# MVP Ecommerce

Single-seller online store selling physical goods in one country and one currency. Customers must be logged in to buy; payment is online only.

## Language

**Store**:
The single seller operating the shop. There is exactly one Store; no other sellers exist.
_Avoid_: Marketplace, vendor, merchant

**Customer**:
A registered, logged-in user who can place Orders.
_Avoid_: Buyer, client, member

**Admin**:
A registered user who manages the Store (products, orders, users).
_Avoid_: Staff, owner, superuser

**Guest**:
An unauthenticated visitor who can browse but not buy.
_Avoid_: Anonymous customer, visitor

## Catalog

**Product**:
A thing the Store sells, with a name, description, images and one category. It is sold only through its Variants.
_Avoid_: Item, listing

**Archived**:
A Product or Variant the Admin has removed from sale. It is hidden from the store but never deleted, so past Orders still refer to it.
_Avoid_: Deleted, disabled, inactive

**Category**:
A flat, single-level grouping of Products, such as T-shirts or Shoes. Each Product belongs to exactly one Category.
_Avoid_: Collection, department, tag

**Variant**:
A specific purchasable form of a Product (for example size M, colour red), with its own SKU and stock.
_Avoid_: Option combination, child product

**Option type**:
A kind of choice a Variant differs by, such as Size or Colour. The Admin can add new Option types.
_Avoid_: Attribute, property

**Option value**:
One choice within an Option type, such as M or Red. Each Variant has one Option value per Option type of its Product.
_Avoid_: Attribute value

**SKU**:
The unique identifier of a Variant.
_Avoid_: Product code, item number

**Stock**:
The count of units of a Variant available to sell.
_Avoid_: Inventory, quantity on hand

## Ordering

**Cart**:
The Customer's saved selection of Variants and quantities, kept on the server. Each Customer has one.
_Avoid_: Basket, bag

**Order**:
A Customer's confirmed purchase of one or more Variants, created at checkout and paid online.
_Avoid_: Purchase, transaction

**Order number**:
The human-readable identifier of an Order (for example `ORD-20261125-0001`), shown to Customers and used as the payment invoice number.
_Avoid_: Order ID, invoice ID, reference

**Order total**:
The sum of an Order's items plus the Shipping fee. Prices include tax; there is no separate tax line.
_Avoid_: Grand total, amount due

**Order item**:
One line of an Order. It stores a copy of the Variant's name, SKU, options and unit price as they were at checkout, so later edits to the Product never change the Order.
_Avoid_: Line, cart item

**Order status**:
Where an Order is in its life: `pending_payment`, `paid`, `shipped`, `completed`, `cancelled`, or `expired`. An Order can be cancelled only before it is `shipped`; `expired` means unpaid past its deadline. A `shipped` Order becomes `completed` when the Customer confirms receipt, the Admin completes it, or 7 days pass.
_Avoid_: State, stage

**Reservation**:
A temporary hold on Stock for an Order that is `pending_payment`, released if the Order is cancelled or expires.
_Avoid_: Lock, allocation

**Address**:
A delivery location saved in a Customer's address book. The Address chosen at checkout is copied onto the Order.
_Avoid_: Location, shipping details

**Shipping fee**:
The flat amount added to every Order for delivery, set by the Admin. Each Order keeps the fee it was charged.
_Avoid_: Delivery charge, postage
