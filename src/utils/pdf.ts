import PDFDocument from "pdfkit";
import type { AssignmentReportRow } from "./excel.js";
import type { FieldTeamReportRow } from "./fieldTeamReport.js";

/** Rounds a Date down to UTC midnight of its own calendar day, discarding
 * any stray time-of-day component. Every date this report deals with
 * (week bounds, entry dates) is meant to represent a calendar day, not a
 * specific instant, comparing raw timestamps without this normalization
 * is what causes a one-day drift depending on what timezone the server
 * happens to be running in. */
function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Formats a Date using its UTC calendar day, never the server's local
 * timezone, so "8/30/2026" always means the same calendar day it was
 * entered as, regardless of where this process happens to run. */
function formatUTCDate(d: Date): string {
  return new Date(utcMidnight(d)).toLocaleDateString("en-US", { timeZone: "UTC" });
}

interface MealTransportReportForPdf {
  week: { label: string; weekStart: Date; weekEnd: Date };
  status: string;
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

/** Renders the weekly meal & transport report as close to the original
 * paper form as a generated PDF reasonably can: title/subtitle, the
 * project/name/week header block, the daily table, the totals block (with
 * Total Transport correctly stacked under Total Accommodation rather than
 * beside it, per the corrected layout), and the two signature blocks. */
export function buildMealTransportReportPdf(
  report: MealTransportReportForPdf,
  totals: { totalMeal: number; totalAccommodation: number; totalTransport: number; grandTotal: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 44, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const money = (n: number) => `$${n.toFixed(2)}`;

    if (report.config.title.trim()) {
      doc.fontSize(15).font("Helvetica-Bold").fillColor("#111111").text(report.config.title, { align: "center" });
    }
    doc.fontSize(11).font("Helvetica-Bold").text(report.config.subtitle, { align: "center" });
    doc.moveDown(1);

    function keyValueRow(key: string, value: string, y: number, keyWidth = 150) {
      doc.rect(left, y, width, 20).stroke("#000000");
      doc.moveTo(left + keyWidth, y).lineTo(left + keyWidth, y + 20).stroke("#000000");
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#111111").text(key, left + 6, y + 6, { width: keyWidth - 12 });
      doc.font("Helvetica").text(value, left + keyWidth + 6, y + 6, { width: width - keyWidth - 12 });
    }

    let y = doc.y;
    keyValueRow("Project:", report.config.program.name, y);
    keyValueRow(`Name of ${report.config.submitterRole.name}:`, report.user.name ?? "—", y + 20);
    keyValueRow(
      "Week:",
      `From ${formatUTCDate(report.week.weekStart)}   To ${formatUTCDate(report.week.weekEnd)}`,
      y + 40
    );
    doc.y = y + 66;
    doc.moveDown(0.5);

    // Daily table.
    const cols = [
      { key: "date", label: "Date", width: width * 0.24 },
      { key: "meal", label: "Meal (USD)", width: width * 0.19 },
      { key: "accommodation", label: "Accommodation (USD)", width: width * 0.23 },
      { key: "transport", label: "Transport (USD)", width: width * 0.19 },
      { key: "total", label: "Total (USD)", width: width * 0.15 },
    ];
    function tableRow(values: string[], rowY: number, bold: boolean) {
      let x = left;
      doc.rect(left, rowY, width, 20).stroke("#000000");
      cols.forEach((c, i) => {
        if (i > 0) doc.moveTo(x, rowY).lineTo(x, rowY + 20).stroke("#000000");
        doc.fontSize(9).font(bold ? "Helvetica-Bold" : "Helvetica").fillColor("#111111").text(values[i] ?? "", x + 5, rowY + 6, { width: c.width - 10 });
        x += c.width;
      });
    }
    y = doc.y;
    tableRow(cols.map((c) => c.label), y, true);
    const dayMap = new Map(report.entries.map((e) => [e.date.toISOString().slice(0, 10), e]));
    // Not automatically a 7-day week, spans exactly however many days this
    // report's own weekStart to weekEnd covers (5 for a Mon-Fri config,
    // etc). Both bounds are normalized to UTC midnight first: comparing
    // raw timestamps without that step drifts by a day depending on the
    // server's local timezone, and so does building each day with local
    // setDate/getDate on a UTC-stored date, which is also why an entry's
    // amounts could go missing here even though it's really in the data,
    // the lookup key silently stopped matching.
    const periodDays = Math.round((utcMidnight(report.week.weekEnd) - utcMidnight(report.week.weekStart)) / 86400000) + 1;
    for (let i = 0; i < periodDays; i++) {
      const dayMs = utcMidnight(report.week.weekStart) + i * 86400000;
      const d = new Date(dayMs);
      const entry = dayMap.get(d.toISOString().slice(0, 10));
      const rowY = y + 20 * (i + 1);
      const total = entry ? entry.mealUsd + entry.accommodationUsd + entry.transportUsd : 0;
      tableRow(
        [
          formatUTCDate(d),
          entry ? money(entry.mealUsd) : "",
          entry ? money(entry.accommodationUsd) : "",
          entry ? money(entry.transportUsd) : "",
          entry ? money(total) : "",
        ],
        rowY,
        false
      );
    }
    doc.y = y + 20 * (periodDays + 1);
    doc.moveDown(0.5);

    // Totals — Total Transport stacked under Total Accommodation, per the
    // corrected layout, not beside it as the original paper form had it.
    y = doc.y;
    keyValueRow("Total Meal", money(totals.totalMeal), y);
    keyValueRow("Total Accommodation", money(totals.totalAccommodation), y + 20);
    keyValueRow("Total Transport", money(totals.totalTransport), y + 40);
    keyValueRow("Grand Total", money(totals.grandTotal), y + 60);
    doc.y = y + 86;
    doc.moveDown(0.5);

    // Signatures.
    const half = width / 2;
    y = doc.y;
    doc.rect(left, y, width, 22).stroke("#000000");
    doc.moveTo(left + half, y).lineTo(left + half, y + 22).stroke("#000000");
    doc.fontSize(9).font("Helvetica-Bold").text(`Prepared by (${report.config.submitterRole.name})`, left + 6, y + 7);
    doc.text(`Approved by (${report.config.approver.role?.name ?? "Approver"})`, left + half + 6, y + 7);

    function signatureBlock(
      rowY: number,
      label: string,
      name: string,
      signatureName: string | null,
      signatureImage: string | null,
      signedAt: Date | null,
      x: number
    ) {
      doc.fontSize(9).font("Helvetica").fillColor("#111111").text(`${label}: ${name}`, x + 6, rowY + 6, { width: half - 12 });
      doc.text("Signature:", x + 6, rowY + 22, { width: half - 12 });
      if (signatureImage) {
        try {
          const base64 = signatureImage.replace(/^data:image\/png;base64,/, "");
          doc.image(Buffer.from(base64, "base64"), x + 60, rowY + 16, { fit: [half - 90, 34] });
        } catch {
          // A corrupt/unparseable data URL falls back to a blank line rather
          // than crashing the whole export.
          doc.text("____________________", x + 60, rowY + 22);
        }
      } else if (signatureName) {
        // "Name" mode: no drawn image, the typed name itself is the
        // signature, rendered in a signature-style font.
        doc.font("Times-Italic").fontSize(14).text(signatureName, x + 60, rowY + 18, { width: half - 90 });
        doc.font("Helvetica").fontSize(9);
      } else {
        doc.text("____________________", x + 60, rowY + 22);
      }
      doc.text(`Date: ${signedAt ? formatUTCDate(signedAt) : "____________"}`, x + 6, rowY + 58, { width: half - 12 });
    }

    const sigRowY = y + 22;
    doc.rect(left, sigRowY, width, 84).stroke("#000000");
    doc.moveTo(left + half, sigRowY).lineTo(left + half, sigRowY + 84).stroke("#000000");
    signatureBlock(sigRowY, "Name", report.user.name ?? "—", report.preparerSignatureName, report.preparerSignatureImage, report.preparerSignedAt, left);
    signatureBlock(
      sigRowY,
      "Name",
      report.config.approver.name ?? "—",
      report.approverSignatureName,
      report.approverSignatureImage,
      report.approverSignedAt,
      left + half
    );

    doc.end();
  });
}

