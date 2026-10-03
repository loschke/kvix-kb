# kvix-kb · Bauplan M0

Stand 03.10.2026 · Grundlage: `docs/BRIEFING.md` · Status: **zur Freigabe, noch nichts gebaut**

Dieser Plan hat vier Teile: die Vorab-Prüfung der zwei Bestandsbausteine, die Befunde am Seed-Korpus, die Bauschritte in Reihenfolge und die offenen Fragen. Die Fragen stehen am Ende, die blockierenden sind markiert.

---

## 1. Vorab-Prüfung der Bestandsbausteine

Die Pfade in der CLAUDE.md waren noch Platzhalter. Gefunden und geprüft habe ich:

| Baustein | Ort |
|---|---|
| GitHub-Knowledge-MCP | `C:\Users\losch\Projekte\loschke-hub\mcp-hub`, Provider `github-kb` (live unter `mcp.loschke.ai`) |
| Wissensansatz build.jetzt | `C:\Users\losch\Projekte\loschke-hub\build-jetzt-superagents` (nicht das alte `build-jetzt`): `apps/agents/src/mastra/workflows/wissen.ts`, `packages/shared/src/wissenskarte.ts`, ADR `docs/adr/0043-wissen-aus-quellen.md` |

### 1.1 github-kb (Kandidat für M2)

**Einschätzung: anpassen, aber erst in M2. In M0 bewusst nicht nutzen.**

**Was schon trägt:** Ein neues Repo lässt sich allein per Config anbinden (Endpoint-Eintrag plus Env-Variablen). Bearer-Token je Endpoint mit Token-Liste je Kunde, Read-only-Garantie, Schutz gegen Pfad-Traversal, LRU-Cache, Throttling. Der Provider-Mechanismus ist sauber erweiterbar: Ein neuer Provider-Typ (Arbeitsname `okf-kb`) kann die vorhandenen `makeKb*`-Factories für Lesen, Batch-Lesen und Baum direkt wiederverwenden. Die Teststrategie mit msw lässt sich übernehmen.

**Was ihm für die Rolle als wissen.work-Zugriffsschicht fehlt:**

- **Kein Concept-Verständnis.** `systeme/ticketsystem` ergibt 404, er erwartet den Dateipfad mit `.md`. Typ aus Ordner, Schema-Kenntnis und `taxonomie.yaml` kennt er nicht.
- **Keine Kanten.** `kb_find_backlinks` erkennt nur `[[...]]` und Markdown-Links. Kanten in der `links:`-Map und Referenzfelder wie `zugang: prozesse/x` findet er nicht. Die gepflanzte Lücke wäre für ihn unsichtbar. Dazu prüft der Wikilink-Regex nur den Dateinamen, `[[archiv/ticketsystem]]` zählt fälschlich als Backlink auf `systeme/ticketsystem`.
- **Keine Sichtbarkeit.** Kein Filter nach `visibility` oder `status`, kein Ausblenden von `archiv/`, kein Root-Pfad, jeder Branch lesbar. Für Sichtbarkeit je Kunde reicht ein neuer Provider nicht: Der `ToolContext` kennt nur die Endpoint-ID, nicht den aufrufenden Token. Das ist eine Änderung im Core des Hubs.
- **Abhängig von GitHub Code Search.** Suche, Backlinks und Frontmatter-Filter laufen darüber. Code Search kennt nur den Default-Branch, indexiert verzögert und ist rate-limitiert. `kb_filter_by_frontmatter` schneidet außerdem still bei 100 Treffern ab (`per_page: 200` angefragt, `capped` wird nie wahr) und kann keine verschachtelten Felder wie `links.belongs_to`.
- **Datumsfalle.** gray-matter macht aus `last_verified: 2026-10-10` ein JS-`Date`. Ein Filter mit `eq "2026-10-10"` greift nie.

**Folgen für M0** (damit M2 später nur noch anschließen muss):

1. Der Validator baut intern ein vollständiges Korpus-Modell (Concepts, Typen, alle ausgehenden Referenzen mit Kantentyp, eingehende Referenzen). `validate --json` gibt dieses Modell mit aus. Ein späterer `okf-kb`-Provider kann daraus einen Index pro Commit lesen, statt Code Search zu benutzen.
2. Datumswerte bleiben im ganzen Tooling Strings im Format `YYYY-MM-DD`, nie `Date`.
3. Die Befunde zu github-kb (Backlink-Regex, `capped`-Bug) melde ich nur, im mcp-hub fasse ich nichts an.

