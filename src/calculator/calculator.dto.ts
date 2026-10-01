import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  Max,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

function parseNumber(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) return value;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : value;
}

function Numeric() {
  return Transform(({ value }) => parseNumber(value));
}

export class CalculatorLaborTaskDto {
  @IsString()
  techniqueId!: string;

  @IsOptional()
  @IsString()
  workerId?: string;

  @IsOptional()
  @IsString()
  workerName?: string;

  @Numeric()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  quantity!: number;

  @IsOptional()
  @Numeric()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  factor1?: number;

  @IsOptional()
  @Numeric()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  factor2?: number;

  @IsOptional()
  @Numeric()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  appliedHours?: number;

  @IsOptional()
  @Numeric()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  rateOverride?: number;
}

export class CalculatorFiringDto {
  @IsIn(['LOW', 'HIGH'])
  stage!: 'LOW' | 'HIGH';

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  kilnId?: string;

  @IsIn(['SHARED', 'EXCLUSIVE'])
  firingType!: 'SHARED' | 'EXCLUSIVE';

  // Preserved for existing clients; firing occupancy is derived from volume and kiln capacity.
  @IsOptional()
  @Numeric()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  occupancy?: number;
}

export class CalculatorItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @Numeric()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @Numeric()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  lengthCm?: number;

  @IsOptional()
  @Numeric()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  widthCm?: number;

  @IsOptional()
  @Numeric()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  heightCm?: number;

  @IsOptional()
  @Numeric()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  clayWeightG?: number;

  @IsOptional()
  @IsString()
  clayProductId?: string;

  @IsOptional()
  @IsString()
  glazeProductId?: string;

  @IsOptional()
  @Numeric()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1)
  glazePercent?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalculatorLaborTaskDto)
  laborTasks!: CalculatorLaborTaskDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalculatorFiringDto)
  firings!: CalculatorFiringDto[];
}

/** Mirrors the frontend quotation draft payload accepted by POST /api/quotation-calculations. */
export class CalculatorInputDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  validityDays?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CalculatorItemDto)
  items!: CalculatorItemDto[];

  @IsOptional()
  @Numeric()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  productionFactor?: number;

  @IsOptional()
  @Numeric()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  productionDays?: number;
}
