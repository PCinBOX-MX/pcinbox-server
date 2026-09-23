const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

function loadEnv(file) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) return false;
  const text = fs.readFileSync(p, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
  return true;
}

if (!loadEnv(".env.local") && !loadEnv(".env")) {
  console.error("NO_ENV");
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("NO_DATABASE_URL");
  process.exit(2);
}

const prisma = new PrismaClient();

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    table,
    column,
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

(async () => {
  if (!(await columnExists("products", "warrantyMode"))) {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE `products` ADD COLUMN `warrantyMode` VARCHAR(32) NULL AFTER `warrantyMonths`",
    );
    console.log("ADDED products.warrantyMode");
  } else {
    console.log("OK products.warrantyMode");
  }

  if (await columnExists("product_serials", "idProductSerial")) {
    if (!(await columnExists("product_serials", "warrantyMode"))) {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE `product_serials` ADD COLUMN `warrantyMode` VARCHAR(32) NULL AFTER `warrantyMonths`",
      );
      console.log("ADDED product_serials.warrantyMode");
    } else {
      console.log("OK product_serials.warrantyMode");
    }
  } else {
    console.log("SKIP product_serials (table missing)");
  }

  const tech = await prisma.$executeRawUnsafe(`
    UPDATE \`products\`
    SET \`warrantyMonths\` = 12, \`warrantyMode\` = 'months'
    WHERE \`providerId\` = 2
  `);
  const pcs = await prisma.$executeRawUnsafe(`
    UPDATE \`products\`
    SET \`warrantyMonths\` = 12, \`warrantyMode\` = 'months'
    WHERE \`providerId\` = 1 AND \`isPC\` = 1
  `);
  const align = await prisma.$executeRawUnsafe(`
    UPDATE \`products\`
    SET \`warrantyMode\` = 'months'
    WHERE \`warrantyMonths\` IS NOT NULL
      AND \`warrantyMonths\` > 0
      AND (\`warrantyMode\` IS NULL OR \`warrantyMode\` = '')
  `);

  console.log("UPDATED_TECHSMART", Number(tech));
  console.log("UPDATED_PCINBOX_ISPC", Number(pcs));
  console.log("ALIGNED_MODE", Number(align));

  const summary = await prisma.$queryRawUnsafe(`
    SELECT
      providerId,
      CASE WHEN isPC = 1 THEN 'isPC' ELSE 'other' END AS kind,
      warrantyMonths,
      warrantyMode,
      COUNT(*) AS n
    FROM products
    WHERE providerId IN (1, 2, 3)
    GROUP BY providerId, CASE WHEN isPC = 1 THEN 'isPC' ELSE 'other' END, warrantyMonths, warrantyMode
    ORDER BY providerId, kind, warrantyMonths
  `);

  console.log(
    "SUMMARY",
    JSON.stringify(summary, (_, v) => (typeof v === "bigint" ? Number(v) : v)),
  );
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("FATAL", String(e.message || e).slice(0, 400));
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
