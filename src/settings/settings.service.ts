import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { AuditService } from "../common/audit.service";
import { PrismaService } from "../common/prisma.service";
import { FieldErrors } from "../common/errors";
import { SequenceService } from "../common/sequence.service";
import { resolveUbigeo } from "../catalogs/catalogs";

export const COMMERCIAL_DEFAULTS = {
  id: "default",
  glazeDefaultPct: "0.15",
  separationXcm: "3",
  separationYcm: "3",
  separationZcm: "3",
  productionFactorDefault: "3",
  productionFactorMin: "2",
  igvRate: "0.18",
  rentPerDay: "110",
  utilitiesPerDay: "10",
  administrativeCost: "200",
  hoursPerCycle: "8",
  validityDays: 30,
  dayAdjustments: [] as Array<{ label: string; days: number }>,
  priceRounding: "NONE",
  defaultFiringType: "SHARED",
  defaultLowFiringEnabled: true,
  defaultHighFiringEnabled: true,
  defaultLowKilnId: null as string | null,
  defaultHighKilnId: null as string | null,
};
export const PRICE_ROUNDING = ["NONE", "UP_1", "UP_5", "UP_10"] as const;

export const DOCUMENT_DEFAULTS = {
  id: "default",
  showLogo: true,
  showLegalName: true,
  showRuc: true,
  showAddress: true,
  showPhones: true,
  showEmail: true,
  showWebsite: true,
  validityText: "Esta cotización es válida por {dias} días, hasta el {vence}.",
  conditions:
    "Precios expresados en soles (S/), incluyen IGV.\nLa producción inicia con la confirmación del pedido.",
  observations: null as string | null,
  estimatedTime: null as string | null,
  paymentTerms:
    "50% de adelanto para iniciar la producción y 50% contra entrega.",
  bankName: null as string | null,
  bankAccountHolder: null as string | null,
  bankAccount: null as string | null,
  bankCci: null as string | null,
  closingMessage: "Gracias por confiar en nuestro taller.",
  showSignature: false,
  signatureName: null as string | null,
  signatureRole: null as string | null,
};

export const COMPANY_DEFAULTS = {
  id: "default",
  legalName: null,
  tradeName: "GREDA",
  ruc: null,
  address: null,
  addressReference: null,
  ubigeoCode: null,
  department: null,
  province: null,
  district: null,
  country: null,
  postalCode: null,
  phone: null,
  mobile: null,
  email: null,
  website: null,
  contactName: null,
  contactRole: null,
} as Record<string, string | null>;

const LOGO_TYPES: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
  {
    mime: "image/png",
    test: (b) =>
      b.length > 8 &&
      b
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/jpeg",
    test: (b) =>
      b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/webp",
    test: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString("ascii") === "RIFF" &&
      b.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

const isBlank = (value: unknown) =>
  value == null || (typeof value === "string" && value.trim() === "");
const text = (value: unknown) => (isBlank(value) ? null : String(value).trim());
const isNumber = (value: unknown) =>
  (typeof value === "number" && Number.isFinite(value)) ||
  (typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Number(value)));

type NumberRule = {
  label: string;
  min?: number;
  above?: number;
  max?: number;
  integer?: boolean;
};
const commercialNumbers: Record<string, NumberRule> = {
  glazeDefaultPct: { label: "El porcentaje de esmalte", min: 0, max: 1 },
  separationXcm: { label: "La separación X", min: 0, max: 100 },
  separationYcm: { label: "La separación Y", min: 0, max: 100 },
  separationZcm: { label: "La separación Z", min: 0, max: 100 },
  productionFactorDefault: {
    label: "El factor de producción",
    above: 0,
    max: 100,
  },
  productionFactorMin: { label: "El factor mínimo", above: 0, max: 100 },
  igvRate: { label: "El IGV", min: 0, max: 1 },
  rentPerDay: { label: "El alquiler diario", min: 0 },
  utilitiesPerDay: { label: "Los servicios diarios", min: 0 },
  administrativeCost: { label: "El costo administrativo", min: 0 },
  hoursPerCycle: { label: "Las horas por ciclo", above: 0, max: 24 },
  validityDays: { label: "La vigencia", min: 1, max: 365, integer: true },
};

