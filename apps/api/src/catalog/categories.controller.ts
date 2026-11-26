import { Body, ConflictException, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseFilters, UseGuards } from '@nestjs/common';
import { type Category, NameInput } from '@mvp/shared';
import { AdminGuard } from '../auth/admin.guard';
import { parseBody } from '../common/parse-body';
import { PrismaService } from '../infra/prisma.service';
import { PrismaErrorFilter } from './prisma-error.filter';

const FIELDS = { id: true, name: true } as const;

// Every Category by name; the storefront lists the same.
export const listCategories = (prisma: PrismaService): Promise<Category[]> =>
  prisma.category.findMany({ orderBy: { name: 'asc' }, select: FIELDS });

// Admin management of Categories. One with Products can't be deleted, so no Product is left without one.
@Controller('admin/categories')
@UseGuards(AdminGuard)
@UseFilters(PrismaErrorFilter)
export class CategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(): Promise<Category[]> {
    return listCategories(this.prisma);
  }

  @Post()
  create(@Body() body: unknown): Promise<Category> {
    return this.prisma.category.create({ data: parseBody(NameInput, body), select: FIELDS });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown): Promise<Category> {
    return this.prisma.category.update({ where: { id }, data: parseBody(NameInput, body), select: FIELDS });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    if (await this.prisma.product.count({ where: { categoryId: id } })) {
      throw new ConflictException('Category still has Products');
    }
    await this.prisma.category.delete({ where: { id } });
  }
}
