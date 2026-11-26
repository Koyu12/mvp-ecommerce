import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { OptionTypesController } from './option-types.controller';
import { OptionTypesService } from './option-types.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';

@Module({
  imports: [AuthModule],
  controllers: [CategoriesController, OptionTypesController, ProductsController, StorefrontController],
  providers: [CategoriesService, OptionTypesService, ProductsService, StorefrontService],
})
export class CatalogModule {}
