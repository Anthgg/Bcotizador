import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { DashboardService } from "./dashboard.service";
@ApiTags("dashboard")
@Controller("dashboard")
export class DashboardController {
  constructor(private service: DashboardService) {}
  @Get() get() {
    return this.service.get();
  }
}
