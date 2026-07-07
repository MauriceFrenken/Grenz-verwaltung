const LETZTE_AKTUALISIERUNG = "Juli 2026";

export function DatenschutzInhalt() {
  return (
    <div className="space-y-8 text-sm leading-relaxed text-text-muted">
      <p>
        Diese Datenschutzerklärung gilt für die interne Webanwendung „FRENKEN Verwaltung“. Die
        Anwendung richtet sich ausschließlich an berechtigte Mitarbeiterinnen und Mitarbeiter der
        FRENKEN Holding GmbH und ihrer verbundenen Unternehmen.
      </p>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">1. Verantwortlicher</h3>
        <p>
          Verantwortlich für die Datenverarbeitung ist die FRENKEN Holding GmbH. Bei Fragen zum
          Datenschutz wenden Sie sich bitte an Ihre interne Ansprechperson oder den
          Systemadministrator.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">
          2. Daten auf Anmelde- und Passwortseiten
        </h3>
        <p>
          Beim Aufruf der Anmeldeseite, beim Zurücksetzen des Passworts und bei der erstmaligen
          Passwortvergabe nach einer Einladung verarbeiten wir insbesondere:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Ihre geschäftliche E-Mail-Adresse zur Anmeldung und für Sicherheits-E-Mails</li>
          <li>Ihr Passwort ausschließlich zur Authentifizierung (gespeichert nur in gehashter Form)</li>
          <li>
            Technische Verbindungsdaten wie IP-Adresse, Browsertyp und Zeitpunkt des Zugriffs
          </li>
        </ul>
        <p>
          Die Verarbeitung erfolgt, um Ihnen den Zugang zur internen Anwendung zu ermöglichen und
          die Sicherheit des Systems zu gewährleisten.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">3. Externe Dienste beim Seitenaufruf</h3>
        <p>
          Beim Laden der Anwendung werden Schriftarten von Google Fonts eingebunden. Dabei kann Ihre
          IP-Adresse an Google Ireland Limited bzw. Google LLC (USA) übermittelt werden, da die
          Schriftdateien von Servern von Google abgerufen werden.
        </p>
        <p>
          Für Authentifizierung, Datenbank und Dateispeicher nutzen wir Supabase (Supabase, Inc.).
          Dabei werden Ihre Anmeldedaten und Sitzungsinformationen über verschlüsselte Verbindungen
          an die Supabase-Infrastruktur übertragen und dort verarbeitet.
        </p>
        <p>
          Die Webanwendung wird auf Servern eines Hosting-Anbieters bereitgestellt. Dabei fallen
          ebenfalls technische Zugriffsdaten (z. B. IP-Adresse, Zeitstempel) an.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">
          4. Weitere Verarbeitung nach der Anmeldung
        </h3>
        <p>
          Innerhalb der Anwendung werden geschäftsbezogene Daten verarbeitet, die für die interne
          Verwaltung erforderlich sind — z. B. Mandanten-, Objekt- und Mietverwaltungsdaten sowie
          hochgeladene Dokumente. Der Zugriff ist rollenbasiert beschränkt.
        </p>
        <p>
          Bestimmte Funktionen (z. B. KI-gestützte Dokumentenverarbeitung) können Inhalte an
          externe KI-Dienstleister (z. B. OpenAI) übermitteln. Dies geschieht nur im Rahmen der
          jeweiligen Funktion und nicht beim bloßen Aufruf der Anmelde- oder Passwortseiten.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">5. Rechtsgrundlagen</h3>
        <p>Die Verarbeitung erfolgt insbesondere auf Grundlage von:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Art. 6 Abs. 1 lit. b DSGVO — zur Erfüllung des Beschäftigungs- bzw. Nutzungsverhältnisses
            und Bereitstellung der internen Anwendung
          </li>
          <li>
            Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse an IT-Sicherheit, Betrieb und
            Missbrauchsprävention
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">6. Speicherdauer</h3>
        <p>
          Sitzungsdaten werden für die Dauer Ihrer Anmeldung bzw. gemäß den technischen Vorgaben des
          Authentifizierungsdienstes gespeichert. Geschäftsdaten werden entsprechend den internen
          Aufbewahrungsfristen und gesetzlichen Vorgaben gespeichert und anschließend gelöscht oder
          gesperrt.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">7. Ihre Rechte</h3>
        <p>
          Sie haben im Rahmen der geltenden Datenschutzgesetze insbesondere das Recht auf Auskunft,
          Berichtigung, Löschung, Einschränkung der Verarbeitung sowie Widerspruch gegen die
          Verarbeitung. Wenden Sie sich hierzu an den Verantwortlichen oder Ihren
          Systemadministrator.
        </p>
        <p>
          Sie haben zudem das Recht, sich bei einer Datenschutzaufsichtsbehörde zu beschweren.
        </p>
      </section>

      <p className="border-t border-hairline pt-6 text-xs">
        Stand: {LETZTE_AKTUALISIERUNG}
      </p>
    </div>
  );
}
