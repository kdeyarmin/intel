/** Small CSV reader for reference files. Quoted commas and quotes are kept. */

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }
  return rows;
}

export function csvRecords(text: string): Record<string, string>[] {
  const grid = parseCsv(text);
  if (!grid.length) return [];
  const headers = grid[0].map((h) => h.trim());
  return grid.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      if (header) record[header] = (cells[i] ?? "").trim();
    });
    return record;
  });
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function cell(row: Record<string, string>, names: string[]): string {
  const wanted = new Set(names.map(norm));
  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(norm(key)) && value.trim() !== "") return value.trim();
  }
  return "";
}

export function num(value: string): number | null {
  const cleaned = value.trim().replace(/[$,]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!cleaned || cleaned === "-" || cleaned.toLowerCase() === "na") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Five-digit county FIPS. A leading zero that a spreadsheet dropped is restored. */
export function fips(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 4) return digits.padStart(5, "0");
  if (digits.length === 5) return digits;
  return null;
}

export function zip5(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const zip = digits.padStart(5, "0").slice(0, 5);
  return zip.length === 5 ? zip : null;
}

export function npi(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

export function yearOf(value: string): string | null {
  const match = value.match(/(19|20)\d{2}/);
  return match ? match[0] : null;
}

export function periodOf(value: string): string | null {
  const quarter = value.match(/(20\d{2})\s*Q\s*([1-4])/i);
  if (quarter) return `${quarter[1]}Q${quarter[2]}`;
  const month = value.match(/(20\d{2})[-/](\d{2})/);
  if (month) return `${month[1]}-${month[2]}`;
  const compact = value.match(/^(20\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}`;
  return null;
}

export function periodFromFileName(name: string): string | null {
  return periodOf(name.replace(/\.[^.]+$/, "").replace(/[_]/g, "-"));
}
