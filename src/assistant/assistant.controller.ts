import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Role } from "../generated/prisma/enums";
import { Roles } from "../common/auth.decorators";
import { AuthUser } from "../common/auth.guards";
import { CurrentUser } from "../common/current-user.decorator";
import { strictBodyPipe } from "../common/strict-body.pipe";
import {
  AssistantAskDto,
  AssistantFeedbackDto,
  AssistantKnowledgeDto,
  AssistantRecommendationsDto,
  AssistantSimulationDto,
  AssistantSuggestionDto,
  AssistantSuggestionReviewDto,
  FiringOutcomeDto,
  QuotationOutcomeDto,
  RecommendationDecisionDto,
  RecommendationResultDto,
} from "./assistant.dto";
import { AssistantService } from "./assistant.service";
import { RecommendationService } from "./recommendation.service";

@ApiTags("assistant")
@Controller("assistant")
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly recommendationService: RecommendationService,
  ) {}

  @Post("ask")
  async ask(@Body(strictBodyPipe) input: AssistantAskDto, @CurrentUser() user: AuthUser) {
    return { data: await this.assistant.ask(input, user) };
  }

  @Get("history")
  async history(@CurrentUser() user: AuthUser) {
    return { data: await this.assistant.history(user) };
  }

  @Post("feedback")
  async feedback(@Body(strictBodyPipe) input: AssistantFeedbackDto, @CurrentUser() user: AuthUser) {
    return { data: await this.assistant.feedback(input, user) };
  }

  @Get("knowledge")
  async knowledge(
    @CurrentUser() user: AuthUser,
    @Query("module") module?: string,
    @Query("step") step?: string,
  ) {
    return { data: await this.assistant.listKnowledge(user, module, step) };
  }

  @Post("knowledge")
  @Roles(Role.ADMIN)
  async createKnowledge(@Body(strictBodyPipe) input: AssistantKnowledgeDto, @CurrentUser() user: AuthUser) {
    return { data: await this.assistant.createKnowledge(input, user) };
  }

  @Get("knowledge-suggestions")
  @Roles(Role.ADMIN)
  async suggestions() {
    return { data: await this.assistant.listSuggestions() };
  }

  @Post("knowledge-suggestions")
  async submitSuggestion(@Body(strictBodyPipe) input: AssistantSuggestionDto, @CurrentUser() user: AuthUser) {
    return { data: await this.assistant.submitSuggestion(input, user) };
  }

  @Post("knowledge-suggestions/:id/review")
  @Roles(Role.ADMIN)
  async reviewSuggestion(
    @Param("id") id: string,
    @Body(strictBodyPipe) input: AssistantSuggestionReviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.assistant.reviewSuggestion(id, input, user) };
  }

  @Get("unresolved")
  @Roles(Role.ADMIN)
  async unresolved() {
    return { data: await this.assistant.unresolvedQuestions() };
  }

  @Get("admin/summary")
  @Roles(Role.ADMIN)
  async summary() {
    return { data: await this.assistant.adminSummary() };
  }

  @Get("admin/recommendation-events")
  @Roles(Role.ADMIN)
  async recommendationEvents() {
    return { data: await this.assistant.recommendationEvents() };
  }

  @Post("quotation-outcomes")
  @Roles(Role.ADMIN)
  async quotationOutcome(@Body(strictBodyPipe) input: QuotationOutcomeDto, @CurrentUser() user: AuthUser) {
    return { data: await this.assistant.createQuotationOutcome(input, user) };
  }

  @Post("firing-outcomes")
  @Roles(Role.ADMIN)
  async firingOutcome(@Body(strictBodyPipe) input: FiringOutcomeDto, @CurrentUser() user: AuthUser) {
    return { data: await this.assistant.createFiringOutcome(input, user) };
  }

  @Post("recommendations")
  async recommendations(@Body(strictBodyPipe) input: AssistantRecommendationsDto, @CurrentUser() user: AuthUser) {
    return { data: await this.recommendationService.recommendations(input, user) };
  }

  @Post("simulations")
  async simulate(@Body(strictBodyPipe) input: AssistantSimulationDto, @CurrentUser() user: AuthUser) {
    return { data: await this.recommendationService.simulate(input, user) };
  }

  @Post("simulations/:id/apply")
  async applySimulation(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return { data: await this.recommendationService.applyExplicitly(id, user) };
  }

  @Post("recommendations/:id/decision")
  async recommendationDecision(
    @Param("id") id: string,
    @Body(strictBodyPipe) input: RecommendationDecisionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.recommendationService.decide(id, input, user) };
  }

  @Post("recommendation-results")
  @Roles(Role.ADMIN)
  async recommendationResult(@Body(strictBodyPipe) input: RecommendationResultDto, @CurrentUser() user: AuthUser) {
    return { data: await this.assistant.recordRecommendationResult(input, user) };
  }
}
