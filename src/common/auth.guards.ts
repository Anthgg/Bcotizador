import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Role } from '../generated/prisma/enums';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';

export interface AuthUser { id: string; email: string; role: Role; displayName: string }
type AuthRequest = Request & { user?: AuthUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly jwt: JwtService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Se requiere autenticación');
    try {
      const payload = await this.jwt.verifyAsync<AuthUser>(token);
      if (!payload.id || !payload.role) throw new Error('Invalid token');
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o vencido');
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!request.user) throw new UnauthorizedException('Se requiere autenticación');
    if (!roles.includes(request.user.role)) throw new ForbiddenException('El rol no tiene permiso para esta acción');
    return true;
  }
}