### 1.2 Wissensansatz build.jetzt („Wissen aus Quellen", ADR 0043)

**Einschätzung: Muster anpassen und übernehmen, Code bewusst nicht nutzen.**

Kurz zum Ansatz: Quellen landen in `quellen/`, ein Mastra-Workflow verdichtet jede Quelle einzeln, plant dann über alle Quellen plus Bestand, eine Abnahme-Karte im Chat gibt frei, der Code schreibt `wissen/<thema>.md` (H1 als Titel, kein Frontmatter, Herkunftszeilen am Ende) und baut daraus `wissen/_karte.md` neu. Die Karte steht im Systemprompt. Ablage in R2, keine Versionierung, keine Kanten, keine Prüfung auf Veraltetes.

**Übertragbar, und wo es landet:**

| Muster aus build.jetzt | Wo in wissen.work |
|---|---|
| Bestand zuerst, Themen statt Dateien: fortschreiben statt Dublette | AGENTS.md (M0), Werkbank (M1) |
| Widersprüche nennen, nicht auflösen | AGENTS.md: Konflikt-Hinweis in den PR-Text (M0) |
| Auslassen nur mit Begründung | AGENTS.md: PR-Text nennt, was aus einer Quelle bewusst nicht übernommen wurde (M0) |
| Regeln im Code prüfen, nicht in der Anweisung | Grundprinzip des Validators (M0) |
| Herkunft schreibt der Code, nicht das Modell | Werkbank füllt `quellen` aus dem Dossier (M1) |
| Index wird aus dem Ordner neu gebaut, nie fortgeschrieben | Korpus-Modell aus `validate --json` (M0), Karte für Agenten (M2) |
| Karte im Kontext statt Hoffen auf Werkzeugaufrufe (gemessen: 3 von 3 statt 1 von 6 Läufen) | Zugriffsschicht M2 und Chat-Evaluation |
| Zwei Stufen: je Quelle verdichten, dann über alles planen | Ingest-Agent und Werkbank (M1) |

**Passt nicht:** Ablage ohne Versionierung (Git ersetzt das), Wissen ohne Frontmatter (zu arm für Typen, Kanten, Stand), flacher Ordner ohne Typen, Abnahme per Klick ohne Diff (ersetzt keinen PR), Löschen der Originale (in wissen.work bleibt die Quelle unter `archiv/`), Bindung an ein Projekt (wissen.work ist ein gemeinsamer Graph).

Für M0 heißt das konkret: Die Muster gehen in AGENTS.md und in die Bauweise des Validators. Ein Feld wie `summary` aus der Karte wäre nützlich, gehört aber nicht in M0, weil es das Schema ändert und die Seed-Concepts es nicht tragen.

---

## 2. Befunde am Seed-Korpus (gemeldet, nicht repariert)

Die acht Seed-Concepts erfüllen das Schema aus Abschnitt 2 des Briefings vollständig. Typ, Ordner, Pflichtfelder und Kantentypen stimmen. Die Befunde betreffen Linkziele, Daten und Quellen und kollidieren teils mit der Abnahme-Checkliste.

