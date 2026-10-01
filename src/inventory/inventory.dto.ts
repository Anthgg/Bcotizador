import { IsEnum, IsNumberString, IsOptional, IsString, MinLength } from 'class-validator';
import { InventoryMovementType } from '../generated/prisma/enums';

export class InventoryMovementDto {
  @IsString() @MinLength(1) productId!: string;
  @IsOptional() @IsString() locationId?: string;
  @IsEnum(InventoryMovementType) type!: InventoryMovementType;
  @IsNumberString() quantity!: string;
  @IsString() @MinLength(1) unit!: string;
  @IsOptional() @IsString() reason?: string;
}
