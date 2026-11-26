import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { StoreSettings } from '@mvp/shared';
import { AdminGuard } from '../auth/admin.guard';
import { parseBody } from '../common/parse-body';
import { PrismaService } from '../infra/prisma.service';
import { readStoreSettings, SETTINGS_FIELDS, SETTINGS_ID } from './settings';

// Admins read and edit the Store settings, such as the Shipping fee the Cart and checkout read.
@Controller('admin/settings')
@UseGuards(AdminGuard)
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  get(): Promise<StoreSettings> {
    return readStoreSettings(this.prisma);
  }

  @Put()
  update(@Body() body: unknown): Promise<StoreSettings> {
    const data = parseBody(StoreSettings, body);
    return this.prisma.storeSettings.update({ where: { id: SETTINGS_ID }, data, select: SETTINGS_FIELDS });
  }
}
