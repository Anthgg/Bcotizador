import {
  ConflictException,
  Injectable,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { initializeLocalDefaults } from "./bootstrap-defaults";
import { AuthUser } from "../common/auth.guards";
import { Role } from "../generated/prisma/enums";
import { BootstrapDto, LoginDto } from "./auth.dto";
import { SequenceService } from "../common/sequence.service";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditService,
    @Optional() private sequences?: SequenceService,
  ) {}
  async login(input: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (
      !user ||
      !user.isActive ||
      !(await bcrypt.compare(input.password, user.passwordHash))
    ) {
      throw new UnauthorizedException("Correo o contraseña incorrectos");
    }
    const safe = {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
    };
    return { accessToken: await this.jwt.signAsync(safe), user: safe };
  }
  async bootstrapStatus() {
    const configured = Boolean(this.config.get<string>("BOOTSTRAP_SECRET"));
    return {
      bootstrapRequired: configured && (await this.prisma.user.count()) === 0,
    };
  }
  async bootstrap(input: BootstrapDto, suppliedSecret?: string) {
    const secret = this.config.get<string>("BOOTSTRAP_SECRET");
    if (!secret || !suppliedSecret || suppliedSecret !== secret)
      throw new UnauthorizedException(
        "La clave de instalación no es correcta.",
      );
    const user = await this.prisma.$transaction(async (tx) => {
      if ((await tx.user.count()) > 0)
        throw new ConflictException(
          "GREDA ya tiene usuarios. Pide acceso a un administrador.",
        );
      const created = await tx.user.create({
        data: {
          email: input.email.toLowerCase(),
          displayName: input.displayName,
          passwordHash: await bcrypt.hash(input.password, 12),
          role: Role.ADMIN,
        },
      });
      await this.audit.write(
        created.id,
        "CREATE",
        "User",
        created.id,
        null,
        {
          id: created.id,
          email: created.email,
          displayName: created.displayName,
          role: created.role,
        },
        tx,
      );
      await initializeLocalDefaults(
        tx,
        created.id,
        this.audit,
        this.sequences ? (key) => this.sequences!.next(key, tx) : undefined,
      );
      return {
        id: created.id,
        email: created.email,
        displayName: created.displayName,
        role: created.role,
      };
    });
    const safeUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
    return { accessToken: await this.jwt.signAsync(safeUser), user: safeUser };
  }
  me(user: AuthUser) {
    return user;
  }
}
