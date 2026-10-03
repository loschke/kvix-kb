# AGENTS.md · Redaktionshandbuch

Für Agenten, die in dieser Wissensbasis Concepts anlegen oder ändern. Menschen lesen es auch, geschrieben ist es für dich.

**Quelle der Wahrheit für Typen, Felder, Kanten, Gates und Turnusse ist [`schema/taxonomie.yaml`](schema/taxonomie.yaml).** Dieses Handbuch erklärt, wie du damit arbeitest. Wo beide sich widersprechen, gilt die Taxonomie. Melde den Widerspruch.

---

## 1. Grundregeln

1. **Ändere nur per Pull Request.** Nie direkt auf `main` committen oder pushen. Nie selbst mergen, den Merge macht ein Mensch.
2. **Prüfe vor jedem PR:** `npm run validate` muss mit 0 Fehlern enden. Warnungen sind erlaubt, nenne sie im PR.
3. **Entscheide Widersprüche nicht still.** Widersprechen sich Quellen untereinander oder eine Quelle dem Bestand, übernimm keine Fassung stillschweigend. Schreib den Konflikt in den PR-Text, Abschnitt „Konflikt-Hinweise“, mit beiden Fundstellen.
4. **Bestand zuerst.** Suche vor dem Anlegen, ob es das Thema schon gibt. Schreib ein vorhandenes Concept fort, statt eine Dublette anzulegen.
5. **Keine Personen.** Kein Name, keine persönliche Mailadresse, in keinem Feld und nicht im Text. Zuständigkeit läuft über Rollen und Orgeinheiten. `kontaktweg` ist immer ein Funktionspostfach.
6. **Keine Artefakte im Repo.** Keine Zusammenfassungen, Reports, Exporte, Notizen oder Entwürfe außerhalb der Typ-Ordner. `lint-report.md` wird nie committet.
7. **Ändere `schema/taxonomie.yaml` nur auf ausdrücklichen Auftrag.** Sie gilt für den ganzen Korpus.

## 2. Ablage

- **Ein Ordner pro Typ, der Pfad ist die ID.** `systeme/ticketsystem.md` hat die ID `systeme/ticketsystem`.
- **Typ-Ordner sind flach.** Keine Unterordner. Hierarchie (Unterleistungen, Varianten) drückst du mit `belongs_to` aus.
- **Dateinamen** klein, mit Bindestrichen, Umlaute als ae/oe/ue/ss. Beispiel: `rueckmeldungsexport-auswerten.md`.
- **Rohquellen** liegen unter `archiv/<bereich>/` und sind keine Concepts. Lege dort nur ab, was ein Concept tatsächlich als Quelle braucht.
- **Verweise im Text** schreibst du als `[[pfad]]` ohne `.md`, z. B. `[[systeme/ticketsystem]]`. Sie zählen wie Kanten.

| Ordner | Typ | Gate |
|---|---|---|
| `regelungen/` | regelung | G3 |
| `prozesse/` | prozess | G2 |
| `leistungen/` | leistung | G2 |
| `leitfaeden/` | leitfaden | G1 |
| `rollen/` | rolle | G1 |
| `orgeinheiten/` | orgeinheit | G1 |
| `begriffe/` | begriff | G1 |
| `systeme/` | system | G1 |

## 3. Frontmatter

Jedes Concept beginnt mit einem YAML-Frontmatter. Pflichtfelder für alle:

```yaml
typ: system                      # muss zum Ordner passen
titel: "Ticketsystem"
authority: canonical             # canonical | derived
owner: orgeinheiten/it           # Rolle oder Orgeinheit, nie eine Person
visibility: internal             # public | internal | restricted
status: active                   # draft | active | archived
quellen:                         # Pfade unter archiv/, darf bei canonical leer sein
  - archiv/it/systemlandschaft.md
last_verified: 2026-10-14        # YYYY-MM-DD
links: {}                        # Kanten, siehe unten; muss existieren, darf leer sein
# volatilitaet: hoch             # optional: hoch | niedrig
```

Dazu kommen die Pflichtfelder des Typs. Welche das sind, steht in der Taxonomie unter `typen`. Felder mit einem Pfad als Wert (`owner`, `zugang`, `betreiber`, `leitung`, `vertretung`, `ansprechpartner`, `beteiligte_rollen`, `systeme`) zeigen auf Concepts. Sie zählen für die Link-Integrität wie Kanten.

