import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Role } from "../generated/prisma/enums";
import { CurrentUser } from "../common/current-user.decorator";
import { Roles } from "../common/auth.decorators";
import { AuthUser } from "../common/auth.guards";
import { CatalogResource, CatalogService } from "./catalog.service";
import { ProductTechniqueBodyDto, WorkerTechniqueBodyDto } from "./catalog.dto";
import { strictBodyPipe } from "../common/strict-body.pipe";
import { RecipeCostService } from "../recipes/recipe-cost.service";

@ApiTags("catalog")
@Controller()
export class CatalogController {
  constructor(
    private service: CatalogService,
    private recipeCosts: RecipeCostService,
  ) {}
  @Get("recipes/:id/cost")
  async recipeCost(@Param("id") id: string) {
    return this.service.recipeCost(id);
  }
  @Post("recipes/cost-preview")
  async recipeCostPreview(@Body() body: unknown) {
    return { data: await this.recipeCosts.previewCost(body) };
  }
  @Get("workers/:workerId/techniques")
  async workerTechniques(@Param("workerId") id: string) {
    return { data: await this.service.workerTechniques(id) };
  }
  @Get("techniques/:techniqueId/workers")
  async techniqueWorkers(@Param("techniqueId") id: string) {
    return { data: await this.service.techniqueWorkers(id) };
  }
  @Get("products/:productId/techniques")
  async productTechniques(@Param("productId") id: string) {
    return { data: await this.service.productTechniques(id) };
  }
  @Get(":resource")
  async list(
    @Param("resource") resource: CatalogResource,
    @Query() query: Record<string, string>,
  ) {
    return this.service.list(resource, query);
  }
  @Get(":resource/:id")
  async get(
    @Param("resource") resource: CatalogResource,
    @Param("id") id: string,
  ) {
    return { data: await this.service.get(resource, id) };
  }
  @Roles(Role.ADMIN, Role.OPERARIO)
  @Post(":resource")
  async create(
    @Param("resource") resource: CatalogResource,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.service.create(resource, body, user.id) };
  }
  @Roles(Role.ADMIN, Role.OPERARIO)
  @Patch(":resource/:id")
  async update(
    @Param("resource") resource: CatalogResource,
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.service.update(resource, id, body, user.id) };
  }
  @Roles(Role.ADMIN, Role.OPERARIO)
  @Delete(":resource/:id")
  async remove(
    @Param("resource") resource: CatalogResource,
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.service.remove(resource, id, user.id) };
  }
  @Roles(Role.ADMIN, Role.OPERARIO)
  @Post("workers/:workerId/techniques/:techniqueId")
  async setWorkerTechnique(
    @Param("workerId") worker: string,
    @Param("techniqueId") technique: string,
    @Body(strictBodyPipe) body: WorkerTechniqueBodyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return {
      data: await this.service.setWorkerTechnique(
        worker,
        technique,
        body,
        user.id,
      ),
    };
  }
  @Roles(Role.ADMIN, Role.OPERARIO)
  @Put("workers/:workerId/techniques/:techniqueId")
  async putWorkerTechnique(
    @Param("workerId") worker: string,
    @Param("techniqueId") technique: string,
    @Body(strictBodyPipe) body: WorkerTechniqueBodyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return {
      data: await this.service.setWorkerTechnique(
        worker,
        technique,
        body,
        user.id,
      ),
    };
  }
  @Roles(Role.ADMIN, Role.OPERARIO)
  @Delete("workers/:workerId/techniques/:techniqueId")
  async deleteWorkerTechnique(
    @Param("workerId") worker: string,
    @Param("techniqueId") technique: string,
    @CurrentUser() user: AuthUser,
  ) {
    return {
      data: await this.service.deleteWorkerTechnique(
        worker,
        technique,
        user.id,
      ),
    };
  }
  @Roles(Role.ADMIN, Role.OPERARIO)
  @Post("products/:productId/techniques/:techniqueId")
  async setProductTechnique(
    @Param("productId") product: string,
    @Param("techniqueId") technique: string,
    @Body(strictBodyPipe) body: ProductTechniqueBodyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return {
      data: await this.service.setProductTechnique(
        product,
        technique,
        body,
        user.id,
      ),
    };
  }
  @Roles(Role.ADMIN, Role.OPERARIO)
  @Put("products/:productId/techniques/:techniqueId")
  async putProductTechnique(
    @Param("productId") product: string,
    @Param("techniqueId") technique: string,
    @Body(strictBodyPipe) body: ProductTechniqueBodyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return {
      data: await this.service.setProductTechnique(
        product,
        technique,
        body,
        user.id,
      ),
    };
  }
  @Roles(Role.ADMIN, Role.OPERARIO)
  @Delete("products/:productId/techniques/:techniqueId")
  async deleteProductTechnique(
    @Param("productId") product: string,
    @Param("techniqueId") technique: string,
    @CurrentUser() user: AuthUser,
  ) {
    return {
      data: await this.service.deleteProductTechnique(
        product,
        technique,
        user.id,
      ),
    };
  }
}
