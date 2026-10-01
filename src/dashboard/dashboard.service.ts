import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}
  async get() {
    const [
      products,
      customers,
      drafts,
      imports,
      recentQuotations,
      importErrors,
      workers,
      workerTechniques,
      confirmed,
    ] = await Promise.all([
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.customer.count({ where: { isActive: true } }),
      this.prisma.quotation.count({ where: { status: "DRAFT" } }),
      this.prisma.importBatch.count({ where: { status: "PREVIEW" } }),
      this.prisma.quotation.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          status: true,
          total: true,
          createdAt: true,
          customer: { select: { displayName: true } },
        },
      }),
      this.prisma.importError.count({
        where: {
          severity: { in: ["ERROR", "AMBIGUOUS"] },
          batch: { status: "PREVIEW" },
        },
      }),
      this.prisma.worker.count({ where: { isActive: true } }),
      this.prisma.workerTechnique.count({
        where: { isActive: true, worker: { isActive: true } },
      }),
      this.prisma.quotation.count({ where: { status: "CONFIRMED" } }),
    ]);
    return {
      data: {
        counts: {
          products,
          customers,
          drafts,
          confirmed,
          workers,
          workerTechniques,
          pendingImports: imports,
          importErrors,
        },
        recentQuotations,
      },
    };
  }
}
