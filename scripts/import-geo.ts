// Imports Rwanda's administrative hierarchy — provinces, districts, sectors,
// cells, villages — into the normalized geo tables (Province/District/
// Sector/Cell/Village), preserving the real government-assigned ids from
// the source dump rather than generating new ones.
//
// Supersedes the old import-geo-sql.ts, which populated the now-removed
// flat AdminLocation table. Safe to re-run: uses skipDuplicates, so rows
// already imported are left untouched.
//
// Usage:
//   npx tsx scripts/import-geo.ts
//   npx tsx scripts/import-geo.ts path/to/file.sql
//
// Expects the same shape as data/rwanda-admin-boundaries.sql:
//   provinces(id, name, izina, created_at, updated_at)
//   districts(id, name, province, created_at, updated_at)
//   sectors(id, name, district, created_at, updated_at)
//   cells(id, name, sector, created_at, updated_at)
//   villages(id, name, cell, created_at, updated_at)

import "dotenv/config";
import fs from "fs";
import path from "path";
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

function unescape(value: string): string {
  return value.replace(/\\'/g, "'").replace(/''/g, "'");
}

/** Pulls every INSERT INTO `table` (...) VALUES (...), (...), ...; block
 * for the given table name and returns its raw tuples as string arrays,
 * without assuming a fixed column count (works for both the 3-string-column
 * `provinces` table and the id/name/parent shape everything else uses). */
function parseInserts(sql: string, table: string): string[][] {
  const rows: string[][] = [];
  const insertRegex = new RegExp("INSERT INTO `" + table + "`[^;]*;", "gs");
  const inserts = sql.match(insertRegex) ?? [];

  // Matches one (...) tuple at a time: numbers, 'quoted strings' (with
  // escaped quotes), or NULL, separated by commas.
  const tupleRegex = /\(\s*((?:'(?:[^'\\]|\\.)*'|NULL|\d+)(?:\s*,\s*(?:'(?:[^'\\]|\\.)*'|NULL|\d+))*)\s*\)/g;
  const fieldRegex = /'(?:[^'\\]|\\.)*'|NULL|\d+/g;

  for (const insert of inserts) {
    const valuesPart = insert.split(/VALUES/i)[1];
    if (!valuesPart) continue;
    let tupleMatch: RegExpExecArray | null;
    while ((tupleMatch = tupleRegex.exec(valuesPart)) !== null) {
      const fields = (tupleMatch[1].match(fieldRegex) ?? []).map((f) =>
        f === "NULL" ? "" : f.startsWith("'") ? unescape(f.slice(1, -1)) : f
      );
      rows.push(fields);
    }
  }
  return rows;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

async function main() {
  const filePath = process.argv[2] || path.join(process.cwd(), "data", "rwanda-admin-boundaries.sql");
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }
  const sql = fs.readFileSync(filePath, "utf8");

  const provinceRows = parseInserts(sql, "provinces").map(([id, name, izina]) => ({
    id: Number(id),
    name,
    izina,
  }));
  const districtRows = parseInserts(sql, "districts").map(([id, name, province]) => ({
    id: Number(id),
    name,
    provinceId: Number(province),
  }));
  const sectorRows = parseInserts(sql, "sectors").map(([id, name, district]) => ({
    id: Number(id),
    name,
    districtId: Number(district),
  }));
  const cellRows = parseInserts(sql, "cells").map(([id, name, sector]) => ({
    id: Number(id),
    name,
    sectorId: Number(sector),
  }));
  const villageRows = parseInserts(sql, "villages").map(([id, name, cell]) => ({
    id: Number(id),
    name,
    cellId: Number(cell),
  }));

  console.log(
    `Parsed: ${provinceRows.length} provinces, ${districtRows.length} districts, ${sectorRows.length} sectors, ${cellRows.length} cells, ${villageRows.length} villages`
  );

  // Parents first — FK constraints require it, and it means a half-run is
  // safe to just re-run (skipDuplicates makes every step idempotent).
  async function importLevel<T>(label: string, rows: T[], create: (batch: T[]) => Promise<{ count: number }>) {
    let imported = 0;
    for (const batch of chunk(rows, 500)) {
      const result = await create(batch);
      imported += result.count;
    }
    console.log(`${label}: imported ${imported} new / ${rows.length} total`);
  }

  await importLevel("Provinces", provinceRows, (batch) => prisma.province.createMany({ data: batch, skipDuplicates: true }));
  await importLevel("Districts", districtRows, (batch) => prisma.district.createMany({ data: batch, skipDuplicates: true }));
  await importLevel("Sectors", sectorRows, (batch) => prisma.sector.createMany({ data: batch, skipDuplicates: true }));
  await importLevel("Cells", cellRows, (batch) => prisma.cell.createMany({ data: batch, skipDuplicates: true }));
  await importLevel("Villages", villageRows, (batch) => prisma.village.createMany({ data: batch, skipDuplicates: true }));

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
