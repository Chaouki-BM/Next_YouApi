require("dotenv").config();
const limiter = require("./src/middlewares/rateLimit.middleware");
const cors = require("cors");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const PORT = process.env.PORT;
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
const helmet = require("helmet");
const compression = require("compression");

app.use(helmet());
app.use(compression());
app.use(limiter);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date(),
    uptime: process.uptime(),
  });
});

const connectDB = require("./src/config/db");
connectDB();
// Routes
const userRoutes = require("./src/routes/User.routes");
const mirrorRoutes = require("./src/routes/MirrorSession.routes");
const exerciseRoutes = require("./src/routes/Exercise.routes");
const bodyAnalysisRoutes = require("./src/routes/BodyAnalysis.routes");
const nutritionPlanRoutes = require("./src/routes/nutritionPlan.routes");
const trainingPlanRoutes = require("./src/routes/TrainingPlan.routes");

app.use("/api/users", userRoutes);
app.use("/api/mirror", mirrorRoutes);
app.use("/api/exercises", exerciseRoutes);
app.use("/api/body-analysis", bodyAnalysisRoutes);
app.use("/api/nutrition-plan", nutritionPlanRoutes);
app.use("/api/training-plan", trainingPlanRoutes);
app.use("/api/admin", require("./src/routes/Admin.routes"));

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Mirror device joins session room
  socket.on("mirror-join-session", (sessionId) => {
    socket.join(`mirror-${sessionId}`);
    console.log(`Mirror ${socket.id} joined session: ${sessionId}`);
    socket.emit("mirror-session-joined", { sessionId, socketId: socket.id });
  });

  // Mirror device requests session status
  socket.on("mirror-check-status", async (sessionId) => {
    const MirrorSession = require("./src/models/MirrorSession.model");
    try {
      const session = await MirrorSession.findOne({ sessionId }).populate(
        "user",
        "-password",
      );

      if (session && session.status === "connected") {
        socket.emit("mirror-user-connected", {
          success: true,
          user: session.user,
          sessionId: session.sessionId,
        });
      } else {
        socket.emit("mirror-session-status", {
          status: session?.status || "not-found",
          sessionId,
        });
      }
    } catch (error) {
      socket.emit("mirror-error", { message: error.message });
    }
  });

  // User joins waiting room for connection confirmation
  socket.on("user-join-session", (sessionId) => {
    socket.join(`user-${sessionId}`);
    console.log(`User ${socket.id} monitoring session: ${sessionId}`);
  });

  socket.on("join_session", ({ sessionId }) => {
    socket.join(`phone-${sessionId}`);
    console.log(`[Socket] Phone joined room: phone-${sessionId}`);
  });

  socket.on("leave_session", ({ sessionId }) => {
    socket.leave(`phone-${sessionId}`);
    console.log(`[Socket] Phone left room: phone-${sessionId}`);
  });

  // Mirror device disconnects from session
  socket.on("mirror-leave-session", (sessionId) => {
    socket.leave(`mirror-${sessionId}`);
    console.log(`Mirror ${socket.id} left session: ${sessionId}`);
  });

  // General room join/leave
  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
    socket.to(roomId).emit("user-joined", socket.id);
  });

  socket.on("leave-room", (roomId) => {
    socket.leave(roomId);
    console.log(`User ${socket.id} left room: ${roomId}`);
    socket.to(roomId).emit("user-left", socket.id);
  });

  // Handle messages
  socket.on("send-message", (data) => {
    socket.to(data.roomId).emit("receive-message", data);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Make io accessible to routes
app.set("io", io);

// Error handler must be the last middleware
app.use(require("./src/middlewares/error.middleware"));

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
