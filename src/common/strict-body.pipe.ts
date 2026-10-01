import { ValidationError, ValidationPipe } from "@nestjs/common";
import { FieldIssue, validationError } from "./errors";

const SPANISH =
  /[áéíóúñ¿]|^(Selecciona|Ingresa|Indica|El |La |Los |Las |Usa |Revisa)/i;

function flatten(errors: ValidationError[], parent = ""): FieldIssue[] {
  return errors.flatMap((error) => {
    const field = parent
      ? /^\d+$/.test(error.property)
        ? `${parent}[${error.property}]`
        : `${parent}.${error.property}`
      : error.property;
    const own = Object.values(error.constraints ?? {})
      .slice(0, 1)
      .map((message) => ({
        field,
        message: SPANISH.test(message)
          ? message
          : error.constraints?.whitelistValidation
            ? `El campo «${error.property}» no está permitido.`
            : "Revisa este dato.",
      }));
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/** Turns class-validator errors into the shared VALIDATION_ERROR shape with one message per field. */
export const validationExceptionFactory = (errors: ValidationError[]) =>
  validationError(flatten(errors));

/** Strict request-body validation for dynamic routes and nested calculator payloads. */
export const strictBodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
  exceptionFactory: validationExceptionFactory,
});
