import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/lib/api';
import { exportAccountData } from '@/server/account-service';

/** GDPR Art. 15 — data-subject access as a JSON download. */
export const GET = handle(async () => {
  const user = await requireUser();
  const data = await exportAccountData(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="pharmabridge-datenauskunft-${user.id.slice(0, 8)}.json"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
