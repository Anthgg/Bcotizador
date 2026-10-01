import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { PrismaService } from "./prisma.service";
import { SequenceService } from "./sequence.service";
@Global()
@Module({
  providers: [PrismaService, AuditService, SequenceService],
  exports: [PrismaService, AuditService, SequenceService],
})
export class CommonModule {}
