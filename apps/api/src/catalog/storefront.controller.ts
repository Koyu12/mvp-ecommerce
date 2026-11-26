import { Controller, Get, Param, Query } from '@nestjs/common';
import { type Category, type OptionType, type ProductPage, StorefrontQuery, type StorefrontProduct } from '@mvp/shared';
import { parseBody } from '../common/parse-body';
import { CategoriesService } from './categories.service';
import { OptionTypesService } from './option-types.service';
import { StorefrontService } from './storefront.service';

// Public browsing for Guests and Customers.
@Controller()
export class StorefrontController {
  constructor(
    private readonly storefront: StorefrontService,
    private readonly categoriesService: CategoriesService,
    private readonly optionTypesService: OptionTypesService,
  ) {}

  @Get('categories')
  categories(): Promise<Category[]> {
    return this.categoriesService.list();
  }

  // What the size and colour filters pick from.
  @Get('option-types')
  optionTypes(): Promise<OptionType[]> {
    return this.optionTypesService.list();
  }

  @Get('products')
  list(@Query() query: unknown): Promise<ProductPage> {
    return this.storefront.list(parseBody(StorefrontQuery, query));
  }

  @Get('products/:id')
  get(@Param('id') id: string): Promise<StorefrontProduct> {
    return this.storefront.get(id);
  }
}
