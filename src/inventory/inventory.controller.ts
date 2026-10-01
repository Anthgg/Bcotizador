import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '../generated/prisma/enums';
import { Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/auth.guards';
import { InventoryMovementDto } from './inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private service: InventoryService) {}
  @Get() async list(@Query() query: Record<string, string>) { return this.service.list(query); }
  @Get(':productId/movements') async movements(@Param('productId') productId: string, @Query() query: Record<string, string>) {
    return { data: await this.service.movements(productId, query) };
  }
  @Roles(Role.ADMIN, Role.OPERARIO) @Post('movements')
  async create(@Body() input: InventoryMovementDto, @CurrentUser() user: AuthUser) {
    return { data: await this.service.createMovement(input, user.id) };
  }
}
