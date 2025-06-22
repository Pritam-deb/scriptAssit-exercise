import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from './logger.service';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) { }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Assign a unique request ID if one doesn't exist
    const requestId = request.headers['x-request-id'] || uuidv4();
    request.headers['x-request-id'] = requestId; // Ensure it's on the request for downstream use

    const { method, url, body, user } = request;
    const ip = request.ip;
    const userAgent = request.get('user-agent') || '';

    this.logger.setContext(context.getClass().name);

    this.logger.log({
      message: `Incoming Request: ${method} ${url}`,
      requestId,
      method,
      url,
      ip,
      userAgent,
      user: user ? { id: user.id, role: user.role } : 'Guest',
      body: this.sanitizeBody(body),
    });

    const now = Date.now();
    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - now;
          this.logger.log({
            message: `Outgoing Response: ${method} ${url} - ${response.statusCode}`,
            requestId,
            statusCode: response.statusCode,
            duration: `${duration}ms`,
          });
        },
        error: err => {
          const duration = Date.now() - now;
          this.logger.error(
            {
              message: `Request Failed: ${method} ${url}`,
              requestId,
              statusCode: err.status || 500,
              duration: `${duration}ms`,
              error: err.message,
            },
            err.stack,
          );
        },
      }),
    );
  }

  private sanitizeBody(body: any) {
    if (!body || typeof body !== 'object') return body;
    const redacted = { ...body };
    if (redacted.password) redacted.password = '[REDACTED]';
    if (redacted.token) redacted.token = '[REDACTED]';
    if (redacted.refreshToken) redacted.refreshToken = '[REDACTED]';
    return redacted;
  }
}