**Regeln, die du leicht übersiehst:**

- **`derived`** braucht mindestens eine Quelle. Nimm `derived`, solange die Quelle weiterlebt und das Concept daraus abgeleitet ist.
- **Regelungen (G3)** brauchen immer mindestens eine Quelle und eine `gilt_fuer`-Kante.
- **`gueltig_ab: null`** ist nur bei `status: draft` erlaubt.
- **Leitfäden** brauchen mindestens eine `abhaengig_von`-Kante.
- **`visibility`:** Nimm im Zweifel `internal`. `public` nur, wenn auch die Quelle öffentlich ist.

## 4. Kanten

Unter `links` sind nur diese fünf Kanten zulässig (Mandanten-Erweiterungen mit Präfix `x_`):

| Kante | Wann |
|---|---|
| `belongs_to` | gehört zu, ist Teil von (Navigation, Hierarchie) |
| `related_to` | loser Kontext, nur als Hinweis für die Suche |
| `gilt_fuer` | Geltungsbereich einer Regelung (Rolle oder Orgeinheit) |
| `ersetzt` | dieses Concept ist Nachfolger des Ziels |
| `abhaengig_von` | stimmt nur, solange das Ziel stimmt. Ändert sich das Ziel, wird dieses Concept zur Prüfung geflaggt |

Nimm `abhaengig_von` nur, wenn das Concept wirklich falsch würde, sobald sich das Ziel ändert. Für bloßen Zusammenhang reicht `related_to`.

## 5. Ändern, ablösen, prüfen

- **Ablösen statt löschen.** Ein neues Concept bekommt `ersetzt: [altes]`, das alte `status: archived`. Lösche keine Concepts.
- **`last_verified` setzt du nur, wenn du den Inhalt tatsächlich gegen die Quelle oder mit dem Owner geprüft hast.** Nie, nur um einen Lint-Befund „Ungeprüft“ verschwinden zu lassen. Schreib in den PR, was du geprüft hast.
- **Ein Verweis auf ein noch fehlendes Concept** ist erlaubt (Warnung, kein Fehler). Nenne ihn im PR.
- **Lint-Issues schließt du nicht.** Behebt dein PR einen Befund, verweise darauf mit „Bezug: #nummer“, nicht mit „Closes“ oder „Fixes“. Das Schließen ist eine menschliche Entscheidung.

## 6. Gates und Pull Requests

| Gate | Typen | PR |
|---|---|---|
| G1 | leitfaden, rolle, orgeinheit, begriff, system | Sammel-PR mit mehreren Concepts erlaubt, ein Review |
| G2 | prozess, leistung | ein Concept je PR, Freigabe durch den Owner |
| G3 | regelung | ein Concept je PR, Owner plus zweite Person; Quelle Pflicht |

Ein Sammel-PR enthält nur G1-Typen. Jedes G2- oder G3-Concept bekommt einen eigenen PR. Nutze die PR-Vorlage und fülle jeden Abschnitt aus. „Keine“ ist eine gültige Antwort, ein leerer Abschnitt nicht.

**Aus Quellen übernehmen:** Nenne im PR, was du aus einer Quelle bewusst nicht übernommen hast und warum (z. B. „Strukturzahlen bleiben im Organigramm führend“).

## 7. Quellen aus der Kvix-Fallakte

Die Rohdokumente der fiktiven Firma Kvix liegen außerhalb dieses Repos (Pfad in `CLAUDE.md`). Das Quell-Repo ist **read-only**: Kopiere eine benötigte Datei nach `archiv/<bereich>/`, schreib oder verschiebe nie etwas im Quell-Repo. Das Personenregister kopierst du nie.

## 8. Feste Ausnahmen in diesem Repo

- **Die Lücke `prozesse/systemzugang-beantragen` bleibt offen.** `systeme/ticketsystem` verweist im Feld `zugang` darauf, das Concept existiert absichtlich nicht. Es ist der Testfall für den Lint. Leg es nicht an und entferne den Verweis nicht.
- **Seed-Concepts in der Bauphase:** Bis zur Abnahme von Meilenstein M0 (`docs/ABNAHME.md`) bleiben die acht Seed-Concepts unverändert. Befunde dazu meldest du als Issue. Nach der Abnahme sind Änderungen über den normalen PR-Weg erwünscht.
