/**
 * Excel/CSV Parser — Reads spreadsheet files into structured data
 * for the research engine to process.
 */

import ExcelJS from "exceljs";
import { readFile } from "fs/promises";

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: unknown[][];
  rowCount: number;
  columnCount: number;
}

/**
 * Parse an Excel (.xlsx, .xls) or CSV file into structured data.
 */
export async function parseExcel(filePath: string): Promise<ParsedSheet> {
  const ext = filePath.toLowerCase().split(".").pop();

  if (ext === "csv") {
    return parseCsv(filePath);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error(`No worksheets found in ${filePath}`);
  }

  const headers: string[] = [];
  const rows: unknown[][] = [];

  sheet.eachRow((row, rowNumber) => {
    const values = row.values as unknown[];
    // ExcelJS row.values is 1-indexed, first element is undefined
    const cleaned = values.slice(1).map(cellToValue);

    if (rowNumber === 1) {
      // Treat first row as headers
      for (const val of cleaned) {
        headers.push(String(val ?? `Column ${headers.length + 1}`));
      }
    } else {
      rows.push(cleaned);
    }
  });

  return {
    sheetName: sheet.name,
    headers,
    rows,
    rowCount: rows.length,
    columnCount: headers.length,
  };
}

/**
 * Parse a CSV file.
 */
async function parseCsv(filePath: string): Promise<ParsedSheet> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length === 0) {
    return {
      sheetName: "CSV",
      headers: [],
      rows: [],
      rowCount: 0,
      columnCount: 0,
    };
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);

  return {
    sheetName: "CSV",
    headers,
    rows,
    rowCount: rows.length,
    columnCount: headers.length,
  };
}

/**
 * Parse a single CSV line, handling quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Convert an ExcelJS cell value to a plain JS value.
 */
function cellToValue(cell: unknown): unknown {
  if (cell === null || cell === undefined) return null;

  // ExcelJS rich text
  const obj = cell as Record<string, unknown>;
  if (typeof cell === "object" && "richText" in obj) {
    return (obj.richText as { text: string }[]).map((rt) => rt.text).join("");
  }

  // ExcelJS hyperlink
  if (typeof cell === "object" && "hyperlink" in obj) {
    return (obj.text as string) ?? (obj.hyperlink as string);
  }

  // ExcelJS formula result
  if (typeof cell === "object" && "result" in obj) {
    return obj.result;
  }

  // Date
  if (cell instanceof Date) {
    return cell.toISOString();
  }

  return cell;
}
