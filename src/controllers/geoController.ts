import type { Request, Response } from "express";
import { sendResponse } from "../utils/apiResponse.js";
import { prisma } from "../utils/prisma.js";

function intParam(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const n = Number(value);
  return Number.isInteger(n) ? n : undefined;
}

export async function listProvinces(_req: Request, res: Response): Promise<void> {
  const rows = await prisma.province.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  sendResponse(res, 200, "Provinces retrieved successfully", rows);
}

export async function listDistricts(req: Request, res: Response): Promise<void> {
  const provinceId = intParam(req.query.provinceId);
  if (provinceId === undefined) {
    sendResponse(res, 200, "Districts retrieved successfully", []);
    return;
  }

  const rows = await prisma.district.findMany({
    where: { provinceId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  sendResponse(res, 200, "Districts retrieved successfully", rows);
}

export async function listSectors(req: Request, res: Response): Promise<void> {
  const districtId = intParam(req.query.districtId);
  if (districtId === undefined) {
    sendResponse(res, 200, "Sectors retrieved successfully", []);
    return;
  }

  const rows = await prisma.sector.findMany({
    where: { districtId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  sendResponse(res, 200, "Sectors retrieved successfully", rows);
}

export async function listCells(req: Request, res: Response): Promise<void> {
  const sectorId = intParam(req.query.sectorId);
  if (sectorId === undefined) {
    sendResponse(res, 200, "Cells retrieved successfully", []);
    return;
  }

  const rows = await prisma.cell.findMany({
    where: { sectorId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  sendResponse(res, 200, "Cells retrieved successfully", rows);
}

export async function listVillages(req: Request, res: Response): Promise<void> {
  const cellId = intParam(req.query.cellId);
  if (cellId === undefined) {
    sendResponse(res, 200, "Villages retrieved successfully", []);
    return;
  }

  const rows = await prisma.village.findMany({
    where: { cellId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  sendResponse(res, 200, "Villages retrieved successfully", rows);
}
