import { Body, Controller, Get, Param, Patch, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
import {
  type AdminProduct,
  type AdminVariant,
  LowStockQuery,
  type LowStockVariant,
  ProductInput,
  ProductUpdate,
  VariantInput,
  VariantUpdate,
} from '@mvp/shared';
import { AdminGuard } from '../auth/admin.guard';
import { parseBody } from '../common/parse-body';
import { PrismaErrorFilter } from './prisma-error.filter';
import { ProductsService } from './products.service';

// Admin management of Products and their Variants.
@Controller('admin')
@UseGuards(AdminGuard)
@UseFilters(PrismaErrorFilter)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('products')
  list(): Promise<AdminProduct[]> {
    return this.products.list();
  }

  @Post('products')
  create(@Body() body: unknown): Promise<AdminProduct> {
    return this.products.create(parseBody(ProductInput, body));
  }

  @Get('products/:id')
  get(@Param('id') id: string): Promise<AdminProduct> {
    return this.products.get(id);
  }

  @Patch('products/:id')
  update(@Param('id') id: string, @Body() body: unknown): Promise<AdminProduct> {
    return this.products.update(id, parseBody(ProductUpdate, body));
  }

  @Post('products/:id/variants')
  addVariant(@Param('id') productId: string, @Body() body: unknown): Promise<AdminVariant> {
    return this.products.addVariant(productId, parseBody(VariantInput, body));
  }

  @Patch('variants/:id')
  updateVariant(@Param('id') id: string, @Body() body: unknown): Promise<AdminVariant> {
    return this.products.updateVariant(id, parseBody(VariantUpdate, body));
  }

  @Get('variants/low-stock')
  lowStock(@Query() query: unknown): Promise<LowStockVariant[]> {
    return this.products.lowStock(parseBody(LowStockQuery, query).below);
  }
}
