import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CalculatorService } from './calculator.service';
import { CalculatorInputDto } from './calculator.dto';
import { strictBodyPipe } from '../common/strict-body.pipe';
@ApiTags('quotation-calculations')
@Controller('quotation-calculations')
export class CalculatorController {
  constructor(private service: CalculatorService) {}
  @Post() async calculate(@Body(strictBodyPipe) body: CalculatorInputDto) { return { data: await this.service.calculate(body) }; }
}
