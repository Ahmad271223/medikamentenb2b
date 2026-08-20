import { describe, expect, it } from 'vitest';
import { parseCsv, validateRows, type BulkValidationContext } from './csv';

const ctx = (): BulkValidationContext => ({
  knownProducts: new Map([
    ['amoxicillin', 'prod-amox'],
    ['metformin', 'prod-metf'],
  ]),
  existingLots: new Set(['prod-amox|LOT-EXISTING']),
  today: new Date('2026-08-20T00:00:00.000Z'),
});

describe('parseCsv', () => {
  it('parses comma CSV with quoted fields', () => {
    const r = parseCsv('product_inn,lot_number,expiry_date,quantity\n"Amoxicillin","L-1",2028-01-01,500');
    expect(r.delimiter).toBe(',');
    expect(r.missingHeaders).toEqual([]);
    expect(r.rows[0]?.values['product_inn']).toBe('Amoxicillin');
    expect(r.rows[0]?.line).toBe(2);
  });

  it('detects German semicolon delimiter', () => {
    const r = parseCsv('product_inn;lot_number;expiry_date;quantity\nMetformin;L-2;2027-06-01;100');
    expect(r.delimiter).toBe(';');
    expect(r.rows[0]?.values['quantity']).toBe('100');
  });

  it('reports missing required headers', () => {
    const r = parseCsv('product_inn,quantity\nAmoxicillin,5');
    expect(r.missingHeaders).toEqual(['lot_number', 'expiry_date']);
  });
});

describe('validateRows', () => {
  const parse = (body: string) =>
    parseCsv('product_inn,lot_number,manufacturing_date,expiry_date,quantity,temperature_mode\n' + body);

  it('accepts a fully valid row with defaults applied', () => {
    const { rows } = parse('Amoxicillin,L-10,2025-01-01,2028-01-01,500,');
    const r = validateRows(rows, ctx());
    expect(r.errors).toEqual([]);
    expect(r.valid[0]).toMatchObject({
      productId: 'prod-amox',
      lotNumber: 'L-10',
      quantity: 500,
      unit: 'pack',
      temperatureMode: 'AMBIENT',
    });
  });

  it('flags unknown products, bad dates, past expiry and bad quantities per line', () => {
    const { rows } = parse(
      ['Ibuprofen,L-1,,2028-01-01,10,', 'Amoxicillin,L-2,,01.01.2028,10,', 'Amoxicillin,L-3,,2026-01-01,10,', 'Amoxicillin,L-4,,2028-01-01,-5,'].join('\n'),
    );
    const r = validateRows(rows, ctx());
    const codes = r.errors.map((e) => `${e.line}:${e.code}`);
    expect(codes).toContain('2:PRODUCT_UNKNOWN');
    expect(codes).toContain('3:EXPIRY_INVALID');
    expect(codes).toContain('4:EXPIRY_IN_PAST');
    expect(codes).toContain('5:QUANTITY_INVALID');
    expect(r.valid).toEqual([]);
  });

  it('rejects manufacturing after expiry and invalid temperature', () => {
    const { rows } = parse('Amoxicillin,L-5,2029-01-01,2028-01-01,10,VERY_COLD');
    const codes = validateRows(rows, ctx()).errors.map((e) => e.code);
    expect(codes).toContain('MFG_AFTER_EXPIRY');
    expect(codes).toContain('TEMPERATURE_INVALID');
  });

  it('detects duplicates within the file and against existing inventory', () => {
    const { rows } = parse(['Amoxicillin,L-7,,2028-01-01,10,', 'Amoxicillin,L-7,,2028-01-01,10,', 'Amoxicillin,LOT-EXISTING,,2028-01-01,10,'].join('\n'));
    const codes = validateRows(rows, ctx()).errors.map((e) => `${e.line}:${e.code}`);
    expect(codes).toContain('3:DUPLICATE_IN_FILE');
    expect(codes).toContain('4:DUPLICATE_EXISTING');
  });
});
