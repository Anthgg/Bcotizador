-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERARIO', 'TESTER');

-- CreateEnum
CREATE TYPE "WorkerType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('RAW_MATERIAL', 'PREPARED_MATERIAL', 'FINISHED_PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING_BALANCE', 'ENTRY', 'EXIT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TechniqueRule" AS ENUM ('UN_FACTOR', 'DOS_FACTORES', 'SIMPLE');

-- CreateEnum
CREATE TYPE "FiringStage" AS ENUM ('LOW', 'HIGH');

-- CreateEnum
CREATE TYPE "FiringType" AS ENUM ('SHARED', 'EXCLUSIVE');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CostStatus" AS ENUM ('READY', 'COST_INCOMPLETE');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'TESTER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "internalReference" TEXT,
    "name" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL DEFAULT 'FINISHED_PRODUCT',
    "categoryId" TEXT,
    "posCategoryId" TEXT,
    "salesTax" DECIMAL(8,6),
    "purchaseTax" DECIMAL(8,6),
    "canSell" BOOLEAN NOT NULL DEFAULT true,
    "canBuy" BOOLEAN NOT NULL DEFAULT false,
    "posAvailable" BOOLEAN NOT NULL DEFAULT false,
    "salePrice" DECIMAL(24,12),
    "unitCost" DECIMAL(24,12),
    "costPerGram" DECIMAL(27,15),
    "costUnit" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "purchaseUnit" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "identificationType" TEXT,
    "identificationNumber" TEXT,
    "street" TEXT,
    "district" TEXT,
    "province" TEXT,
    "department" TEXT,
    "country" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "bankAccount" TEXT,
    "bankName" TEXT,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "displayName" TEXT NOT NULL,
    "customerType" TEXT NOT NULL DEFAULT 'PORMENOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" DECIMAL(24,12) NOT NULL,
    "unit" TEXT NOT NULL,
    "reason" TEXT,
    "sourceKey" TEXT,
    "importBatchId" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "outputProductId" TEXT NOT NULL,
    "yieldQuantity" DECIMAL(24,12) NOT NULL,
    "yieldUnit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeItem" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientProductId" TEXT NOT NULL,
    "quantity" DECIMAL(24,12) NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "RecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "workerType" "WorkerType" NOT NULL DEFAULT 'INTERNAL',
    "dailyRate" DECIMAL(24,12),
    "hoursPerDay" DECIMAL(8,3) DEFAULT 8,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Technique" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "rule" "TechniqueRule" NOT NULL DEFAULT 'SIMPLE',
    "factor1" DECIMAL(24,12),
    "factor2" DECIMAL(24,12),
    "cycleRate" DECIMAL(24,12),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Technique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerTechnique" (
    "workerId" TEXT NOT NULL,
    "techniqueId" TEXT NOT NULL,
    "factor1Override" DECIMAL(24,12),
    "factor2Override" DECIMAL(24,12),
    "rateOverride" DECIMAL(24,12),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerTechnique_pkey" PRIMARY KEY ("workerId","techniqueId")
);

-- CreateTable
CREATE TABLE "ProductTechnique" (
    "productId" TEXT NOT NULL,
    "techniqueId" TEXT NOT NULL,
    "defaultWorkerId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductTechnique_pkey" PRIMARY KEY ("productId","techniqueId")
);

