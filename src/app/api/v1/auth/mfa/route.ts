import { z } from 'zod';
import { ApiError, assertSameOrigin, handle, ok, requireUser } from '@/lib/api';
import { beginMfaSetup, confirmMfaSetup, disableMfa } from '@/server/account-service';

const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setup') }),
  z.object({ action: z.literal('verify'), code: z.string().length(6) }),
  z.object({ action: z.literal('disable'), code: z.string().length(6) }),
]);

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const input = Schema.parse(await req.json());

  switch (input.action) {
    case 'setup':
      return ok(await beginMfaSetup(user.id, user.email));
    case 'verify':
      await confirmMfaSetup(user.id, input.code);
      return ok({ mfaEnabled: true });
    case 'disable':
      await disableMfa(user.id, input.code);
      return ok({ mfaEnabled: false });
    default:
      throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_ACTION');
  }
});
