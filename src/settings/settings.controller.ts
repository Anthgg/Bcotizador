import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '../generated/prisma/enums';
import { Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/auth.guards';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private service: SettingsService) {}
  @Get() get() { return this.service.get(); }
  @Roles(Role.ADMIN) @Patch()
  update(@Body() body: Record<string, any>, @CurrentUser() user: AuthUser) { return this.service.update(body, user.id); }
}
