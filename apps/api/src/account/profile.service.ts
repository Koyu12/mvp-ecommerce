import { Injectable } from '@nestjs/common';
import type { Profile, ProfileUpdate } from '@mvp/shared';
import { PrismaService } from '../infra/prisma.service';

const PROFILE_FIELDS = { name: true, email: true, phone: true } as const;

// A Customer's own profile. Email changes are not offered here.
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  get(userId: string): Promise<Profile> {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: PROFILE_FIELDS });
  }

  update(userId: string, data: ProfileUpdate): Promise<Profile> {
    return this.prisma.user.update({ where: { id: userId }, data, select: PROFILE_FIELDS });
  }
}
