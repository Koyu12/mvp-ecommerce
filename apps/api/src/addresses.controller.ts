import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { type Address, AddressInput, AddressUpdate } from '@mvp/shared';
import { parseBody } from './input';
import { PrismaService } from './prisma.service';
import { CurrentUser, SessionGuard, type SessionUser } from './session.guard';

const SELECT = {
  id: true,
  recipientName: true,
  phone: true,
  line1: true,
  line2: true,
  city: true,
  region: true,
  postalCode: true,
} as const;

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
      select: SELECT,
    });
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<Address> {
    const data = parseBody(AddressInput, body);
    return this.prisma.address.create({ data: { ...data, userId: user.id }, select: SELECT });
  }

  @Get(':id')
  async get(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<Address> {
    const address = await this.prisma.address.findFirst({ where: { id, userId: user.id }, select: SELECT });
    if (!address) throw new NotFoundException();
    return address;
  }

  @Patch(':id')
  async update(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<Address> {
    const data = parseBody(AddressUpdate, body);
    await this.get(user, id); // 404 unless it is this Customer's; userId is never updated, so it stays theirs
    return this.prisma.address.update({ where: { id }, data, select: SELECT });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    const { count } = await this.prisma.address.deleteMany({ where: { id, userId: user.id } });
    if (!count) throw new NotFoundException();
  }
}
