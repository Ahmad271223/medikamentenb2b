/**
 * DEMO seed — every business entity created here is labeled DEMO (isDemo flags,
 * [DEMO] name prefixes, rule status DEMO/PENDING_VERIFICATION).
 *
 * NO-HALLUCINATION POLICY: no regulatory statement about any real country is
 * seeded as verified. Real countries receive only NO_VERIFIED_RULE /
 * PENDING_VERIFICATION placeholders. The fictional country "ZZ —
 * Demonstration Country" exists precisely so the full ELIGIBLE flow can be
 * demonstrated without asserting anything about a real jurisdiction.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { hashPassword } from '../src/lib/crypto/password';
import { evaluateBatchForDestination, ELIGIBILITY_ENGINE_VERSION } from '../src/domain/eligibility/engine';
import type { EligibilityInput, ShelfLifeRuleSnapshot } from '../src/domain/eligibility/types';
import { diffDaysUtc } from '../src/domain/dates';

const prisma = new PrismaClient();
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const DEMO_PASSWORD = 'PharmaBridge-Demo-2026';

interface CountrySeed {
  id: string;
  en: string;
  de: string;
  ar: string;
  region: string;
  isEea?: boolean;
  supply?: boolean;
  destination?: boolean;
}

const COUNTRIES: CountrySeed[] = [
  { id: 'DE', en: 'Germany', de: 'Deutschland', ar: 'ألمانيا', region: 'Western Europe', isEea: true, supply: true },
  { id: 'NL', en: 'Netherlands', de: 'Niederlande', ar: 'هولندا', region: 'Western Europe', isEea: true, supply: true },
  { id: 'AT', en: 'Austria', de: 'Österreich', ar: 'النمسا', region: 'Western Europe', isEea: true, supply: true },
  { id: 'CH', en: 'Switzerland', de: 'Schweiz', ar: 'سويسرا', region: 'Western Europe', isEea: false, supply: true },
  { id: 'BE', en: 'Belgium', de: 'Belgien', ar: 'بلجيكا', region: 'Western Europe', isEea: true },
  { id: 'FR', en: 'France', de: 'Frankreich', ar: 'فرنسا', region: 'Western Europe', isEea: true },
  { id: 'DK', en: 'Denmark', de: 'Dänemark', ar: 'الدنمارك', region: 'Northern Europe', isEea: true },
  { id: 'SE', en: 'Sweden', de: 'Schweden', ar: 'السويد', region: 'Northern Europe', isEea: true },
  { id: 'IT', en: 'Italy', de: 'Italien', ar: 'إيطاليا', region: 'Southern Europe', isEea: true },
  { id: 'ES', en: 'Spain', de: 'Spanien', ar: 'إسبانيا', region: 'Southern Europe', isEea: true },
  { id: 'EG', en: 'Egypt', de: 'Ägypten', ar: 'مصر', region: 'MENA', destination: true },
  { id: 'JO', en: 'Jordan', de: 'Jordanien', ar: 'الأردن', region: 'MENA', destination: true },
  { id: 'LB', en: 'Lebanon', de: 'Libanon', ar: 'لبنان', region: 'MENA', destination: true },
  { id: 'SA', en: 'Saudi Arabia', de: 'Saudi-Arabien', ar: 'المملكة العربية السعودية', region: 'MENA', destination: true },
  { id: 'AE', en: 'United Arab Emirates', de: 'Vereinigte Arabische Emirate', ar: 'الإمارات العربية المتحدة', region: 'MENA', destination: true },
  { id: 'KE', en: 'Kenya', de: 'Kenia', ar: 'كينيا', region: 'Sub-Saharan Africa', destination: true },
  { id: 'NG', en: 'Nigeria', de: 'Nigeria', ar: 'نيجيريا', region: 'Sub-Saharan Africa', destination: true },
  { id: 'ZA', en: 'South Africa', de: 'Südafrika', ar: 'جنوب أفريقيا', region: 'Sub-Saharan Africa', destination: true },
  { id: 'PK', en: 'Pakistan', de: 'Pakistan', ar: 'باكستان', region: 'South Asia', destination: true },
  { id: 'KZ', en: 'Kazakhstan', de: 'Kasachstan', ar: 'كازاخستان', region: 'Central Asia', destination: true },
  { id: 'UZ', en: 'Uzbekistan', de: 'Usbekistan', ar: 'أوزبكستان', region: 'Central Asia', destination: true },
  { id: 'GE', en: 'Georgia', de: 'Georgien', ar: 'جورجيا', region: 'Eastern Europe', destination: true },
  { id: 'VN', en: 'Vietnam', de: 'Vietnam', ar: 'فيتنام', region: 'Southeast Asia', destination: true },
  { id: 'PH', en: 'Philippines', de: 'Philippinen', ar: 'الفلبين', region: 'Southeast Asia', destination: true },
];

// EXAMPLE products only (spec §74) — attributes are DEMO data, not verified
// master data. No shortage or availability claim is implied.
const PRODUCTS = [
  { inn: 'Amoxicillin', atc: 'J01CA04', strength: '500', unit: 'mg', form: 'capsule', pack: 20, shelf: 36 },
  { inn: 'Amoxicillin/Clavulanic acid', atc: 'J01CR02', strength: null, unit: null, form: 'tablet', pack: 14, shelf: 24 },
  { inn: 'Ceftriaxone', atc: 'J01DD04', strength: '1000', unit: 'mg', form: 'powder for injection', pack: 10, shelf: 36 },
  { inn: 'Azithromycin', atc: 'J01FA10', strength: '500', unit: 'mg', form: 'tablet', pack: 3, shelf: 36 },
  { inn: 'Metronidazole', atc: 'P01AB01', strength: '500', unit: 'mg', form: 'tablet', pack: 20, shelf: 36 },
  { inn: 'Metformin', atc: 'A10BA02', strength: '1000', unit: 'mg', form: 'tablet', pack: 120, shelf: 48 },
  { inn: 'Salbutamol', atc: 'R03AC02', strength: '100', unit: 'µg/dose', form: 'inhaler', pack: 1, shelf: 24 },
  { inn: 'Furosemide', atc: 'C03CA01', strength: '40', unit: 'mg', form: 'tablet', pack: 50, shelf: 48 },
  { inn: 'Amlodipine', atc: 'C08CA01', strength: '10', unit: 'mg', form: 'tablet', pack: 100, shelf: 36 },
  { inn: 'Tranexamic acid', atc: 'B02AA02', strength: '500', unit: 'mg', form: 'tablet', pack: 20, shelf: 36 },
] as const;

async function main() {
  const already = await prisma.user.findUnique({ where: { email: 'admin@demo.pharmabridge.local' } });
  if (already) {
    console.log('Seed skipped — demo data already present.');
    return;
  }

  console.log('Seeding PharmaBridge DEMO data …');
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // ── Platform configuration (everything configurable, nothing hardcoded) ──
  const configs: Array<[string, Prisma.InputJsonValue, string]> = [
    ['demo_mode', true, 'Shows the DEMO banner in the UI'],
    ['seller_commission_percent', 5, 'Platform commission charged to sellers (%)'],
    ['buyer_fee_percent', 0, 'Optional buyer-side fee (%)'],
    ['default_shipping_days', 6, 'Arrival projection: default shipping days'],
    ['default_customs_buffer_days', 4, 'Arrival projection: customs buffer days'],
    ['default_operational_buffer_days', 5, 'Arrival projection: operational safety buffer days'],
    ['short_dated_threshold_months', 12, 'Below this remaining shelf life a listing is SHORT_DATED'],
    ['excluded_controlled_statuses', ['NARCOTIC', 'PSYCHOTROPIC', 'OTHER_CONTROLLED'], 'Product classes excluded in the MVP phase'],
    ['allow_cold_chain', false, 'MVP: cold-chain trades require human review'],
    ['sanctions_max_age_days', 180, 'Sanctions screening validity window'],
    ['license_warning_days', 90, 'License expiry warning horizon'],
  ];
  for (const [key, value, description] of configs) {
    await prisma.platformConfig.upsert({ where: { key }, update: {}, create: { key, value, description } });
  }

  // ── Countries ──────────────────────────────────────────────────────────
  for (const c of COUNTRIES) {
    await prisma.country.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        nameEn: c.en,
        nameDe: c.de,
        nameAr: c.ar,
        region: c.region,
        isEea: c.isEea ?? false,
        isSupplyEnabled: c.supply ?? false,
        isDestinationEnabled: c.destination ?? false,
        tradeStatus: 'NOT_TRADE_ENABLED',
      },
    });
  }
  await prisma.country.upsert({
    where: { id: 'ZZ' },
    update: {},
    create: {
      id: 'ZZ',
      nameEn: 'Demonstration Country [DEMO]',
      nameDe: 'Demonstrationsland [DEMO]',
      nameAr: 'بلد تجريبي [DEMO]',
      region: 'Demo',
      isEea: false,
      isSupplyEnabled: false,
      isDestinationEnabled: true,
      tradeStatus: 'TRADE_ENABLED',
      shippingDays: 6,
      customsBufferDays: 4,
      operationalBufferDays: 5,
      isDemo: true,
    },
  });

  // ── Platform staff ───────────────────────────────────────────────────────
  const [admin, officer] = await Promise.all([
    prisma.user.create({
      data: {
        email: 'admin@demo.pharmabridge.local', passwordHash,
        firstName: 'Ada', lastName: 'Admin [DEMO]', locale: 'de', platformRole: 'PLATFORM_ADMIN',
      },
    }),
    prisma.user.create({
      data: {
        email: 'compliance@demo.pharmabridge.local', passwordHash,
        firstName: 'Carla', lastName: 'Compliance [DEMO]', locale: 'de', platformRole: 'COMPLIANCE_OFFICER',
      },
    }),
  ]);
  await prisma.user.create({
    data: {
      email: 'analyst@demo.pharmabridge.local', passwordHash,
      firstName: 'Rami', lastName: 'Analyst [DEMO]', locale: 'en', platformRole: 'REGULATORY_ANALYST',
    },
  });

  // ── Demo seller (DE, verified) ──────────────────────────────────────────
  const sellerUser = await prisma.user.create({
    data: {
      email: 'seller@demo.pharmabridge.local', passwordHash,
      firstName: 'Sofia', lastName: 'Sellerin [DEMO]', locale: 'de',
    },
  });
  const sellerOrg = await prisma.organization.create({
    data: {
      kind: 'SELLER',
      legalName: '[DEMO] Rhein Pharma Handel GmbH',
      tradingName: 'Rhein Pharma',
      countryId: 'DE',
      city: 'Frankfurt am Main',
      contactEmail: 'seller@demo.pharmabridge.local',
      status: 'VERIFIED',
      kybStatus: 'APPROVED',
      sanctionsStatus: 'CLEAR',
      isDemo: true,
      members: { create: { userId: sellerUser.id, role: 'OWNER' } },
    },
  });
  const sellerWda = await prisma.license.create({
    data: {
      orgId: sellerOrg.id, type: 'WDA', number: 'DE-WDA-DEMO-4711',
      issuingAuthority: '[DEMO] Regierungspräsidium Musterstadt', countryId: 'DE',
      issueDate: d('2023-10-01'), expiryDate: d('2027-10-01'),
      status: 'VERIFIED', verifiedById: officer.id, verifiedAt: new Date(), isDemo: true,
    },
  });
  // A GDP certificate that expires soon — exercises the expiry-warning UI.
  await prisma.license.create({
    data: {
      orgId: sellerOrg.id, type: 'GDP', number: 'DE-GDP-DEMO-0815',
      issuingAuthority: '[DEMO] Regierungspräsidium Musterstadt', countryId: 'DE',
      issueDate: d('2024-10-05'), expiryDate: d('2026-10-05'),
      status: 'VERIFIED', verifiedById: officer.id, verifiedAt: new Date(), isDemo: true,
    },
  });
  const sellerWarehouse = await prisma.warehouse.create({
    data: {
      orgId: sellerOrg.id, name: 'Lager Frankfurt [DEMO]', city: 'Frankfurt am Main', countryId: 'DE',
      capAmbient: true, capCold2to8: true, gdpCompliant: true,
    },
  });
  await prisma.sanctionsCheck.create({
    data: {
      subjectType: 'ORGANIZATION', subjectId: sellerOrg.id, provider: 'MANUAL',
      result: 'CLEAR', checkedById: officer.id, expiresAt: d('2027-02-20'),
      payload: { note: 'DEMO DATA — manual screening record' },
    },
  });

  // ── Demo buyer (fictional country ZZ, verified) ─────────────────────────
  const buyerUser = await prisma.user.create({
    data: {
      email: 'buyer@demo.pharmabridge.local', passwordHash,
      firstName: 'Bilal', lastName: 'Buyer [DEMO]', locale: 'en',
    },
  });
  const buyerOrg = await prisma.organization.create({
    data: {
      kind: 'BUYER',
      legalName: '[DEMO] Demoland Medical Supplies Ltd.',
      countryId: 'ZZ',
      contactEmail: 'buyer@demo.pharmabridge.local',
      status: 'VERIFIED',
      kybStatus: 'APPROVED',
      sanctionsStatus: 'CLEAR',
      isDemo: true,
      members: { create: { userId: buyerUser.id, role: 'OWNER' } },
    },
  });
  await prisma.license.create({
    data: {
      orgId: buyerOrg.id, type: 'IMPORT', number: 'ZZ-IMP-DEMO-2201',
      issuingAuthority: '[DEMO] Demoland Medicines Agency', countryId: 'ZZ',
      issueDate: d('2025-01-15'), expiryDate: d('2028-01-15'),
      status: 'VERIFIED', verifiedById: officer.id, verifiedAt: new Date(), isDemo: true,
    },
  });
  await prisma.warehouse.create({
    data: {
      orgId: buyerOrg.id, name: 'Central Warehouse [DEMO]', city: 'Demo City', countryId: 'ZZ',
      capAmbient: true,
    },
  });
  await prisma.sanctionsCheck.create({
    data: {
      subjectType: 'ORGANIZATION', subjectId: buyerOrg.id, provider: 'MANUAL',
      result: 'CLEAR', checkedById: officer.id, expiresAt: d('2027-02-20'),
      payload: { note: 'DEMO DATA — manual screening record' },
    },
  });
  await prisma.importPermit.create({
    data: {
      buyerOrgId: buyerOrg.id, countryId: 'ZZ', permitNumber: 'ZZ-PERMIT-DEMO-77',
      issueDate: d('2026-05-01'), expiryDate: d('2027-05-01'), status: 'VERIFIED',
    },
  });

  // ── A second seller still in the KYB queue (work for compliance) ───────
  const pendingUser = await prisma.user.create({
    data: {
      email: 'seller2@demo.pharmabridge.local', passwordHash,
      firstName: 'Petra', lastName: 'Pending [DEMO]', locale: 'de',
    },
  });
  const pendingOrg = await prisma.organization.create({
    data: {
      kind: 'SELLER',
      legalName: '[DEMO] Alpen Medica AG',
      countryId: 'AT',
      contactEmail: 'seller2@demo.pharmabridge.local',
      status: 'PENDING_KYB',
      kybStatus: 'PENDING',
      isDemo: true,
      members: { create: { userId: pendingUser.id, role: 'OWNER' } },
    },
  });
  await prisma.complianceReview.create({ data: { type: 'KYB', orgId: pendingOrg.id, priority: 60 } });
  const pendingLicense = await prisma.license.create({
    data: {
      orgId: pendingOrg.id, type: 'WDA', number: 'AT-WDA-DEMO-9903',
      issuingAuthority: '[DEMO] BASG Musterbehörde', countryId: 'AT',
      expiryDate: d('2028-03-01'), status: 'PENDING_REVIEW', isDemo: true,
    },
  });
  await prisma.complianceReview.create({
    data: { type: 'LICENSE', orgId: pendingOrg.id, licenseId: pendingLicense.id, priority: 55 },
  });

  // ── Manufacturer + products ─────────────────────────────────────────────
  const manufacturer = await prisma.manufacturer.create({
    data: { name: '[DEMO] Muster Pharma GmbH', countryId: 'DE', isDemo: true },
  });

  const productIds = new Map<string, string>();
  for (const p of PRODUCTS) {
    const created = await prisma.product.create({
      data: {
        inn: p.inn,
        manufacturerId: manufacturer.id,
        mahName: '[DEMO] Muster Pharma GmbH',
        atcCode: p.atc,
        strengthValue: p.strength,
        strengthUnit: p.unit,
        dosageForm: p.form,
        packSize: p.pack,
        packUnit: 'pack',
        prescriptionStatus: 'RX',
        controlledStatus: 'NONE',
        coldChain: false,
        originalShelfLifeMonths: p.shelf,
        status: 'VERIFIED',
        isDemo: true,
      },
    });
    productIds.set(p.inn, created.id);
  }
  // One cold-chain product to exercise the review path.
  const insulin = await prisma.product.create({
    data: {
      inn: 'Human insulin', manufacturerId: manufacturer.id, mahName: '[DEMO] Muster Pharma GmbH',
      atcCode: 'A10AB01', strengthValue: '100', strengthUnit: 'IU/ml', dosageForm: 'solution for injection',
      packSize: 1, packUnit: 'vial', prescriptionStatus: 'RX', controlledStatus: 'NONE',
      coldChain: true, storageMinC: '2', storageMaxC: '8',
      originalShelfLifeMonths: 30, status: 'VERIFIED', isDemo: true,
    },
  });
  productIds.set('Human insulin', insulin.id);

  // Product registrations in the fictional destination — DEMO only.
  for (const [, productId] of productIds) {
    await prisma.productCountryRegistration.create({
      data: {
        productId, countryId: 'ZZ', status: 'REGISTERED',
        registrationNumber: `ZZ-REG-${productId.slice(0, 8)}`,
        sourceName: 'DEMO DATA — fictional registry', verifiedAt: new Date(), isDemo: true,
      },
    });
  }

  // ── Batches with spread expiry buckets ──────────────────────────────────
  const batchSeeds = [
    { inn: 'Amoxicillin', lot: 'DEMO-LOT-2506', mfg: '2025-06-15', exp: '2028-06-15', qty: 5000, quality: 'VERIFIED' as const },
    { inn: 'Ceftriaxone', lot: 'DEMO-LOT-2411', mfg: '2024-11-01', exp: '2027-11-01', qty: 8000, quality: 'VERIFIED' as const },
    { inn: 'Azithromycin', lot: 'DEMO-LOT-2405', mfg: '2024-05-01', exp: '2027-05-01', qty: 3000, quality: 'UNVERIFIED' as const },
    { inn: 'Metformin', lot: 'DEMO-LOT-2301', mfg: '2023-01-15', exp: '2027-01-15', qty: 12000, quality: 'UNVERIFIED' as const },
    { inn: 'Salbutamol', lot: 'DEMO-LOT-2411B', mfg: '2024-11-10', exp: '2026-11-10', qty: 900, quality: 'UNVERIFIED' as const },
    { inn: 'Furosemide', lot: 'DEMO-LOT-2503', mfg: '2025-03-01', exp: '2029-03-01', qty: 20000, quality: 'UNVERIFIED' as const },
    { inn: 'Amlodipine', lot: 'DEMO-LOT-2408', mfg: '2024-08-10', exp: '2027-08-10', qty: 7000, quality: 'UNVERIFIED' as const },
    { inn: 'Human insulin', lot: 'DEMO-LOT-2503C', mfg: '2025-03-01', exp: '2027-09-01', qty: 400, quality: 'UNVERIFIED' as const, cold: true },
  ];

  let listingBatchId: string | null = null;
  for (const b of batchSeeds) {
    const batch = await prisma.batch.create({
      data: {
        productId: productIds.get(b.inn)!,
        sellerOrgId: sellerOrg.id,
        warehouseId: sellerWarehouse.id,
        lotNumber: b.lot,
        manufacturingDate: d(b.mfg),
        expiryDate: d(b.exp),
        originalShelfLifeDays: diffDaysUtc(d(b.exp), d(b.mfg)),
        quantity: b.qty,
        unit: 'pack',
        temperatureMode: 'cold' in b && b.cold ? 'COLD_2_8' : 'AMBIENT',
        qualityStatus: b.quality,
        verifiedAt: b.quality === 'VERIFIED' ? new Date() : null,
        isDemo: true,
        position: { create: { onHand: b.qty } },
      },
    });
    if (b.inn === 'Amoxicillin') listingBatchId = batch.id;
  }

  // ── Regulatory rules ────────────────────────────────────────────────────
  // ZZ (fictional): fully verified DEMO ruleset so the eligible flow works.
  const zzShelfRule = await prisma.regulatoryRule.create({
    data: { countryId: 'ZZ', ruleType: 'SHELF_LIFE' },
  });
  const zzShelfV1 = await prisma.regulatoryRuleVersion.create({
    data: {
      ruleId: zzShelfRule.id, version: 1,
      payload: { kind: 'COMBINED_RULE', minMonths: 12, minPercent: 50, combinator: 'WHICHEVER_GREATER' },
      status: 'VERIFIED', confidence: 'HIGH',
      authorityName: '[DEMO] Demoland Medicines Agency',
      sourceName: 'DEMO DATA — fictional country, no real-world claim',
      publishedAt: d('2026-01-01'), effectiveAt: d('2026-01-01'),
      lastVerifiedAt: new Date(), verifiedById: officer.id, createdById: admin.id,
      notes: 'Fictional demonstration rule. Real countries must pass the 13-step research pipeline.',
    },
  });
  await prisma.regulatoryRule.update({ where: { id: zzShelfRule.id }, data: { currentVersionId: zzShelfV1.id } });

  const zzImportRule = await prisma.regulatoryRule.create({
    data: { countryId: 'ZZ', ruleType: 'IMPORT_LICENSE' },
  });
  const zzImportV1 = await prisma.regulatoryRuleVersion.create({
    data: {
      ruleId: zzImportRule.id, version: 1,
      payload: { permitRequired: true, requiredDocumentCodes: ['CERTIFICATE_OF_ANALYSIS'] },
      status: 'VERIFIED', confidence: 'HIGH',
      authorityName: '[DEMO] Demoland Medicines Agency',
      sourceName: 'DEMO DATA — fictional country, no real-world claim',
      publishedAt: d('2026-01-01'), lastVerifiedAt: new Date(), verifiedById: officer.id, createdById: admin.id,
    },
  });
  await prisma.regulatoryRule.update({ where: { id: zzImportRule.id }, data: { currentVersionId: zzImportV1.id } });

  // Real countries: explicit NO_VERIFIED_RULE placeholders, honestly unverified.
  for (const countryId of ['DE', 'EG', 'KE', 'JO', 'LB']) {
    const rule = await prisma.regulatoryRule.create({ data: { countryId, ruleType: 'SHELF_LIFE' } });
    const v1 = await prisma.regulatoryRuleVersion.create({
      data: {
        ruleId: rule.id, version: 1,
        payload: { kind: 'NO_VERIFIED_RULE' },
        status: 'PENDING_VERIFICATION', confidence: 'UNVERIFIED',
        sourceName: 'SOURCE REQUIRED — 13-step country research pipeline pending',
        createdById: admin.id,
        notes: 'Placeholder: no verified statement exists. Trading against this country is impossible until verification.',
      },
    });
    await prisma.regulatoryRule.update({ where: { id: rule.id }, data: { currentVersionId: v1.id } });
  }

  // ── Listing + engine-computed eligibility snapshots ─────────────────────
  const listing = await prisma.listing.create({
    data: {
      sellerOrgId: sellerOrg.id,
      batchId: listingBatchId!,
      productId: productIds.get('Amoxicillin')!,
      listingType: 'SURPLUS',
      quantityAvailable: 5000,
      minOrderQuantity: 100,
      unitPrice: '4.20',
      currency: 'EUR',
      negotiable: true,
      incoterm: 'CPT',
      visibility: 'PUBLIC_VERIFIED',
      status: 'ACTIVE',
      publishedAt: new Date(),
      isDemo: true,
    },
  });

  const listingBatch = await prisma.batch.findUniqueOrThrow({ where: { id: listingBatchId! } });
  const amoxicillin = await prisma.product.findUniqueOrThrow({ where: { id: productIds.get('Amoxicillin')! } });
  const allCountries = await prisma.country.findMany();
  const zzRegistrations = new Set(
    (await prisma.productCountryRegistration.findMany({ where: { productId: amoxicillin.id } })).map(
      (r) => `${r.countryId}:${r.status}`,
    ),
  );
  const shelfRules = await prisma.regulatoryRule.findMany({
    where: { ruleType: 'SHELF_LIFE' },
    include: { currentVersion: true },
  });
  const importRules = await prisma.regulatoryRule.findMany({
    where: { ruleType: 'IMPORT_LICENSE' },
    include: { currentVersion: true },
  });

  const today = new Date();
  let evaluated = 0;
  for (const country of allCountries) {
    const shelfRuleRow = shelfRules.find((r) => r.countryId === country.id)?.currentVersion ?? null;
    const importRuleRow = importRules.find((r) => r.countryId === country.id)?.currentVersion ?? null;
    const importPayload = importRuleRow?.payload as { permitRequired?: boolean; requiredDocumentCodes?: string[] } | null;

    const input: EligibilityInput = {
      today,
      batch: {
        id: listingBatch.id,
        expiryDate: listingBatch.expiryDate,
        manufacturingDate: listingBatch.manufacturingDate,
        originalShelfLifeMonths: amoxicillin.originalShelfLifeMonths,
        quantity: listingBatch.quantity,
        recallStatus: listingBatch.recallStatus,
        quarantineStatus: listingBatch.quarantineStatus,
        qualityStatus: listingBatch.qualityStatus,
      },
      product: {
        id: amoxicillin.id,
        status: amoxicillin.status,
        atcCode: amoxicillin.atcCode,
        dosageForm: amoxicillin.dosageForm,
        controlledStatus: amoxicillin.controlledStatus,
        coldChain: amoxicillin.coldChain,
        temperatureMode: 'AMBIENT',
        serializationRequired: amoxicillin.serializationRequired,
      },
      seller: {
        id: sellerOrg.id,
        status: 'VERIFIED',
        sanctionsResult: 'CLEAR',
        sanctionsCheckedAt: today,
        licenses: [{ type: sellerWda.type, status: 'VERIFIED', expiryDate: sellerWda.expiryDate }],
      },
      buyer: null, // country-level evaluation
      destination: {
        countryId: country.id,
        tradeStatus: country.tradeStatus,
        productRegistration: zzRegistrations.has(`${country.id}:REGISTERED`) ? 'REGISTERED' : 'UNKNOWN',
        shelfLifeRule: shelfRuleRow
          ? ({
              id: shelfRuleRow.id,
              status: shelfRuleRow.status,
              payload: shelfRuleRow.payload,
            } as ShelfLifeRuleSnapshot)
          : null,
        importPermitRequired: importPayload?.permitRequired ?? null,
        requiredDocumentCodes: importPayload?.requiredDocumentCodes ?? [],
        shippingDays: country.shippingDays ?? 6,
        customsBufferDays: country.customsBufferDays ?? 4,
        operationalBufferDays: country.operationalBufferDays ?? 5,
      },
      availableDocumentCodes: [],
      config: {
        excludedControlledStatuses: ['NARCOTIC', 'PSYCHOTROPIC', 'OTHER_CONTROLLED'],
        allowColdChain: false,
        sanctionsMaxAgeDays: 180,
        engineVersion: ELIGIBILITY_ENGINE_VERSION,
      },
    };

    const result = evaluateBatchForDestination(input);
    await prisma.listingEligibility.create({
      data: {
        listingId: listing.id,
        countryId: country.id,
        verdict: result.verdict,
        reasons: result.reasons as unknown as Prisma.InputJsonValue,
        requiredDocuments: result.requiredDocuments,
        requiredPermits: result.requiredPermits,
        projectedArrivalDate: result.projectedArrivalDate,
        arrivalShelfLifeDays: result.arrivalShelfLifeDays,
        arrivalShelfLifePercent: result.arrivalShelfLifePercent,
        requiresHumanReview: result.requiresHumanReview,
        engineVersion: result.engineVersion,
        ruleVersionIds: result.ruleVersionIds,
      },
    });
    evaluated += 1;
  }

  // ── Buyer demand (RFQ) ──────────────────────────────────────────────────
  await prisma.buyerDemand.create({
    data: {
      buyerOrgId: buyerOrg.id,
      productId: amoxicillin.id,
      quantity: 2000,
      unit: 'pack',
      destinationCountryId: 'ZZ',
      requiredBy: d('2026-11-30'),
      maxUnitPrice: '5.00',
      currency: 'EUR',
      minRemainingShelfLifeMonths: 12,
      monthlyConsumptionUnits: 1500,
      isDemo: true,
    },
  });

  // ── Audit + notifications ───────────────────────────────────────────────
  await prisma.auditLog.create({
    data: {
      actorType: 'SYSTEM',
      action: 'DEMO_SEED_EXECUTED',
      entityType: 'Platform',
      newValue: { countries: allCountries.length, products: productIds.size, eligibilityEvaluations: evaluated },
    },
  });
  for (const u of [sellerUser, buyerUser]) {
    await prisma.notification.create({
      data: {
        userId: u.id,
        type: 'WELCOME',
        title: 'Willkommen bei PharmaBridge [DEMO]',
        body: 'Diese Umgebung enthält ausschließlich gekennzeichnete Demonstrationsdaten.',
      },
    });
  }

  console.log('Seed complete.');
  console.log(`  Countries: ${allCountries.length} (incl. fictional ZZ) · Products: ${productIds.size} · Eligibility snapshots: ${evaluated}`);
  console.log('  Demo accounts (password for all): ' + DEMO_PASSWORD);
  console.log('    admin@demo.pharmabridge.local        (Platform Admin)');
  console.log('    compliance@demo.pharmabridge.local   (Compliance Officer)');
  console.log('    analyst@demo.pharmabridge.local      (Regulatory Analyst)');
  console.log('    seller@demo.pharmabridge.local       (Seller, DE, verified)');
  console.log('    seller2@demo.pharmabridge.local      (Seller, AT, KYB pending)');
  console.log('    buyer@demo.pharmabridge.local        (Buyer, ZZ, verified)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
