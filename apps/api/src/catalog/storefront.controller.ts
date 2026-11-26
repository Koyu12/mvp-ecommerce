import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import {
  type Category,
  effectivePrice,
  type OptionType,
  type ProductPage,
  StorefrontQuery,
  type StorefrontProduct,
} from '@mvp/shared';
import { Prisma } from '@prisma/client';
import { parseBody } from '../common/parse-body';
import { PrismaService } from '../infra/prisma.service';
import { listCategories } from './categories.controller';

const ON_SALE = { archived: false } satisfies Prisma.VariantWhereInput;

// Public browsing for Guests and Customers. Archived Products and Variants never appear, and neither
// does a Product with no Variant on sale, since it is sold only through its Variants.
@Controller()
export class StorefrontController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('categories')
  categories(): Promise<Category[]> {
    return listCategories(this.prisma);
  }

  // What the size and colour filters pick from.
  @Get('option-types')
  optionTypes(): Promise<OptionType[]> {
    return this.prisma.optionType.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, values: { select: { id: true, value: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
  }

  @Get('products')
  async list(@Query() query: unknown): Promise<ProductPage> {
    const { categoryId, q, minPrice, maxPrice, optionValueIds, page, pageSize } = parseBody(StorefrontQuery, query);

    // One Variant on sale must match every filter at once: price, and one of the picked values of each Option type.
    const variant: Prisma.VariantWhereInput = { ...ON_SALE, AND: [] };
    if (optionValueIds?.length) {
      const values = await this.prisma.optionValue.findMany({ where: { id: { in: optionValueIds } }, select: { id: true, optionTypeId: true } });
      const typeOf = new Map(values.map((v) => [v.id, v.optionTypeId]));
      const groups = new Map<string, string[]>();
      // An unknown id is its own group, so it matches nothing rather than being ignored.
      for (const id of optionValueIds) {
        const key = typeOf.get(id) ?? id;
        groups.set(key, [...(groups.get(key) ?? []), id]);
      }
      for (const ids of groups.values()) (variant.AND as Prisma.VariantWhereInput[]).push({ optionValues: { some: { id: { in: ids } } } });
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      const range = { gte: minPrice, lte: maxPrice };
      (variant.AND as Prisma.VariantWhereInput[]).push({ OR: [{ price: range }, { price: null, product: { price: range } }] });
    }

    const where: Prisma.ProductWhereInput = {
      archived: false,
      categoryId,
      // ILIKE, served by the trigram index on product.name.
      name: q ? { contains: q, mode: 'insensitive' } : undefined,
      variants: { some: variant },
    };
    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          categoryId: true,
          price: true,
          images: true,
          // The "from" price counts only Variants matching the filters; Stock counts every Variant on sale.
          variants: { where: variant, select: { price: true } },
          _count: { select: { variants: { where: { ...ON_SALE, stock: { gt: 0 } } } } },
        },
      }),
    ]);
    const items = rows.map(({ variants, _count, price, images, ...p }) => ({
      ...p,
      image: images[0] ?? null,
      fromPrice: Math.min(...variants.map((v) => effectivePrice(v, { price }))),
      inStock: _count.variants > 0,
    }));
    return { items, total, page, pageSize };
  }

  @Get('products/:id')
  async get(@Param('id') id: string): Promise<StorefrontProduct> {
    const row = await this.prisma.product.findFirst({
      where: { id, archived: false, variants: { some: ON_SALE } },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        images: true,
        category: { select: { id: true, name: true } },
        optionTypes: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            name: true,
            values: {
              where: { variants: { some: { ...ON_SALE, productId: id } } },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: { id: true, value: true },
            },
          },
        },
        variants: {
          where: ON_SALE,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, price: true, stock: true, image: true, optionValues: { select: { id: true } } },
        },
      },
    });
    if (!row) throw new NotFoundException();
    const { price, variants, ...product } = row;
    return {
      ...product,
      variants: variants.map((v) => ({
        id: v.id,
        optionValueIds: v.optionValues.map((o) => o.id).sort(),
        effectivePrice: effectivePrice(v, { price }),
        stock: v.stock,
        image: v.image,
      })),
    };
  }
}
