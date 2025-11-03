-- DropForeignKey
ALTER TABLE `categories` DROP FOREIGN KEY `fk_categories_providerId`;

-- DropForeignKey
ALTER TABLE `products` DROP FOREIGN KEY `fk_categorieId_products`;

-- DropForeignKey
ALTER TABLE `products` DROP FOREIGN KEY `fk_providerId_products`;

-- DropForeignKey
ALTER TABLE `resetpassword` DROP FOREIGN KEY `resetpassword_ibfk_1`;

-- DropForeignKey
ALTER TABLE `cart_items` DROP FOREIGN KEY `fk_card_id_cart`;

-- DropForeignKey
ALTER TABLE `cart_items` DROP FOREIGN KEY `fk_product_id_cart`;

-- DropForeignKey
ALTER TABLE `carts` DROP FOREIGN KEY `fk_userId_car`;

-- DropForeignKey
ALTER TABLE `changepassword` DROP FOREIGN KEY `changepassword_ibfk_1`;

-- DropForeignKey
ALTER TABLE `addresses` DROP FOREIGN KEY `addresses_ibfk_1`;

-- DropForeignKey
ALTER TABLE `billing` DROP FOREIGN KEY `billing_ibfk_1`;

-- DropForeignKey
ALTER TABLE `reviews` DROP FOREIGN KEY `reviews_ibfk_1`;

-- DropForeignKey
ALTER TABLE `favorites` DROP FOREIGN KEY `favorites_ibfk_1`;

-- DropForeignKey
ALTER TABLE `favorites` DROP FOREIGN KEY `favorites_ibfk_2`;

-- DropForeignKey
ALTER TABLE `cards` DROP FOREIGN KEY `cards_ibfk_1`;

-- DropForeignKey
ALTER TABLE `order` DROP FOREIGN KEY `fk_userId_order`;

-- DropForeignKey
ALTER TABLE `shipments` DROP FOREIGN KEY `fk_order_id_shipments`;

-- DropTable
DROP TABLE `categories`;

-- DropTable
DROP TABLE `products`;

-- DropTable
DROP TABLE `providers`;

-- DropTable
DROP TABLE `users`;

-- DropTable
DROP TABLE `resetpassword`;

-- DropTable
DROP TABLE `cart_items`;

-- DropTable
DROP TABLE `carts`;

-- DropTable
DROP TABLE `changepassword`;

-- DropTable
DROP TABLE `addresses`;

-- DropTable
DROP TABLE `billing`;

-- DropTable
DROP TABLE `reviews`;

-- DropTable
DROP TABLE `favorites`;

-- DropTable
DROP TABLE `cards`;

-- DropTable
DROP TABLE `order`;

-- DropTable
DROP TABLE `shipments`;

