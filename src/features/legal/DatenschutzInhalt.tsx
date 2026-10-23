const LETZTE_AKTUALISIERUNG = "Oktober 2026";

export function DatenschutzInhalt() {
  return (
    <div className="space-y-8 text-sm leading-relaxed text-text-muted">
      <p>
        Diese Datenschutzerklärung gilt für die interne Webanwendung „Grenz &amp;
        Co. Verwaltung“. Die Anwendung richtet sich ausschließlich an berechtigte
        Mitarbeiterinnen und Mitarbeiter der Grenz &amp; Co.
        Immobilienberatungs-GmbH und ihrer verbundenen Unternehmen. Wir
        informieren Sie nachfolgend gemäß Art. 13 und 14 der
        Datenschutz-Grundverordnung (DSGVO) über die Verarbeitung
        personenbezogener Daten bei der Nutzung dieser Anwendung.
      </p>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">
          1. Verantwortlicher
        </h3>
        <p>Verantwortlicher im Sinne des Art. 4 Nr. 7 DSGVO ist:</p>
        <p>
          Grenz &amp; Co. Immobilienberatungs-GmbH
          <br />
          Friesenplatz 1
          <br />
          50672 Köln, Deutschland
          <br />
          Telefon: +49 (0)221 669 648 50
          <br />
          E-Mail: info@grenz-co.de
        </p>
        <p>Vertreten durch den Geschäftsführer: Sebastian Grenz</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">
          2. Kontakt bei Datenschutzfragen
        </h3>
        <p>
          Bei Fragen zur Verarbeitung Ihrer personenbezogenen Daten oder zur
          Ausübung Ihrer Rechte wenden Sie sich bitte an: info@grenz-co.de
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">
          3. Daten auf Anmelde- und Passwortseiten
        </h3>
        <p>
          Beim Aufruf der Anmeldeseite, beim Zurücksetzen des Passworts und bei
          der erstmaligen Passwortvergabe nach einer Einladung verarbeiten wir
          insbesondere:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Ihre geschäftliche E-Mail-Adresse zur Anmeldung und für
            Sicherheits-E-Mails
          </li>
          <li>
            Ihr Passwort ausschließlich zur Authentifizierung (gespeichert nur
            in gehashter Form)
          </li>
          <li>
            Technische Verbindungsdaten wie IP-Adresse, Browsertyp und Zeitpunkt
            des Zugriffs
          </li>
        </ul>
        <p>
          Ihre geschäftliche E-Mail-Adresse wird bei der Einladung durch einen
          Administrator im System hinterlegt und stammt insoweit nicht von Ihnen
          selbst, sondern aus dem Beschäftigungsverhältnis (Information gemäß
          Art. 14 DSGVO).
        </p>
        <p>
          Zwecke der Verarbeitung sind die Bereitstellung des Zugangs zur
          internen Anwendung, die Authentifizierung der Nutzerinnen und Nutzer
          sowie die Gewährleistung der Sicherheit und Stabilität des Systems.
          Rechtsgrundlagen sind § 26 Abs. 1 BDSG i. V. m. Art. 88 DSGVO
          (Durchführung des Beschäftigungsverhältnisses) sowie Art. 6 Abs. 1
          lit. f DSGVO (berechtigtes Interesse an IT-Sicherheit, Betrieb und
          Missbrauchsprävention).
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">
          4. Hosting und externe Dienste beim Seitenaufruf
        </h3>
        <p>
          Die Webanwendung wird bei Vercel Inc., 440 N Barranca Avenue #4133,
          Covina, CA 91723, USA gehostet. Beim Aufruf der Anwendung fallen dort
          technische Zugriffsdaten an (z. B. IP-Adresse, Zeitstempel,
          aufgerufene Seite, Browsertyp), die zur Auslieferung der Anwendung und
          zur Gewährleistung der Sicherheit erforderlich sind. Rechtsgrundlage
          ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt im
          sicheren und zuverlässigen Betrieb der Anwendung. Mit Vercel besteht
          ein Auftragsverarbeitungsvertrag gemäß Art. 28 DSGVO; Vercel ist unter
          dem EU-US Data Privacy Framework zertifiziert (Art. 45 DSGVO),
          ergänzend gelten die EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit.
          c DSGVO).
        </p>
        <p>
          Für Authentifizierung, Datenbank und Dateispeicher nutzen wir
          Supabase, einen Dienst der Supabase, Inc., 970 Toa Payoh North #07-04,
          Singapur 318992. Dabei werden Ihre Anmeldedaten, Sitzungsinformationen
          und die in der Anwendung gespeicherten Inhalte über verschlüsselte
          Verbindungen an die Supabase-Infrastruktur übertragen und dort
          verarbeitet. Unser Supabase-Projekt wird in der Region EU Central
          (Frankfurt am Main, Deutschland) betrieben; die Daten werden dort
          gespeichert. Mit Supabase besteht ein Auftragsverarbeitungsvertrag
          gemäß Art. 28 DSGVO; soweit dabei Daten in Drittländer übermittelt
          werden, erfolgt dies auf Grundlage der EU-Standardvertragsklauseln
          (Art. 46 Abs. 2 lit. c DSGVO).
        </p>
        <p>
          Die in der Anwendung verwendeten Schriftarten sind lokal eingebunden;
          beim Laden der Seite wird keine Verbindung zu Servern von
          Drittanbietern (z. B. Google Fonts) aufgebaut.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">
          5. Cookies und Local Storage
        </h3>
        <p>
          Die Anwendung verwendet keine Cookies oder vergleichbaren Technologien
          zu Werbe- oder Analysezwecken. Zur Aufrechterhaltung Ihrer
          Anmeldesitzung wird ein Sitzungs-Token im Local Storage Ihres Browsers
          gespeichert. Diese Speicherung ist für die Bereitstellung des von
          Ihnen genutzten Dienstes unbedingt erforderlich und daher gemäß § 25
          Abs. 2 Nr. 2 TDDDG ohne Einwilligung zulässig. Das Token wird bei der
          Abmeldung bzw. mit Ablauf der Sitzung gelöscht oder ungültig.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">
          6. Weitere Verarbeitung nach der Anmeldung
        </h3>
        <p>
          Innerhalb der Anwendung werden geschäftsbezogene Daten verarbeitet,
          die für die interne Verwaltung erforderlich sind — z. B. Exposés,
          E-Mail-Anhänge, Rechnungen, Kontoumsätze sowie hochgeladene Dokumente. Der
          Zugriff ist rollenbasiert beschränkt; Änderungen an Benutzerkonten und
          Berechtigungen können zu Nachweiszwecken protokolliert werden
          (Audit-Trail). Rechtsgrundlagen sind Art. 6 Abs. 1 lit. b und f DSGVO
          sowie — soweit Beschäftigtendaten betroffen sind — § 26 Abs. 1 BDSG.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">
          7. KI-gestützte Exposé-Analyse (Anthropic)
        </h3>
        <p>
          Für die Funktion „Exposé-Import“ wird der Textinhalt hochgeladener
          Exposé-PDFs an Anthropic übermittelt (Anthropic Ireland, Limited;
          Verarbeitung teilweise durch Anthropic, PBC, San Francisco, USA), um
          strukturierte Angaben (z. B. Objektadresse, Kaufpreis, Baujahr,
          Makler-Kontaktdaten) automatisiert zu extrahieren. Die Übermittlung
          erfolgt ausschließlich bei aktiver Nutzung dieser Funktion — nicht
          beim bloßen Aufruf der Anmelde- oder Passwortseiten.
        </p>
        <p>
          Dabei können auch personenbezogene Daten Dritter verarbeitet werden,
          die in den Dokumenten enthalten sind (insbesondere Namen und
          Kontaktdaten von Makler- und Ansprechpersonen). Diese Daten stammen
          aus den uns überlassenen Exposé-Unterlagen (Information gemäß Art. 14
          DSGVO). Die extrahierten Ergebnisse werden vor der Übernahme von einer
          Mitarbeiterin bzw. einem Mitarbeiter geprüft; eine ausschließlich
          automatisierte Entscheidung im Sinne des Art. 22 DSGVO findet nicht
          statt.
        </p>
        <p>
          Mit Anthropic besteht ein Auftragsverarbeitungsvertrag gemäß Art. 28
          DSGVO. Nach den API-Nutzungsbedingungen von Anthropic werden über die
          Schnittstelle übermittelte Inhalte nicht zum Training der Modelle
          verwendet. Soweit Daten in die USA übermittelt werden, erfolgt dies
          auf Grundlage des EU-US Data Privacy Framework (Art. 45 DSGVO) bzw.
          der EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO).
          Rechtsgrundlage der Verarbeitung ist Art. 6 Abs. 1 lit. f DSGVO; unser
          berechtigtes Interesse liegt in der effizienten, fehlerarmen Erfassung
          von Transaktionsdaten aus Exposé-Unterlagen.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">
          8. Empfänger und Auftragsverarbeiter
        </h3>
        <p>
          Innerhalb unseres Unternehmens erhalten nur diejenigen Stellen Zugriff
          auf Ihre Daten, die diese zur Erfüllung ihrer Aufgaben benötigen.
          Daneben setzen wir die in dieser Erklärung genannten Dienstleister
          (Vercel, Supabase, Anthropic) als Auftragsverarbeiter gemäß Art. 28 DSGVO
          ein. Eine Übermittlung an sonstige Dritte findet nur statt, wenn
          hierfür eine gesetzliche Verpflichtung besteht oder Sie eingewilligt
          haben.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">
          9. Übermittlung in Drittländer
        </h3>
        <p>
          Soweit personenbezogene Daten in Länder außerhalb der EU bzw. des EWR
          übermittelt werden (insbesondere in die USA an Vercel Inc. und
          Anthropic, PBC), stellen wir durch geeignete Garantien ein angemessenes
          Datenschutzniveau sicher: den Angemessenheitsbeschluss zum EU-US Data
          Privacy Framework (Art. 45 DSGVO) für dort zertifizierte Anbieter
          sowie ergänzend die EU-Standardvertragsklauseln der Europäischen
          Kommission (Art. 46 Abs. 2 lit. c DSGVO). Eine Kopie der Garantien
          können Sie über die oben genannten Kontaktdaten anfordern.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">
          10. Speicherdauer
        </h3>
        <p>
          Sitzungsdaten werden für die Dauer Ihrer Anmeldung gespeichert und
          anschließend gelöscht bzw. ungültig. Server-Protokolldaten werden nur
          kurzzeitig gespeichert und automatisch gelöscht, sofern sie nicht zur
          Aufklärung konkreter Sicherheitsvorfälle länger benötigt werden.
          Benutzerkonten werden gelöscht, wenn die Zugangsberechtigung endet.
          Geschäftsdaten und Dokumente speichern wir, solange sie für die
          interne Verwaltung erforderlich sind, sowie darüber hinaus im Rahmen
          gesetzlicher Aufbewahrungspflichten (insbesondere § 257 HGB: bis zu 10
          Jahre, § 147 AO: bis zu 8 bzw. 10 Jahre); anschließend werden sie
          gelöscht oder in der Verarbeitung eingeschränkt.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">
          11. Ihre Rechte
        </h3>
        <p>
          Ihnen stehen als betroffener Person insbesondere folgende Rechte zu:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Auskunft über die verarbeiteten Daten (Art. 15 DSGVO)</li>
          <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
          <li>Löschung (Art. 17 DSGVO)</li>
          <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
          <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
        </ul>
        <p className="font-medium text-heading">
          Widerspruchsrecht (Art. 21 DSGVO): Soweit wir Daten auf Grundlage von
          Art. 6 Abs. 1 lit. f DSGVO verarbeiten, haben Sie das Recht, aus
          Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit
          Widerspruch gegen die Verarbeitung einzulegen.
        </p>
        <p>
          Zur Ausübung Ihrer Rechte wenden Sie sich an die unter Ziffer 1 bzw. 2
          genannten Kontaktdaten. Sie haben zudem das Recht, sich bei einer
          Datenschutzaufsichtsbehörde zu beschweren (Art. 77 DSGVO),
          insbesondere bei der für uns zuständigen Behörde: Landesbeauftragte
          für Datenschutz und Informationsfreiheit Nordrhein-Westfalen (LDI
          NRW), Kavalleriestraße 2–4, 40213 Düsseldorf, www.ldi.nrw.de.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-heading">
          12. Pflicht zur Bereitstellung und automatisierte Entscheidungsfindung
        </h3>
        <p>
          Die Angabe Ihrer geschäftlichen E-Mail-Adresse und die Vergabe eines
          Passworts sind für die Nutzung der Anwendung erforderlich; ohne diese
          Daten kann kein Zugang bereitgestellt werden. Eine automatisierte
          Entscheidungsfindung einschließlich Profiling im Sinne des Art. 22
          DSGVO findet nicht statt.
        </p>
      </section>

      <p className="border-t border-hairline pt-6 text-xs">
        Stand: {LETZTE_AKTUALISIERUNG}
      </p>
    </div>
  );
}
