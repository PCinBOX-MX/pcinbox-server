const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const items = await prisma.cartItems.findMany({
    where: { productId: 1036n }
  });
  console.log(JSON.stringify(items, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
