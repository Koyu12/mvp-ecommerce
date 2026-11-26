import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { StoreSettings } from '@mvp/shared';
import { AdminGuard } from '../auth/admin.guard';
import { parseBody } from '../common/parse-body';
import { SettingsService } from './settings.service';

// Admins read and edit the Store settings, such as the Shipping fee the Cart and checkout read.
@Controller('admin/settings')
@UseGuards(AdminGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(): Promise<StoreSettings> {
    return this.settings.read();
  }

  @Put()
  update(@Body() body: unknown): Promise<StoreSettings> {
    return this.settings.update(parseBody(StoreSettings, body));
  }
}
