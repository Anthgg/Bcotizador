import { Module } from "@nestjs/common";
import { CalculatorModule } from "../calculator/calculator.module";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";
import { RecommendationService } from "./recommendation.service";
import { ASSISTANT_PROVIDER, DeterministicAssistantProvider } from "./assistant.provider";

@Module({
  imports: [CalculatorModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    RecommendationService,
    { provide: ASSISTANT_PROVIDER, useClass: DeterministicAssistantProvider },
  ],
})
export class AssistantModule {}
