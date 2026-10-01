import { Injectable } from "@nestjs/common";
import { QuotationsService } from "./quotations.service";
import { SettingsService } from "../settings/settings.service";
import {
  PdfQuote,
  renderQuotationPdf,
} from "../documents/quotation-pdf.renderer";

@Injectable()
export class QuotationPdfService {
  constructor(
    private quotations: QuotationsService,
    private settings: SettingsService,
  ) {}
  async create(id: string): Promise<{ buffer: Buffer; code: string | null }> {
    const [quote, company, documents, logo] = await Promise.all([
      this.quotations.publicDocument(id) as Promise<PdfQuote>,
      this.settings.company(),
      this.settings.documents(),
      this.settings.logo(),
    ]);
    const buffer = await renderQuotationPdf({
      company: company.data,
      documents: documents.data,
      quote,
      logo: logo
        ? { data: Buffer.from(logo.data), mimeType: logo.mimeType }
        : null,
    });
    return { buffer, code: quote.code };
  }
}
