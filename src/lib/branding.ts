// Working name only — the brand is intentionally isolated here so a rename is
// a one-file change (spec §79). Do not hardcode the name anywhere else;
// UI copy pulls it from the i18n catalogs which interpolate {brand}.

export const BRAND = {
  name: 'PharmaBridge',
  legalSuffix: '(working title)',
  taglineKey: 'brand.tagline', // localized in messages/*.json
} as const;
