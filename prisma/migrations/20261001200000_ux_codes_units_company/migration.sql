-- UX redesign: system-generated codes, canonical units, company/document settings.

-- Product: system code, stockable flag and optional piece sheet for the quoter.
ALTER TABLE "Product" ADD COLUMN "code" TEXT;
ALTER TABLE "Product" ADD COLUMN "isStockable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN "lengthCm" DECIMAL(24,12);
ALTER TABLE "Product" ADD COLUMN "widthCm" DECIMAL(24,12);
ALTER TABLE "Product" ADD COLUMN "heightCm" DECIMAL(24,12);
ALTER TABLE "Product" ADD COLUMN "clayWeightG" DECIMAL(24,12);
ALTER TABLE "Product" ADD COLUMN "defaultClayId" TEXT;
ALTER TABLE "Product" ADD COLUMN "defaultGlazeId" TEXT;
ALTER TABLE "Product" ALTER COLUMN "unit" SET DEFAULT 'und';
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
ALTER TABLE "Product" ADD CONSTRAINT "Product_defaultClayId_fkey" FOREIGN KEY ("defaultClayId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_defaultGlazeId_fkey" FOREIGN KEY ("defaultGlazeId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Customer" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

ALTER TABLE "InventoryMovement" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "InventoryMovement_code_key" ON "InventoryMovement"("code");

ALTER TABLE "CommercialSettings" ADD COLUMN "priceRounding" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "CommercialSettings" ADD COLUMN "defaultFiringType" TEXT NOT NULL DEFAULT 'SHARED';
ALTER TABLE "CommercialSettings" ADD COLUMN "defaultLowFiringEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CommercialSettings" ADD COLUMN "defaultHighFiringEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CommercialSettings" ADD COLUMN "defaultLowKilnId" TEXT;
ALTER TABLE "CommercialSettings" ADD COLUMN "defaultHighKilnId" TEXT;

CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "legalName" TEXT,
    "tradeName" TEXT,
    "ruc" TEXT,
    "address" TEXT,
    "addressReference" TEXT,
    "ubigeoCode" TEXT,
    "department" TEXT,
    "province" TEXT,
    "district" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "website" TEXT,
    "contactName" TEXT,
    "contactRole" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyLogo" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyLogo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showLegalName" BOOLEAN NOT NULL DEFAULT true,
    "showRuc" BOOLEAN NOT NULL DEFAULT true,
    "showAddress" BOOLEAN NOT NULL DEFAULT true,
    "showPhones" BOOLEAN NOT NULL DEFAULT true,
    "showEmail" BOOLEAN NOT NULL DEFAULT true,
    "showWebsite" BOOLEAN NOT NULL DEFAULT true,
    "validityText" TEXT,
    "conditions" TEXT,
    "observations" TEXT,
    "estimatedTime" TEXT,
    "paymentTerms" TEXT,
    "bankName" TEXT,
    "bankAccountHolder" TEXT,
    "bankAccount" TEXT,
    "bankCci" TEXT,
    "closingMessage" TEXT,
    "showSignature" BOOLEAN NOT NULL DEFAULT false,
    "signatureName" TEXT,
    "signatureRole" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NumberSequence" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "yearly" BOOLEAN NOT NULL DEFAULT false,
    "currentYear" INTEGER,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("key")
);

-- Canonical unit codes: g, kg, ml, L, cm, cm2, cm3, und, dia, hora.
UPDATE "Product" SET "unit" = CASE
    WHEN lower(btrim("unit")) IN ('g','gr','grs','gramo','gramos','gram') THEN 'g'
    WHEN lower(btrim("unit")) IN ('kg','kgs','kilo','kilos','kilogramo','kilogramos') THEN 'kg'
    WHEN lower(btrim("unit")) IN ('ml','mililitro','mililitros') THEN 'ml'
    WHEN lower(btrim("unit")) IN ('l','lt','lts','litro','litros') THEN 'L'
    WHEN lower(btrim("unit")) IN ('und','unid','unidad','unidades','unit','units','u') THEN 'und'
    ELSE "unit" END;
UPDATE "Product" SET "costUnit" = CASE
    WHEN lower(btrim("costUnit")) IN ('g','gr','grs','gramo','gramos','gram') THEN 'g'
    WHEN lower(btrim("costUnit")) IN ('kg','kgs','kilo','kilos','kilogramo','kilogramos') THEN 'kg'
    WHEN lower(btrim("costUnit")) IN ('ml','mililitro','mililitros') THEN 'ml'
    WHEN lower(btrim("costUnit")) IN ('l','lt','lts','litro','litros') THEN 'L'
    WHEN lower(btrim("costUnit")) IN ('und','unid','unidad','unidades','unit','units','u') THEN 'und'
    ELSE "costUnit" END
  WHERE "costUnit" IS NOT NULL;
UPDATE "Product" SET "purchaseUnit" = CASE
    WHEN lower(btrim("purchaseUnit")) IN ('g','gr','grs','gramo','gramos','gram') THEN 'g'
    WHEN lower(btrim("purchaseUnit")) IN ('kg','kgs','kilo','kilos','kilogramo','kilogramos') THEN 'kg'
    WHEN lower(btrim("purchaseUnit")) IN ('ml','mililitro','mililitros') THEN 'ml'
    WHEN lower(btrim("purchaseUnit")) IN ('l','lt','lts','litro','litros') THEN 'L'
    WHEN lower(btrim("purchaseUnit")) IN ('und','unid','unidad','unidades','unit','units','u') THEN 'und'
    ELSE "purchaseUnit" END
  WHERE "purchaseUnit" IS NOT NULL;
UPDATE "Recipe" SET "yieldUnit" = CASE
    WHEN lower(btrim("yieldUnit")) IN ('g','gr','grs','gramo','gramos','gram') THEN 'g'
    WHEN lower(btrim("yieldUnit")) IN ('kg','kgs','kilo','kilos','kilogramo','kilogramos') THEN 'kg'
    WHEN lower(btrim("yieldUnit")) IN ('und','unid','unidad','unidades','unit','units','u') THEN 'und'
    ELSE "yieldUnit" END;
UPDATE "RecipeItem" SET "unit" = CASE
    WHEN lower(btrim("unit")) IN ('g','gr','grs','gramo','gramos','gram') THEN 'g'
    WHEN lower(btrim("unit")) IN ('kg','kgs','kilo','kilos','kilogramo','kilogramos') THEN 'kg'
    WHEN lower(btrim("unit")) IN ('und','unid','unidad','unidades','unit','units','u') THEN 'und'
    ELSE "unit" END;
UPDATE "InventoryMovement" SET "unit" = CASE
    WHEN lower(btrim("unit")) IN ('g','gr','grs','gramo','gramos','gram') THEN 'g'
    WHEN lower(btrim("unit")) IN ('kg','kgs','kilo','kilos','kilogramo','kilogramos') THEN 'kg'
    WHEN lower(btrim("unit")) IN ('und','unid','unidad','unidades','unit','units','u') THEN 'und'
    ELSE "unit" END;

-- Services are never stocked; the legacy customer type RETAIL is the Spanish "Pormenor".
UPDATE "Product" SET "isStockable" = false WHERE "productType" = 'SERVICE';
UPDATE "Customer" SET "customerType" = 'PORMENOR' WHERE "customerType" = 'RETAIL';

-- Standard system codes for existing rows; master references stay in internalReference.
UPDATE "Product" p SET "code" = 'PRD-' || LPAD(s.rn::TEXT, 6, '0')
  FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "internalReference" NULLS LAST, "id") AS rn FROM "Product") s
  WHERE p."id" = s."id";