function checkNumber(
  errors: FieldErrors,
  field: string,
  value: unknown,
  rule: NumberRule,
) {
  if (!isNumber(value)) {
    errors.add(field, `${rule.label} debe ser un número.`);
    return;
  }
  const n = Number(value);
  if (rule.integer && !Number.isInteger(n))
    errors.add(field, `${rule.label} debe ser un número entero.`);
  else if (rule.above != null && n <= rule.above)
    errors.add(field, `${rule.label} debe ser mayor que cero.`);
  else if (rule.min != null && n < rule.min)
    errors.add(
      field,
      `${rule.label} debe ser mayor o igual a ${rule.min === 0 ? "cero" : rule.min}.`,
    );
  else if (rule.max != null && n > rule.max)
    errors.add(field, `${rule.label} no puede ser mayor que ${rule.max}.`);
}

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private config: ConfigService,
    private sequences: SequenceService,
  ) {}

  // ---- Comercial y cotizador ----
  async get() {
    const stored = await this.prisma.commercialSettings.findUnique({
      where: { id: "default" },
    });
    return {
      data: stored
        ? { ...COMMERCIAL_DEFAULTS, ...stored }
        : COMMERCIAL_DEFAULTS,
    };
  }
  async update(body: Record<string, any>, actorId: string) {
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new BadRequestException("El cuerpo debe ser un objeto");
    const errors = new FieldErrors();
    const data: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      if (key === "id" || key === "updatedAt" || value === undefined) continue;
      if (commercialNumbers[key]) {
        checkNumber(errors, key, value, commercialNumbers[key]);
        data[key] = key === "validityDays" ? Number(value) : String(value);
      } else if (key === "dayAdjustments") {
        if (!Array.isArray(value)) {
          errors.add(key, "Los ajustes de días tienen un formato inválido.");
          continue;
        }
        const rows = value.map((row: any, index: number) => {
          const label = text(row?.label);
          if (!label)
            errors.add(`dayAdjustments[${index}].label`, "Describe el ajuste.");
          if (!isNumber(row?.days) || Number(row.days) < 0)
            errors.add(
              `dayAdjustments[${index}].days`,
              "Los días deben ser cero o más.",
            );
          return { label: label ?? "", days: Number(row?.days ?? 0) };
        });
        data[key] = rows;
      } else if (key === "priceRounding") {
        if (!PRICE_ROUNDING.includes(value))
          errors.add(key, "Selecciona un tipo de redondeo.");
        data[key] = value;
      } else if (key === "defaultFiringType") {
        if (!["SHARED", "EXCLUSIVE"].includes(value))
          errors.add(key, "Selecciona el tipo de hornada.");
        data[key] = value;
      } else if (
        key === "defaultLowFiringEnabled" ||
        key === "defaultHighFiringEnabled"
      ) {
        if (typeof value !== "boolean")
          errors.add(key, "Indica si la quema está activa por defecto.");
        data[key] = value;
      } else if (key === "defaultLowKilnId" || key === "defaultHighKilnId") {
        if (value === null || value === "") {
          data[key] = null;
          continue;
        }
        const kiln =
          typeof value === "string"
            ? await this.prisma.kiln.findUnique({ where: { id: value } })
            : null;
        if (!kiln || !kiln.isActive)
          errors.add(key, "Selecciona un horno activo.");
        data[key] = value;
      } else {
        errors.add(key, `El campo «${key}» no se puede modificar.`);
      }
    }
    const current = (await this.get()).data;
    const merged = { ...current, ...data };
    if (
      !errors.has("productionFactorDefault") &&
      !errors.has("productionFactorMin") &&
      Number(merged.productionFactorDefault) <
        Number(merged.productionFactorMin)
    ) {
      errors.add(
        "productionFactorDefault",
        "El factor recomendado no puede ser menor que el factor mínimo.",
      );
    }
    errors.throwIfAny();
    if (Object.keys(data).length === 0) return this.get();
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.commercialSettings.findUnique({
        where: { id: "default" },
      });
      const after = await tx.commercialSettings.upsert({
        where: { id: "default" },
        create: { ...COMMERCIAL_DEFAULTS, ...data } as any,
        update: data,
      });
      await this.audit.write(
        actorId,
        before ? "UPDATE" : "CREATE",
        "CommercialSettings",
        "default",
        before ?? COMMERCIAL_DEFAULTS,
        after,
        tx,
      );
      return { data: after };
    });
  }

  // ---- Empresa ----
  private logoMaxBytes() {
    return Math.round(
      (Number(this.config.get("LOGO_MAX_MB") ?? 2) || 2) * 1024 * 1024,
    );
  }
  async logoMeta() {
    const logo = await this.prisma.companyLogo.findUnique({
      where: { id: "default" },
      select: {
        mimeType: true,
        size: true,
        sha256: true,
        fileName: true,
        updatedAt: true,
      },
    });
    return logo
      ? {
          ...logo,
          url: "/api/settings/company/logo?v=" + logo.sha256.slice(0, 12),
        }
      : null;
  }
  async company() {
    const stored = await this.prisma.companyProfile.findUnique({
      where: { id: "default" },
    });
    return {
      data: {
        ...COMPANY_DEFAULTS,
        ...(stored ?? {}),
        logo: await this.logoMeta(),
        logoMaxBytes: this.logoMaxBytes(),
      },
    };
  }
  async updateCompany(body: Record<string, any>, actorId: string) {
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new BadRequestException("El cuerpo debe ser un objeto");
    const allowed = [
      "legalName",
      "tradeName",
      "ruc",
      "address",
      "addressReference",
      "ubigeoCode",
      "postalCode",
      "phone",
      "mobile",
      "email",
      "website",
      "contactName",
      "contactRole",
    ];
    const errors = new FieldErrors();
    const data: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(body)) {
      if (
        value === undefined ||
        [
          "id",
          "updatedAt",
          "logo",
          "logoMaxBytes",
          "department",
          "province",
          "district",
          "country",
        ].includes(key)
      )
        continue;
      if (!allowed.includes(key)) {
        errors.add(key, `El campo «${key}» no se puede modificar.`);
        continue;
      }
      if (value !== null && typeof value !== "string") {
        errors.add(key, "Revisa este dato.");
        continue;
      }
      data[key] = text(value);
      if ((data[key]?.length ?? 0) > 300)
        errors.add(key, "El texto es demasiado largo.");
    }
    if (data.ruc && !/^(10|15|17|20)\d{9}$/.test(data.ruc))
      errors.add(
        "ruc",
        "El RUC tiene 11 dígitos y empieza con 10, 15, 17 o 20.",
      );
    if (data.postalCode && !/^\d{5}$/.test(data.postalCode))
      errors.add("postalCode", "El código postal tiene 5 dígitos.");
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      errors.add("email", "Ingresa un correo válido.");
    for (const phone of ["phone", "mobile"])
      if (data[phone] && !/^[+\d][\d\s()-]{5,19}$/.test(data[phone]!))
        errors.add(phone, "Ingresa un número válido.");
    if (data.website) {
      const candidate = /^https?:\/\//i.test(data.website)
        ? data.website
        : "https://" + data.website;
      try {
        const url = new URL(candidate);
        if (!url.hostname.includes(".")) throw new Error("host");
        data.website = candidate;
      } catch {
        errors.add("website", "Ingresa una dirección web válida.");
      }
    }
    if ("ubigeoCode" in data) {
      const location = resolveUbigeo(data.ubigeoCode);
      if (data.ubigeoCode && !location)
        errors.add("ubigeoCode", "Selecciona un distrito de la lista.");
      Object.assign(
        data,
        location
          ? {
              department: location.department,
              province: location.province,
              district: location.district,
              country: location.country,
            }
          : { department: null, province: null, district: null, country: null },
      );
    }
    errors.throwIfAny();
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.companyProfile.findUnique({
        where: { id: "default" },
      });
      const after = await tx.companyProfile.upsert({
        where: { id: "default" },
        create: { ...data, id: "default" } as any,
        update: data,
      });
      await this.audit.write(
        actorId,
        before ? "UPDATE" : "CREATE",
        "CompanyProfile",
        "default",
        before ?? COMPANY_DEFAULTS,
        after,
        tx,
      );
      return this.company();
    });
  }
  async uploadLogo(
    file: { buffer: Buffer; size: number; originalname?: string } | undefined,
    actorId: string,
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Selecciona una imagen.",
        details: [{ field: "logo", message: "Selecciona una imagen." }],
      });
    const max = this.logoMaxBytes();
    if (file.size > max) {
      const message = `La imagen supera el máximo de ${(max / 1024 / 1024).toLocaleString("es-PE", { maximumFractionDigits: 1 })} MB.`;
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message,
        details: [{ field: "logo", message }],
      });
    }
    const type = LOGO_TYPES.find((candidate) => candidate.test(file.buffer));
    if (!type) {
      const message = "El archivo debe ser una imagen PNG, JPG o WEBP.";
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message,
        details: [{ field: "logo", message }],
      });
    }
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const fileName = file.originalname ? file.originalname.slice(0, 200) : null;
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.companyLogo.findUnique({
        where: { id: "default" },
        select: { mimeType: true, size: true, sha256: true, fileName: true },
      });
      const data = {
        data: new Uint8Array(file.buffer),
        mimeType: type.mime,
        size: file.size,
        sha256,
        fileName,
      };
      await tx.companyLogo.upsert({
        where: { id: "default" },
        create: { id: "default", ...data },
        update: data,
      });
      await this.audit.write(
        actorId,
        before ? "UPDATE" : "CREATE",
        "CompanyLogo",
        "default",
        before,
        { mimeType: type.mime, size: file.size, sha256, fileName },
        tx,
      );
    });
    return this.company();
  }
  async deleteLogo(actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.companyLogo.findUnique({
        where: { id: "default" },
        select: { mimeType: true, size: true, sha256: true, fileName: true },
      });
      if (!before) throw new NotFoundException("No hay un logo cargado.");
      await tx.companyLogo.delete({ where: { id: "default" } });
      await this.audit.write(
        actorId,
        "DELETE",
        "CompanyLogo",
        "default",
        before,
        null,
        tx,
      );
    });
    return this.company();
  }
  async logo() {
    return this.prisma.companyLogo.findUnique({ where: { id: "default" } });
  }
  async branding() {
    const profile = await this.prisma.companyProfile.findUnique({
      where: { id: "default" },
      select: { tradeName: true },
    });
    return {
      data: {
        tradeName: profile?.tradeName ?? COMPANY_DEFAULTS.tradeName,
        logo: await this.logoMeta(),
      },
    };
  }

  // ---- Documentos ----
  async documents() {
    const stored = await this.prisma.documentSettings.findUnique({
      where: { id: "default" },
    });
    return { data: { ...DOCUMENT_DEFAULTS, ...(stored ?? {}) } };
  }
  validateDocuments(body: Record<string, any>): Record<string, any> {
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new BadRequestException("El cuerpo debe ser un objeto");
    const booleans = [
      "showLogo",
      "showLegalName",
      "showRuc",
      "showAddress",
      "showPhones",
      "showEmail",
      "showWebsite",
      "showSignature",
    ];
    const texts = [
      "validityText",
      "conditions",
      "observations",
      "estimatedTime",
      "paymentTerms",
      "bankName",
      "bankAccountHolder",
      "bankAccount",
      "bankCci",
      "closingMessage",
      "signatureName",
      "signatureRole",
    ];
    const errors = new FieldErrors();
    const data: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined || key === "id" || key === "updatedAt") continue;
      if (booleans.includes(key)) {
        if (typeof value !== "boolean")
          errors.add(key, "Indica si se muestra en el documento.");
        data[key] = value;
      } else if (texts.includes(key)) {
        if (value !== null && typeof value !== "string") {
          errors.add(key, "Revisa este texto.");
          continue;
        }
        data[key] = text(value);
        if ((data[key]?.length ?? 0) > 2000)
          errors.add(key, "El texto no puede superar 2000 caracteres.");
      } else errors.add(key, `El campo «${key}» no se puede modificar.`);
    }
    if (
      data.bankCci &&
      !/^\d{20}$/.test(String(data.bankCci).replace(/[\s-]/g, ""))
    )
      errors.add("bankCci", "El CCI tiene 20 dígitos.");
    if (data.bankCci) data.bankCci = String(data.bankCci).replace(/[\s-]/g, "");
    errors.throwIfAny();
    return data;
  }
  async updateDocuments(body: Record<string, any>, actorId: string) {
    const data = this.validateDocuments(body);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.documentSettings.findUnique({
        where: { id: "default" },
      });
      const after = await tx.documentSettings.upsert({
        where: { id: "default" },
        create: { ...DOCUMENT_DEFAULTS, ...data } as any,
        update: data,
      });
      await this.audit.write(
        actorId,
        before ? "UPDATE" : "CREATE",
        "DocumentSettings",
        "default",
        before ?? DOCUMENT_DEFAULTS,
        after,
        tx,
      );
      return { data: { ...DOCUMENT_DEFAULTS, ...after } };
    });
  }

  // ---- Numeración ----
  async sequenceList() {
    const rows = await this.prisma.numberSequence.findMany({
      orderBy: { key: "asc" },
    });
    const order = [
      "QUOTATION",
      "PRODUCT",
      "CUSTOMER",
      "WORKER",
      "TECHNIQUE",
      "KILN",
      "MOVEMENT",
    ];
    rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    return {
      data: rows.map((row) => ({
        key: row.key,
        label: row.label,
        prefix: row.prefix,
        padding: row.padding,
        yearly: row.yearly,
        lastValue: row.lastValue,
        currentYear: row.currentYear,
        format: row.yearly ? "{PREFIJO}-{AÑO}-{NÚMERO}" : "{PREFIJO}-{NÚMERO}",
        nextCode: this.sequences.preview(row),
        lastCode:
          row.lastValue > 0
            ? this.sequences.preview({ ...row, lastValue: row.lastValue - 1 })
            : null,
        updatedAt: row.updatedAt,
      })),
    };
  }
  async updateSequence(
    key: string,
    body: Record<string, any>,
    actorId: string,
  ) {
    const errors = new FieldErrors();
    const data: Record<string, any> = {};
    for (const [field, value] of Object.entries(body ?? {})) {
      if (value === undefined) continue;
      if (field === "prefix") {
        const prefix =
          typeof value === "string" ? value.trim().toUpperCase() : "";
        if (!/^[A-Z]{2,5}$/.test(prefix))
          errors.add("prefix", "El prefijo debe tener de 2 a 5 letras.");
        data.prefix = prefix;
      } else if (field === "padding") {
        if (
          !Number.isInteger(Number(value)) ||
          Number(value) < 4 ||
          Number(value) > 10
        )
          errors.add("padding", "Usa entre 4 y 10 dígitos.");
        data.padding = Number(value);
      } else
        errors.add(
          field,
          "Solo se pueden cambiar el prefijo y los dígitos; el correlativo no se edita.",
        );
    }
    errors.throwIfAny();
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.numberSequence.findUnique({ where: { key } });
      if (!before) throw new NotFoundException("Secuencia no encontrada.");
      const after = await tx.numberSequence.update({ where: { key }, data });
      await this.audit.write(
        actorId,
        "UPDATE",
        "NumberSequence",
        key,
        before,
        after,
        tx,
      );
    });
    return this.sequenceList();
  }
}
