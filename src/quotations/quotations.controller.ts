import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '../generated/prisma/enums';
import { Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/auth.guards';
import { QuotationsService } from './quotations.service';
import { QuotationPdfService } from './quotation-pdf.service';

@ApiTags('quotations')
@Controller('quotations')
export class QuotationsController {
  constructor(private service: QuotationsService, private pdf: QuotationPdfService) {}
  @Get() list(@Query() query: Record<string, string>) { return this.service.list(query); }
  @Get(':id/pdf') async getPdf(@Param('id') id: string, @Res() response: Response) {
    const buffer = await this.pdf.create(id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', 'inline; filename="cotizacion-' + id + '.pdf"');
    response.send(buffer);
  }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Roles(Role.ADMIN, Role.OPERARIO) @Post()
  create(@Body() body: any, @CurrentUser() user: AuthUser) { return this.service.create(body, user.id); }
  @Roles(Role.ADMIN, Role.OPERARIO) @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthUser) { return this.service.updateDraft(id, body, user.id); }
  @Roles(Role.ADMIN, Role.OPERARIO) @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.service.confirm(id, user.id); }
  @Roles(Role.ADMIN, Role.OPERARIO) @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.service.cancel(id, user.id); }
}
