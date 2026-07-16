const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const stock = await prisma.product_stock.findMany({ where: { productId: 1036n }, include: { branches: true } });
  console.log(JSON.stringify(stock, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
