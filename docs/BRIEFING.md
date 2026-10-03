# wissen.work · Prototyp-Briefing für Claude Code

**Auftrag:** Baue den technischen Prototypen der wissen.work-Wissensbasis auf Basis des Kvix-Beispielkorpus.
**Sprache:** Deutsch (Commits, Doku, Issues). **Arbeitsweise:** Erst Plan vorlegen, dann umsetzen, kleine Commits. Bei Unklarheiten fragen statt raten.

---

## 1. Kontext: Was ist wissen.work

wissen.work ist eine agentisch gepflegte Enterprise-Wissensbasis: Markdown-Concepts mit YAML-Frontmatter in einem Git-Repo, verknüpft zu einem Graphen. Agenten sind Redakteure UND Konsumenten, Menschen prüfen nur an Gates (Pull Requests). Grundlage sind das Open Knowledge Format (OKF, Google 2026) als Formatschicht, das LLM-Wiki-Muster (ingest/query/lint) als Betriebsmuster und eine eigene Taxonomie als Schemaschicht.

Der Prototyp nutzt die **fiktive Firma Kvix** (Vorgangsbearbeitung für Versicherungs-Mandate, Planspiel-Firma von lernen.diy). Ein Seed-Korpus mit 8 Beispiel-Concepts existiert bereits und wird bereitgestellt (Ordner `kvix/` mit je einem Concept pro Typ). Er enthält **eine absichtlich gepflanzte Lücke**: `systeme/ticketsystem.md` verweist im Feld `zugang` auf `prozesse/systemzugang-beantragen`, das nicht existiert. Diese Lücke darf NICHT repariert werden, sie ist der Testfall für den Lint-Agenten.

**Quellmaterial (Kvix-Fallakte):** Die vollständigen Rohdokumente der fiktiven Firma (Unternehmensprofil, Organigramm, Leistungskatalog, KI-Richtlinien-Entwurf, Protokolle, Systemlandschaft usw.) liegen lokal im lernen.diy-Repo unter `C:\Users\losch\Projekte\loschke-hub\lernen-diy\src\content\planspiel`. Dieses Repo ist **read-only Quelle**: bei Bedarf Dateien von dort nach `archiv/` KOPIEREN, niemals im lernen-diy-Repo schreiben oder Dateien verschieben.

**Der Prototyp ist fertig, wenn drei Dinge nachweisbar sind:**
1. Die CI-Validierung blockt Schema-Verstöße (demonstriert an einem absichtlich kaputten Test-Concept).
2. Der Lint-Lauf findet die gepflanzte Lücke (fehlendes Linkziel) und meldet sie als Issue/Report.
3. Ein Concept-Änderungs-PR läuft end-to-end durch Validierung und Merge.

**Vorab-Prüfung (Bestandsaufnahme, Teil des ersten Plans):** Bevor der Bauplan entsteht, zwei vorhandene Bausteine von Rico sichten und bewerten, was davon wiederverwendbar ist:
1. Der bestehende **GitHub-MCP**, der bereits als Knowledge-MCP fungiert. Kandidat für den späteren lesenden KB-Zugriff (Meilenstein M2): Prüfen, ob er die Rolle der MCP-Zugriffsschicht übernehmen kann oder was ihm dafür fehlt.
2. Der stark vereinfachte **Wissensmanagement-Ansatz im build.jetzt-Projekt** (Mastra, nach dem Muster von Claude Projects: aufbereitetes Wissen je Build-Projekt). Prüfen, welche Muster daraus für Aufbereitung und Ablage übertragbar sind.

Ergebnis im Plan: je Baustein eine kurze Einschätzung (übernehmen / anpassen / bewusst nicht nutzen, mit Begründung). Nichts ungeprüft übernehmen, aber auch nichts neu bauen, was dort schon trägt.

---

## 2. Die Spezifikation (verbindlich)

### 2.1 Ablage-Konventionen

