import { NextRequest, NextResponse } from 'next/server';
import { ApiError, fail, ok, requirePermission } from '@/lib/api';
import { searchMarketplace } from '@/server/marketplace-service';

/** Fast autocomplete for the discover search bar — scoped to the same
 *  eligibility-filtered inventory the buyer can actually purchase. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requirePermission('org:read');
    if (!user.org) return ok([]);
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
    if (q.length < 2) return ok([]);

    const { items } = await searchMarketplace(user.org.id, { q });
    const seen = new Set<string>();
    const suggestions = [];
    for (const it of items) {
      const p = it.product;
      const label = p.brandName ?? p.inn;
      if (seen.has(label)) continue;
      seen.add(label);
      const strength = p.strengthValue ? `${p.strengthValue} ${p.strengthUnit ?? ''}`.trim() : '';
      const sub = [p.inn, strength, p.manufacturer].filter(Boolean).join(' · ');
      suggestions.push({ label, sub, q: label });
      if (suggestions.length >= 8) break;
    }
    return ok(suggestions);
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}
