import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const method = req.method;
    const url = req.url;
    const now = Date.now();
    const requestId = req.headers['x-request-id'] || 'N/A';
    const userId = req.user?.id || 'Guest';

    const sanitizeBody = (body: any) => {
      if (!body || typeof body !== 'object') return body;
      const redacted = { ...body };
      if (redacted.password) redacted.password = '[REDACTED]';
      if (redacted.token) redacted.token = '[REDACTED]';
      return redacted;
    };

    this.logger.log(`Incoming Request`, {
      method,
      url,
      requestId,
      userId,
      params: req.params,
      query: req.query,
      body: sanitizeBody(req.body),
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - now;
          this.logger.log(`Response Sent`, {
            method,
            url,
            requestId,
            userId,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
          });
        },
        error: err => {
          const duration = Date.now() - now;
          this.logger.error(`Request Failed`, {
            method,
            url,
            requestId,
            userId,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            message: err.message,
          });
        },
      }),
    );
  }
}
