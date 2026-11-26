import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { type Profile, ProfileUpdate } from '@mvp/shared';
import { parseBody } from './input';
import { PrismaService } from './prisma.service';
import { CurrentUser, SessionGuard, type SessionUser } from './session.guard';

const PROFILE = { name: true, email: true, phone: true } as const;

// The signed-in Customer's own profile. Email changes are not offered here.
@Controller('profile')
@UseGuards(SessionGuard)
export class ProfileController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  get(@CurrentUser() user: SessionUser): Promise<Profile> {
    return this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: PROFILE });
  }

  @Patch()
  update(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<Profile> {
    const data = parseBody(ProfileUpdate, body);
    return this.prisma.user.update({ where: { id: user.id }, data, select: PROFILE });
  }
}
