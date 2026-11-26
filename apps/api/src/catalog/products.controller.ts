import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  type AdminProduct,
  type AdminVariant,
  effectivePrice,
  LowStockQuery,
  type LowStockVariant,
  ProductInput,
  ProductUpdate,
  VariantInput,
  VariantUpdate,
} from '@mvp/shared';
import { Prisma } from '@prisma/client';
import { AdminGuard } from '../auth/admin.guard';
import { parseBody } from '../common/parse-body';
import { PrismaService } from '../infra/prisma.service';
import { PrismaErrorFilter } from './prisma-error.filter';

const VARIANT_FIELDS = {
  id: true,
  productId: true,
  sku: true,
  stock: true,
  price: true,
  archived: true,
  optionValues: { select: { id: true } },
  product: { select: { name: true, price: true } },
} satisfies Prisma.VariantSelect;
const PRODUCT_FIELDS = {
  id: true,
  name: true,
  description: true,
  categoryId: true,
  price: true,
  archived: true,
  optionTypes: { select: { id: true } },
  variants: { select: VARIANT_FIELDS, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.ProductSelect;

type VariantRow = Prisma.VariantGetPayload<{ select: typeof VARIANT_FIELDS }>;
type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_FIELDS }>;

const sortedIds = (rows: { id: string }[]) => rows.map((r) => r.id).sort();
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

const toVariant = ({ optionValues, product, ...v }: VariantRow): AdminVariant => ({
  ...v,
  effectivePrice: effectivePrice(v, product),
  optionValueIds: sortedIds(optionValues),
});
const toProduct = ({ optionTypes, variants, ...p }: ProductRow): AdminProduct => ({
  ...p,
  optionTypeIds: sortedIds(optionTypes),
  variants: variants.map(toVariant),
});

// Admin management of Products and their Variants. Both are archived, never deleted.
@Controller('admin')
@UseGuards(AdminGuard)
@UseFilters(PrismaErrorFilter)
export class ProductsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('products')
  async list(): Promise<AdminProduct[]> {
    // shortcut: every Product in one response; add paging when the catalog outgrows one page.
    const rows = await this.prisma.product.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: PRODUCT_FIELDS });
    return rows.map(toProduct);
  }

  @Post('products')
  async create(@Body() body: unknown): Promise<AdminProduct> {
    const { optionTypeIds, ...data } = parseBody(ProductInput, body);
    await this.checkReferences(data.categoryId, optionTypeIds);
    const row = await this.prisma.product.create({
      data: { ...data, optionTypes: { connect: optionTypeIds.map((id) => ({ id })) } },
      select: PRODUCT_FIELDS,
    });
    return toProduct(row);
  }

  @Get('products/:id')
  async get(@Param('id') id: string): Promise<AdminProduct> {
    return toProduct(await this.find(id));
  }

  @Patch('products/:id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<AdminProduct> {
    const { optionTypeIds, ...data } = parseBody(ProductUpdate, body);
    const current = await this.find(id);
    await this.checkReferences(data.categoryId, optionTypeIds);
    if (optionTypeIds && current.variants.length && !sameSet(optionTypeIds, sortedIds(current.optionTypes))) {
      throw new ConflictException("A Product's Option types can't change once it has Variants");
    }
    const row = await this.prisma.product.update({
      where: { id },
      data: { ...data, optionTypes: optionTypeIds && { set: optionTypeIds.map((id) => ({ id })) } },
      select: PRODUCT_FIELDS,
    });
    return toProduct(row);
  }

  @Post('products/:id/variants')
  async addVariant(@Param('id') productId: string, @Body() body: unknown): Promise<AdminVariant> {
    const { optionValueIds, price, ...data } = parseBody(VariantInput, body);
    await this.checkOptionValues(await this.find(productId), optionValueIds);
    const row = await this.prisma.variant.create({
      data: { ...data, price: price ?? null, productId, optionValues: { connect: optionValueIds.map((id) => ({ id })) } },
      select: VARIANT_FIELDS,
    });
    return toVariant(row);
  }

  @Patch('variants/:id')
  async updateVariant(@Param('id') id: string, @Body() body: unknown): Promise<AdminVariant> {
    const { optionValueIds, ...data } = parseBody(VariantUpdate, body);
    if (optionValueIds) {
      const variant = await this.prisma.variant.findUnique({ where: { id }, select: { productId: true } });
      if (!variant) throw new NotFoundException();
      await this.checkOptionValues(await this.find(variant.productId), optionValueIds, id);
    }
    const row = await this.prisma.variant.update({
      where: { id },
      data: { ...data, optionValues: optionValueIds && { set: optionValueIds.map((id) => ({ id })) } },
      select: VARIANT_FIELDS,
    });
    return toVariant(row);
  }

  // Variants on sale whose Stock is below the threshold, so the Admin can restock in time.
  @Get('variants/low-stock')
  async lowStock(@Query() query: unknown): Promise<LowStockVariant[]> {
    const { below } = parseBody(LowStockQuery, query);
    const rows = await this.prisma.variant.findMany({
      where: { stock: { lt: below }, archived: false, product: { archived: false } },
      orderBy: [{ stock: 'asc' }, { sku: 'asc' }],
      take: 200, // shortcut: first 200 only; page it if the Store ever has more low Variants than that.
      select: VARIANT_FIELDS,
    });
    return rows.map((row) => ({ ...toVariant(row), productName: row.product.name }));
  }

  private async find(id: string): Promise<ProductRow> {
    const row = await this.prisma.product.findUnique({ where: { id }, select: PRODUCT_FIELDS });
    if (!row) throw new NotFoundException();
    return row;
  }

  private async checkReferences(categoryId?: string, optionTypeIds?: string[]) {
    if (categoryId && !(await this.prisma.category.count({ where: { id: categoryId } }))) {
      throw new BadRequestException('categoryId: no such Category');
    }
    if (optionTypeIds && (await this.prisma.optionType.count({ where: { id: { in: optionTypeIds } } })) !== optionTypeIds.length) {
      throw new BadRequestException('optionTypeIds: unknown or repeated Option type');
    }
  }

  // Exactly one existing Option value per Option type of the Product, and no other Variant with the same combination.
  private async checkOptionValues(product: ProductRow, optionValueIds: string[], variantId?: string) {
    const values = await this.prisma.optionValue.findMany({ where: { id: { in: optionValueIds } }, select: { optionTypeId: true } });
    const types = values.map((v) => v.optionTypeId);
    // `in` drops repeats, so a repeated or unknown id shows up as a length mismatch.
    if (values.length !== optionValueIds.length || !sameSet(types, sortedIds(product.optionTypes))) {
      throw new BadRequestException("optionValueIds: pick exactly one Option value for each of the Product's Option types");
    }
    // shortcut: check-then-insert, so two simultaneous creates could still both pass; fine for one Admin.
    if (product.variants.some((v) => v.id !== variantId && sameSet(sortedIds(v.optionValues), optionValueIds))) {
      throw new ConflictException('Another Variant of this Product has the same Option values');
    }
  }
}
