import ExcelJS from "exceljs";

export interface RawBeneficiaryRow {
  rowNumber: number;
  name?: string;
  telephone?: string;
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
  gender?: string;
  ageRange?: string;
  ipName?: string;
  category?: string;
  personalId?: string;
  status?: string;
  outcome?: string;
  programs?: string; // comma-separated program names
}

const BENEFICIARY_COLUMNS: { key: keyof Omit<RawBeneficiaryRow, "rowNumber">; header: string }[] = [
  { key: "name", header: "Name" },
  { key: "telephone", header: "Telephone" },
  { key: "province", header: "Province" },
  { key: "district", header: "District" },
  { key: "sector", header: "Sector" },
  { key: "cell", header: "Cell" },
  { key: "village", header: "Village" },
  { key: "gender", header: "Gender (MALE/FEMALE/OTHER)" },
  { key: "ageRange", header: "Age (e.g. 18-20)" },
  { key: "ipName", header: "IP Name" },
  { key: "category", header: "Category" },
  { key: "personalId", header: "Personal ID" },
  { key: "status", header: "Status (ACTIVE/INACTIVE/SUSPENDED)" },
  { key: "programs", header: "Programs (comma-separated names)" },
];

function cellText(cell: ExcelJS.Cell): string | undefined {
  const value = cell.value;
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object") {
    if ("text" in value && typeof (value as { text?: unknown }).text === "string") {
      return (value as { text: string }).text.trim() || undefined;
    }
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if ("result" in value) return String((value as { result?: unknown }).result ?? "").trim() || undefined;
    return undefined;
  }
  return String(value).trim() || undefined;
}

/**
 * Reads the first worksheet of an uploaded .xlsx file. Column order doesn't
 * matter — headers are matched case-insensitively against the known set of
 * beneficiary fields, so a supervisor's own spreadsheet layout still works
 * as long as the header text is recognizable.
 */
export async function parseBeneficiariesWorkbook(buffer: Buffer): Promise<RawBeneficiaryRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const columnForIndex = new Map<number, keyof Omit<RawBeneficiaryRow, "rowNumber">>();

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const raw = cellText(cell)?.toLowerCase() ?? "";
    const match = BENEFICIARY_COLUMNS.find(
      (c) => raw.startsWith(c.key.toLowerCase()) || raw.startsWith(c.header.toLowerCase().split(" (")[0])
    );
    if (match) columnForIndex.set(colNumber, match.key);
  });

  const rows: RawBeneficiaryRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (row.cellCount === 0) continue;
    const entry: RawBeneficiaryRow = { rowNumber: r };
    let hasAnyValue = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = columnForIndex.get(colNumber);
      if (!key) return;
      const text = cellText(cell);
      if (text) {
        (entry as unknown as Record<string, string>)[key] = text;
        hasAnyValue = true;
      }
    });
    if (hasAnyValue) rows.push(entry);
  }
  return rows;
}

/** Downloadable blank template with the exact headers the importer understands, plus one example row. */
export async function buildBeneficiaryTemplateWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Beneficiaries");
  sheet.columns = BENEFICIARY_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    name: "Alice Uwimana",
    telephone: "+250788000000",
    province: "Eastern",
    district: "Nyagatare",
    sector: "Rukomo",
    cell: "Cyabajwa",
    village: "Nyamirama",
    gender: "FEMALE",
    ageRange: "30-35",
    ipName: "World Vision",
    category: "Elderly",
    personalId: "1199080012345678",
    status: "ACTIVE",
    programs: "Agriculture Baseline Survey 2026",
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export interface RawUserGroupRow {
  rowNumber: number;
  groupCode?: string; // "Group 01"
  groupName?: string; // "Gasabo Cluster A"
  operationalArea?: string;
  role?: string; // "Supervisor" | "Enumerator"
  name?: string;
  telephone?: string;
  email?: string;
  district?: string;
  region?: string; // informal name for province, e.g. "Kigali City" -> Kigali
}

const USER_GROUP_COLUMNS: { key: keyof Omit<RawUserGroupRow, "rowNumber">; header: string }[] = [
  { key: "groupCode", header: "Group" },
  { key: "groupName", header: "Group name" },
  { key: "operationalArea", header: "Operational area" },
  { key: "role", header: "Role" },
  { key: "name", header: "Name" },
  { key: "telephone", header: "Phone number" },
  { key: "email", header: "Email" },
  { key: "district", header: "District" },
  { key: "region", header: "Region" },
];

/**
 * Reads the Supervisor & Enumerator group spreadsheet — one row per person,
 * grouped by the "Group" column, each row stating its own Role. Same
 * case-insensitive header matching as parseBeneficiariesWorkbook.
 */
