import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
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
import { SettingsService } from "./settings.service";
import { AuditHistoryService } from "./audit-history.service";
import {
  renderQuotationPdf,
  sampleQuote,
} from "../documents/quotation-pdf.renderer";
import { resolveUbigeo } from "../catalogs/catalogs";

type UploadedImage = { originalname: string; size: number; buffer: Buffer };

@ApiTags("settings")
@Controller("settings")
export class SettingsController {
  constructor(
    private service: SettingsService,
    private history: AuditHistoryService,
  ) {}

  @Get() get() {
    return this.service.get();
  }
  @Roles(Role.ADMIN)
  @Patch()
  update(@Body() body: Record<string, any>, @CurrentUser() user: AuthUser) {
    return this.service.update(body, user.id);
  }

  @Public() @Get("branding") branding() {
    return this.service.branding();
  }

  @Get("company") company() {
    return this.service.company();
  }
  @Roles(Role.ADMIN)
  @Patch("company")
  updateCompany(
    @Body() body: Record<string, any>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateCompany(body, user.id);
  }

  @Public()
  @Get("company/logo")
  async logo(@Req() request: Request, @Res() response: Response) {
    const logo = await this.service.logo();
    if (!logo) throw new NotFoundException("No hay un logo cargado.");
    const etag = '"' + logo.sha256 + '"';
    response.setHeader("ETag", etag);
    response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    response.setHeader("Cross-Origin-Resource-Policy", "same-site");
    if (request.headers["if-none-match"] === etag) {
      response.status(304).end();
      return;
    }
    response.setHeader("Content-Type", logo.mimeType);
    response.send(Buffer.from(logo.data));
  }
  @Roles(Role.ADMIN)
  @Put("company/logo")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  uploadLogo(
    @UploadedFile() file: UploadedImage,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.uploadLogo(file, user.id);
  }
  @Roles(Role.ADMIN)
  @Delete("company/logo")
  deleteLogo(@CurrentUser() user: AuthUser) {
    return this.service.deleteLogo(user.id);
  }

  @Get("documents") documents() {
    return this.service.documents();
  }
  @Roles(Role.ADMIN)
  @Patch("documents")
  updateDocuments(
    @Body() body: Record<string, any>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateDocuments(body, user.id);
  }

  /** Renders a sample quotation with unsaved company and document values, so the preview reflects edits before saving. */
  @Roles(Role.ADMIN)
  @Post("documents/preview")
  async preview(
    @Body()
    body: {
      company?: Record<string, any>;
      documents?: Record<string, any>;
      pages?: number;
    },
    @Res() response: Response,
  ) {
    const [company, documents, commercial, logo] = await Promise.all([
      this.service.company(),
      this.service.documents(),
      this.service.get(),
      this.service.logo(),
    ]);
    const draftDocuments = this.service.validateDocuments(
      body?.documents ?? {},
    );
    const draftCompany: Record<string, any> = {};
    for (const [key, value] of Object.entries(body?.company ?? {}))
      if (typeof value === "string" || value === null)
        draftCompany[key] = value;
    const location = resolveUbigeo(
      draftCompany.ubigeoCode ?? company.data.ubigeoCode,
    );
    const itemCount = body?.pages === 2 ? 18 : 4;
    const buffer = await renderQuotationPdf({
      company: { ...company.data, ...draftCompany, ...(location ?? {}) },
      documents: { ...documents.data, ...draftDocuments },
      logo: logo
        ? { data: Buffer.from(logo.data), mimeType: logo.mimeType }
        : null,
      quote: sampleQuote(Number(commercial.data.validityDays) || 30, itemCount),
    });
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      'inline; filename="vista-previa-cotizacion.pdf"',
    );
    response.setHeader("Cache-Control", "no-store");
    response.send(buffer);
  }

  @Roles(Role.ADMIN) @Get("sequences") sequences() {
    return this.service.sequenceList();
  }
  @Roles(Role.ADMIN)
  @Patch("sequences/:key")
  updateSequence(
    @Param("key") key: string,
    @Body() body: Record<string, any>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateSequence(key, body, user.id);
  }

  @Roles(Role.ADMIN) @Get("history") auditHistory(
    @Query() query: Record<string, string>,
  ) {
    return this.history.list(query);
  }
}
