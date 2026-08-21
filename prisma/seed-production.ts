/**
 * PRODUCTION seed — the counterpart to the DEMO seed:
 *  - countries only (real ISO entries, all NOT_TRADE_ENABLED — trade enablement
 *    happens exclusively through the verified rule pipeline)
 *  - platform configuration with demo_mode=false
 *  - one bootstrap PLATFORM_ADMIN from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 *  - NO demo organizations, NO fictional country ZZ, NO regulatory statements
 *
 * Run: SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… npm run db:seed:prod
 * (env vars come from the deployment environment, not from .env files)
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { checkPasswordPolicy, hashPassword } from '../src/lib/crypto/password';

const prisma = new PrismaClient();

const COUNTRIES: Array<{ id: string; en: string; de: string; ar: string; region: string; isEea?: boolean; supply?: boolean; destination?: boolean }> = [
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

async function main() {
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

  const configs: Array<[string, Prisma.InputJsonValue]> = [
    ['demo_mode', false],
    ['seller_commission_percent', 5],
    ['buyer_fee_percent', 0],
    ['default_shipping_days', 6],
    ['default_customs_buffer_days', 4],
    ['default_operational_buffer_days', 5],
    ['short_dated_threshold_months', 12],
    ['excluded_controlled_statuses', ['NARCOTIC', 'PSYCHOTROPIC', 'OTHER_CONTROLLED']],
    ['allow_cold_chain', false],
    ['sanctions_max_age_days', 180],
    ['license_warning_days', 90],
    ['listing_auto_approve_verified', true],
  ];
  for (const [key, value] of configs) {
    await prisma.platformConfig.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL?.toLowerCase().trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required for the production seed.');
  }
  const policy = checkPasswordPolicy(adminPassword);
  if (!policy.ok) throw new Error(`SEED_ADMIN_PASSWORD violates the password policy: ${policy.issues.join(', ')}`);

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await hashPassword(adminPassword),
        firstName: 'Platform',
        lastName: 'Admin',
        locale: 'de',
        platformRole: 'PLATFORM_ADMIN',
      },
    });
    console.log(`Bootstrap PLATFORM_ADMIN created: ${adminEmail} (enable MFA immediately).`);
  } else {
    console.log('Admin user already exists — skipped.');
  }

  console.log(`Production seed complete: ${COUNTRIES.length} countries (all NOT_TRADE_ENABLED), config, demo_mode=false.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
