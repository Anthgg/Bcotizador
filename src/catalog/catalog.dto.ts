import { IsBoolean, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { NumericField } from '../common/dto-transforms';

export class WorkerTechniqueBodyDto {
  [key: string]: any;

  @IsOptional()
  @NumericField()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  factor1Override?: number | null;

  @IsOptional()
  @NumericField()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  factor2Override?: number | null;

  @IsOptional()
  @NumericField()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  rateOverride?: number | null;

  @IsOptional()
  @NumericField()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  cycleRateOverride?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ProductTechniqueBodyDto {
  [key: string]: any;

  @IsOptional()
  @IsString()
  defaultWorkerId?: string | null;

  @IsOptional()
  @NumericField()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}
