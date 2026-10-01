import { ValidationPipe } from '@nestjs/common';

/** Strict request-body validation for dynamic routes and nested calculator payloads. */
export const strictBodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
});
