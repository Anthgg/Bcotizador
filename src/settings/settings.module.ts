import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";
import { AuditHistoryService } from "./audit-history.service";
import { LoginAppearanceController } from "./login-appearance.controller";
import { LoginAppearanceService } from "./login-appearance.service";
@Module({
  controllers: [LoginAppearanceController, SettingsController],
  providers: [SettingsService, AuditHistoryService, LoginAppearanceService],
  exports: [SettingsService, AuditHistoryService],
})
export class SettingsModule {}
