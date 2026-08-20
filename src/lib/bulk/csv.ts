// Pure CSV parsing/validation for the bulk batch import (spec §37).
// No I/O — the API route feeds file text and context in, gets a row-level
// report out. Fixed documented headers in M2; free column mapping arrives with
// the full wizard.

export const BULK_HEADERS = {
  required: ['product_inn', 'lot_number', 'expiry_date', 'quantity'] as const,
  optional: ['manufacturing_date', 'unit', 'temperature_mode'] as const,
};

export interface CsvParseResult {
  delimiter: ',' | ';';
  headers: string[];
  rows: Array<{ line: number; values: Record<string, string> }>;
  missingHeaders: string[];
}

const TEMPERATURE_MODES = new Set(['AMBIENT', 'COLD_2_8', 'FROZEN', 'CONTROLLED_ROOM']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

export function parseCsv(text: string): CsvParseResult {
  const lines = text
    .replace(/^﻿/, '') // BOM (Excel exports)
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim().length > 0);

  const headerLine = lines[0] ?? '';
  // German Excel exports use semicolons — detect from the header line.
  const delimiter: ',' | ';' =
    (headerLine.match(/;/g)?.length ?? 0) > (headerLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const headers = splitLine(headerLine, delimiter).map((h) => h.toLowerCase());
  const missingHeaders = BULK_HEADERS.required.filter((h) => !headers.includes(h));

  const rows = lines.slice(1).map((line, idx) => {
    const cells = splitLine(line, delimiter);
    const values: Record<string, string> = {};
    headers.forEach((h, i) => {
      values[h] = cells[i] ?? '';
    });
    return { line: idx + 2, values }; // 1-based, +1 for header row
  });

  return { delimiter, headers, rows, missingHeaders };
}

export interface BulkValidationContext {
  /** lowercased INN → productId for products the org may use */
  knownProducts: Map<string, string>;
  /** existing `${productId}|${lotNumber}` combinations of the org */
  existingLots: Set<string>;
  today: Date;
}

export interface ValidBatchRow {
  line: number;
  productId: string;
  productInn: string;
  lotNumber: string;
  manufacturingDate: string | null;
  expiryDate: string;
  quantity: number;
  unit: string;
  temperatureMode: string;
}

export interface RowError {
  line: number;
  code:
    | 'PRODUCT_UNKNOWN'
    | 'LOT_MISSING'
    | 'EXPIRY_INVALID'
    | 'EXPIRY_IN_PAST'
    | 'MFG_INVALID'
    | 'MFG_AFTER_EXPIRY'
    | 'QUANTITY_INVALID'
    | 'TEMPERATURE_INVALID'
    | 'DUPLICATE_IN_FILE'
    | 'DUPLICATE_EXISTING';
  detail?: string;
}

export interface BulkValidationResult {
  valid: ValidBatchRow[];
  errors: RowError[];
}

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const dt = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === s;
}

export function validateRows(
  rows: CsvParseResult['rows'],
  ctx: BulkValidationContext,
): BulkValidationResult {
  const valid: ValidBatchRow[] = [];
  const errors: RowError[] = [];
  const seenInFile = new Set<string>();
  const todayIso = ctx.today.toISOString().slice(0, 10);

  for (const row of rows) {
    const v = row.values;
    const rowErrors: RowError[] = [];

    const inn = (v['product_inn'] ?? '').trim();
    const productId = ctx.knownProducts.get(inn.toLowerCase());
    if (!productId) rowErrors.push({ line: row.line, code: 'PRODUCT_UNKNOWN', detail: inn || '(empty)' });

    const lot = (v['lot_number'] ?? '').trim();
    if (!lot) rowErrors.push({ line: row.line, code: 'LOT_MISSING' });

    const expiry = (v['expiry_date'] ?? '').trim();
    if (!isValidDate(expiry)) {
      rowErrors.push({ line: row.line, code: 'EXPIRY_INVALID', detail: expiry });
    } else if (expiry <= todayIso) {
      rowErrors.push({ line: row.line, code: 'EXPIRY_IN_PAST', detail: expiry });
    }

    const mfg = (v['manufacturing_date'] ?? '').trim();
    if (mfg) {
      if (!isValidDate(mfg)) rowErrors.push({ line: row.line, code: 'MFG_INVALID', detail: mfg });
      else if (isValidDate(expiry) && mfg >= expiry) rowErrors.push({ line: row.line, code: 'MFG_AFTER_EXPIRY' });
    }

    const qtyRaw = (v['quantity'] ?? '').trim();
    const qty = Number(qtyRaw);
    if (!/^\d+$/.test(qtyRaw) || !Number.isInteger(qty) || qty <= 0) {
      rowErrors.push({ line: row.line, code: 'QUANTITY_INVALID', detail: qtyRaw });
    }

    const temp = (v['temperature_mode'] ?? '').trim().toUpperCase() || 'AMBIENT';
    if (!TEMPERATURE_MODES.has(temp)) {
      rowErrors.push({ line: row.line, code: 'TEMPERATURE_INVALID', detail: temp });
    }

    if (productId && lot) {
      const key = `${productId}|${lot}`;
      if (seenInFile.has(key)) rowErrors.push({ line: row.line, code: 'DUPLICATE_IN_FILE', detail: lot });
      else if (ctx.existingLots.has(key)) rowErrors.push({ line: row.line, code: 'DUPLICATE_EXISTING', detail: lot });
      seenInFile.add(key);
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      valid.push({
        line: row.line,
        productId: productId!,
        productInn: inn,
        lotNumber: lot,
        manufacturingDate: mfg || null,
        expiryDate: expiry,
        quantity: qty,
        unit: (v['unit'] ?? '').trim() || 'pack',
        temperatureMode: temp,
      });
    }
  }

  return { valid, errors };
}
