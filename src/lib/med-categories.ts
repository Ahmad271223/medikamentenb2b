// Therapeutic-category taxonomy mapped onto the WHO ATC classification.
// ATC is an anatomical/therapeutic *classification* of active substances —
// it carries no regulatory statement about any country, so it is safe to
// hardcode. Used by the "discover" page for quick-category chips, the
// grouped category grid and the category filter; `atcPrefixes` drive the
// actual DB filtering (prefix match on Product.atcCode). Categories may
// overlap on purpose: a diuretic belongs to "cardio" AND "kidney".
// Labels live in messages/*.json under `discover.categories.<key>` and
// `discover.groups.<group>`.

export type MedCategoryGroup = 'infection' | 'organs' | 'oncology' | 'neuro' | 'other';

export interface MedCategory {
  key: string;
  group: MedCategoryGroup;
  /** lucide-react icon name, resolved in the page component */
  icon: string;
  atcPrefixes: string[];
}

/** Display order of the groups in the category grid. */
export const MED_CATEGORY_GROUPS: MedCategoryGroup[] = ['infection', 'organs', 'oncology', 'neuro', 'other'];

export const MED_CATEGORIES: MedCategory[] = [
  // ── Infections & vaccination ────────────────────────────────────────────
  { key: 'antibiotics', group: 'infection', icon: 'Bug', atcPrefixes: ['J01'] },
  { key: 'antimycotics', group: 'infection', icon: 'Biohazard', atcPrefixes: ['J02', 'P01', 'P02', 'P03'] },
  { key: 'tuberculosis', group: 'infection', icon: 'ShieldAlert', atcPrefixes: ['J04'] },
  { key: 'hiv', group: 'infection', icon: 'Shield', atcPrefixes: ['J05AE', 'J05AF', 'J05AG', 'J05AJ', 'J05AR'] },
  { key: 'antivirals', group: 'infection', icon: 'ShieldPlus', atcPrefixes: ['J05'] },
  { key: 'vaccines', group: 'infection', icon: 'Syringe', atcPrefixes: ['J07'] },
  { key: 'immunoglobulins', group: 'infection', icon: 'TestTube', atcPrefixes: ['J06'] },

  // ── Organ systems & metabolism ──────────────────────────────────────────
  { key: 'cardio', group: 'organs', icon: 'HeartPulse', atcPrefixes: ['C'] },
  { key: 'kidney', group: 'organs', icon: 'Filter', atcPrefixes: ['C03', 'B03XA', 'B03AC', 'V03AE', 'H05', 'A11CC'] },
  { key: 'liver', group: 'organs', icon: 'Beaker', atcPrefixes: ['A05', 'J05AP', 'J05AF', 'A06AD11', 'A07AA11'] },
  { key: 'respiratory', group: 'organs', icon: 'Wind', atcPrefixes: ['R03', 'R01', 'R05', 'R06', 'R07'] },
  { key: 'gastro', group: 'organs', icon: 'Soup', atcPrefixes: ['A02', 'A03', 'A04', 'A06', 'A07', 'A09'] },
  { key: 'diabetes', group: 'organs', icon: 'Droplet', atcPrefixes: ['A10'] },
  { key: 'thyroid', group: 'organs', icon: 'CircleDot', atcPrefixes: ['H03'] },
  { key: 'hormones', group: 'organs', icon: 'FlaskConical', atcPrefixes: ['H01', 'H02', 'H04', 'G03'] },
  { key: 'womens', group: 'organs', icon: 'Venus', atcPrefixes: ['G01', 'G02', 'G03', 'H01BB'] },
  { key: 'urology', group: 'organs', icon: 'Waves', atcPrefixes: ['G04'] },
  { key: 'bone', group: 'organs', icon: 'Bone', atcPrefixes: ['M05', 'H05', 'A12A', 'A11CC'] },
  { key: 'rheuma', group: 'organs', icon: 'Bandage', atcPrefixes: ['M01', 'M04', 'L04AB', 'L04AC', 'H02'] },

  // ── Oncology, blood & immune system ─────────────────────────────────────
  { key: 'oncology', group: 'oncology', icon: 'Ribbon', atcPrefixes: ['L01', 'L02'] },
  { key: 'supportive', group: 'oncology', icon: 'HandHeart', atcPrefixes: ['A04', 'L03AA', 'M05BA', 'V03AF', 'B03XA'] },
  { key: 'immunology', group: 'oncology', icon: 'Dna', atcPrefixes: ['L04', 'L03'] },
  { key: 'blood', group: 'oncology', icon: 'Droplets', atcPrefixes: ['B02', 'B03'] },
  { key: 'anticoag', group: 'oncology', icon: 'Activity', atcPrefixes: ['B01'] },

  // ── Nervous system, mind & pain ─────────────────────────────────────────
  { key: 'pain', group: 'neuro', icon: 'Pill', atcPrefixes: ['N02', 'M01', 'M03'] },
  { key: 'neurology', group: 'neuro', icon: 'Brain', atcPrefixes: ['N03', 'N04', 'N07', 'N02CC', 'L03AB'] },
  { key: 'psychiatry', group: 'neuro', icon: 'BrainCircuit', atcPrefixes: ['N05', 'N06'] },
  { key: 'anesthesia', group: 'neuro', icon: 'Siren', atcPrefixes: ['N01', 'B05', 'V03AB', 'C01CA', 'M03A', 'R07'] },

  // ── Other specialties ───────────────────────────────────────────────────
  { key: 'dermatology', group: 'other', icon: 'Sparkles', atcPrefixes: ['D'] },
  { key: 'ophthalmology', group: 'other', icon: 'Eye', atcPrefixes: ['S01'] },
  { key: 'ent', group: 'other', icon: 'Ear', atcPrefixes: ['S02', 'S03', 'R01'] },
  { key: 'dental', group: 'other', icon: 'Smile', atcPrefixes: ['A01'] },
  { key: 'allergy', group: 'other', icon: 'Sun', atcPrefixes: ['R06', 'V01', 'D04'] },
  { key: 'vitamins', group: 'other', icon: 'Leaf', atcPrefixes: ['A11', 'A12'] },
  { key: 'nutrition', group: 'other', icon: 'Utensils', atcPrefixes: ['B05', 'V06'] },
  { key: 'diagnostics', group: 'other', icon: 'ScanLine', atcPrefixes: ['V04', 'V08', 'V09'] },
];

export type MedCategoryKey = (typeof MED_CATEGORIES)[number]['key'];

export function categoryByKey(key: string | undefined | null): MedCategory | undefined {
  if (!key) return undefined;
  return MED_CATEGORIES.find((c) => c.key === key);
}

export function categoriesInGroup(group: MedCategoryGroup): MedCategory[] {
  return MED_CATEGORIES.filter((c) => c.group === group);
}

/** Category used for a product's card icon: the most specific matching prefix wins. */
export function categoryForAtc(atc: string | null | undefined): MedCategory | undefined {
  if (!atc) return undefined;
  const code = atc.toUpperCase();
  let best: { cat: MedCategory; len: number } | undefined;
  for (const cat of MED_CATEGORIES) {
    for (const p of cat.atcPrefixes) {
      if (code.startsWith(p) && (!best || p.length > best.len)) best = { cat, len: p.length };
    }
  }
  return best?.cat;
}

/** Quick-access chips shown on top of the discover page (most-procured areas first). */
export const QUICK_CATEGORY_KEYS = [
  'antibiotics',
  'oncology',
  'diabetes',
  'cardio',
  'kidney',
  'liver',
  'pain',
  'respiratory',
  'hiv',
  'vaccines',
];
