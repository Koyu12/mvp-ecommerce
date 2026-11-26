import { CategoriesController } from './categories.controller';
import { OptionTypesController } from './option-types.controller';
import { ProductsController } from './products.controller';
import { StorefrontController } from './storefront.controller';

// Every catalog controller, so app.module.ts registers the feature in one line.
export const CATALOG_CONTROLLERS = [CategoriesController, OptionTypesController, ProductsController, StorefrontController];
