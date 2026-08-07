import PDFDocument from "pdfkit";
import type { AssignmentReportRow } from "./excel.js";

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
