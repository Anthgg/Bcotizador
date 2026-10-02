import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { Role } from "../generated/prisma/enums";
import { Public, Roles } from "../common/auth.decorators";
import { CurrentUser } from "../common/current-user.decorator";
import { AuthUser } from "../common/auth.guards";
import { LoginAppearanceService } from "./login-appearance.service";

type UploadedImage = { originalname: string; size: number; buffer: Buffer };

@ApiTags("settings")
@Controller("settings/login-appearance")
export class LoginAppearanceController {
  constructor(private service: LoginAppearanceService) {}

  /** Público: el login lo necesita antes de iniciar sesión. Solo contiene parámetros visuales. */
  @Public() @Get() get() {
    return this.service.get();
  }

  @Roles(Role.ADMIN)
  @Patch()
  update(@Body() body: Record<string, any>, @CurrentUser() user: AuthUser) {
    return this.service.update(body, user.id);
  }

  @Roles(Role.ADMIN)
  @Put("hero")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 40 * 1024 * 1024, files: 1 },
    }),
  )
  upload(@UploadedFile() file: UploadedImage, @CurrentUser() user: AuthUser) {
    return this.service.upload(file, user.id);
  }

  @Roles(Role.ADMIN)
  @Delete("hero")
  reset(@CurrentUser() user: AuthUser) {
    return this.service.reset(user.id);
  }

  /** Variantes WEBP públicas (sin metadatos). El original conserva EXIF, así que solo lo descarga un administrador. */
  @Public()
  @Get("hero/:variant")
  async variant(
    @Param("variant") variant: string,
    @Query("v") version: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (variant === "original")
      throw new NotFoundException("Usa la descarga de administrador.");
    return this.send(variant, version, request, response);
  }

  @Public()
  @Get("logo-light")
  async lightLogo(
    @Query("v") version: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const logo = await this.service.lightLogo();
    const etag = `"logo-light-${logo.key}"`;
    response.setHeader("ETag", etag);
    response.setHeader(
      "Cache-Control",
      version === logo.key ? "public, max-age=31536000, immutable" : "no-cache",
    );
    response.setHeader("Cross-Origin-Resource-Policy", "same-site");
    if (request.headers["if-none-match"] === etag) {
      response.status(304).end();
      return;
    }
    response.setHeader("Content-Type", "image/png");
    response.send(logo.data);
  }

  @Roles(Role.ADMIN)
  @Get("hero-original")
  original(@Req() request: Request, @Res() response: Response) {
    return this.send("original", undefined, request, response);
  }

  private async send(
    variant: string,
    version: string | undefined,
    request: Request,
    response: Response,
  ) {
    const asset = await this.service.asset(variant);
    if (!asset) throw new NotFoundException("No hay una imagen cargada.");
    const etag = `"${variant}-${asset.createdAt.getTime()}-${asset.size}"`;
    response.setHeader("ETag", etag);
    response.setHeader(
      "Cache-Control",
      version ? "public, max-age=31536000, immutable" : "no-cache",
    );
    response.setHeader("Cross-Origin-Resource-Policy", "same-site");
    if (request.headers["if-none-match"] === etag) {
      response.status(304).end();
      return;
    }
    response.setHeader("Content-Type", asset.mimeType);
    response.send(Buffer.from(asset.data));
  }
}
