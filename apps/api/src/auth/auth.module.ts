import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { EmailQueue } from '../email/email.queue';
import { Clock } from '../infra/clock';
import { PrismaService } from '../infra/prisma.service';
import { AdminGuard } from './admin.guard';
import { AUTH, createAuth } from './auth';
import { SessionGuard } from './session.guard';
import { UsersService } from './users.service';

// Import this module wherever a controller uses SessionGuard or AdminGuard: the guards need AUTH in scope.
@Module({
  imports: [EmailModule],
  providers: [{ provide: AUTH, useFactory: createAuth, inject: [PrismaService, EmailQueue, Clock] }, SessionGuard, AdminGuard, UsersService],
  exports: [AUTH, SessionGuard, AdminGuard, UsersService],
})
export class AuthModule {}
