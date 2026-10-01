import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/current-user.decorator";
import { Public } from "../common/auth.decorators";
import { AuthUser } from "../common/auth.guards";
import { AuthService } from "./auth.service";
import { BootstrapDto, LoginDto } from "./auth.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private service: AuthService) {}
  @Public()
  @Post("login")
  async login(@Body() input: LoginDto) {
    return { data: await this.service.login(input) };
  }
  @Public()
  @Post("bootstrap")
  async bootstrap(
    @Body() input: BootstrapDto,
    @Headers("x-bootstrap-secret") secret?: string,
  ) {
    return { data: await this.service.bootstrap(input, secret) };
  }
  @Get("me") me(@CurrentUser() user: AuthUser) {
    return { data: this.service.me(user) };
  }
}
