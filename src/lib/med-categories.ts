// Therapeutic-category taxonomy mapped onto the WHO ATC classification.
// ATC is an anatomical/therapeutic *classification* of active substances —
// it carries no regulatory statement about any country, so it is safe to
// hardcode. Used by the "discover" page for quick-category chips and the
// category filter; `atcPrefixes` drive the actual DB filtering.
// Labels live in messages/*.json under `discover.categories.<key>`.

export interface MedCategory {
  key: string;
  /** lucide-react icon name, resolved in the page component */
  icon: string;
  atcPrefixes: string[];
}

export const MED_CATEGORIES: MedCategory[] = [
  { key: 'pain', icon: 'Pill', atcPrefixes: ['M01', 'N02'] },
  { key: 'antibiotics', icon: 'Bug', atcPrefixes: ['J01'] },
  { key: 'antivirals', icon: 'ShieldPlus', atcPrefixes: ['J05'] },
  { key: 'diabetes', icon: 'Droplet', atcPrefixes: ['A10'] },
  { key: 'cardio', icon: 'HeartPulse', atcPrefixes: ['C'] },
  { key: 'anticoag', icon: 'Droplets', atcPrefixes: ['B01'] },
  { key: 'oncology', icon: 'Activity', atcPrefixes: ['L01', 'L02'] },
  { key: 'respiratory', icon: 'Wind', atcPrefixes: ['R03', 'R01', 'R06'] },
  { key: 'gastro', icon: 'Soup', atcPrefixes: ['A02', 'A03', 'A04', 'A07'] },
  { key: 'neuro', icon: 'Brain', atcPrefixes: ['N'] },
  { key: 'hormones', icon: 'FlaskConical', atcPrefixes: ['H', 'G03'] },
  { key: 'dermatology', icon: 'Sparkles', atcPrefixes: ['D'] },
  { key: 'ophthalmology', icon: 'Eye', atcPrefixes: ['S01'] },
  { key: 'vitamins', icon: 'Leaf', atcPrefixes: ['A11', 'A12'] },
];

export type MedCategoryKey = (typeof MED_CATEGORIES)[number]['key'];

export function categoryByKey(key: string | undefined | null): MedCategory | undefined {
  if (!key) return undefined;
  return MED_CATEGORIES.find((c) => c.key === key);
}

/** First category whose ATC prefix matches (longest prefixes are listed first per category). */
export function categoryForAtc(atc: string | null | undefined): MedCategory | undefined {
  if (!atc) return undefined;
  const code = atc.toUpperCase();
  return MED_CATEGORIES.find((c) => c.atcPrefixes.some((p) => code.startsWith(p)));
}

/** Quick-access chips shown on top of the discover page. */
export const QUICK_CATEGORY_KEYS = ['pain', 'antibiotics', 'diabetes', 'cardio', 'oncology', 'respiratory', 'gastro'];