-- CreateTable
CREATE TABLE "Kiln" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "class" TEXT,
    "capacityCm3" DECIMAL(24,12) NOT NULL,
    "lowRate" DECIMAL(24,12) NOT NULL,
    "highRate" DECIMAL(24,12) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kiln_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "glazeDefaultPct" DECIMAL(8,6) NOT NULL DEFAULT 0.15,
    "separationXcm" DECIMAL(8,3) NOT NULL DEFAULT 3,
    "separationYcm" DECIMAL(8,3) NOT NULL DEFAULT 3,
    "separationZcm" DECIMAL(8,3) NOT NULL DEFAULT 3,
    "productionFactorDefault" DECIMAL(12,6) NOT NULL DEFAULT 3,
    "productionFactorMin" DECIMAL(12,6) NOT NULL DEFAULT 2,
    "igvRate" DECIMAL(8,6) NOT NULL DEFAULT 0.18,
    "rentPerDay" DECIMAL(24,12) NOT NULL DEFAULT 110,
    "utilitiesPerDay" DECIMAL(24,12) NOT NULL DEFAULT 10,
    "administrativeCost" DECIMAL(24,12) NOT NULL DEFAULT 200,
    "hoursPerCycle" DECIMAL(8,3) NOT NULL DEFAULT 8,
    "validityDays" INTEGER NOT NULL DEFAULT 30,
    "dayAdjustments" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "costStatus" "CostStatus" NOT NULL DEFAULT 'READY',
    "customerId" TEXT NOT NULL,
    "validityDays" INTEGER NOT NULL DEFAULT 30,
    "productionFactor" DECIMAL(12,6) NOT NULL,
    "productionDays" DECIMAL(12,6) NOT NULL,
    "materialCost" DECIMAL(24,12),
    "laborCost" DECIMAL(24,12),
    "firingCost" DECIMAL(24,12),
    "technicalCost" DECIMAL(24,12),
    "otherCosts" DECIMAL(24,12),
    "subtotal" DECIMAL(24,12),
    "igvRate" DECIMAL(8,6) NOT NULL,
    "igvAmount" DECIMAL(24,12),
    "total" DECIMAL(24,12),
    "unitPrice" DECIMAL(24,12),
    "inputSnapshot" JSONB NOT NULL,
    "economicSnapshot" JSONB,
    "createdById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(24,12) NOT NULL,
    "lengthCm" DECIMAL(24,12),
    "widthCm" DECIMAL(24,12),
    "heightCm" DECIMAL(24,12),
    "clayWeightG" DECIMAL(24,12) NOT NULL,
    "materialCost" DECIMAL(24,12),
    "laborCost" DECIMAL(24,12),
    "firingCost" DECIMAL(24,12),
    "unitPrice" DECIMAL(24,12),
    "lineTotal" DECIMAL(24,12),
    "inputSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationMaterial" (
    "id" TEXT NOT NULL,
    "quotationItemId" TEXT NOT NULL,
    "materialType" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT,
    "quantity" DECIMAL(24,12) NOT NULL,
    "unit" TEXT NOT NULL,
    "appliedUnitCost" DECIMAL(27,15),
    "cost" DECIMAL(24,12),

    CONSTRAINT "QuotationMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationLaborTask" (
    "id" TEXT NOT NULL,
    "quotationItemId" TEXT NOT NULL,
    "workerId" TEXT,
    "techniqueId" TEXT NOT NULL,
    "workerName" TEXT,
    "techniqueName" TEXT NOT NULL,
    "quantity" DECIMAL(24,12) NOT NULL,
    "factor1" DECIMAL(24,12),
    "factor2" DECIMAL(24,12),
    "cycles" DECIMAL(24,12),
    "calculatedHours" DECIMAL(24,12),
    "appliedHours" DECIMAL(24,12),
    "rate" DECIMAL(24,12),
    "cost" DECIMAL(24,12),

    CONSTRAINT "QuotationLaborTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationFiring" (
    "id" TEXT NOT NULL,
    "quotationItemId" TEXT NOT NULL,
    "stage" "FiringStage" NOT NULL,
    "firingType" "FiringType" NOT NULL,
    "kilnId" TEXT,
    "kilnName" TEXT,
    "capacityCm3" DECIMAL(24,12),
    "tariff" DECIMAL(24,12),
    "occupancy" DECIMAL(12,8),
    "batches" DECIMAL(24,12),
    "volumeCm3" DECIMAL(24,12) NOT NULL,
    "cost" DECIMAL(24,12),

    CONSTRAINT "QuotationFiring_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationTotals" (
    "quotationId" TEXT NOT NULL,
    "materialCost" DECIMAL(24,12),
    "laborCost" DECIMAL(24,12),
    "firingCost" DECIMAL(24,12),
    "technicalCost" DECIMAL(24,12),
    "productionFactor" DECIMAL(12,6) NOT NULL,
    "productionDays" DECIMAL(12,6) NOT NULL,
    "otherCosts" DECIMAL(24,12),
    "subtotal" DECIMAL(24,12),
    "igvRate" DECIMAL(8,6) NOT NULL,
    "igvAmount" DECIMAL(24,12),
    "total" DECIMAL(24,12),
    "unitPrice" DECIMAL(24,12),

    CONSTRAINT "QuotationTotals_pkey" PRIMARY KEY ("quotationId")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "preview" JSONB NOT NULL,
    "rawData" JSONB NOT NULL,
    "createdById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportError" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "severity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_name_key" ON "ProductCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PosCategory_name_key" ON "PosCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_internalReference_key" ON "Product"("internalReference");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_productType_isActive_idx" ON "Product"("productType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_identificationNumber_key" ON "Contact"("identificationNumber");

-- CreateIndex
CREATE INDEX "Contact_displayName_idx" ON "Contact"("displayName");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_contactId_key" ON "Customer"("contactId");

-- CreateIndex
CREATE INDEX "Customer_displayName_idx" ON "Customer"("displayName");

-- CreateIndex
CREATE INDEX "Customer_customerType_idx" ON "Customer"("customerType");

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_sourceKey_key" ON "InventoryMovement"("sourceKey");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_locationId_createdAt_idx" ON "InventoryMovement"("productId", "locationId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_importBatchId_idx" ON "InventoryMovement"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_outputProductId_key" ON "Recipe"("outputProductId");

-- CreateIndex
CREATE INDEX "RecipeItem_recipeId_idx" ON "RecipeItem"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeItem_ingredientProductId_idx" ON "RecipeItem"("ingredientProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_code_key" ON "Worker"("code");

-- CreateIndex
CREATE INDEX "Worker_name_idx" ON "Worker"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Technique_code_key" ON "Technique"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Technique_name_key" ON "Technique"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Kiln_code_key" ON "Kiln"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Kiln_name_key" ON "Kiln"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_code_key" ON "Quotation"("code");

-- CreateIndex
CREATE INDEX "Quotation_status_createdAt_idx" ON "Quotation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Quotation_customerId_createdAt_idx" ON "Quotation"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_sha256_key" ON "ImportBatch"("sha256");

-- CreateIndex
CREATE INDEX "ImportBatch_status_createdAt_idx" ON "ImportBatch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ImportError_batchId_severity_idx" ON "ImportError"("batchId", "severity");

-- CreateIndex
CREATE INDEX "AuditEvent_entity_entityId_createdAt_idx" ON "AuditEvent"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosCategory" ADD CONSTRAINT "PosCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PosCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_posCategoryId_fkey" FOREIGN KEY ("posCategoryId") REFERENCES "PosCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_outputProductId_fkey" FOREIGN KEY ("outputProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_ingredientProductId_fkey" FOREIGN KEY ("ingredientProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerTechnique" ADD CONSTRAINT "WorkerTechnique_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerTechnique" ADD CONSTRAINT "WorkerTechnique_techniqueId_fkey" FOREIGN KEY ("techniqueId") REFERENCES "Technique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTechnique" ADD CONSTRAINT "ProductTechnique_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTechnique" ADD CONSTRAINT "ProductTechnique_techniqueId_fkey" FOREIGN KEY ("techniqueId") REFERENCES "Technique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTechnique" ADD CONSTRAINT "ProductTechnique_defaultWorkerId_fkey" FOREIGN KEY ("defaultWorkerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationMaterial" ADD CONSTRAINT "QuotationMaterial_quotationItemId_fkey" FOREIGN KEY ("quotationItemId") REFERENCES "QuotationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationMaterial" ADD CONSTRAINT "QuotationMaterial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLaborTask" ADD CONSTRAINT "QuotationLaborTask_quotationItemId_fkey" FOREIGN KEY ("quotationItemId") REFERENCES "QuotationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLaborTask" ADD CONSTRAINT "QuotationLaborTask_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLaborTask" ADD CONSTRAINT "QuotationLaborTask_techniqueId_fkey" FOREIGN KEY ("techniqueId") REFERENCES "Technique"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationFiring" ADD CONSTRAINT "QuotationFiring_quotationItemId_fkey" FOREIGN KEY ("quotationItemId") REFERENCES "QuotationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationFiring" ADD CONSTRAINT "QuotationFiring_kilnId_fkey" FOREIGN KEY ("kilnId") REFERENCES "Kiln"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationTotals" ADD CONSTRAINT "QuotationTotals_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportError" ADD CONSTRAINT "ImportError_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
