import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { FieldErrors, validationError } from "../common/errors";
import { DEFAULT_LOGO_PNG_BASE64 } from "../documents/greda-logo.data";

export const LOGIN_DEFAULTS = {
  focalX: 50,
  focalY: 50,
  overlay: 0.45,
  title: "Cotiza, produce y entrega con orden.",
  highlight: "entrega con orden." as string | null,
  subtitle:
    "Productos, costos, mano de obra y quemas del taller en un solo lugar.",
  showLogo: true,
  logoTone: "LIGHT",
};

/** Anchos WEBP que se generan al subir una imagen; nunca se amplía por encima del original. */
export const HERO_VARIANTS = { sm: 640, md: 1024, lg: 1600, xl: 2400 } as const;
type VariantKey = keyof typeof HERO_VARIANTS;

/** Imagen del taller incluida en el frontend, usada mientras no se suba otra. */
const BUNDLED_HERO = {
  originalUrl: "/brand/login-hero.jpg",
  width: 2000,
  height: 1004,
  variants: {
    sm: { url: "/brand/login-hero-640.webp", width: 640 },
    md: { url: "/brand/login-hero-1024.webp", width: 1024 },
    lg: { url: "/brand/login-hero-1600.webp", width: 1600 },
    xl: { url: "/brand/login-hero-2400.webp", width: 2000 },
  },
};
type LoginHeroImage = {
  source: "DEFAULT" | "CUSTOM";
  originalUrl: string;
  width: number;
  height: number;
  variants: Record<string, { url: string; width: number }>;
};

const IMAGE_TYPES: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
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

const MIN_WIDTH = 640;
const MIN_HEIGHT = 400;
const TEXT_LIMITS = { title: 80, highlight: 60, subtitle: 160 } as const;
const EDITABLE = [
  "focalX",
  "focalY",
  "overlay",
  "title",
  "highlight",
  "subtitle",
  "showLogo",
  "logoTone",
] as const;

