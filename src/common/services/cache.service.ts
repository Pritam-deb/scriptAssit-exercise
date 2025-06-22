import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import RedisLib from 'ioredis';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;
  private readonly prefix = 'app:';

  constructor(configService: ConfigService) {
    try {
      this.redis = new RedisLib({
        host: configService.get<string>('REDIS_HOST'),
        port: configService.get<number>('REDIS_PORT'),
      });
    } catch (err) {
      this.logger.error('Redis connection failed. Cache operations will be skipped.', err);
      this.redis = null as any;
    }
  }

  private buildKey(key: string): string {
    if (!key || typeof key !== 'string') {
      throw new Error('Cache key must be a non-empty string.');
    }
    return `${this.prefix}${key}`;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (!this.redis) {
      this.logger.warn(`Skipping cache set: Redis unavailable for key ${key}`);
      return;
    }
    const namespacedKey = this.buildKey(key);
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds) {
        await this.redis.set(namespacedKey, payload, 'EX', ttlSeconds);
      } else {
        await this.redis.set(namespacedKey, payload);
      }
      this.logger.debug(`Cache set: ${namespacedKey}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to cache: ${namespacedKey} - ${errorMsg}`);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) {
      this.logger.warn(`Skipping cache get: Redis unavailable for key ${key}`);
      return null;
    }
    const namespacedKey = this.buildKey(key);
    try {
      const raw = await this.redis.get(namespacedKey);
      if (!raw) {
        this.logger.debug(`Cache miss: ${namespacedKey}`);
        return null;
      }
      this.logger.debug(`Cache hit: ${namespacedKey}`);
      return JSON.parse(raw);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error fetching cache: ${namespacedKey} - ${errorMsg}`);
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.redis) {
      this.logger.warn(`Skipping cache delete: Redis unavailable for key ${key}`);
      return false;
    }
    const namespacedKey = this.buildKey(key);
    try {
      const result = await this.redis.del(namespacedKey);
      const deleted = result > 0;
      this.logger.debug(`${deleted ? 'Deleted' : 'Missed'} cache: ${namespacedKey}`);
      return deleted;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error deleting cache: ${namespacedKey} - ${errorMsg}`);
      return false;
    }
  }

  async clear(): Promise<void> {
    if (!this.redis) {
      this.logger.warn('Skipping cache clear: Redis unavailable');
      return;
    }
    try {
      const keys = await this.redis.keys(`${this.prefix}*`);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
      this.logger.warn('Cache cleared');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error clearing cache: ${errorMsg}`);
    }
  }

  async has(key: string): Promise<boolean> {
    if (!this.redis) {
      this.logger.warn(`Skipping cache has check: Redis unavailable for key ${key}`);
      return false;
    }
    const namespacedKey = this.buildKey(key);
    try {
      const exists = await this.redis.exists(namespacedKey);
      this.logger.debug(`Cache ${exists ? 'has' : 'missing'}: ${namespacedKey}`);
      return exists === 1;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error checking cache key: ${namespacedKey} - ${errorMsg}`);
      return false;
    }
  }
}
