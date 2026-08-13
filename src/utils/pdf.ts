import PDFDocument from "pdfkit";
import type { AssignmentReportRow } from "./excel.js";
import type { FieldTeamReportRow } from "./fieldTeamReport.js";

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
