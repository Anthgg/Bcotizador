import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { Role } from "../generated/prisma/enums";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { FieldErrors } from "../common/errors";

const ROLES = ["ADMIN", "OPERARIO", "TESTER"];
const safeUser = (user: any) => {
  if (!user) return user;
  const safe = { ...user };
  delete safe.passwordHash;
  return safe;
};
type UserBody = {
  email?: string;
  displayName?: string;
  password?: string;
  role?: Role;
  isActive?: boolean;
};

function validateUser(body: UserBody, creating: boolean) {
  const errors = new FieldErrors();
  const allowed = ["email", "displayName", "password", "role", "isActive"];
  for (const key of Object.keys(body ?? {}))
    if (!allowed.includes(key))
      errors.add(key, `El campo «${key}» no se puede modificar.`);
  if (creating || body.displayName !== undefined) {
    if (
      typeof body.displayName !== "string" ||
      body.displayName.trim().length < 2
    )
      errors.add("displayName", "Ingresa el nombre del usuario.");
  }
  if (creating || body.email !== undefined) {
    if (
      typeof body.email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
    )
      errors.add("email", "Ingresa un correo válido.");
  }
  if (creating || (body.password !== undefined && body.password !== "")) {
    if (typeof body.password !== "string" || body.password.length < 12)
      errors.add(
        "password",
        "La contraseña debe tener al menos 12 caracteres.",
      );
  }
  if (body.role !== undefined && !ROLES.includes(body.role))
    errors.add("role", "Selecciona un rol.");
  if (body.isActive !== undefined && typeof body.isActive !== "boolean")
    errors.add("isActive", "Indica si el usuario está activo.");
  errors.throwIfAny();
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}
  async list() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });
    return { data: users.map(safeUser) };
  }
  async create(body: UserBody, actorId: string) {
    validateUser(body, true);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: body.email!.trim().toLowerCase(),
            displayName: body.displayName!.trim(),
            passwordHash: await bcrypt.hash(body.password!, 12),
            role: body.role ?? Role.TESTER,
            isActive: body.isActive ?? true,
          },
        });
        await this.audit.write(
          actorId,
          "CREATE",
          "User",
          user.id,
          null,
          safeUser(user),
          tx,
        );
        return { data: safeUser(user) };
      });
    } catch (e: any) {
      if (e?.code === "P2002")
        throw new ConflictException({
          code: "DUPLICATE",
          message: "Ese correo ya está registrado.",
          details: [
            { field: "email", message: "Ese correo ya está registrado." },
          ],
        });
      throw e;
    }
  }
  async update(id: string, body: UserBody, actorId: string) {
    validateUser(body, false);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("Usuario no encontrado");
      const losesAdmin =
        before.role === Role.ADMIN &&
        before.isActive &&
        ((body.role && body.role !== Role.ADMIN) || body.isActive === false);
      if (losesAdmin)
        await this.assertAnotherAdmin(
          tx,
          id,
          id === actorId
            ? "No puedes quitarte el rol de administrador ni desactivarte."
            : undefined,
        );
      const data: any = { ...body };
      if (data.email) data.email = data.email.trim().toLowerCase();
      if (data.displayName) data.displayName = data.displayName.trim();
      if (data.password)
        data.passwordHash = await bcrypt.hash(data.password, 12);
      delete data.password;
      try {
        const after = await tx.user.update({ where: { id }, data });
        await this.audit.write(
          actorId,
          "UPDATE",
          "User",
          id,
          safeUser(before),
          safeUser(after),
          tx,
        );
        return { data: safeUser(after) };
      } catch (e: any) {
        if (e?.code === "P2002")
          throw new ConflictException({
            code: "DUPLICATE",
            message: "Ese correo ya está registrado.",
            details: [
              { field: "email", message: "Ese correo ya está registrado." },
            ],
          });
        throw e;
      }
    });
  }
  async remove(id: string, actorId: string) {
    if (id === actorId)
      throw new ConflictException("No puedes eliminar tu propio usuario.");
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("Usuario no encontrado");
      if (before.role === Role.ADMIN && before.isActive)
        await this.assertAnotherAdmin(tx, id);
      await tx.user.delete({ where: { id } });
      await this.audit.write(
        actorId,
        "DELETE",
        "User",
        id,
        safeUser(before),
        null,
        tx,
      );
      return { data: { id, deleted: true } };
    });
  }
  private async assertAnotherAdmin(
    tx: any,
    exceptId: string,
    selfMessage?: string,
  ) {
    if (selfMessage) throw new ConflictException(selfMessage);
    const admins = await tx.user.count({
      where: { role: Role.ADMIN, isActive: true, NOT: { id: exceptId } },
    });
    if (admins === 0)
      throw new ConflictException(
        "Debe quedar al menos un administrador activo.",
      );
  }
}
