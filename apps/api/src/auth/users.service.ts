import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infra/prisma.service';

// Read access to users for other features.
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Where Admin notices go.
  async adminEmails(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({ where: { role: 'admin' }, select: { email: true } });
    return admins.map((a) => a.email);
  }
}
