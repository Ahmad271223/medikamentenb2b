import { z } from 'zod';
import { assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { createPlatformUser } from '@/server/platform-user-service';

// Create a platform staff account (Compliance Officer, Regulatory Analyst,
// Platform Admin). Staff never belong to a trading organization.
const CreateSchema = z.object({
  email: z.string().email().max(200),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  platformRole: z.enum(['PLATFORM_ADMIN', 'COMPLIANCE_OFFICER', 'REGULATORY_ANALYST']),
  locale: z.enum(['de', 'en', 'ar']).default('de'),
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const admin = await requirePermission('user:manage');
  const input = CreateSchema.parse(await req.json());
  const result = await createPlatformUser(admin.id, input);
  return ok(result, { status: 201 });
});
