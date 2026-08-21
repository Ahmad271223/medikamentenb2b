import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

// Legal skeleton — the structure follows Art. 13/14 GDPR information duties.
// Every bracketed value is a placeholder that MUST be replaced by counsel
// before publication (legal texts are deliberately not machine-translated;
// the German original governs, see docs PART M).

export default async function PrivacyPage() {
  const t = await getTranslations('legal');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{t('privacyTitle')}</h1>
      <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
        {t('draftBanner')}
      </p>

      <div className="prose-slate mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
        <section>
          <h2 className="text-lg font-semibold text-slate-900">1. Verantwortlicher</h2>
          <p>[FIRMA GmbH], [Straße Nr.], [PLZ Ort], Deutschland · E-Mail: [datenschutz@domain] · Vertreten durch: [Geschäftsführung]</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">2. Verarbeitete Daten und Zwecke</h2>
          <p>
            Geschäftliche Kontaktdaten von Ansprechpartnern registrierter Organisationen (Name, geschäftliche
            E-Mail, Rolle), Vertrags- und Transaktionsdaten, Lizenz- und Verifizierungsnachweise, technische
            Protokolldaten. Zwecke: Vertragsdurchführung (Art. 6 Abs. 1 lit. b DSGVO), Erfüllung
            arzneimittelrechtlicher Pflichten (lit. c), berechtigte Interessen an Sicherheit und
            Missbrauchsvermeidung (lit. f). Es werden keine Patientendaten verarbeitet.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">3. Cookies</h2>
          <p>
            Es wird ausschließlich ein technisch notwendiges Sitzungs-Cookie (<code>pb_session</code>) gesetzt.
            Keine Tracking- oder Marketing-Cookies; ein Einwilligungsbanner ist daher nicht erforderlich.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">4. Empfänger und Auftragsverarbeiter</h2>
          <p>[Hosting-Anbieter, EU-Region] · [E-Mail-Versanddienst] · [Objektspeicher] · [Zahlungsdienstleister] — jeweils mit Auftragsverarbeitungsvertrag nach Art. 28 DSGVO.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">5. Speicherdauer</h2>
          <p>
            Profildaten bis zur Kontolöschung (Anonymisierung). Handels-, Chargen- und Compliance-Aufzeichnungen
            unterliegen arzneimittel- und handelsrechtlichen Aufbewahrungspflichten und werden nach Kontolöschung
            in anonymisierter Zuordnung weiter aufbewahrt ([Fristen einsetzen]).
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">6. Betroffenenrechte</h2>
          <p>
            Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18),
            Datenübertragbarkeit (Art. 20), Widerspruch (Art. 21), Beschwerde bei einer Aufsichtsbehörde
            (Art. 77). Auskunft und Löschung stehen registrierten Nutzer:innen zusätzlich als
            Selbstbedienungsfunktion unter „Einstellungen → Datenschutz“ zur Verfügung.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">7. Datensicherheit</h2>
          <p>TLS-Transportverschlüsselung, Zugriff nach Rollen- und Organisationsprinzip, revisionssicheres Audit-Protokoll, Hosting und Backups in der EU.</p>
        </section>
        <p className="text-xs text-slate-400">Stand: [Datum einsetzen]</p>
      </div>
    </div>
  );
}