- **Ein Ordner pro Typ, der Dateipfad ist die Concept-ID** (ohne `.md`-Endung als ID gelesen, z. B. `regelungen/mobiles-arbeiten`). Ordnernamen: `regelungen/`, `prozesse/`, `leistungen/`, `leitfaeden/`, `rollen/`, `orgeinheiten/`, `begriffe/`, `systeme/`.
- **Flach:** Keine Unterordner in Typ-Ordnern. Hierarchie (Unterleistungen, Varianten) lebt ausschließlich in `belongs_to`-Kanten.
- **Rohquellen** liegen unter `archiv/<bereich>/...` und sind KEINE Concepts (werden nicht validiert, nur referenziert).
- **Inline-Verweise** im Body nutzen `[[pfad]]`-Syntax (z. B. `[[systeme/ticketsystem]]`) und zählen für die Link-Integrität genauso wie Frontmatter-Kanten.

### 2.2 Basis-Frontmatter (jedes Concept, alle Felder Pflicht außer `volatilitaet`)

| Feld | Werte / Format |
|---|---|
| `typ` | genau einer von: `regelung`, `prozess`, `leistung`, `leitfaden`, `rolle`, `orgeinheit`, `begriff`, `system` |
| `titel` | String |
| `authority` | `canonical` \| `derived` (bei `derived` ist mindestens eine Quelle unter `quellen` Pflicht) |
| `owner` | Concept-Pfad einer Rolle oder Orgeinheit (nie eine Person) |
| `visibility` | `public` \| `internal` \| `restricted` |
| `status` | `draft` \| `active` \| `archived` |
| `quellen` | Liste von Pfaden (typisch `archiv/...`) |
| `links` | Map, Schlüssel = Kantentyp, Wert = Liste von Concept-Pfaden (siehe 2.3). Darf leer sein, muss aber existieren |
| `last_verified` | Datum `YYYY-MM-DD` |
| `volatilitaet` | optional: `hoch` \| `niedrig` (übersteuert den Prüf-Turnus des Typs: `hoch` halbiert, `niedrig` verdoppelt) |

### 2.3 Kanten (nur diese fünf sind zulässig)

| Kante | Semantik |
|---|---|
| `belongs_to` | Zugehörigkeit/Ownership, n:m erlaubt (Navigation, Hierarchie) |
| `related_to` | loser Kontext, reiner Retrieval-Hinweis, keine Propagation |
| `gilt_fuer` | Geltungsbereich (Regelung → Rolle/Orgeinheit); realisiert das Pflichtfeld Geltungsbereich der Regelung |
| `ersetzt` | Nachfolge; macht Vorgänger auffindbar-veraltet |
| `abhaengig_von` | Korrektheits-Abhängigkeit; Änderung/Abkündigung des Ziels flaggt abhängige Concepts zur Prüfung |

Unbekannte Kantentypen sind ein Validierungsfehler (Ausnahme: Präfix `x_` für Mandanten-Extensions, im Prototyp nicht genutzt).

### 2.4 Typspezifische Pflichtfelder, Gates und Prüf-Turnusse

| typ | zusätzliche Pflichtfelder | Gate | Turnus (Tage) |
|---|---|---|---|
| `regelung` | `verbindlichkeit` (`verbindlich`\|`empfehlung`), `gueltig_ab` (Datum oder `null` bei `status: draft`), optional `gueltig_bis`; `gilt_fuer`-Kante Pflicht | G3 | 90 |
| `prozess` | `ausloeser`, `ergebnis`, `beteiligte_rollen` (Liste Rollen-Pfade), `systeme` (Liste System-Pfade) | G2 | 180 |
| `leistung` | `zielgruppe`, `ansprechpartner` (Rollen-Pfad), `lebenszyklus` (`aktiv`\|`eingestellt`) | G2 | 180 |
| `leitfaden` | `zweck`, `vorbedingungen`; `abhaengig_von`-Kante Pflicht | G1 | 180 |
| `rolle` | `aufgaben` (Liste), `kontaktweg` (Funktionspostfach, nie Person), `vertretung` (Rollen-Pfad) | G1 | 365 |
| `orgeinheit` | `auftrag`, `leitung` (Rollen-Pfad) | G1 | 365 |
| `begriff` | `definition`, `synonyme` (Liste) | G1 | kein Verfall |
| `system` | `zweck`, `zugang` (Prozess-Pfad), `betreiber` (Orgeinheit-Pfad), `lebenszyklus` | G1 | 180 |

