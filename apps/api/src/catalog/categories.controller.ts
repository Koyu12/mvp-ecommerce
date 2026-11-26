import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseFilters, UseGuards } from '@nestjs/common';
import { type Category, NameInput } from '@mvp/shared';
import { AdminGuard } from '../auth/admin.guard';
import { parseBody } from '../common/parse-body';
import { CategoriesService } from './categories.service';
import { PrismaErrorFilter } from './prisma-error.filter';

// Admin management of Categories.
@Controller('admin/categories')
@UseGuards(AdminGuard)
@UseFilters(PrismaErrorFilter)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(): Promise<Category[]> {
    return this.categories.list();
  }

  @Post()
  create(@Body() body: unknown): Promise<Category> {
    return this.categories.create(parseBody(NameInput, body));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown): Promise<Category> {
    return this.categories.update(id, parseBody(NameInput, body));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.categories.remove(id);
  }
}
