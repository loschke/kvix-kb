# kvix-kb

Prototyp der Wissensbasis von wissen.work am Beispiel der fiktiven Firma **Kvix** (Vorgangsbearbeitung für Versicherungs-Mandate, Planspiel-Firma von lernen.diy). Alle Inhalte sind erfunden.

Wissen liegt hier als Markdown-Dateien mit YAML-Frontmatter in Git. Jede Datei ist ein **Concept** (eine Regelung, ein Prozess, eine Rolle …), Verweise zwischen Concepts bilden einen Graphen. Agenten schreiben und lesen, Menschen prüfen an Pull Requests. Zwei Werkzeuge halten den Korpus sauber:

- **Validierung** prüft bei jedem PR deterministisch, ob jedes Concept dem Schema entspricht. Verstöße machen die CI rot.
- **Lint** sucht regelmäßig nach Wartungsbedarf: fehlende Linkziele, veraltete Prüfungen, Concepts ohne Verweise, abgelaufene Regelungen, abgekündigte Abhängigkeiten.

Regeln für alle, die Concepts schreiben: [AGENTS.md](AGENTS.md). Bauplan und Entscheidungen: [docs/PLAN.md](docs/PLAN.md).

---

## Struktur

```
schema/taxonomie.yaml   Einzige Quelle der Wahrheit: Typen, Felder, Kanten, Gates, Turnusse
regelungen/ prozesse/ leistungen/ leitfaeden/
rollen/ orgeinheiten/ begriffe/ systeme/
                        Concepts, ein flacher Ordner je Typ; Pfad ohne .md = ID
archiv/                 Rohquellen, keine Concepts
tools/                  Validator und Lint (TypeScript), Tests unter tools/tests/
.github/workflows/      validate.yml (jeder PR), lint.yml (wöchentlich und manuell)
```

Validator und Lint kennen keinen einzigen Typ- oder Feldnamen. Alles kommt aus `schema/taxonomie.yaml`. Ein anderer Mandant oder ein Projektraum mit lockeren Regeln ändert die Config, nicht den Code. Gates und Turnusse stehen dafür in einem Profil-Block (`profile.org-kb`), ein zweites Profil ist ein weiterer Block.

## Lokal nutzen

Voraussetzung: Node 22.12 oder neuer.

```bash
npm ci
```

```bash
npm run validate
```

```bash
npm run lint
```

```bash
npm test
```

| Befehl | Optionen |
|---|---|
| `npm run validate` | `--json` (Befunde und Korpus-Modell), `--root <dir>`, `--schema <datei>` |
| `npm run lint` | `--stichtag YYYY-MM-DD` (Default heute), `--report <datei>` (Default `lint-report.md`), `--json`, `--issues`, `--trockenlauf` |

Optionen werden nach `--` übergeben, z. B. `npm run lint -- --stichtag 2027-01-01`.

## Validierung: Fehler und Warnungen

| Ebene | Wirkung | Regeln |
|---|---|---|
| **Fehler** | Exit 1, CI rot, PR nicht mergebar | `frontmatter-fehlt`, `frontmatter-ungueltig`, `kein-typ-ordner`, `unterordner`, `typ-unbekannt`, `typ-ordner`, `pflichtfeld-fehlt`, `wert-null`, `wert-format`, `wert-unzulaessig`, `datum-format`, `liste-leer`, `referenz-form`, `pfad-form`, `ziel-typ` (bei `owner` und Referenzfeldern), `kante-unbekannt`, `kante-pflicht`, `derived-braucht-quelle`, `gate-pflicht` |
| **Warnung** | sichtbar, CI bleibt grün | `linkziel-fehlt`, `feld-unbekannt`, `ziel-typ` (bei `gilt_fuer`), `keine-concept-datei` |

Fehlende Linkziele sind Warnungen, weil Verweise auf noch nicht geschriebene Concepts im Aufbau normal sind. Der Lint macht daraus Issues. Exit 2 bedeutet: Die Taxonomie selbst ist ungültig oder der Aufruf falsch.

Auf dem Seed-Korpus endet die Validierung mit 0 Fehlern und Warnungen zu zehn fehlenden Linkzielen.

## Lint

| Befund | Label | Bedeutung |
|---|---|---|
| Fehlendes Linkziel | `lint:fehlendes-linkziel` | Ein Concept verweist auf ein Concept, das es nicht gibt |
| Ungeprüft | `lint:ungeprueft` | `last_verified` ist älter als der Turnus des Typs (`volatilitaet` hoch halbiert, niedrig verdoppelt; Begriffe verfallen nicht) |
| Orphan | `lint:orphan` | Kein anderes Concept verweist darauf |
| Abgelaufen | `lint:abgelaufen` | `gueltig_bis` liegt vor dem Stichtag, `status` ist noch `active` |
| Abhängigkeit prüfen | `lint:abhaengigkeit` | Ein Ziel von `abhaengig_von` ist archiviert oder eingestellt; ein Nachfolger über `ersetzt` wird genannt |

