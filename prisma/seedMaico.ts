import "dotenv/config";
import bcrypt from "bcryptjs";
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
const DEFAULT_PASSWORD = "Password123!";

const ROLE_PERMISSIONS: Record<string, string[]> = {
  "human resources": ["users:view", "users:create", "users:edit", "users:delete", "roles:view", "activity:view"],
  "data manager": [
    "programs:view",
    "programs:create",
    "programs:edit",
    "beneficiaries:view",
    "beneficiaries:create",
    "beneficiaries:edit",
    "beneficiaries:delete",
    "assignments:view",
    "assignments:create",
    "assignments:edit",
    "replacements:view",
    "replacements:create",
    "replacements:edit",
    "monitoring:view",
    "activity:view",
  ],
  supervisor: [
    "users:view",
    "programs:view",
    "beneficiaries:view",
    "assignments:view",
    "replacements:view",
    "replacements:create",
    "replacements:edit",
    "vehicles:view",
  ],
  enumerator: ["beneficiaries:view", "assignments:view", "replacements:create"],
};

const PROVINCES = ["Kigali", "South", "West", "North", "East"];

const PROGRAM_SCENARIOS = [
  "BASELINE_SURVEY",
  "ENDLINE_SURVEY",
  "TRACER_STUDY",
  "PROGRAM_OUTCOME_ASSESSMENT",
  "QUALITATIVE_STUDY",
] as const;

const PROGRAM_STATUSES = ["PLANNING", "FIELDWORK", "DATA_CLEANING", "REPORTING", "COMPLETED"] as const;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { name: TENANT_NAME } });
  if (!tenant) throw new Error(`Tenant "${TENANT_NAME}" not found`);
  console.log(`Using tenant "${tenant.name}" (${tenant.id})`);

  const roleByName: Record<string, { id: string }> = {};
  for (const [name, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      update: { permissions },
      create: { tenantId: tenant.id, name, permissions },
    });
    roleByName[name] = role;
    console.log(`Role ready: ${name} (${role.id})`);
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  type UserSpec = { email: string; name: string; roleName: string; telephone: string };
  const specs: UserSpec[] = [];

  specs.push({ email: "hr@maico.rw", name: "Aline Uwase", roleName: "human resources", telephone: "+250780000001" });
  specs.push({ email: "datamanager@maico.rw", name: "Eric Habimana", roleName: "data manager", telephone: "+250780000002" });
  for (let i = 1; i <= 10; i++) {
    specs.push({
      email: `supervisor${pad(i)}@maico.rw`,
      name: `Supervisor ${pad(i)}`,
      roleName: "supervisor",
      telephone: `+25078010${pad(i, 4)}`,
    });
  }
  for (let i = 1; i <= 30; i++) {
    specs.push({
      email: `enumerator${pad(i)}@maico.rw`,
      name: `Enumerator ${pad(i)}`,
      roleName: "enumerator",
      telephone: `+25078020${pad(i, 4)}`,
    });
  }

  let userCount = 0;
  for (const spec of specs) {
    const role = roleByName[spec.roleName];
    await prisma.user.upsert({
      where: { email: spec.email },
      update: { name: spec.name, roleId: role.id, tenantId: tenant.id },
      create: {
        email: spec.email,
        name: spec.name,
        password: passwordHash,
        roleId: role.id,
        tenantId: tenant.id,
        telephone: spec.telephone,
        status: "ACTIVE",
        province: PROVINCES[userCount % PROVINCES.length],
      },
    });
    userCount++;
  }
  console.log(`Users ready: ${userCount} (1 HR, 1 data manager, 10 supervisors, 30 enumerators)`);

  let programCount = 0;
  for (let i = 1; i <= 10; i++) {
    const name = `Field Program ${pad(i)}`;
    const scenarioType = PROGRAM_SCENARIOS[i % PROGRAM_SCENARIOS.length];
    const status = PROGRAM_STATUSES[i % PROGRAM_STATUSES.length];
    const startDate = new Date(2026, i % 12, 1);
    const endDate = new Date(2026, (i % 12) + 3, 1);
    await prisma.program.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      update: {},
      create: {
        tenantId: tenant.id,
        name,
        description: `Dummy program #${i} for maico ltd`,
        scenarioType,
        status,
        startDate,
        endDate,
        targetSampleSize: 100 * i,
      },
    });
    programCount++;
  }
  console.log(`Programs ready: ${programCount}`);

  console.log("\nDone. Default password for all seeded users: " + DEFAULT_PASSWORD);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