Gates: **G1** = Sammel-PR möglich, ein Review. **G2** = Einzel-PR, Owner-Freigabe. **G3** = Einzel-PR, Owner + Vier-Augen; Merge blockiert bei fehlender Quelle oder abgelaufener Gültigkeit. Im Prototyp werden Gates über Branch-Protection/CODEOWNERS nur vorbereitet und im README dokumentiert (ein Ein-Personen-Repo kann Vier-Augen nicht erzwingen).

**Aktualitätslogik:** Turnus = maximale Zeit seit `last_verified` (mit volatilitaet-Override). Überschreitung ist KEIN CI-Fehler, sondern ein Lint-Befund ("ungeprüft").

---

## 3. Aufgaben (in dieser Reihenfolge)

### Schritt 1: Repo-Struktur

```
kvix-kb/
├── README.md              # Was ist das, wie läuft Validierung/Lint, Fragenkatalog
├── AGENTS.md              # Redaktionshandbuch für schreibende Agenten (siehe unten)
├── schema/
│   └── taxonomie.yaml     # Die komplette Spezifikation aus Abschnitt 2 als Config
├── regelungen/ prozesse/ leistungen/ leitfaeden/ rollen/ orgeinheiten/ begriffe/ systeme/
│                          # Seed-Korpus (8 Concepts, werden bereitgestellt)
├── archiv/                # Rohquellen: bei Bedarf aus der Kvix-Fallakte kopieren (Pfad siehe Abschnitt 1)
├── package.json           # npm scripts: validate, lint, test
├── tools/
│   ├── validate.ts        # deterministischer Validator (auch lokal ausführbar)
│   └── lint.ts            # Lint-Lauf (Befunde als Markdown-Report + optional gh-Issues)
└── .github/workflows/
    ├── validate.yml       # bei PR und Push: npm run validate (Node 20)
    └── lint.yml           # geplant (cron, wöchentlich) + manuell: npm run lint
```

**Zentral: `schema/taxonomie.yaml` ist die einzige Quelle der Wahrheit.** Validator und Lint lesen Typen, Pflichtfelder, erlaubte Werte, Kanten, Gates und Turnusse aus dieser Datei, nichts davon wird im Code hartkodiert. (Grund: wissen.work ist mehrmandantenfähig, pro Mandant ändert sich nur die Config.) **Zukunftssicherung:** Die Config-Struktur muss perspektivisch Raum-Profile tragen können, also denselben Core mit lockereren Gates und Turnussen für spätere Projekt- und Teamräume. Im Prototyp reicht ein einziges Profil (die Org-KB), aber Gates und Turnusse gehören als Profil-Block strukturiert, nicht als globale Konstanten, damit ein zweites Profil später nur Config ist, kein Refactoring.

### Schritt 2: Validator (`tools/validate.ts`, deterministisch, kein LLM)

Prüft jede `*.md` in den Typ-Ordnern:
- Frontmatter parsebar, alle Basis-Pflichtfelder vorhanden, Werte in erlaubten Mengen
- Typ passt zum Ordner; typspezifische Pflichtfelder vorhanden
- `derived` ⇒ mindestens eine Quelle; `regelung` ⇒ `gilt_fuer` nicht leer; `leitfaden` ⇒ `abhaengig_von` nicht leer
- Kantentypen zulässig; alle Kanten-Ziele und `[[wikilinks]]` im Body zeigen auf existierende Concepts
  - **Ausnahme:** fehlende Linkziele sind WARNUNG (Exit 0, aber gelistet), kein Fehler. Begründung: Links auf noch nicht existierende Concepts sind im Aufbau normal; der Lint macht daraus Issues. Alles andere (Schema) ist FEHLER (Exit 1).
- Ausgabe: menschenlesbarer Report (Datei, Zeile, Problem), maschinenlesbar als JSON via `--json`

