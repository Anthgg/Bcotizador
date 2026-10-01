import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) password!: string;
}
export class BootstrapDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) displayName!: string;
  @IsString() @MinLength(12) password!: string;
}
