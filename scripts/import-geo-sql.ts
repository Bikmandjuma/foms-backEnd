// Imports Rwanda administrative hierarchy into AdminLocation
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

    console.error(
      `File not found: ${filePath}`
    );

    process.exitCode = 1;
    return;
  }


  const sql = fs.readFileSync(
    filePath,
    "utf8"
  );



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



  const provinceById =
    new Map(
      provinces.map(p => [
        p.id,
        p.name
      ])
    );


  const districtById =
    new Map(
      districts.map(d => [
        d.id,
        d
      ])
    );


  const sectorById =
    new Map(
      sectors.map(s => [
        s.id,
        s
      ])
    );


  const cellById =
    new Map(
      cells.map(c => [
        c.id,
        c
      ])
    );



  const flatRows: {
    province:string;
    district:string;
    sector:string;
    cell:string;
    village:string;
  }[] = [];



  let skipped = 0;



  for (const village of villages) {


    const cell =
      cellById.get(
        village.parent!
      );


    const sector =
      cell
        ? sectorById.get(cell.parent!)
        : undefined;


    const district =
      sector
        ? districtById.get(sector.parent!)
        : undefined;


    const province =
      district
        ? provinceById.get(district.parent!)
        : undefined;



    if (
      !cell ||
      !sector ||
      !district ||
      !province
    ) {

      skipped++;
      continue;

    }



    flatRows.push({

      province,

      district:
        district.name,

      sector:
        sector.name,

      cell:
        cell.name,

      village:
        village.name

    });


  }



  if (skipped > 0) {

    console.warn(
      `Skipped ${skipped} villages with broken parents`
    );

  }



  console.log(
    `Flattened ${flatRows.length} rows. Importing...`
  );



  let imported = 0;



  for (const batch of chunk(
    flatRows,
    500
  )) {


    const result =
      await prisma.adminLocation.createMany({

        data: batch,

        skipDuplicates: true

      });



    imported += result.count;


    console.log(
      `Imported ${imported}/${flatRows.length}`
    );


  }



  console.log(
    `Done. Imported ${imported} locations`
  );

}



main()

.catch(err => {

  console.error(err);

  process.exitCode = 1;

})

.finally(async () => {

  await prisma.$disconnect();

});