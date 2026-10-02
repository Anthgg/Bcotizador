CREATE TABLE "LoginAppearance" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "focalX" INTEGER NOT NULL DEFAULT 50,
    "focalY" INTEGER NOT NULL DEFAULT 50,
    "overlay" DECIMAL(3,2) NOT NULL DEFAULT 0.45,
    "title" TEXT NOT NULL DEFAULT 'Cotiza, produce y entrega con orden.',
    "highlight" TEXT DEFAULT 'entrega con orden.',
    "subtitle" TEXT NOT NULL DEFAULT 'Productos, costos, mano de obra y quemas del taller en un solo lugar.',
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "logoTone" TEXT NOT NULL DEFAULT 'LIGHT',
    "heroVersion" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoginAppearance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoginHeroAsset" (
    "variant" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "fileName" TEXT,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginHeroAsset_pkey" PRIMARY KEY ("variant")
);

-- La imagen incluida del taller tiene el horno a la derecha del centro.
INSERT INTO "LoginAppearance" ("id", "focalX", "focalY", "updatedAt") VALUES ('default', 64, 52, CURRENT_TIMESTAMP);
