import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { isAdmin } from '@mvp/shared';
import type { SessionUser } from './session.guard';
import { SessionGuard } from './session.guard';

// Lets only Admins through: Guests get 401 from SessionGuard, Customers get 403.
@Injectable()
export class AdminGuard extends SessionGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    if (!isAdmin(context.switchToHttp().getRequest<{ user: SessionUser }>().user)) throw new ForbiddenException();
    return true;
  }
}
