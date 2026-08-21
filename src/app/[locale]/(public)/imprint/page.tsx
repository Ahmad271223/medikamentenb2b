import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

// § 5 TMG / § 18 MStV skeleton — bracketed values MUST be replaced before
// publication; the pharmaceutical-specific entries depend on the chosen legal
// model (broker registration / WDA, see docs PART O #1).

export default async function ImprintPage() {
  const t = await getTranslations('legal');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{t('imprintTitle')}</h1>
      <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
        {t('draftBanner')}
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Anbieter</h2>
          <p>
            [FIRMA GmbH]<br />[Straße Nr.]<br />[PLZ Ort], Deutschland
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Vertretung &amp; Kontakt</h2>
          <p>
            Geschäftsführung: [Name(n)]<br />
            E-Mail: [kontakt@domain] · Telefon: [Nummer]
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Register &amp; Steuern</h2>
          <p>
            Handelsregister: [Amtsgericht, HRB-Nr.]<br />
            USt-IdNr.: [DE…]
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Arzneimittelrechtliche Angaben</h2>
          <p>
            [Je nach Rechtsmodell: Anzeige der Vermittlungstätigkeit nach § 52c AMG bei (Behörde, Datum, Az.) /
            Großhandelserlaubnis nach § 52a AMG (Behörde, Nr.)] · Zuständige Aufsichtsbehörde: [Behörde, Anschrift]
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Verantwortlich i. S. d. § 18 Abs. 2 MStV</h2>
          <p>[Name, Anschrift]</p>
        </section>
      </div>
    </div>
  );
}
