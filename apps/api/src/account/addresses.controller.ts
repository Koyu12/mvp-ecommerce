import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { type Address, AddressInput, AddressUpdate } from '@mvp/shared';
import { parseBody } from '../common/parse-body';
import { CurrentUser, SessionGuard, type SessionUser } from '../auth/session.guard';
import { AddressesService } from './addresses.service';

// The signed-in Customer's address book; AddressesService scopes every lookup to them.
@Controller('addresses')
@UseGuards(SessionGuard)
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<Address[]> {
    return this.addresses.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<Address> {
    return this.addresses.create(user.id, parseBody(AddressInput, body));
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<Address> {
    return this.addresses.get(user.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<Address> {
    return this.addresses.update(user.id, id, parseBody(AddressUpdate, body));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    return this.addresses.remove(user.id, id);
  }
}
