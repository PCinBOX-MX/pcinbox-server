const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const branches = await prisma.branches.findMany();
  console.log(JSON.stringify(branches, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
