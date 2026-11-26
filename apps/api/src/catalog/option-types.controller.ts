import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseFilters, UseGuards } from '@nestjs/common';
import { NameInput, type OptionType, type OptionValue, OptionValueInput } from '@mvp/shared';
import { AdminGuard } from '../auth/admin.guard';
import { parseBody } from '../common/parse-body';
import { OptionTypesService } from './option-types.service';
import { PrismaErrorFilter } from './prisma-error.filter';

// Admin management of Option types and their Option values.
@Controller('admin')
@UseGuards(AdminGuard)
@UseFilters(PrismaErrorFilter)
export class OptionTypesController {
  constructor(private readonly optionTypes: OptionTypesService) {}

  @Get('option-types')
  list(): Promise<OptionType[]> {
    return this.optionTypes.list();
  }

  @Post('option-types')
  create(@Body() body: unknown): Promise<OptionType> {
    return this.optionTypes.create(parseBody(NameInput, body));
  }

  @Patch('option-types/:id')
  update(@Param('id') id: string, @Body() body: unknown): Promise<OptionType> {
    return this.optionTypes.update(id, parseBody(NameInput, body));
  }

  @Delete('option-types/:id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.optionTypes.remove(id);
  }

  @Post('option-types/:id/values')
  addValue(@Param('id') id: string, @Body() body: unknown): Promise<OptionValue> {
    return this.optionTypes.addValue(id, parseBody(OptionValueInput, body));
  }

  @Patch('option-values/:id')
  updateValue(@Param('id') id: string, @Body() body: unknown): Promise<OptionValue> {
    return this.optionTypes.updateValue(id, parseBody(OptionValueInput, body));
  }

  @Delete('option-values/:id')
  @HttpCode(204)
  removeValue(@Param('id') id: string): Promise<void> {
    return this.optionTypes.removeValue(id);
  }
}
