import "dotenv/config";
import { defineConfig } from "prisma/config";

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
const encodedUser = encodeURIComponent(DB_USER ?? "");
const encodedPassword = encodeURIComponent(DB_PASSWORD ?? "");
const databaseUrl = `mysql://${encodedUser}:${encodedPassword}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
