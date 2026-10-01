import { BadRequestException } from "@nestjs/common";

export interface FieldIssue {
  field: string;
  message: string;
}

/** 400 with one human message per field so the UI can show it under the right input. */
export function validationError(details: FieldIssue[]): BadRequestException {
  const message =
    details.length === 1 ? details[0].message : "Revisa los campos marcados.";
  return new BadRequestException({
    code: "VALIDATION_ERROR",
    message,
    details,
  });
}

export class FieldErrors {
  readonly issues: FieldIssue[] = [];
  add(field: string, message: string) {
    if (!this.issues.some((issue) => issue.field === field))
      this.issues.push({ field, message });
  }
  has(field: string) {
    return this.issues.some((issue) => issue.field === field);
  }
  throwIfAny() {
    if (this.issues.length) throw validationError(this.issues);
  }
}

type PrismaLikeError = {
  code?: string;
  meta?: Record<string, any>;
  message?: string;
};

function constraintFields(error: PrismaLikeError): string[] {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === "string")
    return [target.replace(/^.*_(\w+)_key$/, "$1")];
  const fields = error.meta?.driverAdapterError?.cause?.constraint?.fields;
  if (Array.isArray(fields))
    return fields.map((field: string) => String(field).replace(/"/g, ""));
  const index =
    error.meta?.driverAdapterError?.cause?.constraint?.index ??
    error.meta?.modelName;
  if (typeof index === "string") {
    const match = /_(\w+)_key$/.exec(index);
    if (match) return [match[1]];
  }
  return [];
}

const duplicateLabels: Record<string, string> = {
  name: "Ya existe un registro con ese nombre.",
  email: "Ese correo ya está registrado.",
  code: "Ese código ya está en uso.",
  internalReference: "Ya existe un producto con esa referencia del maestro.",
  identificationNumber: "Ya existe un contacto con ese número de documento.",
  outputProductId: "Ese producto ya tiene una receta.",
};

/** Maps Prisma known request errors to HTTP status, code and a human message. */
export function mapPrismaError(error: unknown): {
  status: number;
  code: string;
  message: string;
  details?: FieldIssue[];
} | null {
  const candidate = error as PrismaLikeError;
  if (
    !candidate ||
    typeof candidate !== "object" ||
    typeof candidate.code !== "string" ||
    !/^P\d{4}$/.test(candidate.code)
  )
    return null;
  const original = candidate.meta?.driverAdapterError?.cause?.originalCode;
  if (candidate.code === "P2002" || original === "23505") {
    const fields = constraintFields(candidate);
    const field = fields[0];
    const message =
      (field && duplicateLabels[field]) ||
      "Ya existe un registro con esos datos.";
    return {
      status: 409,
      code: "DUPLICATE",
      message,
      details: field ? [{ field, message }] : undefined,
    };
  }
  if (
    candidate.code === "P2003" ||
    candidate.code === "P2014" ||
    original === "23503"
  ) {
    return {
      status: 409,
      code: "IN_USE",
      message:
        "No se puede completar porque el registro está en uso por otros datos. Puedes desactivarlo en su lugar.",
    };
  }
  if (candidate.code === "P2025")
    return {
      status: 404,
      code: "NOT_FOUND",
      message: "El registro ya no existe. Actualiza la página.",
    };
  return null;
}
