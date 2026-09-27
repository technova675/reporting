/**
 * Reads an uploaded lead list (an .xlsx workbook, CSV, TSV or a
 * semicolon-separated Excel export) into lead rows. Runs in the browser.
 *
 * Exports from Excel, Google Sheets, Apollo or Sales Navigator put columns in
 * any order under their own names, so columns are matched by header rather
 * than position. A file with no recognizable header falls back to the paste
 * format: name, company, website, email, linkedin.
 */

export type LeadField = "name" | "company" | "website" | "email" | "linkedin";
export type LeadRow = Record<LeadField, string>;

export interface ParsedLeadFile {
  rows: LeadRow[];
  /** Which file column fed each field, for the preview. Empty when positional. */
  mapping: Partial<Record<LeadField | "firstName" | "lastName", string>>;
  /** Columns in the file that did not map to anything. */
  ignored: string[];
}

export const ACCEPTED_LEAD_FILES =
  ".csv,.tsv,.txt,.xlsx,text/csv,text/tab-separated-values,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Column = LeadField | "firstName" | "lastName";

/**
 * First match wins, so order matters: the company's LinkedIn page must not
 * stand in for the person's, and "Company Website" is a website, not a company.
 */
const HEADER_RULES: [Column | null, RegExp][] = [
  [null, /compan.*linked\s*in|linked\s*in.*compan/],
  ["linkedin", /linked\s*in|^li( url| profile)?$/],
  ["email", /e ?mail/],
  ["firstName", /^first( name)?$|^given name$/],
  ["lastName", /^last( name)?$|^surname$|^family name$/],
  ["website", /website|domain|^url$|^site$|^web$|homepage/],
  ["company", /compan|organi[sz]ation|^account( name)?$|^business( name)?$|^brand$|^employer$/],
  ["name", /^(full |contact |lead |person )?name$|^contact$|^person$/],
];

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function columnFor(header: string): Column | null {
  const h = normalizeHeader(header);
  if (!h) return null;
  return HEADER_RULES.find(([, rule]) => rule.test(h))?.[0] ?? null;
}

function detectDelimiter(firstLine: string, fileName: string): string {
  if (/\.tsv$/i.test(fileName)) return "\t";
  const count = (c: string) => firstLine.split(c).length - 1;
  const candidates: [string, number][] = [
    [",", count(",")],
    ["\t", count("\t")],
    [";", count(";")],
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][1] > 0 ? candidates[0][0] : ",";
}

/** RFC 4180-style: quoted fields may hold delimiters, newlines and "" escapes. */
function splitRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === "") {
      quoted = true;
    } else if (c === delimiter) {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += c;
    }
  }
  record.push(field);
  records.push(record);

  return records
    .map((r) => r.map((f) => f.trim()))
    .filter((r) => r.some(Boolean));
}

/** Reads a CSV/TSV/TXT file's text. */
export function parseLeadFile(text: string, fileName = ""): ParsedLeadFile {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.slice(0, clean.search(/\r?\n|$/));
  return parseLeadRecords(splitRecords(clean, detectDelimiter(firstLine, fileName)));
}

/**
 * Reads an .xlsx workbook: the first sheet that has any rows. The parser is
 * loaded on demand so it only ships to browsers that actually upload Excel.
 */
export async function parseLeadWorkbook(file: File): Promise<ParsedLeadFile> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  const sheet = sheets.find((s) => s.data.length > 0);
  if (!sheet) return { rows: [], mapping: {}, ignored: [] };

  const records = sheet.data
    .map((row) =>
      row.map((cell) =>
        cell === null ? "" : cell instanceof Date ? cell.toISOString() : String(cell).trim(),
      ),
    )
    .filter((r) => r.some(Boolean));
  return parseLeadRecords(records);
}

/** Maps rows of cells, header first if there is one, to leads. */
function parseLeadRecords(records: string[][]): ParsedLeadFile {
  if (records.length === 0) return { rows: [], mapping: {}, ignored: [] };

  const header = records[0];
  const columns = header.map(columnFor);
  // A cell like "linkedin.com/in/…" matches a header rule, but a row holding
  // URLs or emails is data, not a header.
  const looksLikeData = header.some((cell) => /@|\/|\.[a-z]{2,}/i.test(cell));
  const hasHeader = !looksLikeData && columns.some((c) => c !== null);

  if (!hasHeader) {
    return {
      rows: records.map(([name = "", company = "", website = "", email = "", linkedin = ""]) => ({
        name,
        company,
        website,
        email,
        linkedin,
      })),
      mapping: {},
      ignored: [],
    };
  }

  // First matching column wins, so "Email" beats a later "Secondary Email".
  const index: Partial<Record<Column, number>> = {};
  const mapping: ParsedLeadFile["mapping"] = {};
  const ignored: string[] = [];
  columns.forEach((column, i) => {
    if (column && index[column] === undefined) {
      index[column] = i;
      mapping[column] = header[i];
    } else if (header[i]) {
      ignored.push(header[i]);
    }
  });

  const cell = (record: string[], column: Column) =>
    index[column] === undefined ? "" : (record[index[column]!] ?? "");

  const rows = records.slice(1).map((record) => {
    const fullName =
      cell(record, "name") ||
      [cell(record, "firstName"), cell(record, "lastName")].filter(Boolean).join(" ");
    return {
      name: fullName,
      company: cell(record, "company"),
      website: cell(record, "website"),
      email: cell(record, "email"),
      linkedin: cell(record, "linkedin"),
    };
  });

  return { rows, mapping, ignored };
}