| # | Befund | Folge |
|---|---|---|
| B1 | **Zehn fehlende Linkziele, nicht eines.** Neben der gepflanzten Lücke `prozesse/systemzugang-beantragen` fehlen: `orgeinheiten/it`, `orgeinheiten/kundenmanagement`, `orgeinheiten/kvix`, `orgeinheiten/personal`, `rollen/leitung-kundenmanagement`, `rollen/leitung-operations`, `rollen/sachbearbeitung-korrespondenz`, `rollen/teamleitung-fachsachbearbeitung`, `regelungen/mitbestimmung-ki-einsatz` | Validator warnt zehnmal, Lint meldet zehn Befunde. Kollidiert mit „keine False Positives" (Frage F1) |
| B2 | **`regelungen/ki-einsatz` ist ein Orphan.** Keines der anderen sieben Concepts verweist darauf | Lint meldet einen Orphan-Befund auf dem Seed (Frage F2) |
| B3 | **Alle `last_verified` liegen in der Zukunft** (10.10. bis 21.10.2026, heute ist der 03.10.) | „Ungeprüft" kann auf dem Seed nie greifen. Eine Regel „kein Datum in der Zukunft" würde den Seed rot machen (Frage F3) |
| B4 | **Die `quellen` zeigen auf fiktive Dateien** (`archiv/it/systemlandschaft-2026-09-12.xlsx` usw.). Die Fallakte existiert nur als JSON und Markdown | Eine Existenzprüfung für Quellen würde jeden Seed-Concept anmeckern (Frage F4) |
| B5 | Das Briefing nennt für den Seed den Ordner `kvix/`. Tatsächlich liegen die Typ-Ordner im Repo-Root, wie es die Strukturskizze in Schritt 1 vorsieht | Keine. Ich arbeite mit dem Root |
| B6 | Der im Briefing genannte Fallakte-Pfad `lernen-diy/src/content/planspiel` enthält nur die 22 Übungssets. Die 17 Rohdokumente liegen unter `src/content/fallakte/kvix/*.json` und als Markdown unter `public/planspiel/kvix/*.md` | Für `archiv/` kopiere ich bei Bedarf die Markdown-Fassungen. `kvix-personenregister` kopiere ich nicht, die KB führt keine Personen |
| B7 | Das Feld `zugang` im Ticketsystem ist ein typisiertes Referenzfeld, keine Kante in `links:` und kein Wikilink | Die Link-Integrität muss Referenzfelder mitprüfen, sonst findet der Lint die gepflanzte Lücke gar nicht. Ist im Plan berücksichtigt (Schritt 1) |
| B8 | **Seed widerspricht dem Organigramm.** Das Organigramm (Stand 30.09.) führt „Korrespondenz und Fachsachbearbeitung" als *eine* Einheit unter einer Leitung, Operations umfasst sechs operative Einheiten. `orgeinheiten/operations` spricht von zwei Teams Korrespondenz und Fachsachbearbeitung, `rollen/teamleitung-korrespondenz` nennt als Vertretung eine `teamleitung-fachsachbearbeitung` | Inhaltlicher Konflikt, kein Schemafehler. Betrifft die Fragen 6 und 7 des Fragenkatalogs. Ich melde ihn nur, entscheiden musst du bzw. der Kanon |

Nebenbefund für später: Der Starterprompt in `wissen-work` erwartet kvix-kb unter `../kvix-kb`. Das Repo liegt aber unter `Projekte/vaults/kvix-kb`, `wissen-work` unter `Projekte/wissen-work`. Für M1 relevant, nicht für M0.

---

## 3. Bauschritte

Reihenfolge wie im Briefing, ergänzt um einen Schritt 0 (Repo und GitHub) und einen Schritt 6 (Abnahme). Ohne echtes GitHub-Repo mit Actions sind die Abnahmepunkte 2 und 6 nicht nachweisbar. Jeder Schritt endet mit einem oder wenigen kleinen Commits auf Deutsch.

### Schritt 0: Repo und GitHub

**Entsteht:**
- `git init`, `.gitignore` (node_modules, `lint-report.md`, Coverage)
- Erster Commit: der Ist-Stand (8 Seed-Concepts, `docs/`, `CLAUDE.md`) unverändert als Ausgangsbasis. So ist später per Diff belegbar, dass die Seed-Concepts nicht angefasst wurden.
- GitHub-Repo anlegen und `main` pushen (Name, Sichtbarkeit: Frage F6)
- Auf Freigabe: Platzhalter in der CLAUDE.md durch die gefundenen Pfade ersetzen (Frage F12)

### Schritt 1: Struktur und Taxonomie

**Entsteht:**
- `package.json` (Scripts `validate`, `lint`, `test`; `engines.node >= 20`), `tsconfig.json` (strict), Lockfile
- Abhängigkeiten: `yaml` (Parser mit Zeilennummern, siehe Frage F7), Dev: `typescript`, `tsx`, `vitest`, `@types/node`
- `archiv/.gitkeep` (Inhalt erst bei Bedarf, siehe F4)
- `schema/taxonomie.yaml` mit der kompletten Spezifikation aus Abschnitt 2

**Aufbau der `taxonomie.yaml`** (Skizze, Feldnamen noch nicht endgültig):

