import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";
import { AuditHistoryService } from "./audit-history.service";
@Module({
  controllers: [SettingsController],
  providers: [SettingsService, AuditHistoryService],
  exports: [SettingsService, AuditHistoryService],
})
export class SettingsModule {}
