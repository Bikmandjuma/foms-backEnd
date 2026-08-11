// Imports Rwanda administrative hierarchy into the normalized
// Province -> District -> Sector -> Cell -> Village tables.
//
// Usage:
//   npx tsx scripts/import-geo-sql.ts
//   npx tsx scripts/import-geo-sql.ts path/to/file.sql

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

interface Row {
  id: number;
  name: string;
  parent: number | null;
}

function parseTable(
  sql: string,
  table: string,
  hasParent: boolean
): Row[] {
  const rows: Row[] = [];

  const insertRegex = new RegExp(
    "INSERT INTO `" + table + "`[^;]*;",
    "gs"
  );

  const inserts = sql.match(insertRegex) ?? [];

  for (const insert of inserts) {
    const valuesPart = insert.split(/VALUES/i)[1];

    if (!valuesPart) continue;

    const tupleRegex = hasParent
      ? /\((\d+),\s*'((?:[^'\\]|\\.)*)',\s*(\d+),/g
      : /\((\d+),\s*'((?:[^'\\]|\\.)*)',/g;

    let match: RegExpExecArray | null;

    while ((match = tupleRegex.exec(valuesPart)) !== null) {
      rows.push({
        id: Number(match[1]),
        name: match[2]!.replace(/\\'/g, "'"),
        parent: hasParent ? Number(match[3]) : null,
      });
    }
  }

  return rows;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }

  return result;
}

async function main() {
  const filePath =
    process.argv[2] ||
    path.join(
      process.cwd(),
      "data",
      "rwanda-admin-boundaries.sql"
    );

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const sql = fs.readFileSync(filePath, "utf8");

  const provinces = parseTable(
    sql,
    "provinces",
    false
  );

  const districts = parseTable(
    sql,
    "districts",
    true
  );

  const sectors = parseTable(
    sql,
    "sectors",
    true
  );

  const cells = parseTable(
    sql,
    "cells",
    true
  );

  const villages = parseTable(
    sql,
    "villages",
    true
  );

  console.log(
    `Parsed:
${provinces.length} provinces,
${districts.length} districts,
${sectors.length} sectors,
${cells.length} cells,
${villages.length} villages`
  );

  /*
   * ------------------------------------------------------------
   * Validate the hierarchy before inserting anything.
   * ------------------------------------------------------------
   */

  const provinceIds = new Set(
    provinces.map((p) => p.id)
  );

  const districtIds = new Set(
    districts.map((d) => d.id)
  );

  const sectorIds = new Set(
    sectors.map((s) => s.id)
  );

  const cellIds = new Set(
    cells.map((c) => c.id)
  );

  const invalidDistricts = districts.filter(
    (d) =>
      d.parent === null ||
      !provinceIds.has(d.parent)
  );

  const invalidSectors = sectors.filter(
    (s) =>
      s.parent === null ||
      !districtIds.has(s.parent)
  );

  const invalidCells = cells.filter(
    (c) =>
      c.parent === null ||
      !sectorIds.has(c.parent)
  );

  const invalidVillages = villages.filter(
    (v) =>
      v.parent === null ||
      !cellIds.has(v.parent)
  );

  if (
    invalidDistricts.length > 0 ||
    invalidSectors.length > 0 ||
    invalidCells.length > 0 ||
    invalidVillages.length > 0
  ) {
    console.error("Invalid geography hierarchy detected:");

    console.error(
      `Invalid districts: ${invalidDistricts.length}`
    );

    console.error(
      `Invalid sectors: ${invalidSectors.length}`
    );

    console.error(
      `Invalid cells: ${invalidCells.length}`
    );

    console.error(
      `Invalid villages: ${invalidVillages.length}`
    );

    throw new Error(
      "Geography hierarchy validation failed. Nothing was imported."
    );
  }

  console.log("Geography hierarchy validation passed.");

  /*
   * ------------------------------------------------------------
   * Provinces
   * ------------------------------------------------------------
   *
   * The current Prisma schema requires:
   *
   *   id
   *   name
   *   izina
   *
   * The parser currently provides only name, so use name for
   * izina as well unless the source SQL contains a separate
   * Kinyarwanda field.
   */

  console.log("Importing provinces...");

  const provinceData = provinces.map((province) => ({
    id: province.id,
    name: province.name,
    izina: province.name,
  }));

  let provinceImported = 0;

  for (const batch of chunk(provinceData, 500)) {
    const result = await prisma.province.createMany({
      data: batch,
      skipDuplicates: true,
    });

    provinceImported += result.count;
  }

  console.log(
    `Provinces imported: ${provinceImported}/${provinceData.length}`
  );

  /*
   * ------------------------------------------------------------
   * Districts
   * ------------------------------------------------------------
   */

  console.log("Importing districts...");

  const districtData = districts.map((district) => ({
    id: district.id,
    name: district.name,
    provinceId: district.parent!,
  }));

  let districtImported = 0;

  for (const batch of chunk(districtData, 500)) {
    const result = await prisma.district.createMany({
      data: batch,
      skipDuplicates: true,
    });

    districtImported += result.count;
  }

  console.log(
    `Districts imported: ${districtImported}/${districtData.length}`
  );

  /*
   * ------------------------------------------------------------
   * Sectors
   * ------------------------------------------------------------
   */

  console.log("Importing sectors...");

  const sectorData = sectors.map((sector) => ({
    id: sector.id,
    name: sector.name,
    districtId: sector.parent!,
  }));

  let sectorImported = 0;

  for (const batch of chunk(sectorData, 500)) {
    const result = await prisma.sector.createMany({
      data: batch,
      skipDuplicates: true,
    });

    sectorImported += result.count;
  }

  console.log(
    `Sectors imported: ${sectorImported}/${sectorData.length}`
  );

  /*
   * ------------------------------------------------------------
   * Cells
   * ------------------------------------------------------------
   */

  console.log("Importing cells...");

  const cellData = cells.map((cell) => ({
    id: cell.id,
    name: cell.name,
    sectorId: cell.parent!,
  }));

  let cellImported = 0;

  for (const batch of chunk(cellData, 500)) {
    const result = await prisma.cell.createMany({
      data: batch,
      skipDuplicates: true,
    });

    cellImported += result.count;
  }

  console.log(
    `Cells imported: ${cellImported}/${cellData.length}`
  );

  /*
   * ------------------------------------------------------------
   * Villages
   * ------------------------------------------------------------
   */

  console.log("Importing villages...");

  const villageData = villages.map((village) => ({
    id: village.id,
    name: village.name,
    cellId: village.parent!,
  }));

  let villageImported = 0;

  for (const batch of chunk(villageData, 500)) {
    const result = await prisma.village.createMany({
      data: batch,
      skipDuplicates: true,
    });

    villageImported += result.count;
  }

  console.log(
    `Villages imported: ${villageImported}/${villageData.length}`
  );

  /*
   * ------------------------------------------------------------
   * Done
   * ------------------------------------------------------------
   */

  console.log("");
  console.log("========================================");
  console.log("Rwanda geography import completed.");
  console.log("========================================");
  console.log(`Provinces: ${provinceData.length}`);
  console.log(`Districts: ${districtData.length}`);
  console.log(`Sectors:   ${sectorData.length}`);
  console.log(`Cells:     ${cellData.length}`);
  console.log(`Villages:  ${villageData.length}`);
  console.log("========================================");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
