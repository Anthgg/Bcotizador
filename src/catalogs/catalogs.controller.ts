import { Controller, Get, Header } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { UNITS } from "../common/units";
import { UBIGEO } from "./ubigeo.data";

@ApiTags("catalogs")
@Controller("catalogs")
export class CatalogsController {
  @Get("units") units() {
    return { data: UNITS };
  }
  @Get("ubigeo")
  @Header("Cache-Control", "private, max-age=86400")
  ubigeo() {
    return { data: UBIGEO };
  }
}
