export function countryName(
  c: { nameDe: string; nameEn: string; nameAr: string },
  locale: string,
): string {
  if (locale === 'de') return c.nameDe;
  if (locale === 'ar') return c.nameAr;
  return c.nameEn;
}