```yaml
version: 1
ablage:
  archiv_praefix: archiv/
  wikilink: "[[pfad]]"
  kanten_extension_praefix: x_

basis_felder:
  typ:          { art: typ }
  titel:        { art: text, pflicht: true }
  authority:    { art: enum, werte: [canonical, derived], pflicht: true }
  owner:        { art: referenz, ziel: [rolle, orgeinheit], pflicht: true }
  visibility:   { art: enum, werte: [public, internal, restricted], pflicht: true }
  status:       { art: enum, werte: [draft, active, archived], pflicht: true }
  quellen:      { art: liste, pflicht: true }
  links:        { art: kanten, pflicht: true }
  last_verified: { art: datum, pflicht: true }
  volatilitaet: { art: enum, werte: [hoch, niedrig], pflicht: false }

regeln:
  - wenn: { authority: derived }
    dann: { mindestens_eins: quellen }

kanten:
  belongs_to:    {}
  related_to:    {}
  gilt_fuer:     { ziel: [rolle, orgeinheit] }
  ersetzt:       {}
  abhaengig_von: {}

typen:
  regelung:
    ordner: regelungen
    felder:
      verbindlichkeit: { art: enum, werte: [verbindlich, empfehlung], pflicht: true }
      gueltig_ab:      { art: datum, pflicht: true, null_erlaubt_bei: { status: draft } }
      gueltig_bis:     { art: datum, pflicht: false }
    kanten_pflicht: [gilt_fuer]
  system:
    ordner: systeme
    felder:
      zweck:        { art: text, pflicht: true }
      zugang:       { art: referenz, ziel: [prozess], pflicht: true }
      betreiber:    { art: referenz, ziel: [orgeinheit], pflicht: true }
      lebenszyklus: { art: enum, werte: [aktiv, eingestellt], pflicht: true }
  # ... prozess, leistung, leitfaden, rolle, orgeinheit, begriff analog

profile:
  org-kb:
    gates:
      G1: { beschreibung: "Sammel-PR möglich, ein Review" }
      G2: { beschreibung: "Einzel-PR, Owner-Freigabe" }
      G3: { beschreibung: "Einzel-PR, Owner + Vier-Augen", quelle_pflicht: true }
    typ_gate:   { regelung: G3, prozess: G2, leistung: G2, leitfaden: G1, rolle: G1, orgeinheit: G1, begriff: G1, system: G1 }
    turnus_tage: { regelung: 90, prozess: 180, leistung: 180, leitfaden: 180, rolle: 365, orgeinheit: 365, begriff: null, system: 180 }
    volatilitaet_faktor: { hoch: 0.5, niedrig: 2 }
aktives_profil: org-kb
```

Drei Entscheidungen stecken darin:

- **Referenzfelder sind deklariert** (`art: referenz` mit Zieltypen). Damit prüft der Validator `owner`, `zugang`, `betreiber`, `leitung`, `vertretung`, `ansprechpartner`, `beteiligte_rollen` und `systeme` genauso auf Existenz wie Kanten (Befund B7). Den Zieltyp prüft er über das Ordner-Präfix auch dann, wenn das Ziel noch fehlt: `owner: systeme/x` ist ein Fehler, `owner: rollen/gibts-noch-nicht` nur eine Warnung.
- **Gates und Turnusse sind ein Profil-Block**, keine globalen Konstanten. Ein zweites Profil für Projekt- oder Teamräume ist später nur ein weiterer Block unter `profile:`.
- **Typ und Ordner sind über `ordner:` verbunden.** Kein Typname steht im Code.

Nicht deterministisch prüfbar und deshalb nur in AGENTS.md geregelt: „`kontaktweg` ist ein Funktionspostfach, nie eine Person".

### Schritt 2: Validator

