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
const RESPONDENT_COUNT = 100;

const PROVINCES = ["Kigali", "South", "West", "North", "East"];

const FIRST_NAMES = [
  "Jean", "Marie", "Claude", "Alice", "Eric", "Diane", "Patrick", "Josiane", "Emmanuel", "Solange",
  "Vincent", "Grace", "Innocent", "Chantal", "Fabrice", "Immaculee", "Olivier", "Beatrice", "Theogene", "Yvonne",
];
const LAST_NAMES = [
  "Uwase", "Habimana", "Mukamana", "Niyonzima", "Ingabire", "Nkurunziza", "Uwimana", "Byiringiro", "Mutesi", "Rugamba",
  "Nzeyimana", "Umutoni", "Bizimana", "Kagame", "Uwera", "Twagirayezu", "Mugisha", "Ishimwe", "Gasana", "Nyirahabimana",
];

function pad(n: number, width = 3): string {
  return String(n).padStart(width, "0");
}

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function randomDateOfBirth(i: number): Date {
  const year = 1965 + (i % 45); // ages ~16-61
  const month = i % 12;
  const day = 1 + (i % 28);
  return new Date(year, month, day);
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { name: TENANT_NAME } });
  if (!tenant) throw new Error(`Tenant "${TENANT_NAME}" not found`);
  console.log(`Using tenant "${tenant.name}" (${tenant.id})`);

  const programs = await prisma.program.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } });
  if (programs.length === 0) throw new Error("No programs found for tenant; seed programs first");
  console.log(`Found ${programs.length} programs to distribute respondents across`);

  let created = 0;
  for (let i = 1; i <= RESPONDENT_COUNT; i++) {
    const code = `RESP-${pad(i)}`;
    const firstName = pick(FIRST_NAMES, i);
    const lastName = pick(LAST_NAMES, i + 7);
    const name = `${firstName} ${lastName}`;
    const nationalId = `11989${pad(i, 11)}`;
    const gender = i % 2 === 0 ? "FEMALE" : "MALE";
    const program = programs[i % programs.length];

    await prisma.beneficiary.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      update: {},
      create: {
        tenantId: tenant.id,
        code,
        name,
        telephone: `+25078${pad(3000 + i, 7)}`,
        gender,
        dateOfBirth: randomDateOfBirth(i),
        status: "ACTIVE",
        province: pick(PROVINCES, i),
        nationalId,
        householdSize: 1 + (i % 8),
        consentGiven: true,
        consentAt: new Date(),
        outcome: "PENDING",
        programs: { connect: [{ id: program.id }] },
      },
    });
    created++;
  }

  console.log(`Respondents ready: ${created}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
