import {
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { InventoryMovementType } from "../generated/prisma/enums";

export class InventoryMovementDto {
  @IsString({ message: "Selecciona un producto." })
  @MinLength(1, { message: "Selecciona un producto." })
  productId!: string;
  @IsOptional()
  @IsString({ message: "Selecciona una ubicación." })
  locationId?: string;
  @IsEnum(InventoryMovementType, {
    message: "Selecciona el tipo de movimiento.",
  })
  type!: InventoryMovementType;
  @IsNumberString({}, { message: "Ingresa una cantidad válida." })
  quantity!: string;
  @IsString({ message: "Selecciona una unidad." })
  @MinLength(1, { message: "Selecciona una unidad." })
  unit!: string;
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "El motivo no puede superar 500 caracteres." })
  reason?: string;
}
