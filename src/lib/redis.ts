import { Redis } from "@upstash/redis";
import config from "../config/index.js";

export const redis = new Redis({
  url: config.upstash_redis_rest_url,
  token: config.upstash_redis_rest_token,
});