export async function parseUserGroupsWorkbook(buffer: Buffer): Promise<RawUserGroupRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const columnForIndex = new Map<number, keyof Omit<RawUserGroupRow, "rowNumber">>();

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const raw = cellText(cell)?.toLowerCase() ?? "";
    const match = USER_GROUP_COLUMNS.find((c) => raw.startsWith(c.header.toLowerCase()) || raw.startsWith(c.key.toLowerCase()));
    if (match) columnForIndex.set(colNumber, match.key);
  });

  const rows: RawUserGroupRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (row.cellCount === 0) continue;
    const entry: RawUserGroupRow = { rowNumber: r };
    let hasAnyValue = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = columnForIndex.get(colNumber);
      if (!key) return;
      const text = cellText(cell);
      if (text) {
        (entry as unknown as Record<string, string>)[key] = text;
        hasAnyValue = true;
      }
    });
    if (hasAnyValue) rows.push(entry);
  }
  return rows;
}

export async function buildUserGroupsTemplateWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Groups");
  sheet.columns = USER_GROUP_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    groupCode: "Group 01",
    groupName: "Gasabo Cluster A",
    operationalArea: "Gasabo District",
    role: "Supervisor",
    name: "Kanyarukiga Meshack",
    telephone: "+250788303215",
    email: "meshackkanyarukiga@gmail.com",
    district: "Gasabo",
    region: "Kigali City",
  });
  sheet.addRow({
    groupCode: "Group 01",
    groupName: "Gasabo Cluster A",
    operationalArea: "Gasabo District",
    role: "Enumerator",
    name: "Habonimana Gabriel",
    telephone: "+250782540234",
    email: "gabrielhabonimana@gmail.com",
    district: "Gasabo",
    region: "Kigali City",
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export interface DailyReportRow {
  enumerator: string;
  program: string;
  date: string;
  checkIn: string;
  checkOut: string;
  assigned: number;
  completed: number;
  refused: number;
  notFound: number;
  replaced: number;
  gps: string;
}

/** Excel export for the Daily Field Operations dashboard — one row per field worker for the selected day. */
export async function buildDailyReportWorkbook(rows: DailyReportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Daily field report");
  sheet.columns = [
    { header: "Enumerator", key: "enumerator", width: 22 },
    { header: "Program", key: "program", width: 26 },
    { header: "Date", key: "date", width: 14 },
    { header: "Check-in", key: "checkIn", width: 20 },
    { header: "Check-out", key: "checkOut", width: 20 },
    { header: "Assigned", key: "assigned", width: 10 },
    { header: "Completed", key: "completed", width: 10 },
    { header: "Refused", key: "refused", width: 10 },
    { header: "Not found", key: "notFound", width: 10 },
    { header: "Replaced", key: "replaced", width: 10 },
    { header: "GPS", key: "gps", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export interface AssignmentReportRow {
  vehicle: string;
  driverName: string;
  respondentCode: string;
  respondentName: string;
  enumerator: string;
  program: string;
}

/** Excel export for a Smart Assignment Engine run — one row per assigned respondent. */
export async function buildAssignmentReportWorkbook(rows: AssignmentReportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Assignment report");
  sheet.columns = [
    { header: "Vehicle", key: "vehicle", width: 18 },
    { header: "Driver", key: "driverName", width: 18 },
    { header: "Respondent code", key: "respondentCode", width: 18 },
    { header: "Respondent name", key: "respondentName", width: 24 },
    { header: "Enumerator", key: "enumerator", width: 22 },
    { header: "Program", key: "program", width: 28 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

interface MealTransportReportForWorkbook {
  weekNumber: number;
  weekStart: Date;
  weekEnd: Date;
  preparerSignatureName: string | null;
  preparerSignatureImage: string | null;
  preparerSignedAt: Date | null;
  approverSignatureName: string | null;
  approverSignatureImage: string | null;
  approverSignedAt: Date | null;
  user: { name: string | null };
  config: {
    title: string;
    subtitle: string;
    program: { name: string };
    submitterRole: { name: string };
    approver: { name: string | null; role: { name: string } | null };
  };
  entries: { date: Date; mealUsd: number; accommodationUsd: number; transportUsd: number }[];
}

/** Same four-part layout as the PDF, laid out as real spreadsheet cells
 * (merged header rows, bordered tables) rather than a flat row dump — so
 * it reads like the original paper form, not a data export. */
export async function buildMealTransportReportWorkbook(
  report: MealTransportReportForWorkbook,
  totals: { totalMeal: number; totalAccommodation: number; totalTransport: number; grandTotal: number }
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Week ${report.weekNumber}`);
  sheet.columns = [{ width: 22 }, { width: 18 }, { width: 22 }, { width: 18 }, { width: 16 }];

  const borderSide = { style: "thin" as const, color: { argb: "FF000000" } };
  const border = { top: borderSide, left: borderSide, bottom: borderSide, right: borderSide };
  let r = 1;

  if (report.config.title.trim()) {
    sheet.mergeCells(r, 1, r, 5);
    sheet.getCell(r, 1).value = report.config.title;
    sheet.getCell(r, 1).font = { bold: true, size: 14 };
    sheet.getCell(r, 1).alignment = { horizontal: "center" };
    r++;
  }
  sheet.mergeCells(r, 1, r, 5);
  sheet.getCell(r, 1).value = report.config.subtitle;
  sheet.getCell(r, 1).font = { bold: true, size: 12 };
  sheet.getCell(r, 1).alignment = { horizontal: "center" };
  r += 2;

  const headerRows: [string, string][] = [
    ["Project:", report.config.program.name],
    [`Name of ${report.config.submitterRole.name}:`, report.user.name ?? "—"],
    ["Week:", `From ${report.weekStart.toLocaleDateString()}  To ${report.weekEnd.toLocaleDateString()}`],
  ];
  for (const [key, value] of headerRows) {
    sheet.getCell(r, 1).value = key;
    sheet.getCell(r, 1).font = { bold: true };
    sheet.mergeCells(r, 2, r, 5);
    sheet.getCell(r, 2).value = value;
    for (let c = 1; c <= 5; c++) sheet.getCell(r, c).border = border;
    r++;
  }
  r++;

  const tableHeaderRow = r;
  ["Date", "Meal (USD)", "Accommodation (USD)", "Transport (USD)", "Total (USD)"].forEach((label, i) => {
    const cell = sheet.getCell(tableHeaderRow, i + 1);
    cell.value = label;
    cell.font = { bold: true };
    cell.border = border;
  });
  r++;

  const dayMap = new Map(report.entries.map((e) => [e.date.toISOString().slice(0, 10), e]));
  // Not automatically a 7-day week — spans exactly however many days this
  // report's own weekStart→weekEnd covers.
  const periodDays = Math.round((report.weekEnd.getTime() - report.weekStart.getTime()) / 86400000) + 1;
  for (let i = 0; i < periodDays; i++) {
    const d = new Date(report.weekStart);
    d.setDate(d.getDate() + i);
    const entry = dayMap.get(d.toISOString().slice(0, 10));
    const rowTotal = entry ? entry.mealUsd + entry.accommodationUsd + entry.transportUsd : 0;
    const values = [d.toLocaleDateString(), entry?.mealUsd ?? "", entry?.accommodationUsd ?? "", entry?.transportUsd ?? "", entry ? rowTotal : ""];
    values.forEach((v, i2) => {
      const cell = sheet.getCell(r, i2 + 1);
      cell.value = v;
      cell.border = border;
    });
    r++;
  }
  r++;

  // Totals — Total Transport stacked under Total Accommodation, per the
  // corrected layout.
  const totalRows: [string, number][] = [
    ["Total Meal", totals.totalMeal],
    ["Total Accommodation", totals.totalAccommodation],
    ["Total Transport", totals.totalTransport],
    ["Grand Total", totals.grandTotal],
  ];
  for (const [label, value] of totalRows) {
    sheet.getCell(r, 1).value = label;
    sheet.getCell(r, 1).font = { bold: label === "Grand Total" };
    sheet.mergeCells(r, 2, r, 5);
    sheet.getCell(r, 2).value = value;
    for (let c = 1; c <= 5; c++) sheet.getCell(r, c).border = border;
    r++;
  }
  r++;

  sheet.getCell(r, 1).value = `Prepared by (${report.config.submitterRole.name})`;
  sheet.getCell(r, 1).font = { bold: true };
  sheet.mergeCells(r, 1, r, 2);
  sheet.getCell(r, 3).value = `Approved by (${report.config.approver.role?.name ?? "Approver"})`;
  sheet.getCell(r, 3).font = { bold: true };
  sheet.mergeCells(r, 3, r, 5);
  r++;

  sheet.getCell(r, 1).value = `Name: ${report.user.name ?? "—"}`;
  sheet.mergeCells(r, 1, r, 2);
  sheet.getCell(r, 3).value = `Name: ${report.config.approver.name ?? "—"}`;
  sheet.mergeCells(r, 3, r, 5);
  r++;

  sheet.getCell(r, 1).value = "Signature:";
  sheet.getCell(r, 3).value = "Signature:";
  const signatureRow = r;
  sheet.getRow(signatureRow).height = 40;
  r++; // the image occupies this row visually; the date line follows

  function embedSignature(image: string | null, col: number) {
    if (!image) return;
    try {
      const base64 = image.replace(/^data:image\/png;base64,/, "");
      const imageId = workbook.addImage({ base64, extension: "png" });
      // tl/br are 0-indexed; the signature sits just right of its "Signature:"
      // label, spanning roughly one row of height.
      sheet.addImage(imageId, {
        tl: { col: col - 1 + 0.6, row: signatureRow - 1 + 0.05 },
        ext: { width: 140, height: 34 },
      });
    } catch {
      // A corrupt/unparseable data URL is skipped rather than failing the
      // whole export.
    }
  }
  embedSignature(report.preparerSignatureImage, 1);
  embedSignature(report.approverSignatureImage, 3);

  sheet.getCell(r, 1).value = `Date: ${report.preparerSignedAt ? report.preparerSignedAt.toLocaleDateString() : "—"}`;
  sheet.mergeCells(r, 1, r, 2);
  sheet.getCell(r, 3).value = `Date: ${report.approverSignedAt ? report.approverSignedAt.toLocaleDateString() : "—"}`;
  sheet.mergeCells(r, 3, r, 5);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
