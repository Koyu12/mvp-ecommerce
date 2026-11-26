import { ConflictException, Injectable } from '@nestjs/common';
import type { Category, NameInput } from '@mvp/shared';
import { PrismaService } from '../infra/prisma.service';

const FIELDS = { id: true, name: true } as const;

// One with Products can't be deleted, so no Product is left without one.
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  // Every Category by name; the storefront lists the same.
  list(): Promise<Category[]> {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' }, select: FIELDS });
  }

  create(data: NameInput): Promise<Category> {
    return this.prisma.category.create({ data, select: FIELDS });
  }

  update(id: string, data: NameInput): Promise<Category> {
    return this.prisma.category.update({ where: { id }, data, select: FIELDS });
  }

  async remove(id: string): Promise<void> {
    if (await this.prisma.product.count({ where: { categoryId: id } })) {
      throw new ConflictException('Category still has Products');
    }
    await this.prisma.category.delete({ where: { id } });
  }
}
