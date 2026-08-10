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

type GeoPath = { province: string; district: string; sector: string; cell: string; village: string };

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { name: TENANT_NAME } });
  if (!tenant) throw new Error(`Tenant "${TENANT_NAME}" not found`);
  console.log(`Using tenant "${tenant.name}" (${tenant.id})`);

  const respondents = await prisma.beneficiary.findMany({
    where: { tenantId: tenant.id },
    orderBy: { code: "asc" },
  });
  if (respondents.length === 0) throw new Error("No respondents found for tenant; seed respondents first");
  console.log(`Found ${respondents.length} respondents`);

  // Real Rwanda administrative hierarchy, seeded separately in provinces/districts/sectors/cells/villages.
  const paths = await prisma.$queryRaw<GeoPath[]>`
    SELECT p.name AS province, d.name AS district, s.name AS sector, c.name AS cell, v.name AS village
    FROM villages v
    JOIN cells c ON v.cell = c.id
    JOIN sectors s ON c.sector = s.id
    JOIN districts d ON s.district = d.id
    JOIN provinces p ON d.province = p.id
    ORDER BY RAND()
    LIMIT ${respondents.length}
  `;
  if (paths.length < respondents.length) throw new Error("Not enough geo paths fetched from legacy tables");

  let updated = 0;
  for (let i = 0; i < respondents.length; i++) {
    const path = paths[i];
    await prisma.beneficiary.update({
      where: { id: respondents[i].id },
      data: {
        province: path.province,
        district: path.district,
        sector: path.sector,
        cell: path.cell,
        village: path.village,
      },
    });
    updated++;
  }

  console.log(`Respondents updated with full location (province -> village): ${updated}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
