import { describe, expect, it } from 'vitest';
import * as lucide from 'lucide-react';
import de from '../../messages/de.json';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import {
  MED_CATEGORIES,
  MED_CATEGORY_GROUPS,
  QUICK_CATEGORY_KEYS,
  categoriesInGroup,
  categoryByKey,
  categoryForAtc,
} from './med-categories';

type Catalog = { discover: { categories: Record<string, string>; groups: Record<string, string> } };
const CATALOGS: Array<[string, Catalog]> = [
  ['de', de as unknown as Catalog],
  ['en', en as unknown as Catalog],
  ['ar', ar as unknown as Catalog],
];

describe('med-categories (WHO-ATC taxonomy for the discover page)', () => {
  it('has unique keys, known groups and non-empty ATC prefixes', () => {
    const keys = MED_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of MED_CATEGORIES) {
      expect(MED_CATEGORY_GROUPS).toContain(c.group);
      expect(c.atcPrefixes.length).toBeGreaterThan(0);
      for (const p of c.atcPrefixes) expect(p).toMatch(/^[A-Z][0-9A-Z]*$/);
    }
  });

  it('every group has at least one category and every category is reachable by group', () => {
    const total = MED_CATEGORY_GROUPS.reduce((n, g) => n + categoriesInGroup(g).length, 0);
    expect(total).toBe(MED_CATEGORIES.length);
    for (const g of MED_CATEGORY_GROUPS) expect(categoriesInGroup(g).length).toBeGreaterThan(0);
  });

  it('every quick chip refers to an existing category', () => {
    for (const key of QUICK_CATEGORY_KEYS) expect(categoryByKey(key)).toBeDefined();
  });

  it('every icon name exists in lucide-react', () => {
    for (const c of MED_CATEGORIES) {
      expect((lucide as Record<string, unknown>)[c.icon], `icon ${c.icon} for ${c.key}`).toBeDefined();
    }
  });

  it('has a label in de, en and ar for every category and group (i18n parity)', () => {
    for (const [locale, catalog] of CATALOGS) {
      for (const c of MED_CATEGORIES) {
        expect(catalog.discover.categories[c.key], `${locale}: category ${c.key}`).toBeTruthy();
      }
      for (const g of MED_CATEGORY_GROUPS) {
        expect(catalog.discover.groups[g], `${locale}: group ${g}`).toBeTruthy();
      }
    }
  });

  it('categoryForAtc prefers the most specific matching prefix', () => {
    expect(categoryForAtc('C03CA01')?.key).toBe('kidney'); // diuretic: C03 beats the broad "C"
    expect(categoryForAtc('C09AA02')?.key).toBe('cardio');
    expect(categoryForAtc('J05AR10')?.key).toBe('hiv'); // HIV combination beats generic antivirals (J05)
    expect(categoryForAtc('J05AB01')?.key).toBe('antivirals');
    expect(categoryForAtc('J05AP08')?.key).toBe('liver'); // hepatitis C antiviral
    expect(categoryForAtc('L01XC03')?.key).toBe('oncology');
    expect(categoryForAtc('A10BA02')?.key).toBe('diabetes');
    expect(categoryForAtc('j01ca04')?.key).toBe('antibiotics'); // case-insensitive
    expect(categoryForAtc(null)).toBeUndefined();
    expect(categoryForAtc('ZZ99')).toBeUndefined();
  });
});
