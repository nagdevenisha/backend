import Redis from "ioredis";

// export const redis = new Redis({
//   host: "127.0.0.1",
//   port: 6379
// });


export const redis = new Redis(
 process.env.REDIS_URL
);
redis.on("connect", () => {
  console.log("✅ Connected to Redis");
});

redis.on("error", (err) => {
  console.error("❌ Redis connection error:", err);
});