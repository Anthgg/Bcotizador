import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '../generated/prisma/enums';
import { Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/auth.guards';
import { UsersService } from './users.service';

@ApiTags('users')
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private service: UsersService) {}
  @Get() list() { return this.service.list(); }
  @Post() create(@Body() body: any, @CurrentUser() user: AuthUser) { return this.service.create(body, user.id); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthUser) { return this.service.update(id, body, user.id); }
  @Delete(':id') remove(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.service.remove(id, user.id); }
}
