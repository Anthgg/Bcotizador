CREATE TYPE "LaborBillingMode" AS ENUM ('INTERNAL_INCLUDED', 'HOURLY');

ALTER TABLE "Worker"
ADD COLUMN "billingMode" "LaborBillingMode" NOT NULL DEFAULT 'INTERNAL_INCLUDED';

UPDATE "Worker"
SET "billingMode" = 'HOURLY'
WHERE "workerType" = 'EXTERNAL';

ALTER TABLE "WorkerTechnique"
ADD COLUMN "productivityOverride" DECIMAL(12,6);

ALTER TABLE "QuotationItem"
ADD COLUMN "moldCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "productionTimePerCycleMinutes" DECIMAL(10,3) NOT NULL DEFAULT 480;
