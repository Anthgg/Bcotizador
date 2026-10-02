import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { FiringType } from "../generated/prisma/enums";
import { CalculatorInputDto } from "../calculator/calculator.dto";

export class AssistantContextDto {
  @IsString()
  @MaxLength(300)
  route!: string;

  @IsString()
  @MaxLength(80)
  module!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  step?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;
}

export class AssistantAskDto {
  @ValidateNested()
  @Type(() => AssistantContextDto)
  context!: AssistantContextDto;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  question!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CalculatorInputDto)
  currentInput?: CalculatorInputDto;
}

export class AssistantFeedbackDto {
  @IsString()
  @MaxLength(100)
  interactionId!: string;

  @IsBoolean()
  helpful!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class AssistantKnowledgeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  slug!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(12000)
  content!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  module?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  step?: string;

  @IsOptional()
  @IsBoolean()
  publish?: boolean;

  @IsOptional()
  @IsBoolean()
  adminOnly?: boolean;
}

export class AssistantSuggestionDto {
  @ValidateNested()
  @Type(() => AssistantContextDto)
  context!: AssistantContextDto;

  @IsString()
  @MinLength(4)
  @MaxLength(2000)
  question!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  proposedAnswer?: string;
}

export class AssistantSuggestionReviewDto {
  @IsEnum(["APPROVE", "REJECT"])
  decision!: "APPROVE" | "REJECT";

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  proposedAnswer?: string;

  @IsOptional()
  @IsBoolean()
  adminOnly?: boolean;
}

export class AssistantRecommendationsDto {
  @ValidateNested()
  @Type(() => CalculatorInputDto)
  current!: CalculatorInputDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  availableMoldCount?: number;

  @IsOptional()
  @IsBoolean()
  moldCompatibilityConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;
}

export const AssistantScenarioType = {
  MORE_MOLDS: "MORE_MOLDS",
  REPLACE_WORKER: "REPLACE_WORKER",
  REPLACE_KILN: "REPLACE_KILN",
  REMOVE_HIGH_FIRING: "REMOVE_HIGH_FIRING",
  REMOVE_OPTIONAL_TECHNIQUE: "REMOVE_OPTIONAL_TECHNIQUE",
  CONSOLIDATE_FIRINGS: "CONSOLIDATE_FIRINGS",
} as const;
export type AssistantScenarioType =
  (typeof AssistantScenarioType)[keyof typeof AssistantScenarioType];

export class AssistantScenarioDto {
  @IsEnum(AssistantScenarioType)
  type!: AssistantScenarioType;

  @IsOptional()
  @IsInt()
  @Min(0)
  itemIndex?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  moldCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  availableMoldCount?: number;

  @IsOptional()
  @IsBoolean()
  moldCompatibilityConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  workerId?: string;

  @IsOptional()
  @IsBoolean()
  workerAvailabilityConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  kilnId?: string;

  @IsOptional()
  @IsBoolean()
  firingCompatibilityConfirmed?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(0, { each: true })
  itemIndices?: number[];

  @IsOptional()
  @IsIn(["LOW", "HIGH"])
  stage?: "LOW" | "HIGH";

  @IsOptional()
  @IsBoolean()
  firingScheduleConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  techniqueId?: string;

  @IsOptional()
  @IsBoolean()
  explicitClientApproval?: boolean;
}

export class AssistantSimulationDto {
  @ValidateNested()
  @Type(() => CalculatorInputDto)
  current!: CalculatorInputDto;

  @ValidateNested()
  @Type(() => AssistantScenarioDto)
  scenario!: AssistantScenarioDto;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;
}

export class QuotationOutcomeDto {
  @IsString()
  @MaxLength(100)
  quotationId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 12 })
  @Min(0)
  finalCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 12 })
  @Min(0)
  estimatedTime?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 12 })
  @Min(0)
  actualTime?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  resultQuality?: string;

  @IsOptional()
  @IsDateString()
  outcomeDate?: string;
}

export class FiringOutcomeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  kilnId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  kilnName?: string;

  @IsEnum(FiringType)
  firingType!: FiringType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 12 })
  @Min(0)
  volumeCm3!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 12 })
  @Min(0.000001)
  capacityCm3!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 12 })
  @Min(0)
  quantity!: number;

  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  productTypes!: string[];

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  materials!: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 12 })
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 12 })
  @Min(0)
  realCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 12 })
  @Min(0)
  durationMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  damagedPieces?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observations?: string;

  @IsOptional()
  @IsDateString()
  outcomeDate?: string;
}

export class RecommendationResultDto {
  @IsString()
  @MaxLength(100)
  eventId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 12 })
  realSaving?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 12 })
  estimatedTimeChange?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 12 })
  realTimeChange?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  resultQuality?: string;
}

export class RecommendationDecisionDto {
  @IsBoolean()
  accepted!: boolean;
}
