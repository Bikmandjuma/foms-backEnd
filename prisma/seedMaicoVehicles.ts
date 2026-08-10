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

const DRIVER_NAMES = [
  "Jean Baptiste Nshimiyimana", "Claude Rutayisire", "Patrick Ndayambaje", "Emmanuel Sibomana", "Vincent Karangwa",
  "Fabrice Mugabo", "Innocent Nsengimana", "Theogene Bizumuremyi", "Olivier Ntawuruhunga", "Eric Bimenyimana",
  "Damascene Hakizimana", "Alexis Twizeyimana", "Faustin Munyaneza", "Alphonse Nkusi", "Gilbert Kamanzi",
];

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

async function upsertVehicle(name: string, opts: { driverName: string; capacityPerDay: number }) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { name: TENANT_NAME } });
  const existing = await prisma.vehicle.findFirst({ where: { tenantId: tenant.id, name } });
  if (existing) {
    await prisma.vehicle.update({ where: { id: existing.id }, data: { ...opts, type: "VEHICLE", active: true } });
    return existing.id;
  }
  const created = await prisma.vehicle.create({
    data: { tenantId: tenant.id, name, type: "VEHICLE", active: true, ...opts },
  });
  return created.id;
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { name: TENANT_NAME } });
  if (!tenant) throw new Error(`Tenant "${TENANT_NAME}" not found`);
  console.log(`Using tenant "${tenant.name}" (${tenant.id})`);

  let count = 0;
  for (let i = 1; i <= 10; i++) {
    await upsertVehicle(`SUV ${pad(i)}`, {
      driverName: DRIVER_NAMES[(i - 1) % DRIVER_NAMES.length],
      capacityPerDay: 8, // 8 passenger seats + driver = 9 total
    });
    count++;
  }
  for (let i = 1; i <= 5; i++) {
    await upsertVehicle(`Coaster ${pad(i)}`, {
      driverName: DRIVER_NAMES[(i - 1 + 10) % DRIVER_NAMES.length],
      capacityPerDay: 29, // 29 passenger seats + driver = 30 total
    });
    count++;
  }

  console.log(`Vehicles ready: ${count} (10 SUV, 5 Coaster)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
