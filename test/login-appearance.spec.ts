import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { LoginAppearanceService } from "../src/settings/login-appearance.service";

type Row = Record<string, any>;

/** Prisma en memoria con solo lo que usa el servicio. */
function fakePrisma(appearance: Row | null = null) {
  const state = { appearance, assets: [] as Row[], audits: [] as Row[] };
  const db: any = {
    loginAppearance: {
      findUnique: async () => state.appearance,
      upsert: async ({ create, update }: Row) =>
        (state.appearance = state.appearance
          ? { ...state.appearance, ...update }
          : { focalX: 50, focalY: 50, overlay: "0.45", ...create }),
      update: async ({ data }: Row) =>
        (state.appearance = { ...state.appearance, ...data }),
    },
    loginHeroAsset: {
      findMany: async () => state.assets,
      findUnique: async ({ where }: Row) =>
        state.assets.find((asset) => asset.variant === where.variant) ?? null,
      deleteMany: async () => (state.assets = []),
      createMany: async ({ data }: Row) =>
        (state.assets = data.map((row: Row) => ({
          ...row,
          createdAt: new Date(),
        }))),
    },
    companyLogo: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  const audit = {
    write: async (...args: unknown[]) => state.audits.push(args),
  };
  const config = { get: () => undefined };
  const service = new LoginAppearanceService(db, audit as any, config as any);
  return { service, state };
}

const issues = async (fn: () => unknown) => {
  try {
    await fn();
  } catch (error: any) {
    return (error.getResponse?.().details ?? []) as Array<{
      field: string;
      message: string;
    }>;
  }
  assert.fail("expected a validation error");
};

const image = (
  width: number,
  height: number,
  format: "jpeg" | "png" | "webp",
) =>
  sharp({
    create: { width, height, channels: 3, background: "#c96f4a" },
  })
    .withMetadata({ exif: { IFD0: { Copyright: "secreto" } } })
    [format]()
    .toBuffer();

test("login appearance falls back to safe defaults when nothing is stored", async () => {
  const { service } = fakePrisma();
  const { data } = await service.get();
  assert.equal(data.heroImage.source, "DEFAULT");
  assert.deepEqual(data.heroImage.focal, { x: 50, y: 50 });
  assert.equal(data.heroImage.overlay, 0.45);
  assert.equal(data.hero.title, "Cotiza, produce y entrega con orden.");
  assert.equal(data.hero.highlight, "entrega con orden.");
  assert.equal(data.logo.show, true);
  assert.equal(
    data.logo.url,
    "/api/settings/login-appearance/logo-light?v=greda",
  );
});

test("login appearance clamps stored values the frontend must not trust", async () => {
  const { service } = fakePrisma({
    focalX: 140,
    focalY: -5,
    overlay: "0.95",
    title: "  ",
    highlight: "no está en el título",
    subtitle: "Hola",
    showLogo: true,
    logoTone: "NEON",
    heroVersion: null,
  });
  const { data } = await service.get();
  assert.deepEqual(data.heroImage.focal, { x: 100, y: 0 });
  assert.equal(data.heroImage.overlay, 0.8);
  assert.equal(data.hero.title, "Cotiza, produce y entrega con orden.");
  assert.equal(data.hero.highlight, null);
  assert.equal(data.logo.tone, "LIGHT");
});

test("login appearance validates only safe parameters", async () => {
  const { service } = fakePrisma();
  const errors = await issues(() =>
    service.update(
      {
        focalX: 101,
        focalY: "abc",
        overlay: 0.9,
        title: "",
        subtitle: "<b>hola</b>",
        logoTone: "DARK",
        css: "object-position: 0 0",
      },
      "admin",
    ),
  );
  const fields = Object.fromEntries(
    errors.map((row) => [row.field, row.message]),
  );
  assert.match(fields.focalX, /entre 0 y 100/);
  assert.match(fields.focalY, /número/);
  assert.match(fields.overlay, /80 %/);
  assert.match(fields.title, /Ingresa un título/);
  assert.match(fields.subtitle, /< >/);
  assert.match(fields.logoTone, /logo/);
  assert.match(fields.css, /no se puede editar/);
});

test("login appearance requires the highlight to be part of the title", async () => {
  const { service } = fakePrisma({
    focalX: 50,
    focalY: 50,
    overlay: "0.45",
    title: "Cotiza, produce y entrega con orden.",
    highlight: "entrega con orden.",
    subtitle: "",
    showLogo: true,
    logoTone: "LIGHT",
    heroVersion: null,
  });
  const errors = await issues(() =>
    service.update({ title: "Bienvenido al taller" }, "admin"),
  );
  assert.equal(errors[0].field, "highlight");
  const saved = await service.update(
    {
      title: "Bienvenido al taller",
      highlight: "al taller",
      focalX: 0,
      focalY: 100,
      overlay: 0.3,
    },
    "admin",
  );
  assert.equal(saved.data.hero.highlight, "al taller");
  assert.deepEqual(saved.data.heroImage.focal, { x: 0, y: 100 });
  assert.equal(saved.data.heroImage.overlay, 0.3);
});

for (const [label, width, height, format] of [
  ["16:9", 3200, 1800, "jpeg"],
  ["4:3", 1600, 1200, "png"],
  ["1:1", 1200, 1200, "webp"],
  ["vertical", 900, 1600, "jpeg"],
  ["ultrawide", 3440, 1440, "jpeg"],
] as const) {
  test(`hero upload keeps the ${label} original and builds proportional variants`, async () => {
    const { service, state } = fakePrisma({
      focalX: 70,
      focalY: 30,
      overlay: "0.45",
      title: "Cotiza, produce y entrega con orden.",
      highlight: "entrega con orden.",
      subtitle: "",
      showLogo: true,
      logoTone: "LIGHT",
      heroVersion: null,
    });
    const buffer = await image(width, height, format);
    const { data } = await service.upload(
      { buffer, size: buffer.length, originalname: `taller.${format}` },
      "admin",
    );
    assert.equal(data.heroImage.source, "CUSTOM");
    assert.equal(data.heroImage.width, width);
    assert.equal(data.heroImage.height, height);
    // Una imagen nueva vuelve a centrar el punto focal.
    assert.deepEqual(data.heroImage.focal, { x: 50, y: 50 });
    const original = state.assets.find((row) => row.variant === "original")!;
    assert.ok(
      Buffer.from(original.data).equals(buffer),
      "el original no se modifica",
    );
    for (const key of ["sm", "md", "lg", "xl"]) {
      const asset = state.assets.find((row) => row.variant === key)!;
      assert.equal(asset.mimeType, "image/webp");
      assert.ok(asset.width <= width, "nunca amplía la imagen");
      const ratio = asset.width / asset.height;
      assert.ok(Math.abs(ratio - width / height) < 0.01, "sin deformación");
      const meta = await sharp(Buffer.from(asset.data)).metadata();
      assert.equal(
        meta.exif,
        undefined,
        "las variantes públicas no llevan EXIF",
      );
    }
    assert.match(
      (data.heroImage as any).variants.sm.url,
      /^\/api\/settings\/login-appearance\/hero\/sm\?v=[0-9a-f]{12}$/,
    );
  });
}

test("hero upload rejects files that are not real images or are too small", async () => {
  const { service } = fakePrisma();
  const fake = Buffer.from("GIF89a no es una imagen permitida");
  let errors = await issues(() =>
    service.upload(
      { buffer: fake, size: fake.length, originalname: "a.jpg" },
      "admin",
    ),
  );
  assert.match(errors[0].message, /JPG, PNG o WEBP/);
  const broken = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]);
  errors = await issues(() =>
    service.upload({ buffer: broken, size: broken.length }, "admin"),
  );
  assert.match(errors[0].message, /dañada/);
  const tiny = await image(320, 200, "png");
  errors = await issues(() =>
    service.upload({ buffer: tiny, size: tiny.length }, "admin"),
  );
  assert.match(errors[0].message, /muy pequeña/);
});

test("light logo turns the dark ink white and the light background transparent", async () => {
  const { service } = fakePrisma();
  const { key, data } = await service.lightLogo();
  assert.equal(key, "greda");
  const { data: pixels, info } = await sharp(data)
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  let opaque = 0;
  let transparent = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha > 200) {
      opaque += 1;
      assert.ok(pixels[index] > 250, "las zonas visibles son blancas");
    } else if (alpha < 10) transparent += 1;
  }
  assert.ok(opaque > 0 && transparent > opaque, "el fondo queda transparente");
});
