import { Module } from "@nestjs/common";
import { CalculatorController } from "./calculator.controller";
import { CalculatorService } from "./calculator.service";
import { RecipeCostModule } from "../recipes/recipe-cost.module";

@Module({
  imports: [RecipeCostModule],
  controllers: [CalculatorController],
  providers: [CalculatorService],
  exports: [CalculatorService],
})
export class CalculatorModule {}
