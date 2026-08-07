import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client.js";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("password", 10);

  await prisma.user.upsert({
    where: {
      email: "admin@huska.rw",
    },
    update: {},
    create: {
      email: "admin@huska.rw",
      name: "Super Admin",
      password,
      isPlatformAdmin: true,
    },
  });

  console.log(
    "Seed complete: super admin user (admin@huska.rw), no tenant"
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });