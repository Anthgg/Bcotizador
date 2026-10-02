CREATE TYPE "AssistantKnowledgeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "AssistantSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

CREATE TABLE "AssistantKnowledgeEntry" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "module" TEXT,
    "step" TEXT,
    "adminOnly" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL,
    "status" "AssistantKnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantKnowledgeEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssistantKnowledgeSuggestion" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "proposedAnswer" TEXT,
    "route" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "step" TEXT,
    "status" "AssistantSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "submittedById" TEXT,
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "knowledgeEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "AssistantKnowledgeSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssistantInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "step" TEXT,
    "entityId" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT true,
    "costSensitive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantInteraction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssistantFeedback" (
    "id" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuotationOutcome" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "productTypes" JSONB NOT NULL,
    "quantity" DECIMAL(24,12) NOT NULL,
    "dimensions" JSONB NOT NULL,
    "materials" JSONB NOT NULL,
    "moldCount" INTEGER NOT NULL,
    "workers" JSONB NOT NULL,
    "techniques" JSONB NOT NULL,
    "activeHours" DECIMAL(24,12),
    "firingConfiguration" JSONB NOT NULL,
    "estimatedCost" DECIMAL(24,12),
    "finalCost" DECIMAL(24,12),
    "estimatedTime" DECIMAL(24,12),
    "actualTime" DECIMAL(24,12),
    "notes" TEXT,
    "resultQuality" TEXT,
    "outcomeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuotationOutcome_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FiringOutcome" (
    "id" TEXT NOT NULL,
    "kilnId" TEXT,
    "kilnName" TEXT,
    "firingType" "FiringType" NOT NULL,
    "volumeCm3" DECIMAL(24,12) NOT NULL,
    "capacityCm3" DECIMAL(24,12) NOT NULL,
    "occupancyRatio" DECIMAL(12,8) NOT NULL,
    "quantity" DECIMAL(24,12) NOT NULL,
    "productTypes" JSONB NOT NULL,
    "materials" JSONB NOT NULL,
    "estimatedCost" DECIMAL(24,12),
    "realCost" DECIMAL(24,12),
    "durationMinutes" DECIMAL(24,12),
    "damagedPieces" INTEGER NOT NULL DEFAULT 0,
    "observations" TEXT,
    "outcomeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FiringOutcome_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecommendationEvent" (
    "id" TEXT NOT NULL,
    "recommendationType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "estimatedSaving" DECIMAL(24,12),
    "sourceCases" JSONB NOT NULL DEFAULT '[]',
    "confidence" "ConfidenceLevel" NOT NULL,
    "accepted" BOOLEAN,
    "appliedAt" TIMESTAMP(3),
    "scenario" JSONB,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecommendationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecommendationResult" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "estimatedSaving" DECIMAL(24,12),
    "realSaving" DECIMAL(24,12),
    "estimatedTimeChange" DECIMAL(24,12),
    "realTimeChange" DECIMAL(24,12),
    "resultQuality" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecommendationResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssistantKnowledgeEntry_slug_version_key" ON "AssistantKnowledgeEntry"("slug", "version");
CREATE INDEX "AssistantKnowledgeEntry_status_module_step_idx" ON "AssistantKnowledgeEntry"("status", "module", "step");
CREATE INDEX "AssistantKnowledgeSuggestion_status_createdAt_idx" ON "AssistantKnowledgeSuggestion"("status", "createdAt");
CREATE INDEX "AssistantInteraction_userId_createdAt_idx" ON "AssistantInteraction"("userId", "createdAt");
CREATE INDEX "AssistantInteraction_resolved_createdAt_idx" ON "AssistantInteraction"("resolved", "createdAt");
CREATE UNIQUE INDEX "AssistantFeedback_interactionId_key" ON "AssistantFeedback"("interactionId");
CREATE INDEX "AssistantFeedback_userId_createdAt_idx" ON "AssistantFeedback"("userId", "createdAt");
CREATE INDEX "QuotationOutcome_outcomeDate_quantity_idx" ON "QuotationOutcome"("outcomeDate", "quantity");
CREATE INDEX "QuotationOutcome_quotationId_outcomeDate_idx" ON "QuotationOutcome"("quotationId", "outcomeDate");
CREATE INDEX "FiringOutcome_kilnId_firingType_outcomeDate_idx" ON "FiringOutcome"("kilnId", "firingType", "outcomeDate");
CREATE INDEX "FiringOutcome_volumeCm3_capacityCm3_idx" ON "FiringOutcome"("volumeCm3", "capacityCm3");
CREATE INDEX "RecommendationEvent_entityType_entityId_createdAt_idx" ON "RecommendationEvent"("entityType", "entityId", "createdAt");
CREATE INDEX "RecommendationEvent_recommendationType_createdAt_idx" ON "RecommendationEvent"("recommendationType", "createdAt");
CREATE UNIQUE INDEX "RecommendationResult_recommendationId_key" ON "RecommendationResult"("recommendationId");
CREATE INDEX "RecommendationResult_createdAt_idx" ON "RecommendationResult"("createdAt");

ALTER TABLE "AssistantKnowledgeSuggestion" ADD CONSTRAINT "AssistantKnowledgeSuggestion_knowledgeEntryId_fkey"
FOREIGN KEY ("knowledgeEntryId") REFERENCES "AssistantKnowledgeEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssistantFeedback" ADD CONSTRAINT "AssistantFeedback_interactionId_fkey"
FOREIGN KEY ("interactionId") REFERENCES "AssistantInteraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationResult" ADD CONSTRAINT "RecommendationResult_recommendationId_fkey"
FOREIGN KEY ("recommendationId") REFERENCES "RecommendationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
