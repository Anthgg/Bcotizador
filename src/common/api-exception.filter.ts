import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { mapPrismaError } from "./errors";

const statusMessages: Record<number, string> = {
  400: "Revisa los datos ingresados.",
  401: "Tu sesión terminó. Vuelve a iniciar sesión.",
  403: "No tienes permiso para realizar esta acción.",
  404: "No encontramos lo que buscas.",
  409: "La acción entra en conflicto con datos existentes.",
  413: "El archivo es demasiado grande.",
  422: "No se pudo procesar la solicitud.",
  500: "Ocurrió un error inesperado en el servidor.",
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("ApiExceptionFilter");
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const prisma = mapPrismaError(exception);
    if (prisma) {
      response.status(prisma.status).json({
        error: {
          code: prisma.code,
          message: prisma.message,
          ...(prisma.details ? { details: prisma.details } : {}),
          path: request.url,
        },
      });
      return;
    }
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500)
      this.logger.error(
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : String(exception),
      );
    const raw =
      exception instanceof HttpException ? exception.getResponse() : null;
    const rawMessage = typeof raw === "string" ? raw : (raw as any)?.message;
    const english = (value: unknown) =>
      typeof value === "string" &&
      /\b(must|should|Cannot|Unexpected|File too large|Unauthorized|Forbidden)\b/.test(
        value,
      );
    let generic: unknown =
      status >= 500
        ? statusMessages[500]
        : (rawMessage ??
          statusMessages[status] ??
          "No se pudo completar la solicitud.");
    if (Array.isArray(generic))
      generic = generic.every(english)
        ? statusMessages[400]
        : generic.join("; ");
    else if (english(generic))
      generic = statusMessages[status] ?? statusMessages[400];
    const message = String(generic);
    const details =
      (raw as any)?.details ??
      (Array.isArray(rawMessage) ? rawMessage : undefined);
    response.status(status).json({
      error: {
        code:
          (raw as any)?.code ??
          (status === 500 ? "INTERNAL_ERROR" : "HTTP_" + status),
        message: status === 413 ? statusMessages[413] : message,
        ...(details ? { details } : {}),
        path: request.url,
      },
    });
  }
}