Node 20+, TypeScript (strict), Ausführung via `npx tsx`. Dependencies minimal: `gray-matter` für Frontmatter (alternativ `js-yaml`), sonst nichts Schweres. Tests mit `vitest` und ein paar Fixture-Dateien (ein gültiges, mehrere gezielt kaputte Concepts) unter `tools/tests/`. npm scripts: `npm run validate`, `npm run lint`, `npm test`.

### Schritt 3: Lint (`tools/lint.ts`)

Befund-Typen (jeweils mit betroffenem Concept und Begründung):
- **Fehlendes Linkziel** (muss die gepflanzte Lücke `prozesse/systemzugang-beantragen` finden)
- **Ungeprüft:** `last_verified` älter als Turnus (mit volatilitaet-Override; `begriff` ausgenommen)
- **Orphan:** Concept ohne eine einzige eingehende Kante oder Wikilink-Referenz
- **Abgelaufen:** `regelung` mit `gueltig_bis` in der Vergangenheit und `status: active`
- **Abhängigkeits-Flag:** Concept, dessen `abhaengig_von`-Ziel `status: archived` oder `lebenszyklus: eingestellt` hat

Ausgabe: `lint-report.md` als Workflow-Artefakt; mit Flag `--issues` zusätzlich je Befund ein GitHub-Issue via `gh` CLI (Label je Befund-Typ, keine Duplikate bei erneutem Lauf: vorher offene Issues mit gleichem Titel prüfen).

### Schritt 4: AGENTS.md (Redaktionshandbuch)

Kurz und operativ, für zukünftige schreibende Agenten: die Konventionen aus Abschnitt 2 in Anweisungsform, plus: Änderungen nur per PR, nie direkt auf main; Artefakte/Zusammenfassungen gehören nicht ins Repo; bei Widersprüchen zwischen Quellen keinen stillen Entscheid, sondern Konflikt-Hinweis in den PR-Text; die gepflanzte Lücke nicht "reparieren".

### Schritt 5: README mit Fragenkatalog

README erklärt Zweck, Struktur, lokale Nutzung (`npm run validate`, `npm run lint`) und enthält den **Fragenkatalog** für die spätere Chat-Agent-Evaluation (build.jetzt wird separat angeschlossen, NICHT Teil dieses Auftrags):

1. Was ist ein Vorgang und worin unterscheidet er sich von einem Ticket?
2. Wer gibt kritische Kundenrückmeldungen vor Versand frei?
3. Welche Servicezeiten gelten für die Korrespondenzbearbeitung?
4. Darf ich personenbezogene Daten von Versicherten in ein beliebiges KI-Tool eingeben?
5. Wie werte ich den wöchentlichen Rückmeldungsexport aus?
6. Wer vertritt die Teamleitung Korrespondenz?
7. Zu welchem Bereich gehört das Team Fachsachbearbeitung?
8. Wer betreibt das Ticketsystem?
9. Gilt die KI-Richtlinie schon verbindlich? (erwartete Antwort: nein, status draft)
10. Wie beantrage ich Zugang zum Ticketsystem? (erwartete Antwort: ehrliche Lücke, Verweis auf fehlendes Concept)

### Nicht bauen (Scope-Grenzen)

Kein UI, kein MCP-Server, kein Ingest-Agent, keine Embedding-/RAG-Infrastruktur, keine Änderung an den 8 Seed-Concepts (außer sie verletzen das Schema, dann melden statt fixen). Das kommt in späteren Iterationen.

---

## 4. Abnahme-Checkliste

- [ ] `validate.ts` läuft lokal und in CI grün auf dem Seed-Korpus (mit Warnung zur gepflanzten Lücke)
- [ ] Ein Test-PR mit absichtlichem Schema-Verstoß wird von der CI rot markiert
- [ ] `lint.ts` findet mindestens: die gepflanzte Lücke; korrekt keine False Positives auf dem Seed-Korpus
- [ ] `schema/taxonomie.yaml` enthält die komplette Spezifikation, Code enthält keine hartkodierten Typen
- [ ] README + AGENTS.md vorhanden, auf Deutsch, ohne Marketing-Sprech
- [ ] Ein Beispiel-PR (kleine Concept-Änderung) einmal end-to-end durch Validierung gemerged