/** Simple tabular PDF for a Smart Assignment Engine run — no fancy grid
 * rendering, just clean, readable columns via manual x-positioning
 * (pdfkit has no built-in table support). */
export function buildAssignmentReportPdf(rows: AssignmentReportRow[], title: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text(title, { align: "left" });
    doc.fontSize(9).fillColor("#666666").text(`Generated ${new Date().toLocaleString()}`);
    doc.moveDown(1);

    const columns = [
      { label: "Vehicle", width: 80 },
      { label: "Driver", width: 80 },
      { label: "Code", width: 75 },
      { label: "Respondent", width: 120 },
      { label: "Enumerator", width: 100 },
    ];
    const startX = doc.page.margins.left;
    let y = doc.y;

    function drawRow(values: string[], bold: boolean): void {
      let x = startX;
      doc.fontSize(9).fillColor("#111111").font(bold ? "Helvetica-Bold" : "Helvetica");
      columns.forEach((col, i) => {
        doc.text(values[i] ?? "", x, y, { width: col.width, ellipsis: true });
        x += col.width;
      });
      y += 18;
      if (y > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
    }

    drawRow(columns.map((c) => c.label), true);
    doc.moveTo(startX, y - 4).lineTo(startX + columns.reduce((sum, c) => sum + c.width, 0), y - 4).strokeColor("#dddddd").stroke();

    rows.forEach((r) => drawRow([r.vehicle, r.driverName, r.respondentCode, r.respondentName, r.enumerator], false));

    if (rows.length === 0) {
      doc.fontSize(10).fillColor("#666666").text("No respondents assigned yet.", startX, y);
    }

    doc.end();
  });
}

