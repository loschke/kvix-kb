# Abnahme M0 · kvix-kb

Stand 03.10.2026. Checkliste aus `docs/BRIEFING.md`, Abschnitt 4, ergänzt um den Nachweis zu Entscheidung F1 (`docs/PLAN.md`, Abschnitt 6). Jeder Punkt verlinkt seinen Beleg.

Ausgangsstand für alle Vergleiche: Commit [`9a22d99`](https://github.com/loschke/kvix-kb/commit/9a22d99) (Seed-Korpus, wie bereitgestellt).

---

## 1. Checkliste aus dem Briefing

- [x] **`validate.ts` läuft lokal und in CI grün auf dem Seed-Korpus, mit Warnung zur gepflanzten Lücke**
  - CI auf dem Seed-Stand: [Lauf 37120527746](https://github.com/loschke/kvix-kb/actions/runs/37120527746), Schritt „Concepts validieren“ grün
  - Ergebnis: 8 Concepts, 0 Fehler, 21 Warnungen zu 10 fehlenden Linkzielen, darunter `systeme/ticketsystem.md:9  WARNUNG  linkziel-fehlt  Feld zugang verweist auf prozesse/systemzugang-beantragen`
  - Lokal nachvollziehbar gegen den eingefrorenen Seed-Stand: `npm run validate -- --root tools/tests/fixtures/seed --schema schema/taxonomie.yaml` (gleiches Ergebnis; auf `main` sind es seit PR #15 neun Concepts). Als Dauertest in `tools/tests/validate.test.ts`

- [x] **Ein Test-PR mit absichtlichem Schema-Verstoß wird von der CI rot markiert**
  - [PR #2](https://github.com/loschke/kvix-kb/pull/2), [Lauf 37136540218](https://github.com/loschke/kvix-kb/actions/runs/37136540218): „Concepts validieren“ rot, Merge-Status `BLOCKED`
  - Drei Verstöße als Anmerkung an der Zeile: `pflichtfeld-fehlt` (Zeile 1), `wert-unzulaessig` (Zeile 6), `kante-unbekannt` (Zeile 12)
  - PR geschlossen, nicht gemerged
  - Befund unterwegs: Der erste Lauf dieses PRs war aus dem falschen Grund rot (Tests hingen am lebenden Korpus). Behoben in [PR #3](https://github.com/loschke/kvix-kb/pull/3)

- [x] **`lint.ts` findet die gepflanzte Lücke; keine False Positives auf dem Seed-Korpus**
  - Erster Lauf mit Issues: [Lauf 37136342880](https://github.com/loschke/kvix-kb/actions/runs/37136342880), 11 Befunde, Issues #4 bis #14
  - Gepflanzte Lücke: [Issue #8](https://github.com/loschke/kvix-kb/issues/8) „Lint: Fehlendes Linkziel prozesse/systemzugang-beantragen“
  - False Positives: keine, Einzelnachweis in Abschnitt 2

- [x] **`schema/taxonomie.yaml` enthält die komplette Spezifikation, Code enthält keine hartkodierten Typen**
  - [`schema/taxonomie.yaml`](../schema/taxonomie.yaml): acht Typen mit Ordner, Basis- und Typfelder, Referenzfelder mit Zieltypen, fünf Kanten, Gates und Turnusse als Profil `org-kb`, Signale für den Lint
  - Beleg ohne Hartkodierung: Validator und Lint laufen unverändert gegen eine fremde Taxonomie (`tools/tests/fixtures/andere-taxonomie`, Typ `projekt`, Profil `team-raum`); Test „andere Taxonomie (kein hartkodierter Typ)“ in `tools/tests/validate.test.ts`
  - Die Taxonomie prüft sich selbst beim Laden (`tools/tests/schema.test.ts`)

- [x] **README und AGENTS.md vorhanden, auf Deutsch, ohne Marketing-Sprech**
  - [README.md](../README.md) mit Fragenkatalog (10 Fragen, Fundstellen, erwartete Antworten zu 9 und 10)
  - [AGENTS.md](../AGENTS.md) als Redaktionshandbuch, dazu [PR-Vorlage](../.github/pull_request_template.md)

- [x] **Ein Beispiel-PR (kleine Concept-Änderung) einmal end-to-end durch Validierung gemerged**
  - [PR #15](https://github.com/loschke/kvix-kb/pull/15): neues Concept `orgeinheiten/kundenmanagement`, Quellen nach `archiv/` kopiert
  - Validierung grün: [Lauf 37136691564](https://github.com/loschke/kvix-kb/actions/runs/37136691564), danach von Rico gemerged
  - Wirkung im Lint: [Lauf 37137012311](https://github.com/loschke/kvix-kb/actions/runs/37137012311) meldet 10 statt 11 Befunde und Issue #5 als „ohne aktuellen Befund“; [Issue #5](https://github.com/loschke/kvix-kb/issues/5) von Rico geschlossen

## 2. Nachweis zu F1: gepflanzte Lücke gefunden, kein Befund erfunden

Grundlage: Lint-Lauf [37136342880](https://github.com/loschke/kvix-kb/actions/runs/37136342880) auf Commit [`28199f9`](https://github.com/loschke/kvix-kb/commit/28199f9) (Seed unverändert). Geprüft mit `git cat-file` (existiert die Datei?) und `git grep` (wo wird verwiesen?) auf genau diesem Commit.

**(a) Die gepflanzte Lücke ist unter den Befunden**

- [x] [Issue #8](https://github.com/loschke/kvix-kb/issues/8): `prozesse/systemzugang-beantragen`, Fundstelle `systeme/ticketsystem.md:9` (Feld `zugang`)
- [x] Die Lücke ist weiterhin offen und wird nicht repariert (`AGENTS.md`, Abschnitt 8)

**(b) Jeder gemeldete Befund ist real**

| Issue | Befund | Ziel existiert? | Verwiesen in | Real |
|---|---|---|---|---|
| [#4](https://github.com/loschke/kvix-kb/issues/4) | Fehlendes Linkziel `orgeinheiten/it` | nein | `regelungen/ki-einsatz.md:5, :19`, `systeme/ticketsystem.md:5, :10, :16` | [x] |
| [#5](https://github.com/loschke/kvix-kb/issues/5) | Fehlendes Linkziel `orgeinheiten/kundenmanagement` | nein (bis PR #15) | `begriffe/vorgang.md:5`, `leistungen/korrespondenzbearbeitung.md:5, :15`, `leitfaeden/rueckmeldungsexport-auswerten.md:5, :15`, `prozesse/kundenrueckmeldung-bearbeiten.md:5` | [x] |
| [#6](https://github.com/loschke/kvix-kb/issues/6) | Fehlendes Linkziel `orgeinheiten/kvix` | nein | `orgeinheiten/operations.md:14`, `regelungen/ki-einsatz.md:17` | [x] |
| [#7](https://github.com/loschke/kvix-kb/issues/7) | Fehlendes Linkziel `orgeinheiten/personal` | nein | `orgeinheiten/operations.md:5`, `rollen/teamleitung-korrespondenz.md:5` | [x] |
| [#8](https://github.com/loschke/kvix-kb/issues/8) | Fehlendes Linkziel `prozesse/systemzugang-beantragen` (gepflanzt) | nein | `systeme/ticketsystem.md:9` | [x] |
| [#9](https://github.com/loschke/kvix-kb/issues/9) | Fehlendes Linkziel `regelungen/mitbestimmung-ki-einsatz` | nein | `regelungen/ki-einsatz.md:18` | [x] |
| [#10](https://github.com/loschke/kvix-kb/issues/10) | Fehlendes Linkziel `rollen/leitung-kundenmanagement` | nein | `leistungen/korrespondenzbearbeitung.md:9` | [x] |
| [#11](https://github.com/loschke/kvix-kb/issues/11) | Fehlendes Linkziel `rollen/leitung-operations` | nein | `orgeinheiten/operations.md:9` | [x] |
| [#12](https://github.com/loschke/kvix-kb/issues/12) | Fehlendes Linkziel `rollen/sachbearbeitung-korrespondenz` | nein | `prozesse/kundenrueckmeldung-bearbeiten.md:11` | [x] |
| [#13](https://github.com/loschke/kvix-kb/issues/13) | Fehlendes Linkziel `rollen/teamleitung-fachsachbearbeitung` | nein | `rollen/teamleitung-korrespondenz.md:13` | [x] |
| [#14](https://github.com/loschke/kvix-kb/issues/14) | Orphan `regelungen/ki-einsatz` | ja | keine andere Datei verweist darauf | [x] |

- [x] Elf Befunde, elf reale Lücken, kein Befund erfunden
- [x] Keine Befundart meldet etwas, das auf dem Seed nicht zutrifft: Ungeprüft 0 (alle `last_verified` jünger als der Turnus), Abgelaufen 0 (keine Regelung mit `gueltig_bis`), Abhängigkeit 0 (kein `abhaengig_von`-Ziel archiviert oder eingestellt)
- [x] Kein Duplikat beim zweiten Lauf: [Lauf 37136391377](https://github.com/loschke/kvix-kb/actions/runs/37136391377) meldet „0 neu, 11 bereits offen“

## 3. Rahmenbedingungen

- [x] **Seed-Concepts in M0 unverändert:** `git diff 9a22d99 main` über die acht Seed-Dateien ist leer
- [x] **`main` geschützt:** Ruleset `main-schutz` (nur per PR, Check `validate` Pflicht, kein Force-Push, keine Ausnahme)
- [x] **Merges ausschließlich durch Rico** (Entscheidung F12): #3 und #15 von Rico gemerged
- [x] **Lint-Issues schließt ein Mensch:** #5 von Rico geschlossen, nicht vom Lint

## 4. Nach der Abnahme

- Der wöchentliche Lint-Lauf ist mit diesem PR wieder eingeschaltet (montags 06:00 UTC, mit Issues).
- Das Seed-Tabu endet. Erster regulärer Gate-PR: der Widerspruch zum Organigramm, [Issue #1](https://github.com/loschke/kvix-kb/issues/1).
- Für M1 vorgemerkt: Der Starterprompt in `wissen-work` erwartet dieses Repo unter `../kvix-kb`, es liegt unter `vaults/kvix-kb`.
