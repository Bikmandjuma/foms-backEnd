// import "dotenv/config";
// import bcrypt from "bcryptjs";
// import { PrismaMariaDb } from "@prisma/adapter-mariadb";
// import { PrismaClient } from "../src/generated/prisma/client.js";

// const adapter = new PrismaMariaDb({
//   host: process.env.DB_HOST!,
//   port: Number(process.env.DB_PORT!),
//   user: process.env.DB_USER!,
//   password: process.env.DB_PASSWORD!,
//   database: process.env.DB_NAME!,
//   connectionLimit: 5,
// });

// const prisma = new PrismaClient({ adapter });

// const SALT_ROUNDS = 10;

// async function main(): Promise<void> {
//   const password = await bcrypt.hash("password", SALT_ROUNDS);

//   await prisma.user.upsert({
//     where: { email: "admin@huska.rw" },
//     update: {},
//     create: {
//       email: "admin@huska.rw",
//       name: "Super Admin",
//       password,
//       isPlatformAdmin: true,
//     },
//   });

//   console.log("Seed complete: super admin user (admin@huska.rw), no tenant");
// }

// main()
//   .catch((err) => {
//     console.error(err);
//     process.exitCode = 1;
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });


import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client.js";

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

async function main(): Promise<void> {
  const password = await bcrypt.hash("password", SALT_ROUNDS);

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