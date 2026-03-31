import type { RedisClientType } from 'redis';

import type { CacheRepository, RedisConnection } from '../types';

interface CacheRepositoryOptions {
  ttlSeconds: number;
}

export function createCacheRepository(
  redisClient: RedisConnection | null,
  options: CacheRepositoryOptions
): CacheRepository | null {
  if (!redisClient) {
    return null;
  }

  const client = redisClient;
  const ttlSeconds = options.ttlSeconds;

  async function getJson<T>(key: string): Promise<T | null> {
    const rawValue = await client.get(key);
    return rawValue ? JSON.parse(rawValue) as T : null;
  }

  async function setJson(key: string, value: unknown): Promise<void> {
    await client.set(key, JSON.stringify(value), {
      EX: ttlSeconds
    });
  }

  async function ping(): Promise<void> {
    await client.ping();
  }

  return {
    getJson,
    ping,
    setJson
  };
}
