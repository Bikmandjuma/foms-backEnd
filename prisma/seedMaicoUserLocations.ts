import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST!,
  port: Number(process.env.DB_PORT!),
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  connectionLimit: 1,
  connectTimeout: 30000,
});

const prisma = new PrismaClient({ adapter });

const TENANT_NAME = "maico ltd";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { name: TENANT_NAME } });
  if (!tenant) throw new Error(`Tenant "${TENANT_NAME}" not found`);
  console.log(`Using tenant "${tenant.name}" (${tenant.id})`);

  const users = await prisma.user.findMany({ where: { tenantId: tenant.id }, orderBy: { email: "asc" } });
  if (users.length === 0) throw new Error("No users found for tenant");
  console.log(`Found ${users.length} users`);

  const locations = await prisma.adminLocation.findMany({ take: users.length, orderBy: { id: "asc" } });
  if (locations.length < users.length) throw new Error("Not enough AdminLocation rows");

  let updated = 0;
  for (let i = 0; i < users.length; i++) {
    const loc = locations[i];
    await prisma.user.update({
      where: { id: users[i].id },
      data: {
        province: loc.province,
        district: loc.district,
        sector: loc.sector,
        cell: loc.cell,
        village: loc.village,
        adminLocationId: loc.id,
      },
    });
    updated++;
  }

  console.log(`Users linked to AdminLocation: ${updated}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
