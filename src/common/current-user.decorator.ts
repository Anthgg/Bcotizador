import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from './auth.guards';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  return context.switchToHttp().getRequest().user as AuthUser;
});
