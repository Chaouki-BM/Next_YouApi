const redisClient = require("../config/redis");

const cache =
  (keyOrFactory, ttlSeconds = 60) =>
  async (req, res, next) => {
    const cacheKey =
      typeof keyOrFactory === "function" ? keyOrFactory(req) : keyOrFactory;

    if (!cacheKey || !redisClient.isReady) {
      return next();
    }

    try {
      const data = await redisClient.get(cacheKey);

      if (data) {
        return res.json(JSON.parse(data));
      }
    } catch (_) {
      return next();
    }

    res.sendResponse = res.json;
    res.json = (body) => {
      if (redisClient.isReady) {
        redisClient
          .set(cacheKey, JSON.stringify(body), { EX: ttlSeconds })
          .catch(() => null);
      }

      res.sendResponse(body);
    };

    next();
  };

module.exports = cache;
