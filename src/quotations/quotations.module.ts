import { Module } from '@nestjs/common';
import { CalculatorModule } from '../calculator/calculator.module';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { QuotationPdfService } from './quotation-pdf.service';
@Module({ imports: [CalculatorModule], controllers: [QuotationsController], providers: [QuotationsService, QuotationPdfService] })
export class QuotationsModule {}