**Entsteht:**
- `tools/lib/schema.ts`: lädt und prüft `taxonomie.yaml` selbst (kaputte Config ergibt Exit 2 mit klarer Meldung)
- `tools/lib/korpus.ts`: liest alle `*.md` der Typ-Ordner, trennt Frontmatter und Body, parst YAML mit Zeilennummern, sammelt alle Referenzen (Kanten, Referenzfelder, Wikilinks außerhalb von Code-Blöcken) zu einem Korpus-Modell mit ein- und ausgehenden Referenzen
- `tools/lib/validate.ts`: reine Funktionen `validateConcept(...)` und `validateKorpus(...)`, ohne `process.exit` und ohne Dateizugriff. Die Werkbank (M1) kann sie für die Live-Prüfung einzelner Bausteine importieren (PRD-WERKBANK 8.4: Validator wiederverwenden, nicht duplizieren)
- `tools/validate.ts`: dünne CLI. Optionen `--json`, `--stichtag YYYY-MM-DD`, optional Pfadliste
- `tools/tests/`: vitest mit Fixture-Korpora (ein gültiges Mini-Korpus, je Regel mindestens ein gezielt kaputtes Concept), dazu ein Test mit einer abweichenden Fixture-Taxonomie (anderer Typ, anderes Profil). Der belegt Abnahmepunkt 4: Der Code kennt keine Typen.
- `.github/workflows/validate.yml`: bei Push und PR, Node 20, `npm ci`, `npm test`, `npm run validate`

**Prüfregeln** (jede mit fester Regel-ID für Tests und JSON):

| Ebene | Regeln |
|---|---|
| FEHLER (Exit 1) | Frontmatter fehlt oder nicht parsebar · Pflichtfeld fehlt · Wert nicht erlaubt · Datum nicht `YYYY-MM-DD` · `typ` passt nicht zum Ordner · Unterordner in Typ-Ordner · `derived` ohne Quelle · Pflichtkante leer (`gilt_fuer`, `abhaengig_von`) · unbekannter Kantentyp (außer `x_`) · Referenz zeigt auf falschen Zieltyp · `gueltig_ab: null` außerhalb von `draft` · Quelle fehlt bei G3-Typ |
| WARNUNG (Exit 0) | Linkziel existiert nicht (Kante, Referenzfeld oder Wikilink) · unbekanntes Feld im Frontmatter (Frage F10) |

Ausgabe menschenlesbar als `datei:zeile  FEHLER|WARNUNG  regel-id  Klartext`, mit `--json` als Objekt mit Befunden und Korpus-Modell. Erwartetes Ergebnis auf dem Seed: grün mit zehn Warnungen (B1).

### Schritt 3: Lint

**Entsteht:**
- `tools/lib/lint.ts`: reine Funktion über dasselbe Korpus-Modell, Stichtag als Parameter
- `tools/lint.ts`: CLI, schreibt `lint-report.md`. Mit `--issues` legt sie per `gh` Issues an
- Tests mit Fixtures für jeden Befund-Typ, Stichtag fest gesetzt
- `.github/workflows/lint.yml`: wöchentlich per cron und manuell (`workflow_dispatch`), lädt `lint-report.md` als Artefakt hoch, Rechte `issues: write`

**Befund-Typen:**

| Befund | Regel | Label |
|---|---|---|
| Fehlendes Linkziel | Ziel einer Kante, eines Referenzfelds oder Wikilinks existiert nicht | `lint:fehlendes-linkziel` |
| Ungeprüft | `last_verified` + Turnus (mit Volatilitäts-Faktor) < Stichtag; Typen mit Turnus `null` ausgenommen | `lint:ungeprueft` |
| Orphan | keine eingehende Referenz jeglicher Art | `lint:orphan` |
| Abgelaufen | `gueltig_bis` < Stichtag und `status: active` | `lint:abgelaufen` |
| Abhängigkeits-Flag | `abhaengig_von`-Ziel hat `status: archived` oder `lebenszyklus: eingestellt` | `lint:abhaengigkeit` |

**Issue-Zuschnitt:** ein Issue je Befund-Schlüssel, nicht je Fundstelle. Beim fehlenden Linkziel heißt das ein Issue je fehlendem Ziel, mit allen verweisenden Concepts im Text. Titel stabil, z. B. `Lint: Fehlendes Linkziel prozesse/systemzugang-beantragen`. Vor dem Anlegen prüft das Tool offene Issues mit gleichem Titel, so entstehen keine Duplikate. Fehlende Labels legt es an.

### Schritt 4: AGENTS.md

