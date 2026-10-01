import { ConflictException, Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';

const safeUser = (user: any) => {
  if (!user) return user;
  const safe = { ...user };
  delete safe.passwordHash;
  return safe;
};
@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}
  async list() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return { data: users.map(safeUser) };
  }
  async create(body: { email?: string; displayName?: string; password?: string; role?: Role }, actorId: string) {
    if (!body.email || !body.displayName || !body.password || body.password.length < 12) throw new BadRequestException('Email, nombre y contraseña de al menos 12 caracteres son obligatorios');
    try {
      return await this.prisma.$transaction(async tx => {
        const user = await tx.user.create({
          data: { email: body.email!.toLowerCase(), displayName: body.displayName!, passwordHash: await bcrypt.hash(body.password!, 12), role: body.role ?? Role.TESTER },
        });
        await this.audit.write(actorId, 'CREATE', 'User', user.id, null, safeUser(user), tx);
        return { data: safeUser(user) };
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('El email ya está registrado');
      throw e;
    }
  }
  async update(id: string, body: { email?: string; displayName?: string; password?: string; role?: Role; isActive?: boolean }, actorId: string) {
    if (body.password !== undefined && body.password.length < 12) throw new BadRequestException('La contraseña debe tener al menos 12 caracteres');
    return this.prisma.$transaction(async tx => {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Usuario no encontrado');
      const data: any = { ...body };
      if (data.email) data.email = data.email.toLowerCase();
      if (data.password) { data.passwordHash = await bcrypt.hash(data.password, 12); delete data.password; }
      const after = await tx.user.update({ where: { id }, data });
      await this.audit.write(actorId, 'UPDATE', 'User', id, safeUser(before), safeUser(after), tx);
      return { data: safeUser(after) };
    });
  }
  async remove(id: string, actorId: string) {
    if (id === actorId) throw new ForbiddenException('No puedes eliminar tu propio usuario');
    return this.prisma.$transaction(async tx => {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Usuario no encontrado');
      await tx.user.delete({ where: { id } });
      await this.audit.write(actorId, 'DELETE', 'User', id, safeUser(before), null, tx);
      return { data: { id, deleted: true } };
    });
  }
}
