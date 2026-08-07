import type { Request, Response } from "express";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";

// Read-only reference data — no permission gate beyond being logged in,
// since anyone filling in a user or respondent address form needs this.

export async function listProvinces(_req: Request, res: Response): Promise<void> {
  const rows = await prisma.adminLocation.findMany({
    distinct: ["province"],
    select: { province: true },
    orderBy: { province: "asc" },
  });
  sendResponse(res, 200, "Provinces retrieved successfully", rows.map((r) => r.province));
}

export async function listDistricts(req: Request, res: Response): Promise<void> {
  const { province } = req.query;
  if (typeof province !== "string") {
    sendResponse(res, 200, "Districts retrieved successfully", []);
    return;
  }
  const rows = await prisma.adminLocation.findMany({
    where: { province },
    distinct: ["district"],
    select: { district: true },
    orderBy: { district: "asc" },
  });
  sendResponse(res, 200, "Districts retrieved successfully", rows.map((r) => r.district));
}

export async function listSectors(req: Request, res: Response): Promise<void> {
  const { province, district } = req.query;
  if (typeof district !== "string") {
    sendResponse(res, 200, "Sectors retrieved successfully", []);
    return;
  }
  const rows = await prisma.adminLocation.findMany({
    where: { district, ...(typeof province === "string" ? { province } : {}) },
    distinct: ["sector"],
    select: { sector: true },
    orderBy: { sector: "asc" },
  });
  sendResponse(res, 200, "Sectors retrieved successfully", rows.map((r) => r.sector));
}

export async function listCells(req: Request, res: Response): Promise<void> {
  const { district, sector } = req.query;
  if (typeof sector !== "string") {
    sendResponse(res, 200, "Cells retrieved successfully", []);
    return;
  }
  const rows = await prisma.adminLocation.findMany({
    where: { sector, ...(typeof district === "string" ? { district } : {}) },
    distinct: ["cell"],
    select: { cell: true },
    orderBy: { cell: "asc" },
  });
  sendResponse(res, 200, "Cells retrieved successfully", rows.map((r) => r.cell));
}

export async function listVillages(req: Request, res: Response): Promise<void> {
  const { sector, cell } = req.query;
  if (typeof cell !== "string") {
    sendResponse(res, 200, "Villages retrieved successfully", []);
    return;
  }
  const rows = await prisma.adminLocation.findMany({
    where: { cell, ...(typeof sector === "string" ? { sector } : {}) },
    distinct: ["village"],
    select: { village: true },
    orderBy: { village: "asc" },
  });
  sendResponse(res, 200, "Villages retrieved successfully", rows.map((r) => r.village));
}