type Stored = {
  focalX: number;
  focalY: number;
  overlay: unknown;
  title: string;
  highlight: string | null;
  subtitle: string;
  showLogo: boolean;
  logoTone: string;
  heroVersion: string | null;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

@Injectable()
export class LoginAppearanceService {
  private lightLogos = new Map<string, Buffer>();

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private config: ConfigService,
  ) {}

  maxBytes() {
    return Math.round(
      (Number(this.config.get("LOGIN_HERO_MAX_MB") ?? 15) || 15) * 1024 * 1024,
    );
  }

  private async stored(): Promise<Stored> {
    const row = await this.prisma.loginAppearance.findUnique({
      where: { id: "default" },
    });
    return { ...LOGIN_DEFAULTS, heroVersion: null, ...(row ?? {}) };
  }

  /** Contrato público del login. Corrige valores fuera de rango para que el frontend nunca reciba algo inválido. */
  async get() {
    const row = await this.stored();
    const overlay = Number(row.overlay);
    const focal = {
      x: clamp(Number.isFinite(row.focalX) ? row.focalX : 50, 0, 100),
      y: clamp(Number.isFinite(row.focalY) ? row.focalY : 50, 0, 100),
    };
    const title = row.title?.trim() || LOGIN_DEFAULTS.title;
    const highlight =
      row.highlight && title.includes(row.highlight) ? row.highlight : null;
    const logo = await this.prisma.companyLogo.findUnique({
      where: { id: "default" },
      select: { sha256: true },
    });
    let heroImage: LoginHeroImage = {
      source: "DEFAULT",
      ...BUNDLED_HERO,
    };
    if (row.heroVersion) {
      const assets = await this.prisma.loginHeroAsset.findMany({
        select: { variant: true, width: true, height: true },
      });
      const original = assets.find((asset) => asset.variant === "original");
      if (original) {
        const variants: Record<string, { url: string; width: number }> = {};
        for (const key of Object.keys(HERO_VARIANTS)) {
          const asset = assets.find((candidate) => candidate.variant === key);
          if (asset)
            variants[key] = {
              url: `/api/settings/login-appearance/hero/${key}?v=${row.heroVersion}`,
              width: asset.width,
            };
        }
        heroImage = {
          source: "CUSTOM",
          originalUrl: "/api/settings/login-appearance/hero-original",
          width: original.width,
          height: original.height,
          variants,
        };
      }
    }
    return {
      data: {
        heroImage: {
          ...heroImage,
          focal,
          overlay: Number.isFinite(overlay)
            ? clamp(overlay, 0, 0.8)
            : LOGIN_DEFAULTS.overlay,
        },
        hero: {
          title,
          highlight,
          subtitle: row.subtitle?.trim() ?? "",
        },
        logo: {
          show: row.showLogo !== false,
          tone: row.logoTone === "ORIGINAL" ? "ORIGINAL" : "LIGHT",
          url:
            row.logoTone === "ORIGINAL"
              ? logo
                ? "/api/settings/company/logo?v=" + logo.sha256.slice(0, 12)
                : "/brand/greda-logo.png"
              : "/api/settings/login-appearance/logo-light?v=" +
                (logo?.sha256.slice(0, 12) ?? "greda"),
        },
        limits: {
          maxBytes: this.maxBytes(),
          minWidth: MIN_WIDTH,
          minHeight: MIN_HEIGHT,
          ...TEXT_LIMITS,
        },
      },
    };
  }

  validate(body: Record<string, any>) {
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new BadRequestException("El cuerpo debe ser un objeto");
    const errors = new FieldErrors();
    const unknown = Object.keys(body).filter(
      (key) => !(EDITABLE as readonly string[]).includes(key),
    );
    for (const key of unknown)
      errors.add(key, "Este campo no se puede editar.");
    const out: Record<string, any> = {};
    for (const field of ["focalX", "focalY"] as const) {
      if (body[field] === undefined) continue;
      const value = Number(body[field]);
      if (
        typeof body[field] === "boolean" ||
        body[field] === "" ||
        body[field] === null ||
        !Number.isFinite(value)
      )
        errors.add(field, "El punto focal debe ser un número entre 0 y 100.");
      else if (value < 0 || value > 100)
        errors.add(field, "El punto focal debe estar entre 0 y 100.");
      else out[field] = Math.round(value);
    }
    if (body.overlay !== undefined) {
      const value = Number(body.overlay);
      if (
        typeof body.overlay === "boolean" ||
        body.overlay === "" ||
        body.overlay === null ||
        !Number.isFinite(value)
      )
        errors.add("overlay", "El oscurecimiento debe ser un número.");
      else if (value < 0 || value > 0.8)
        errors.add("overlay", "El oscurecimiento debe estar entre 0 % y 80 %.");
      else out.overlay = Math.round(value * 100) / 100;
    }
    for (const field of ["title", "highlight", "subtitle"] as const) {
      if (body[field] === undefined) continue;
      if (body[field] !== null && typeof body[field] !== "string") {
        errors.add(field, "Debe ser un texto.");
        continue;
      }
      const value = (body[field] ?? "").replace(/\s+/g, " ").trim();
      if (field === "title" && !value) errors.add(field, "Ingresa un título.");
      else if (value.length > TEXT_LIMITS[field])
        errors.add(field, `Usa como máximo ${TEXT_LIMITS[field]} caracteres.`);
      else if (/[<>{}]/.test(value))
        errors.add(field, "No uses los caracteres < > { }.");
      else out[field] = field === "highlight" ? value || null : value;
    }
    if (body.showLogo !== undefined) {
      if (typeof body.showLogo !== "boolean")
        errors.add("showLogo", "Indica si se muestra el logo.");
      else out.showLogo = body.showLogo;
    }
    if (body.logoTone !== undefined) {
      if (!["LIGHT", "ORIGINAL"].includes(body.logoTone))
        errors.add("logoTone", "Elige cómo se ve el logo.");
      else out.logoTone = body.logoTone;
    }
    return { out, errors };
  }

  async update(body: Record<string, any>, actorId: string) {
    const { out, errors } = this.validate(body);
    errors.throwIfAny();
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.loginAppearance.findUnique({
        where: { id: "default" },
      });
      const title = out.title ?? before?.title ?? LOGIN_DEFAULTS.title;
      const highlight =
        out.highlight !== undefined
          ? out.highlight
          : (before?.highlight ?? LOGIN_DEFAULTS.highlight);
      if (highlight && !title.includes(highlight))
        throw validationError([
          {
            field: "highlight",
            message: "El texto resaltado debe ser parte del título.",
          },
        ]);
      const after = await tx.loginAppearance.upsert({
        where: { id: "default" },
        create: { id: "default", ...out },
        update: out,
      });
      await this.audit.write(
        actorId,
        before ? "UPDATE" : "CREATE",
        "LoginAppearance",
        "default",
        before ? this.auditable(before) : { ...LOGIN_DEFAULTS },
        this.auditable(after),
        tx,
      );
    });
    return this.get();
  }

  private auditable(row: Record<string, any>) {
    const out: Record<string, unknown> = {};
    for (const field of EDITABLE) out[field] = row[field];
    return { ...out, overlay: String(row.overlay) };
  }

  private invalid(message: string): never {
    throw validationError([{ field: "heroImage", message }]);
  }

  /** Guarda el archivo original sin recortar y genera variantes WEBP sin metadatos. */
  async upload(
    file: { buffer: Buffer; size: number; originalname?: string } | undefined,
    actorId: string,
  ) {
    if (!file?.buffer?.length) this.invalid("Selecciona una imagen.");
    const max = this.maxBytes();
    if (file.size > max)
      this.invalid(
        `La imagen supera el máximo de ${(max / 1024 / 1024).toLocaleString("es-PE", { maximumFractionDigits: 1 })} MB.`,
      );
    const type = IMAGE_TYPES.find((candidate) => candidate.test(file.buffer));
    if (!type) this.invalid("El archivo debe ser una imagen JPG, PNG o WEBP.");
    let width = 0;
    let height = 0;
    try {
      const meta = await sharp(file.buffer, { failOn: "error" }).metadata();
      const rotated = (meta.orientation ?? 1) >= 5;
      width = (rotated ? meta.height : meta.width) ?? 0;
      height = (rotated ? meta.width : meta.height) ?? 0;
    } catch {
      this.invalid("No se pudo leer la imagen. Puede estar dañada.");
    }
    if (width < MIN_WIDTH || height < MIN_HEIGHT)
      this.invalid(
        `La imagen es muy pequeña (${width} × ${height} px). Usa al menos ${MIN_WIDTH} × ${MIN_HEIGHT} px.`,
      );
    const variants: Array<{
      variant: string;
      mimeType: string;
      width: number;
      height: number;
      data: Buffer;
    }> = [];
    for (const [variant, target] of Object.entries(HERO_VARIANTS) as Array<
      [VariantKey, number]
    >) {
      const { data, info } = await sharp(file.buffer)
        .rotate()
        .resize({ width: target, withoutEnlargement: true })
        .webp({ quality: target <= 1024 ? 72 : 78, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      variants.push({
        variant,
        mimeType: "image/webp",
        width: info.width,
        height: info.height,
        data,
      });
    }
    const version = createHash("sha256")
      .update(file.buffer)
      .digest("hex")
      .slice(0, 12);
    const fileName = file.originalname ? file.originalname.slice(0, 200) : null;
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.loginAppearance.findUnique({
        where: { id: "default" },
      });
      const previous = await tx.loginHeroAsset.findUnique({
        where: { variant: "original" },
        select: { fileName: true },
      });
      await tx.loginHeroAsset.deleteMany({});
      await tx.loginHeroAsset.createMany({
        data: [
          {
            variant: "original",
            mimeType: type.mime,
            width,
            height,
            size: file.size,
            fileName,
            data: new Uint8Array(file.buffer),
          },
          ...variants.map((row) => ({
            ...row,
            size: row.data.length,
            fileName,
            data: new Uint8Array(row.data),
          })),
        ],
      });
      // Una imagen nueva tiene otro sujeto: el punto focal vuelve al centro.
      await tx.loginAppearance.upsert({
        where: { id: "default" },
        create: { id: "default", heroVersion: version },
        update: { heroVersion: version, focalX: 50, focalY: 50 },
      });
      await this.audit.write(
        actorId,
        before ? "UPDATE" : "CREATE",
        "LoginAppearance",
        "default",
        {
          heroImage: previous?.fileName ?? "Imagen incluida del taller",
          focalX: before?.focalX ?? 50,
          focalY: before?.focalY ?? 50,
        },
        {
          heroImage: `${fileName ?? "Imagen subida"} (${width} × ${height} px)`,
          focalX: 50,
          focalY: 50,
        },
        tx,
      );
    });
    return this.get();
  }

  /** Vuelve a la imagen incluida del taller. */
  async reset(actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.loginHeroAsset.findUnique({
        where: { variant: "original" },
        select: { fileName: true },
      });
      if (!previous) throw new NotFoundException("No hay una imagen cargada.");
      await tx.loginHeroAsset.deleteMany({});
      await tx.loginAppearance.update({
        where: { id: "default" },
        data: { heroVersion: null, focalX: 64, focalY: 52 },
      });
      await this.audit.write(
        actorId,
        "UPDATE",
        "LoginAppearance",
        "default",
        { heroImage: previous.fileName ?? "Imagen subida" },
        { heroImage: "Imagen incluida del taller" },
        tx,
      );
    });
    return this.get();
  }

  /**
   * Logo blanco con transparencia para ponerlo sobre la foto: lo oscuro del logo se vuelve blanco
   * y el fondo claro (aunque el PNG no tenga transparencia) desaparece.
   */
  async lightLogo() {
    const logo = await this.prisma.companyLogo.findUnique({
      where: { id: "default" },
      select: { data: true, sha256: true },
    });
    const key = logo?.sha256.slice(0, 12) ?? "greda";
    const cached = this.lightLogos.get(key);
    if (cached) return { key, data: cached };
    const source = logo
      ? Buffer.from(logo.data)
      : Buffer.from(DEFAULT_LOGO_PNG_BASE64, "base64");
    const { data: alpha, info } = await sharp(source)
      .flatten({ background: "#ffffff" })
      // Quita el margen blanco que traen muchos logos para que no se vea diminuto.
      .trim({ threshold: 12 })
      .resize({ height: 240, withoutEnlargement: true })
      .toColourspace("b-w")
      .negate({ alpha: false })
      .linear(1.2, -24)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const data = await sharp({
      create: {
        width: info.width,
        height: info.height,
        channels: 3,
        background: "#ffffff",
      },
    })
      .joinChannel(alpha, {
        raw: { width: info.width, height: info.height, channels: 1 },
      })
      .png()
      .toBuffer();
    this.lightLogos.clear();
    this.lightLogos.set(key, data);
    return { key, data };
  }

  asset(variant: string) {
    if (variant !== "original" && !(variant in HERO_VARIANTS)) return null;
    return this.prisma.loginHeroAsset.findUnique({ where: { variant } });
  }
}