**Entsteht:** `AGENTS.md`, kurz und in Anweisungsform:
- Ablage, Frontmatter, Kanten und Referenzfelder aus Abschnitt 2 als Regeln, Verweis auf `taxonomie.yaml` als Quelle der Wahrheit
- Änderungen nur per PR, nie direkt auf `main`; vor dem PR `npm run validate`
- Gate je Typ und was es für den PR bedeutet (Sammel-PR nur bei G1)
- Aus build.jetzt: erst Bestand prüfen, fortschreiben statt Dublette · Widersprüche zwischen Quellen nie still entscheiden, sondern als Konflikt-Hinweis in den PR-Text · bewusst Ausgelassenes im PR-Text begründen
- Keine Artefakte und Zusammenfassungen im Repo, keine Personen, `kontaktweg` nur Funktionspostfach
- Die gepflanzte Lücke `prozesse/systemzugang-beantragen` nicht reparieren

Dazu `.github/pull_request_template.md` mit den Feldern Gate, Quellen, Konflikt-Hinweise, Ausgelassenes. Kleiner Zusatz zum Briefing, macht die AGENTS.md-Regeln im PR sichtbar.

### Schritt 5: README und Gate-Vorbereitung

**Entsteht:**
- `README.md`: Zweck, Struktur, lokale Nutzung (`npm run validate`, `npm run lint`, `npm test`), Bedeutung von Fehler und Warnung, Lint-Workflow, Gates und was davon im Ein-Personen-Repo erzwungen ist und was nicht, der Fragenkatalog mit den zehn Fragen wörtlich aus dem Briefing samt erwarteter Antwort bei 9 und 10
- `.github/CODEOWNERS`: Typ-Ordner und `schema/` auf `@loschke`
- Branch-Protection bzw. Ruleset für `main`: Status-Check `validate` als Pflicht, PR Pflicht (abhängig von Frage F6)

### Schritt 6: Abnahme

**Entsteht:**
1. **Test-PR rot:** Branch mit einem absichtlich kaputten Concept (z. B. `begriffe/test-kaputt.md` mit unbekanntem Kantentyp und fehlendem Pflichtfeld). CI wird rot, PR wird geschlossen, nicht gemerged.
2. **Beispiel-PR grün:** ein kleiner neuer Concept-PR (Vorschlag in Frage F8), läuft durch Validierung und wird gemerged. Neu statt geändert, weil die acht Seed-Concepts tabu sind. Danach zeigt der Lint ein fehlendes Linkziel weniger.
3. **Lint-Lauf in Actions:** manuell ausgelöst, Report als Artefakt, Issue für `prozesse/systemzugang-beantragen` angelegt. Zweiter Lauf erzeugt keine Duplikate.
4. `docs/ABNAHME.md`: Checkliste aus Abschnitt 4 des Briefings mit Link je Nachweis (PR, Actions-Lauf, Issue).

---

## 4. Offene Fragen

**Blockierend** heißt: Ohne Antwort kann der genannte Schritt nicht sauber abgeschlossen werden. Zu jeder Frage steht meine Empfehlung.

