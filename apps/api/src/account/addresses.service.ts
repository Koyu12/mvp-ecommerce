import { Injectable, NotFoundException } from '@nestjs/common';
import { type Address, AddressInput } from '@mvp/shared';
import { PrismaService } from '../infra/prisma.service';

// The Address columns a Customer sees, taken from the shared schema so the two can't drift apart.
const ADDRESS_FIELDS = Object.fromEntries(['id', ...Object.keys(AddressInput.shape)].map((k) => [k, true])) as Record<
  keyof Address,
  true
>;

// A Customer's address book. Every lookup is scoped to their userId, so another
// Customer's Address answers 404 exactly like one that doesn't exist.
@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: ADDRESS_FIELDS,
    });
  }

  create(userId: string, data: AddressInput): Promise<Address> {
    return this.prisma.address.create({ data: { ...data, userId }, select: ADDRESS_FIELDS });
  }

  async get(userId: string, id: string): Promise<Address> {
    const address = await this.prisma.address.findFirst({ where: { id, userId }, select: ADDRESS_FIELDS });
    if (!address) throw new NotFoundException();
    return address;
  }

  async update(userId: string, id: string, data: Partial<AddressInput>): Promise<Address> {
    await this.get(userId, id); // 404 unless it is this Customer's; userId is never updated, so it stays theirs
    return this.prisma.address.update({ where: { id }, data, select: ADDRESS_FIELDS });
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.address.deleteMany({ where: { id, userId } });
    if (!count) throw new NotFoundException();
  }
}
