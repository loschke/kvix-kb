// Deterministische Prüfung von Concepts gegen die Taxonomie. Kein LLM,
// kein Dateizugriff, kein process.exit: reine Funktionen, damit auch die
// Werkbank (M1) einzelne Bausteine live prüfen kann.
//
// Ebenen:
//   fehler   Schema-Verstoß, CI wird rot (Exit 1)
//   warnung  sichtbar, CI bleibt grün. Fehlende Linkziele sind im Aufbau
//            normal; der Lint macht daraus Issues.

import { findeWikilinks, leseFrontmatter } from "./frontmatter.ts";
import {
  berechneEingehend,
  type Befund,
  type Concept,
  type Dokument,
  type Ebene,
  type Korpus,
  type Referenz,
} from "./korpus.ts";
import { erfuellt, felderFuer, type FeldDef, type Schema, type Strenge } from "./schema.ts";

export interface Ergebnis {
  befunde: Befund[];
  korpus: Korpus;
}

const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;

export function istGueltigesDatum(wert: string): boolean {
  const m = DATUM.exec(wert);
  if (!m) return false;
  const [j, mo, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(j, mo - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === mo - 1 && d.getUTCDate() === t;
}

/** Prüft den ganzen Korpus: jede Datei für sich, danach die Linkziele. */
export function validateKorpus(dokumente: Dokument[], schema: Schema): Ergebnis {
  const befunde: Befund[] = [];
  const concepts = new Map<string, Concept>();
  const ids = new Set<string>();

  for (const dok of dokumente) {
    const r = pruefeDokument(dok, schema);
    befunde.push(...r.befunde);
    if (r.id !== undefined) ids.add(r.id);
    if (r.concept) concepts.set(r.concept.id, r.concept);
  }

  befunde.push(...pruefeLinkziele(concepts.values(), ids));
  const korpus: Korpus = { concepts, ids, eingehend: berechneEingehend(concepts.values()) };
  return { befunde: sortiere(befunde), korpus };
}

/**
 * Prüft ein einzelnes Concept. Ohne bekannteIds werden Linkziele nicht
 * geprüft; mit bekannteIds werden fehlende Ziele als Warnung gemeldet.
 */
export function validateConcept(dok: Dokument, schema: Schema, bekannteIds?: Set<string>): Befund[] {
  const r = pruefeDokument(dok, schema);
  const befunde = [...r.befunde];
  if (r.concept && bekannteIds) {
    const ids = new Set(bekannteIds);
    ids.add(r.concept.id);
    befunde.push(...pruefeLinkziele([r.concept], ids));
  }
  return sortiere(befunde);
}

interface DokumentErgebnis {
  befunde: Befund[];
  id?: string;
  concept?: Concept;
}

function pruefeDokument(dok: Dokument, schema: Schema): DokumentErgebnis {
  const befunde: Befund[] = [];
  const melde = (zeile: number, ebene: Ebene, regel: string, text: string): void => {
    befunde.push({ datei: dok.datei, zeile, ebene, regel, text });
  };

  const teile = dok.datei.split("/");
  const ordner = teile[0] ?? "";
  const ordnerTyp = schema.ordnerZuTyp.get(ordner);
  if (ordnerTyp === undefined) {
    melde(1, "fehler", "kein-typ-ordner", `"${ordner}" ist kein Typ-Ordner der Taxonomie`);
    return { befunde };
  }
  if (teile.length > 2 && schema.typOrdnerFlach) {
    melde(1, "fehler", "unterordner", `Typ-Ordner sind flach. Hierarchie gehört in belongs_to-Kanten, nicht in Unterordner`);
    return { befunde };
  }
  if (!dok.datei.endsWith(schema.conceptEndung)) {
    melde(1, "warnung", "keine-concept-datei", `Datei ohne Endung ${schema.conceptEndung} im Typ-Ordner wird ignoriert`);
    return { befunde };
  }
  const id = dok.datei.slice(0, -schema.conceptEndung.length);

  const fm = leseFrontmatter(dok.inhalt);
  if (!fm.ok) {
    melde(fm.zeile, "fehler", fm.regel, fm.text);
    return { befunde, id };
  }
  const { daten, zeile } = fm.frontmatter;
  const ausgehend: Referenz[] = [];

  // Typ: muss existieren und zum Ordner passen. Geprüft wird danach immer
  // gegen den Ordner-Typ, denn der Pfad ist die ID.
  const typFeld = [...schema.basisFelder.values()].find((f) => f.art === "typ")!;
  const typWert = daten[typFeld.name];
  if (!(typFeld.name in daten) || typWert === null) {
    melde(1, "fehler", "pflichtfeld-fehlt", `Pflichtfeld ${typFeld.name} fehlt`);
  } else if (typeof typWert !== "string" || !schema.typen.has(typWert)) {
    melde(zeile(typFeld.name), "fehler", "typ-unbekannt",
      `${typFeld.name}: "${String(typWert)}" ist kein Typ. Erlaubt: ${[...schema.typen.keys()].join(", ")}`);
  } else if (typWert !== ordnerTyp) {
    melde(zeile(typFeld.name), "fehler", "typ-ordner",
      `${typFeld.name}: "${typWert}" passt nicht zum Ordner ${ordner}/ (erwartet: ${ordnerTyp})`);
  }

  const felder = felderFuer(schema, ordnerTyp);

  // Unbekannte Felder
  for (const name of Object.keys(daten)) {
    if (!felder.has(name)) {
      melde(zeile(name), "warnung", "feld-unbekannt",
        `Feld ${name} ist für Typ ${ordnerTyp} nicht definiert (Tippfehler oder fehlt in der Taxonomie?)`);
    }
  }

  // Felder einzeln
  for (const def of felder.values()) {
    if (def.art === "typ") continue;
    if (!(def.name in daten)) {
      if (def.pflicht) melde(1, "fehler", "pflichtfeld-fehlt", `Pflichtfeld ${def.name} fehlt`);
      continue;
    }
    const wert = daten[def.name];
    if (wert === null) {
      if (def.nullErlaubtWenn && erfuellt(daten, def.nullErlaubtWenn)) continue;
      if (!def.pflicht) continue;
      const hinweis = def.nullErlaubtWenn ? ` (nur erlaubt bei ${beschreibeBedingung(def.nullErlaubtWenn)})` : "";
      melde(zeile(def.name), "fehler", "wert-null", `${def.name} darf nicht null sein${hinweis}`);
      continue;
    }
    pruefeFeld(def, wert, id, schema, zeile, melde, ausgehend);
  }

  // Pflichtkanten des Typs
  const kantenFeld = [...schema.basisFelder.values()].find((f) => f.art === "kanten")!;
  const links = daten[kantenFeld.name];
  const typDef = schema.typen.get(ordnerTyp)!;
  for (const k of typDef.kantenPflicht) {
    const ziele = istMap(links) ? links[k] : undefined;
    if (!Array.isArray(ziele) || ziele.length === 0) {
      melde(zeile(kantenFeld.name, k), "fehler", "kante-pflicht",
        `Typ ${ordnerTyp} braucht mindestens eine ${k}-Kante unter ${kantenFeld.name}`);
    }
  }

  // Bedingte Regeln
  for (const regel of schema.regeln) {
    if (!erfuellt(daten, regel.wenn)) continue;
    const feld = regel.dann.mindestensEins;
    const w = daten[feld];
    if (!Array.isArray(w) || w.length === 0) {
      melde(zeile(feld), "fehler", regel.id, `${regel.beschreibung}: ${feld} ist leer`);
    }
  }

  // Gate des Typs im aktiven Profil
  const gateName = schema.profil.typGate.get(ordnerTyp);
  const gate = gateName === undefined ? undefined : schema.profil.gates.get(gateName);
  for (const feld of gate?.mindestensEins ?? []) {
    const w = daten[feld];
    if (!Array.isArray(w) || w.length === 0) {
      melde(zeile(feld), "fehler", "gate-pflicht",
        `Typ ${ordnerTyp} hat Gate ${gate!.name} (${gate!.beschreibung ?? ""}): ${feld} braucht mindestens einen Eintrag`);
    }
  }

  // Wikilinks im Body
  for (const w of findeWikilinks(fm.frontmatter.body, fm.frontmatter.bodyStartZeile)) {
    if (w.ziel.startsWith(schema.archivPraefix)) continue; // Rohquelle, kein Concept
    const form = pruefeReferenzForm(w.ziel, schema);
    if (form.fehler) {
      melde(w.zeile, "fehler", "referenz-form", `Wikilink [[${w.ziel}]]: ${form.fehler}`);
      continue;
    }
    ausgehend.push({ von: id, ziel: w.ziel, quelle: "wikilink", name: "wikilink", zeile: w.zeile });
  }

  return { befunde, id, concept: { id, datei: dok.datei, typ: ordnerTyp, daten, body: fm.frontmatter.body, ausgehend, zeile } };
}

type Melde = (zeile: number, ebene: Ebene, regel: string, text: string) => void;
type Zeile = (...pfad: (string | number)[]) => number;

function pruefeFeld(
  def: FeldDef,
  wert: unknown,
  id: string,
  schema: Schema,
  zeile: Zeile,
  melde: Melde,
  ausgehend: Referenz[],
): void {
  const n = def.name;
  switch (def.art) {
    case "text":
      if (typeof wert !== "string" || wert.trim() === "") {
        melde(zeile(n), "fehler", "wert-format", `${n} muss ein nicht-leerer Text sein`);
      }
      return;
    case "enum":
      if (typeof wert !== "string" || !def.werte!.includes(wert)) {
        melde(zeile(n), "fehler", "wert-unzulaessig",
          `${n}: "${String(wert)}" ist nicht erlaubt. Erlaubt: ${def.werte!.join(", ")}`);
      }
      return;
    case "datum":
      if (typeof wert !== "string" || !istGueltigesDatum(wert)) {
        melde(zeile(n), "fehler", "datum-format", `${n}: "${String(wert)}" ist kein Datum im Format YYYY-MM-DD`);
      }
      return;
    case "referenz":
      if (typeof wert !== "string") {
        melde(zeile(n), "fehler", "referenz-form", `${n} muss ein Concept-Pfad sein, z. B. rollen/beispiel`);
        return;
      }
      pruefeReferenz(wert, def.ziel, def.zielStrenge, n, zeile(n), "feld", n, id, schema, melde, ausgehend);
      return;
    case "referenz_liste":
      if (!pruefeListe(def, wert, zeile, melde)) return;
      (wert as unknown[]).forEach((el, i) => {
        if (typeof el !== "string") {
          melde(zeile(n, i), "fehler", "referenz-form", `${n}[${i}] muss ein Concept-Pfad sein`);
          return;
        }
        pruefeReferenz(el, def.ziel, def.zielStrenge, n, zeile(n, i), "feld", n, id, schema, melde, ausgehend);
      });
      return;
    case "text_liste":
      if (!pruefeListe(def, wert, zeile, melde)) return;
      (wert as unknown[]).forEach((el, i) => {
        if (typeof el !== "string" || el.trim() === "") {
          melde(zeile(n, i), "fehler", "wert-format", `${n}[${i}] muss ein nicht-leerer Text sein`);
        }
      });
      return;
    case "pfad_liste":
      if (!pruefeListe(def, wert, zeile, melde)) return;
      (wert as unknown[]).forEach((el, i) => {
        if (typeof el !== "string" || !el.startsWith(def.praefix!) || el.length <= def.praefix!.length) {
          melde(zeile(n, i), "fehler", "pfad-form", `${n}[${i}]: "${String(el)}" muss mit ${def.praefix} beginnen`);
        }
      });
      return;
    case "kanten":
      pruefeKanten(def, wert, id, schema, zeile, melde, ausgehend);
      return;
    case "typ":
      return;
  }
}

function pruefeListe(def: FeldDef, wert: unknown, zeile: Zeile, melde: Melde): boolean {
  if (!Array.isArray(wert)) {
    melde(zeile(def.name), "fehler", "wert-format", `${def.name} muss eine Liste sein`);
    return false;
  }
  if (wert.length === 0 && !def.leerErlaubt) {
    melde(zeile(def.name), "fehler", "liste-leer", `${def.name} darf nicht leer sein`);
    return false;
  }
  return true;
}

function pruefeKanten(
  def: FeldDef,
  wert: unknown,
  id: string,
  schema: Schema,
  zeile: Zeile,
  melde: Melde,
  ausgehend: Referenz[],
): void {
  const n = def.name;
  if (!istMap(wert)) {
    melde(zeile(n), "fehler", "wert-format", `${n} muss eine Map Kantentyp -> Liste sein (darf leer sein: {})`);
    return;
  }
  for (const [kante, ziele] of Object.entries(wert)) {
    const kdef = schema.kanten.get(kante);
    const extension = schema.kantenExtensionPraefix !== undefined && kante.startsWith(schema.kantenExtensionPraefix);
    if (!kdef && !extension) {
      melde(zeile(n, kante), "fehler", "kante-unbekannt",
        `Kantentyp ${kante} ist nicht zulässig. Erlaubt: ${[...schema.kanten.keys()].join(", ")}`);
      continue;
    }
    if (!Array.isArray(ziele)) {
      melde(zeile(n, kante), "fehler", "wert-format", `${n}.${kante} muss eine Liste von Concept-Pfaden sein`);
      continue;
    }
    ziele.forEach((ziel, i) => {
      if (typeof ziel !== "string") {
        melde(zeile(n, kante, i), "fehler", "referenz-form", `${n}.${kante}[${i}] muss ein Concept-Pfad sein`);
        return;
      }
      pruefeReferenz(ziel, kdef?.ziel, kdef?.zielStrenge ?? "fehler", `${n}.${kante}`, zeile(n, kante, i),
        "kante", kante, id, schema, melde, ausgehend);
    });
  }
}

function pruefeReferenz(
  ziel: string,
  zielTypen: string[] | undefined,
  strenge: Strenge,
  ort: string,
  zeileNr: number,
  quelle: Referenz["quelle"],
  name: string,
  von: string,
  schema: Schema,
  melde: Melde,
  ausgehend: Referenz[],
): void {
  const form = pruefeReferenzForm(ziel, schema);
  if (form.fehler) {
    melde(zeileNr, "fehler", "referenz-form", `${ort}: "${ziel}" ${form.fehler}`);
    return;
  }
  if (zielTypen && !zielTypen.includes(form.typ!)) {
    melde(zeileNr, strenge, "ziel-typ",
      `${ort}: ${ziel} ist vom Typ ${form.typ}, erwartet: ${zielTypen.join(" oder ")}`);
  }
  ausgehend.push({ von, ziel, quelle, name, zeile: zeileNr });
}

/** Form eines Concept-Pfads: <typ-ordner>/<name>, ohne Endung. */
export function pruefeReferenzForm(ziel: string, schema: Schema): { typ?: string; fehler?: string } {
  if (ziel.endsWith(schema.conceptEndung)) return { fehler: `ist kein Concept-Pfad (ohne ${schema.conceptEndung} angeben)` };
  const teile = ziel.split("/");
  if (teile.length !== 2 || !teile[0] || !teile[1]) {
    return { fehler: "ist kein Concept-Pfad der Form <typ-ordner>/<name>" };
  }
  const typ = schema.ordnerZuTyp.get(teile[0]);
  if (!typ) return { fehler: `zeigt in den Ordner ${teile[0]}/, der kein Typ-Ordner ist` };
  return { typ };
}

function pruefeLinkziele(concepts: Iterable<Concept>, ids: Set<string>): Befund[] {
  const befunde: Befund[] = [];
  for (const c of concepts) {
    for (const r of c.ausgehend) {
      if (ids.has(r.ziel)) continue;
      const ort = r.quelle === "kante" ? `Kante ${r.name}` : r.quelle === "feld" ? `Feld ${r.name}` : "Wikilink";
      befunde.push({
        datei: c.datei,
        zeile: r.zeile,
        ebene: "warnung",
        regel: "linkziel-fehlt",
        text: `${ort} verweist auf ${r.ziel}, das es (noch) nicht gibt`,
      });
    }
  }
  return befunde;
}

function istMap(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function beschreibeBedingung(b: Record<string, unknown[]>): string {
  return Object.entries(b)
    .map(([k, v]) => `${k}: ${v.map(String).join(" | ")}`)
    .join(", ");
}

function sortiere(befunde: Befund[]): Befund[] {
  return befunde.sort((a, b) => a.datei.localeCompare(b.datei) || a.zeile - b.zeile || a.regel.localeCompare(b.regel));
}
