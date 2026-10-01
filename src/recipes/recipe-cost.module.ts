import { Module } from "@nestjs/common";
import { RecipeCostService } from "./recipe-cost.service";

@Module({ providers: [RecipeCostService], exports: [RecipeCostService] })
export class RecipeCostModule {}
