import { Controller, Get } from "@nestjs/common";
import { Public } from "../common/auth.decorators";
import { PrismaService } from "../common/prisma.service";

@Controller()
export class HealthController {
  constructor(private prisma: PrismaService) {}
  @Public()
  @Get("health")
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      data: {
        status: "ok",
        database: "ok",
        timestamp: new Date().toISOString(),
      },
    };
  }
}
