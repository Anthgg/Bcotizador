import { Module } from "@nestjs/common";
import { ImportsController } from "./imports.controller";
import { ImportsService } from "./imports.service";
import { MasterNormalizerService } from "./master-normalizer.service";
@Module({
  controllers: [ImportsController],
  providers: [ImportsService, MasterNormalizerService],
})
export class ImportsModule {}
