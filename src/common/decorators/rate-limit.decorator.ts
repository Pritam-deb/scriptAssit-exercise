import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA = 'rate_limit';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export const RateLimit = (options: RateLimitOptions) => {
  return SetMetadata(RATE_LIMIT_METADATA, options);
};
