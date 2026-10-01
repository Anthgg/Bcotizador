import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { QuotationsService } from './quotations.service';

@Injectable()
export class QuotationPdfService {
  constructor(private quotations: QuotationsService) {}
  async create(id: string): Promise<Buffer> {
    const data = await this.quotations.publicDocument(id);
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'Cotización GREDA ' + data.code, Author: 'GREDA' } });
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      doc.on('data', chunk => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.fontSize(19).fillColor('#111111').text('GREDA', { continued: true }).fontSize(15).text('  Cotización');
      doc.moveDown(0.7).fontSize(10).fillColor('#333333');
      doc.text('Código: ' + (data.code ?? 'Borrador'));
      doc.text('Fecha: ' + new Date(data.createdAt).toLocaleDateString('es-PE'));
      doc.text('Válida hasta: ' + new Date(data.validUntil).toLocaleDateString('es-PE'));
      doc.text('Cliente: ' + (data.customer?.name ?? ''));
      doc.moveDown();
      doc.fontSize(11).fillColor('#111111').text('Productos', { underline: true });
      doc.moveDown(0.4);
      for (const item of data.items ?? []) {
        const qty = Number(item.quantity ?? 0), unit = Number(item.unitPrice ?? 0), total = Number(item.lineTotal ?? qty * unit);
        doc.fontSize(10).fillColor('#222222').text(item.name + '  |  Cantidad: ' + qty + '  |  Precio unitario: S/ ' + unit.toFixed(2) + '  |  Total: S/ ' + total.toFixed(2));
      }
      doc.moveDown();
      doc.fontSize(10).text('Subtotal: S/ ' + Number(data.totals?.subtotal ?? 0).toFixed(2), { align: 'right' });
      doc.text('IGV (' + (Number(data.totals?.igvRate ?? 0) * 100).toFixed(0) + '%): S/ ' + Number(data.totals?.igvAmount ?? 0).toFixed(2), { align: 'right' });
      doc.fontSize(13).fillColor('#111111').text('Total: S/ ' + Number(data.totals?.total ?? 0).toFixed(2), { align: 'right' });
      doc.moveDown(2).fontSize(8).fillColor('#666666').text('Documento generado por GREDA.', { align: 'center' });
      doc.end();
    });
  }
}
