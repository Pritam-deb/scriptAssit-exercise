import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string;
    if (isHttp) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        message = Array.isArray((res as any).message)
          ? (res as any).message.join(', ')
          : (res as any).message || exception.message;
      } else {
        message = exception.message;
      }
    } else {
      message = 'Internal server error';
    }

    const requestId = request.headers['x-request-id'];
    const stack = process.env.NODE_ENV === 'production' ? undefined : (exception as any)?.stack;

    const logMethod = status >= 500 ? 'error' : 'warn';

    if (process.env.NODE_ENV === 'production') {
      // In production we can use an external service like Sentry
      // Sentry.captureException(exception);
    }

    this.logger[logMethod]({
      method: request.method,
      path: request.url,
      requestId,
      statusCode: status,
      message,
      ...(stack && { stack }),
    });

    response.status(status).json({
      success: false,
      code: isHttp ? 'HTTP_EXCEPTION' : 'INTERNAL_ERROR',
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(requestId ? { requestId } : {}),
    });
  }
}
