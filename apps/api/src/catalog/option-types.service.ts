import { ConflictException, Injectable } from '@nestjs/common';
import type { NameInput, OptionType, OptionValue, OptionValueInput } from '@mvp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';

const VALUE_FIELDS = { id: true, value: true } as const;
const TYPE_FIELDS = {
  id: true,
  name: true,
  values: { select: VALUE_FIELDS, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.OptionTypeSelect;

// Option types (Size, Colour) and their Option values, which Variants pick from.
@Injectable()
export class OptionTypesService {
  constructor(private readonly prisma: PrismaService) {}

  // Also what the storefront's size and colour filters pick from.
  list(): Promise<OptionType[]> {
    return this.prisma.optionType.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: TYPE_FIELDS });
  }

  create(data: NameInput): Promise<OptionType> {
    return this.prisma.optionType.create({ data, select: TYPE_FIELDS });
  }

  update(id: string, data: NameInput): Promise<OptionType> {
    return this.prisma.optionType.update({ where: { id }, data, select: TYPE_FIELDS });
  }

  // A type no Product uses has values no Variant uses, so they go with it.
  async remove(id: string): Promise<void> {
    if (await this.prisma.product.count({ where: { optionTypes: { some: { id } } } })) {
      throw new ConflictException('Option type is used by Products');
    }
    await this.prisma.$transaction([
      this.prisma.optionValue.deleteMany({ where: { optionTypeId: id } }),
      this.prisma.optionType.delete({ where: { id } }),
    ]);
  }

  addValue(optionTypeId: string, data: OptionValueInput): Promise<OptionValue> {
    return this.prisma.optionValue.create({ data: { ...data, optionType: { connect: { id: optionTypeId } } }, select: VALUE_FIELDS });
  }

  updateValue(id: string, data: OptionValueInput): Promise<OptionValue> {
    return this.prisma.optionValue.update({ where: { id }, data, select: VALUE_FIELDS });
  }

  async removeValue(id: string): Promise<void> {
    // The join table cascades, so deleting a used value would silently strip it from Variants.
    if (await this.prisma.variant.count({ where: { optionValues: { some: { id } } } })) {
      throw new ConflictException('Option value is used by Variants');
    }
    await this.prisma.optionValue.delete({ where: { id } });
  }
}