/** Field Team Report — grouped by team like the reference "BUS N — TEAM"
 * field sheets, one small table per team with a supervisor line above it. */
export function buildFieldTeamReportPdf(rows: FieldTeamReportRow[], title: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text(title, { align: "left" });
    doc.fontSize(9).fillColor("#666666").text(`Generated ${new Date().toLocaleString()}`);
    doc.moveDown(1);

    const columns = [
      { key: "staffName", label: "Field Staff (Role)", width: 130 },
      { key: "staffPhone", label: "Staff Phone", width: 85 },
      { key: "respondentName", label: "Respondent Assigned", width: 130 },
      { key: "respondentPhone", label: "Respondent Phone", width: 85 },
      { key: "sector", label: "Sector", width: 75 },
      { key: "cell", label: "Cell", width: 75 },
      { key: "statusLabel", label: "Status", width: 100 },
      { key: "notes", label: "Notes", width: 165 },
    ] as const;
    const startX = doc.page.margins.left;
    const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);

    function ensureSpace(lines: number): void {
      if (doc.y + lines * 14 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }
    }

    function drawTeamHeader(row: FieldTeamReportRow): void {
      ensureSpace(4);
      doc.moveDown(0.5);
      doc
        .fontSize(11)
        .fillColor("#111111")
        .font("Helvetica-Bold")
        .text(`${row.teamName}${row.district ? " — " + row.district : ""}`, startX);
      if (row.supervisorName) {
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor("#444444")
          .text(`Team Supervisor: ${row.supervisorName}${row.supervisorPhone ? " " + row.supervisorPhone : ""}`, startX);
      }
      doc.moveDown(0.3);
    }

    function drawRow(values: string[], bold: boolean): void {
      ensureSpace(2);
      const y = doc.y;
      let x = startX;
      doc.fontSize(8.5).fillColor("#111111").font(bold ? "Helvetica-Bold" : "Helvetica");
      columns.forEach((col, i) => {
        doc.text(values[i] ?? "", x, y, { width: col.width, ellipsis: false });
        x += col.width;
      });
      doc.y = y + 16;
    }

    let currentTeam: string | null = null;
    for (const row of rows) {
      if (row.teamName !== currentTeam) {
        currentTeam = row.teamName;
        drawTeamHeader(row);
        drawRow(columns.map((c) => c.label), true);
        doc
          .moveTo(startX, doc.y - 3)
          .lineTo(startX + tableWidth, doc.y - 3)
          .strokeColor("#dddddd")
          .stroke();
      }
      drawRow(
        columns.map((c) => {
          if (c.key === "staffName") return `${row.staffName}${row.staffRole ? " — " + row.staffRole : ""}`;
          const v = row[c.key];
          return v ?? "";
        }),
        false
      );
    }

    if (rows.length === 0) {
      doc.fontSize(10).fillColor("#666666").text("No field team data for the selected filters.", startX, doc.y);
    }

    doc.end();
  });
}
