import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { type Address, AddressInput, AddressUpdate } from '@mvp/shared';
import { parseBody } from '../common/parse-body';
import { PrismaService } from '../infra/prisma.service';
import { CurrentUser, SessionGuard, type SessionUser } from '../auth/session.guard';

// The Address columns a Customer sees, taken from the shared schema so the two can't drift apart.
const ADDRESS_FIELDS = Object.fromEntries(['id', ...Object.keys(AddressInput.shape)].map((k) => [k, true])) as Record<
  keyof Address,
  true
>;

// The signed-in Customer's address book. Every lookup is scoped to their userId, so another
// Customer's Address answers 404 exactly like one that doesn't exist.
@Controller('addresses')
@UseGuards(SessionGuard)
export class AddressesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: ADDRESS_FIELDS,
    });
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<Address> {
    const data = parseBody(AddressInput, body);
    return this.prisma.address.create({ data: { ...data, userId: user.id }, select: ADDRESS_FIELDS });
  }

  @Get(':id')
  async get(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<Address> {
    const address = await this.prisma.address.findFirst({ where: { id, userId: user.id }, select: ADDRESS_FIELDS });
    if (!address) throw new NotFoundException();
    return address;
  }

  @Patch(':id')
  async update(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<Address> {
    const data = parseBody(AddressUpdate, body);
    await this.get(user, id); // 404 unless it is this Customer's; userId is never updated, so it stays theirs
    return this.prisma.address.update({ where: { id }, data, select: ADDRESS_FIELDS });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    const { count } = await this.prisma.address.deleteMany({ where: { id, userId: user.id } });
    if (!count) throw new NotFoundException();
  }
}
