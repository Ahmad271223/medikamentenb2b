import { z } from 'zod';
import { assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { draftRuleVersion } from '@/server/rule-service';

// Typed payload validation per rule type — a draft with a malformed payload
// must never reach the database.

const ProductMatcherSchema = z.object({
  atcPrefix: z.string().min(1).max(7).optional(),
  dosageForm: z.string().min(1).max(100).optional(),
  coldChain: z.boolean().optional(),
  controlled: z.boolean().optional(),
});

const ShelfLifePayloadSchema: z.ZodType<unknown> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('ABSOLUTE_MONTHS'), minMonths: z.number().int().min(1).max(120) }),
    z.object({ kind: z.literal('PERCENTAGE_OF_ORIGINAL'), minPercent: z.number().min(1).max(100) }),
    z.object({
      kind: z.literal('COMBINED_RULE'),
      minMonths: z.number().int().min(1).max(120),
      minPercent: z.number().min(1).max(100),
      combinator: z.enum(['AND', 'OR', 'WHICHEVER_GREATER']),
    }),
    z.object({
      kind: z.literal('PRODUCT_SPECIFIC'),
      rules: z.array(z.object({ match: ProductMatcherSchema, rule: ShelfLifePayloadSchema })).min(1).max(20),
      fallback: ShelfLifePayloadSchema,
    }),
    z.object({ kind: z.literal('CASE_BY_CASE'), note: z.string().max(1000).optional() }),
    z.object({
      kind: z.literal('EXEMPTION_AVAILABLE'),
      base: ShelfLifePayloadSchema,
      exemptionNote: z.string().min(3).max(1000),
    }),
    z.object({ kind: z.literal('NO_VERIFIED_RULE') }),
  ]),
);

const ImportLicensePayloadSchema = z.object({
  permitRequired: z.boolean(),
  requiredDocumentCodes: z.array(z.string().min(1).max(60)).max(30).default([]),
});

const GenericPayloadSchema = z.record(z.string(), z.unknown());

const DraftSchema = z
  .object({
    countryId: z.string().length(2),
    ruleType: z.enum([
      'SHELF_LIFE', 'PRODUCT_REGISTRATION', 'IMPORT_LICENSE', 'LABELING',
      'SERIALIZATION', 'CONTROLLED', 'CUSTOMS', 'OTHER',
    ]),
    productScope: z.string().max(120).optional(),
    payload: z.unknown(),
    authorityName: z.string().max(300).optional(),
    sourceName: z.string().max(300).optional(),
    sourceUrl: z.string().url().max(1000).optional(),
    publishedAt: z.string().date().optional(),
    effectiveAt: z.string().date().optional(),
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNVERIFIED']).default('UNVERIFIED'),
    notes: z.string().max(4000).optional(),
  })
  .superRefine((value, ctx) => {
    const schema =
      value.ruleType === 'SHELF_LIFE'
        ? ShelfLifePayloadSchema
        : value.ruleType === 'IMPORT_LICENSE'
          ? ImportLicensePayloadSchema
          : GenericPayloadSchema;
    const result = schema.safeParse(value.payload);
    if (!result.success) {
      ctx.addIssue({ code: 'custom', path: ['payload'], message: 'Invalid payload for rule type' });
    }
  });

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('rule:draft');
  const input = DraftSchema.parse(await req.json());
  const result = await draftRuleVersion(user.id, {
    ...input,
    payload:
      input.ruleType === 'IMPORT_LICENSE' ? ImportLicensePayloadSchema.parse(input.payload) : input.payload,
  });
  return ok(result, { status: 201 });
});
