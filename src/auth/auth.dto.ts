import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail({}, { message: "Ingresa un correo válido." }) email!: string;
  @IsString({ message: "Ingresa tu contraseña." })
  @MinLength(1, { message: "Ingresa tu contraseña." })
  password!: string;
}
export class BootstrapDto {
  @IsEmail({}, { message: "Ingresa un correo válido." }) email!: string;
  @IsString({ message: "Ingresa tu nombre." })
  @MinLength(2, { message: "Ingresa tu nombre." })
  displayName!: string;
  @IsString({ message: "Ingresa una contraseña." })
  @MinLength(12, {
    message: "La contraseña debe tener al menos 12 caracteres.",
  })
  password!: string;
}
