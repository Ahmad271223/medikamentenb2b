import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(d: Date | string | null | undefined, locale: string): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(d));
}

export function formatDateTime(d: Date | string | null | undefined, locale: string): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
}

export function formatMoney(amount: string | number | null | undefined, currency: string, locale: string): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(amount));
}

export function formatNumber(n: number | null | undefined, locale: string): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(locale).format(n);
}