UPDATE "Worker" w SET "code" = 'TRB-' || LPAD(s.rn::TEXT, 6, '0')
  FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn FROM "Worker") s
  WHERE w."id" = s."id";
UPDATE "Technique" t SET "code" = 'TEC-' || LPAD(s.rn::TEXT, 6, '0')
  FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "code" NULLS LAST, "createdAt", "id") AS rn FROM "Technique") s
  WHERE t."id" = s."id";
UPDATE "Kiln" k SET "code" = 'HOR-' || LPAD(s.rn::TEXT, 6, '0')
  FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "capacityCm3", "id") AS rn FROM "Kiln") s
  WHERE k."id" = s."id";
UPDATE "Customer" c SET "code" = 'CLI-' || LPAD(s.rn::TEXT, 6, '0')
  FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn FROM "Customer") s
  WHERE c."id" = s."id";
UPDATE "InventoryMovement" m SET "code" = 'MOV-' || LPAD(s.rn::TEXT, 6, '0')
  FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn FROM "InventoryMovement") s
  WHERE m."id" = s."id";

INSERT INTO "NumberSequence" ("key", "label", "prefix", "padding", "yearly", "lastValue") VALUES
  ('PRODUCT', 'Productos', 'PRD', 6, false, (SELECT COUNT(*) FROM "Product")),
  ('CUSTOMER', 'Clientes', 'CLI', 6, false, (SELECT COUNT(*) FROM "Customer")),
  ('WORKER', 'Trabajadores', 'TRB', 6, false, (SELECT COUNT(*) FROM "Worker")),
  ('TECHNIQUE', 'Técnicas', 'TEC', 6, false, (SELECT COUNT(*) FROM "Technique")),
  ('KILN', 'Hornos', 'HOR', 6, false, (SELECT COUNT(*) FROM "Kiln")),
  ('MOVEMENT', 'Movimientos de inventario', 'MOV', 6, false, (SELECT COUNT(*) FROM "InventoryMovement"));

-- Quotations keep CTZ-YYYY-NNNNNN and continue the yearly counter.
INSERT INTO "NumberSequence" ("key", "label", "prefix", "padding", "yearly", "currentYear", "lastValue")
  SELECT 'QUOTATION', 'Cotizaciones', 'CTZ', 6, true, s."year", s."lastValue"
  FROM "Sequence" s ORDER BY s."year" DESC LIMIT 1;
INSERT INTO "NumberSequence" ("key", "label", "prefix", "padding", "yearly", "lastValue")
  VALUES ('QUOTATION', 'Cotizaciones', 'CTZ', 6, true, 0)
  ON CONFLICT ("key") DO NOTHING;

DROP TABLE "Sequence";
