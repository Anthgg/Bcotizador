import { Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "./prisma.service";
import { jsonSafe } from "./json";

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}
  async write(
    actorId: string | null,
    action: string,
    entity: string,
    entityId: string,
    before: unknown,
    after: unknown,
    db: Db = this.prisma,
  ) {
    return db.auditEvent.create({
      data: {
        actorId,
        action,
        entity,
        entityId,
        beforeJson: before == null ? Prisma.JsonNull : jsonSafe(before),
        afterJson: after == null ? Prisma.JsonNull : jsonSafe(after),
      },
    });
  }
}
