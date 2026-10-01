import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : null;
    const message = typeof raw === 'string' ? raw : (raw as any)?.message ?? 'Error interno';
    response.status(status).json({
      error: {
        code: (raw as any)?.code ?? (status === 500 ? 'INTERNAL_ERROR' : 'HTTP_' + status),
        message: Array.isArray(message) ? message.join('; ') : message,
        ...(Array.isArray((raw as any)?.message) ? { details: (raw as any).message } : {}),
        path: request.url,
      },
    });
  }
}
