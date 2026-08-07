import "dotenv/config";
import { defineConfig } from "prisma/config";

const {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
} = process.env;

const databaseUrl = `mysql://${encodeURIComponent(DB_USER ?? "")}:${encodeURIComponent(DB_PASSWORD ?? "")}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

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