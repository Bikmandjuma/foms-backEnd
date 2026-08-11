/** Escapes a single CSV field per RFC 4180: wrap in quotes if it contains a
 * comma, quote, or newline, doubling any internal quotes. */
function escapeCsvField(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Builds a CSV buffer from an array of plain objects. `columns` controls
 * both the column order and the header labels, decoupling the CSV shape
 * from whatever key names the row objects happen to use internally.
 */
export function buildCsv<T>(rows: T[], columns: { key: keyof T; label: string }[]): Buffer {
  const lines: string[] = [];
  lines.push(columns.map((c) => escapeCsvField(c.label)).join(","));
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsvField(row[c.key])).join(","));
  }
  // Leading BOM so Excel opens UTF-8 (accented/Kinyarwanda names) correctly.
  return Buffer.from("\uFEFF" + lines.join("\r\n"), "utf8");
}
