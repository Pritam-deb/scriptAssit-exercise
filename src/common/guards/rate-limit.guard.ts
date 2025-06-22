import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { RATE_LIMIT_METADATA } from '../decorators/rate-limit.decorator';

const redis = new Redis();

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(private reflector: Reflector) { }

  private hashIp(ip: string): string {
    return createHash('sha256').update(ip).digest('hex');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip;

    return this.handleRateLimit(ip, context);
  }

  private async handleRateLimit(ip: string, context: ExecutionContext): Promise<boolean> {
    const rateLimitConfig = this.reflector.get<{ limit: number; windowMs: number }>(
      RATE_LIMIT_METADATA,
      context.getHandler(),
    );

    // If no custom rate limit is set, skip custom logic and let ThrottlerGuard handle it
    if (!rateLimitConfig) {
      return true;
    }

    const windowSeconds = Math.floor(rateLimitConfig.windowMs / 1000);
    const maxRequests = rateLimitConfig.limit;
    const key = `rate-limit:${this.hashIp(ip)}`;
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (current > maxRequests) {
      this.logger.warn(`Rate limit exceeded: IP ${ip}, count ${current}, limit ${maxRequests}`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
