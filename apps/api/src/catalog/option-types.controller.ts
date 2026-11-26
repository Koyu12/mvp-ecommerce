import { Body, ConflictException, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseFilters, UseGuards } from '@nestjs/common';
import { NameInput, type OptionType, type OptionValue, OptionValueInput } from '@mvp/shared';
import { Prisma } from '@prisma/client';
import { AdminGuard } from '../auth/admin.guard';
import { parseBody } from '../common/parse-body';
import { PrismaService } from '../infra/prisma.service';
import { PrismaErrorFilter } from './prisma-error.filter';

const VALUE_FIELDS = { id: true, value: true } as const;
const TYPE_FIELDS = {
  id: true,
  name: true,
  values: { select: VALUE_FIELDS, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.OptionTypeSelect;

// Option types (Size, Colour) and their Option values, which Variants pick from.
@Controller('admin')
@UseGuards(AdminGuard)
@UseFilters(PrismaErrorFilter)
export class OptionTypesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('option-types')
  list(): Promise<OptionType[]> {
    return this.prisma.optionType.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: TYPE_FIELDS });
  }

  @Post('option-types')
  create(@Body() body: unknown): Promise<OptionType> {
    return this.prisma.optionType.create({ data: parseBody(NameInput, body), select: TYPE_FIELDS });
  }

  @Patch('option-types/:id')
  update(@Param('id') id: string, @Body() body: unknown): Promise<OptionType> {
    return this.prisma.optionType.update({ where: { id }, data: parseBody(NameInput, body), select: TYPE_FIELDS });
  }

  // A type no Product uses has values no Variant uses, so they go with it.
  @Delete('option-types/:id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    if (await this.prisma.product.count({ where: { optionTypes: { some: { id } } } })) {
      throw new ConflictException('Option type is used by Products');
    }
    await this.prisma.$transaction([
      this.prisma.optionValue.deleteMany({ where: { optionTypeId: id } }),
      this.prisma.optionType.delete({ where: { id } }),
    ]);
  }

  @Post('option-types/:id/values')
  addValue(@Param('id') id: string, @Body() body: unknown): Promise<OptionValue> {
    const data = parseBody(OptionValueInput, body);
    return this.prisma.optionValue.create({ data: { ...data, optionType: { connect: { id } } }, select: VALUE_FIELDS });
  }

  @Patch('option-values/:id')
  updateValue(@Param('id') id: string, @Body() body: unknown): Promise<OptionValue> {
    return this.prisma.optionValue.update({ where: { id }, data: parseBody(OptionValueInput, body), select: VALUE_FIELDS });
  }

  @Delete('option-values/:id')
  @HttpCode(204)
  async removeValue(@Param('id') id: string): Promise<void> {
    // The join table cascades, so deleting a used value would silently strip it from Variants.
    if (await this.prisma.variant.count({ where: { optionValues: { some: { id } } } })) {
      throw new ConflictException('Option value is used by Variants');
    }
    await this.prisma.optionValue.delete({ where: { id } });
  }
}