| # | Frage | Empfehlung | Blockiert |
|---|---|---|---|
| F1 | **Zehn fehlende Linkziele statt einem** (B1). Wie lese ich „keine False Positives"? | Alle zehn ehrlich melden. Sie sind echte Lücken, die gepflanzte ist eine davon. Die Abnahme prüft dann: Die gepflanzte Lücke ist dabei, und es gibt keinen Befund, der nicht real ist. Alternative: neun Stub-Concepts anlegen, damit die gepflanzte Lücke allein steht. Das hieße aber Concepts ohne geprüften Inhalt erfinden | Schritt 3, Abnahme |
| F2 | **`regelungen/ki-einsatz` als Orphan** (B2). Echter Befund oder ausnehmen? | Als echten Befund melden. Eine Regelung, auf die nichts zeigt, ist im Graphen schwer auffindbar. Alternative: `draft` von der Orphan-Prüfung ausnehmen (als Profil-Option in der Taxonomie) | Schritt 3, Abnahme |
| F3 | **`last_verified` in der Zukunft** (B3). Fehler, Warnung oder egal? | In M0 nicht prüfen. Der Stichtag ist per `--stichtag` setzbar (Default heute), damit Tests deterministisch sind und sich das Kvix-Szenario („Ende Oktober") nachstellen lässt | nein |
| F4 | **Quellen und `archiv/`** (B4, B6). Soll der Validator die Existenz von Quellen prüfen, und was kommt nach `archiv/`? | Nur die Form prüfen (beginnt mit `archiv/`), keine Existenz. `archiv/` bleibt in M0 leer bis auf die Quelle für den Beispiel-PR, als Markdown aus `public/planspiel/kvix/` kopiert. Personenregister nie | nein |
| F5 | **G3 und abgelaufene Gültigkeit.** Das Briefing sagt bei G3 „Merge blockiert bei abgelaufener Gültigkeit", führt „Abgelaufen" aber als Lint-Befund. Was gilt? | „Quelle fehlt" bei G3-Typen ist ein Validator-Fehler (billig, deterministisch). „Abgelaufen" bleibt Lint-Befund und blockiert die CI nicht. Im README als „vorbereitet, nicht erzwungen" dokumentiert | Schritt 2 |
| F6 | **GitHub-Repo:** Name `loschke/kvix-kb`? Öffentlich oder privat? | Name ja. Wichtig: Bei privaten Repos eines persönlichen Kontos gibt es Branch-Protection und Rulesets nach meinem Stand nur mit einem bezahlten Plan (Pro). Deinen Plan konnte ich per `gh` nicht auslesen. Hast du Pro, ist privat kein Problem. Ohne Pro und privat wird die CI trotzdem rot, der Merge ist aber technisch nicht blockiert. Öffentlich ginge beides, die Kvix-Inhalte sind fiktiv | **Schritt 0** |
| F7 | **YAML-Bibliothek:** `yaml` (eemeli) statt gray-matter? | Ja. gray-matter liefert keine Zeilennummern (das Briefing verlangt „Datei, Zeile, Problem") und macht aus Daten JS-`Date` (dieselbe Falle wie in github-kb). `yaml` ist klein, ohne weitere Abhängigkeiten, liefert Positionen und lässt Daten als String. Frontmatter-Trennung per einfacher Regel im eigenen Code | Schritt 2 |
| F8 | **Inhalt des Beispiel-PRs.** Welcher neue Concept? | `orgeinheiten/kundenmanagement` aus dem Organigramm (Quelle nach `archiv/personal/` kopiert). Er schließt eine echte Lücke, auf die schon vier Concepts zeigen, und erzeugt keine neue: `leitung` zeigt auf `rollen/leitung-kundenmanagement`, `belongs_to` auf `orgeinheiten/kvix`, beide fehlen bereits. Der Lint zeigt danach einen Befund weniger. Ein Concept, auf das niemand zeigt (etwa ein neuer Begriff), wäre sofort ein Orphan. `orgeinheiten/it` bringt netto nichts, weil seine `leitung` eine neue Lücke öffnet. Nicht `prozesse/systemzugang-beantragen` | Schritt 6 |
| F9 | Erlaubte Werte für `lebenszyklus` bei `system`? Das Briefing nennt sie nur bei `leistung` | `aktiv` und `eingestellt`, wie bei `leistung` | nein |
| F10 | **Unbekannte Felder** im Frontmatter: Fehler oder Warnung? | Warnung. Hält die Tür für Mandanten-Felder offen, ohne still zu sein | nein |
| F11 | **Lint-Issues automatisch?** Soll der wöchentliche cron-Lauf selbst Issues anlegen? | Ja, cron mit `--issues`. Manueller Lauf mit Schalter, Default ohne Issues | nein |
| F12 | **Arbeitsweise mit Git:** Darf ich in diesem Repo je Schritt selbst committen, pushen, PRs öffnen und den Beispiel-PR mergen? Und die Platzhalter in der CLAUDE.md eintragen? | Committen je Schritt ja. Push, PR-Eröffnung und Merge jeweils mit kurzer Rückmeldung an dich, weil sie nach außen gehen | **Schritt 0** |

---

## 5. Was dieser Plan bewusst nicht enthält

Kein UI, kein MCP-Server, kein Ingest-Agent, keine Embeddings oder RAG, keine Änderung an den acht Seed-Concepts, kein Eingriff in `mcp-hub`, `build-jetzt-superagents` oder `lernen-diy`. Die Befunde zu github-kb und das Muster-Mapping aus build.jetzt sind Input für M1 und M2, keine Arbeit in M0.
