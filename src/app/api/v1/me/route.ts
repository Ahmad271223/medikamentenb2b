import { handle, ok, requireUser } from '@/lib/api';

export const GET = handle(async () => {
  const user = await requireUser();
  return ok(user);
});