Befunde sind keine CI-Fehler. Der Lauf schreibt `lint-report.md` (in Actions als Artefakt und auf der Seite des Laufs). Mit `--issues` legt er je Befund ein GitHub-Issue an, mit Label `lint` und dem Label der Befundart. Vor dem Anlegen prüft er offene Issues mit gleichem Titel, ein zweiter Lauf erzeugt keine Duplikate.

**Erledigte Befunde schließt ein Mensch.** Der Lint nennt offene Lint-Issues ohne aktuellen Befund, schließt sie aber nicht. Kuratieren ist am Anfang genau die Arbeit, die Vertrauen ins System aufbaut.

Der Workflow `lint.yml` läuft jeden Montag um 06:00 UTC und legt dabei Issues an. Von Hand startest du ihn unter Actions → Lint → Run workflow, dort mit dem Schalter für Issues (Default aus).

## Stand

Meilenstein M0 ist abgenommen, Nachweise in [docs/ABNAHME.md](docs/ABNAHME.md).

## Gates: vorbereitet und erzwungen

Jeder Typ hat ein Gate. Es legt fest, wie eine Änderung freigegeben wird.

| Gate | Typen | Vorgesehen |
|---|---|---|
| G1 | leitfaden, rolle, orgeinheit, begriff, system | Sammel-PR möglich, ein Review |
| G2 | prozess, leistung | Einzel-PR, Freigabe durch den Owner |
| G3 | regelung | Einzel-PR, Owner und Vier-Augen; Merge blockiert bei fehlender Quelle oder abgelaufener Gültigkeit |

Dieses Repo hat eine Person. Vier-Augen und Owner-Freigaben lassen sich so nicht technisch erzwingen. Der Stand:

| Regel | Status |
|---|---|
| Änderungen an `main` nur per Pull Request | **erzwungen** (Ruleset auf `main`) |
| Merge nur mit grüner Validierung (Check `validate`) | **erzwungen** (Ruleset auf `main`) |
| G3: Regelung braucht mindestens eine Quelle | **erzwungen** (Validator, Fehler `gate-pflicht`) |
| Zuständigkeit je Ordner | **vorbereitet** (`.github/CODEOWNERS`) |
| Owner-Freigabe (G2) und Vier-Augen (G3) | **vorbereitet**, nicht erzwungen: braucht eine zweite Person mit Review-Recht |
| G3: Merge blockiert bei abgelaufener Gültigkeit | **vorbereitet**, nicht erzwungen: abgelaufene Regelungen meldet der Lint (`lint:abgelaufen`) |
| Sammel-PR nur mit G1-Typen | **vorbereitet**: Regel in AGENTS.md und PR-Vorlage |

## Fragenkatalog für die Chat-Agent-Evaluation

Diese Fragen dienen später zur Prüfung eines Chat-Agenten, der auf diese Wissensbasis zugreift (die Anbindung ist nicht Teil dieses Repos). Die Spalte „Fundstelle“ nennt, wo die Antwort im Korpus steht.

| # | Frage | Fundstelle |
|---|---|---|
| 1 | Was ist ein Vorgang und worin unterscheidet er sich von einem Ticket? | `begriffe/vorgang` |
| 2 | Wer gibt kritische Kundenrückmeldungen vor Versand frei? | `prozesse/kundenrueckmeldung-bearbeiten`, `rollen/teamleitung-korrespondenz` |
| 3 | Welche Servicezeiten gelten für die Korrespondenzbearbeitung? | `leistungen/korrespondenzbearbeitung` |
| 4 | Darf ich personenbezogene Daten von Versicherten in ein beliebiges KI-Tool eingeben? | `regelungen/ki-einsatz` |
| 5 | Wie werte ich den wöchentlichen Rückmeldungsexport aus? | `leitfaeden/rueckmeldungsexport-auswerten` |
| 6 | Wer vertritt die Teamleitung Korrespondenz? | `rollen/teamleitung-korrespondenz` |
| 7 | Zu welchem Bereich gehört das Team Fachsachbearbeitung? | `orgeinheiten/operations` |
| 8 | Wer betreibt das Ticketsystem? | `systeme/ticketsystem` |
| 9 | Gilt die KI-Richtlinie schon verbindlich? | `regelungen/ki-einsatz` |
| 10 | Wie beantrage ich Zugang zum Ticketsystem? | `systeme/ticketsystem` |

**Erwartete Antworten, wo sie feststehen:**

- **Frage 9:** Nein. Die Richtlinie hat `status: draft`, `gueltig_ab` ist noch nicht gesetzt.
- **Frage 10:** Eine ehrliche Lücke. Das Ticketsystem verweist für den Zugang auf `prozesse/systemzugang-beantragen`, dieses Concept existiert nicht. Ein guter Agent sagt das, statt einen Ablauf zu erfinden.

**Bekannte Stolperstellen:** Zu den Fragen 6 und 7 widersprechen die Seed-Concepts dem Organigramm der Fallakte ([Issue #1](https://github.com/loschke/kvix-kb/issues/1)). Zu Frage 8 nennt das Ticketsystem `orgeinheiten/it` als Betreiber, das Concept dazu fehlt noch.
