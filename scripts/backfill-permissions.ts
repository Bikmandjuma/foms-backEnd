// One-off script: grants every existing role literally named "admin" (case-
// insensitive) the full tenant permission set. Needed once, right after
// migrating, because roles created before Role.permissions existed have it
// as null and would otherwise be locked out of their own tenant.
//
// Run with: npx tsx scripts/backfill-permissions.ts
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { ALL_TENANT_PERMISSIONS } from "../src/utils/permissions.js";

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const roles = await prisma.role.findMany({
    where: { name: { equals: "admin" } },
  });

  let updated = 0;
  for (const role of roles) {
    const hasPermissions = Array.isArray(role.permissions) && role.permissions.length > 0;
    if (hasPermissions) continue;
    await prisma.role.update({
      where: { id: role.id },
      data: { permissions: ALL_TENANT_PERMISSIONS },
    });
    updated += 1;
  }

  console.log(`Backfilled permissions on ${updated} admin role(s) out of ${roles.length} found.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
