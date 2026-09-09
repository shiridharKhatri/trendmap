/**
 * Utility to convert an array of objects to an RFC 4180 compliant CSV string.
 */
export function generateCsv(
  headers: Array<{ key: string; label: string }>,
  rows: Array<Record<string, any>>
): string {
  const headerLine = headers.map((h) => escapeCsvValue(h.label)).join(",");

  const dataLines = rows.map((row) => {
    return headers
      .map((h) => {
        const val = row[h.key];
        return escapeCsvValue(val);
      })
      .join(",");
  });

  return [headerLine, ...dataLines].join("\r\n");
}

function escapeCsvValue(val: any): string {
  if (val === null || val === undefined) return '""';

  let str: string;
  if (val instanceof Date) {
    str = val.toISOString();
  } else if (typeof val === "object") {
    str = JSON.stringify(val);
  } else {
    str = String(val);
  }

  // Escape quotes
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}
