import { BadRequestException, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Role } from '../generated/prisma/enums';
import { Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/auth.guards';
import { ImportsService } from './imports.service';
type UploadedWorkbook = { originalname: string; size: number; buffer: Buffer };

@ApiTags('imports')
@Controller('imports')
export class ImportsController {
  constructor(private service: ImportsService, private config: ConfigService) {}
  @Roles(Role.ADMIN) @Get('master')
  list() { return this.service.list(); }
  @Roles(Role.ADMIN) @Get('master/:id')
  get(@Param('id') id: string) { return this.service.get(id); }
  @Roles(Role.ADMIN) @Post('master/preview') @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async preview(@UploadedFile() file: UploadedWorkbook, @CurrentUser() user: AuthUser) {
    const maxBytes=(Number(this.config.get('MAX_UPLOAD_MB')??20)||20)*1024*1024;
    if(file && file.size>maxBytes) throw new BadRequestException('El XLSX supera el tamaño máximo permitido');
    return this.service.preview(file,user.id);
  }
  @Roles(Role.ADMIN) @Post('master/:id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.service.confirm(id,user.id); }
}
