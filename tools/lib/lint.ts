// Lint: Wartungsbefunde über den ganzen Korpus. Keine CI-Fehler, sondern
// Hinweise, was gepflegt werden muss. Reine Funktion: Stichtag kommt als
// Parameter, damit Tests und Szenarien reproduzierbar sind.
//
// Welche Felder und Werte zählen, steht in schema/taxonomie.yaml unter
// "signale" und im aktiven Profil (Turnusse, Volatilität).

import type { Concept, Korpus, Referenz } from "./korpus.ts";
import { erfuellt, erfuelltEinesVon, type Schema } from "./schema.ts";
import { istGueltigesDatum } from "./validate.ts";

export type BefundArt = "fehlendes-linkziel" | "ungeprueft" | "orphan" | "abgelaufen" | "abhaengigkeit";

export const BEFUND_ARTEN: Record<BefundArt, { titel: string; label: string; farbe: string; erklaerung: string }> = {
  "fehlendes-linkziel": {
    titel: "Fehlendes Linkziel",
    label: "lint:fehlendes-linkziel",
    farbe: "D93F0B",
    erklaerung: "Ein Concept verweist auf ein Concept, das es nicht gibt.",
  },
  ungeprueft: {
    titel: "Ungeprüft",
    label: "lint:ungeprueft",
    farbe: "FBCA04",
    erklaerung: "Die letzte Prüfung liegt länger zurück als der Turnus des Typs erlaubt.",
  },
  orphan: {
    titel: "Orphan",
    label: "lint:orphan",
    farbe: "C5DEF5",
    erklaerung: "Kein anderes Concept verweist auf dieses, weder per Kante, Referenzfeld noch Wikilink.",
  },
  abgelaufen: {
    titel: "Abgelaufen",
    label: "lint:abgelaufen",
    farbe: "B60205",
    erklaerung: "Die Gültigkeit ist vorbei, das Concept steht aber noch als in Kraft.",
  },
  abhaengigkeit: {
    titel: "Abhängigkeit prüfen",
    label: "lint:abhaengigkeit",
    farbe: "5319E7",
    erklaerung: "Ein Concept, von dem dieses abhängt, ist abgekündigt.",
  },
};

export interface Fundstelle {
  datei: string;
  zeile: number;
  /** z. B. "Feld zugang", "Kante belongs_to", "Wikilink" */
  ort: string;
}

export interface LintBefund {
  art: BefundArt;
  /** Betroffene Concept-ID; beim fehlenden Linkziel das fehlende Ziel */
  concept: string;
  /** Stabiler Titel, dient auch als Duplikat-Schlüssel für Issues */
  titel: string;
  begruendung: string;
  fundstellen: Fundstelle[];
}

const TAG_MS = 24 * 60 * 60 * 1000;

function tage(datum: string): number {
  const [j, m, t] = datum.split("-").map(Number) as [number, number, number];
  return Date.UTC(j, m - 1, t) / TAG_MS;
}

function plusTage(datum: string, n: number): string {
  return new Date((tage(datum) + n) * TAG_MS).toISOString().slice(0, 10);
}

export function heute(): string {
  return new Date().toISOString().slice(0, 10);
}

function ortVon(r: Referenz): string {
  return r.quelle === "kante" ? `Kante ${r.name}` : r.quelle === "feld" ? `Feld ${r.name}` : "Wikilink";
}

function fundstelle(korpus: Korpus, r: Referenz): Fundstelle {
  return { datei: korpus.concepts.get(r.von)?.datei ?? r.von, zeile: r.zeile, ort: ortVon(r) };
}

export function lintKorpus(korpus: Korpus, schema: Schema, stichtag: string): LintBefund[] {
  if (!istGueltigesDatum(stichtag)) throw new Error(`Stichtag "${stichtag}" ist kein Datum im Format YYYY-MM-DD`);
  return [
    ...fehlendeLinkziele(korpus),
    ...ungeprueft(korpus, schema, stichtag),
    ...orphans(korpus),
    ...abgelaufen(korpus, schema, stichtag),
    ...abhaengigkeiten(korpus, schema),
  ];
}

function fehlendeLinkziele(korpus: Korpus): LintBefund[] {
  const befunde: LintBefund[] = [];
  for (const [ziel, refs] of [...korpus.eingehend].sort(([a], [b]) => a.localeCompare(b))) {
    if (korpus.ids.has(ziel)) continue;
    const von = [...new Set(refs.map((r) => r.von))].sort();
    befunde.push({
      art: "fehlendes-linkziel",
      concept: ziel,
      titel: `Lint: Fehlendes Linkziel ${ziel}`,
      begruendung: `${ziel} existiert nicht als Concept. ${von.length === 1 ? "Ein Concept verweist" : `${von.length} Concepts verweisen`} darauf: ${von.join(", ")}.`,
      fundstellen: refs
        .map((r) => fundstelle(korpus, r))
        .sort((a, b) => a.datei.localeCompare(b.datei) || a.zeile - b.zeile),
    });
  }
  return befunde;
}

function ungeprueft(korpus: Korpus, schema: Schema, stichtag: string): LintBefund[] {
  const { feld, volatilitaetFeld } = schema.signale.ungeprueft;
  const befunde: LintBefund[] = [];
  for (const c of sortiert(korpus)) {
    const turnus = schema.profil.turnusTage.get(c.typ);
    if (turnus === null || turnus === undefined) continue; // kein Verfall
    const geprueft = c.daten[feld];
    if (typeof geprueft !== "string" || !istGueltigesDatum(geprueft)) continue; // meldet der Validator
    const vol = volatilitaetFeld ? c.daten[volatilitaetFeld] : undefined;
    const faktor = typeof vol === "string" ? (schema.profil.volatilitaetFaktor.get(vol) ?? 1) : 1;
    const erlaubt = Math.round(turnus * faktor);
    const alter = tage(stichtag) - tage(geprueft);
    if (alter <= erlaubt) continue;
    const turnusText = faktor === 1 ? `${erlaubt} Tage (Typ ${c.typ})` : `${erlaubt} Tage (Typ ${c.typ}: ${turnus}, ${volatilitaetFeld}: ${String(vol)})`;
    befunde.push({
      art: "ungeprueft",
      concept: c.id,
      titel: `Lint: Ungeprüft ${c.id}`,
      begruendung: `${feld}: ${geprueft}, Turnus ${turnusText}. Fällig seit ${plusTage(geprueft, erlaubt + 1)}, ${alter - erlaubt} Tage überfällig.`,
      fundstellen: [{ datei: c.datei, zeile: c.zeile(feld), ort: `Feld ${feld}` }],
    });
  }
  return befunde;
}

function orphans(korpus: Korpus): LintBefund[] {
  const befunde: LintBefund[] = [];
  for (const c of sortiert(korpus)) {
    const vonAnderen = (korpus.eingehend.get(c.id) ?? []).filter((r) => r.von !== c.id);
    if (vonAnderen.length > 0) continue;
    befunde.push({
      art: "orphan",
      concept: c.id,
      titel: `Lint: Orphan ${c.id}`,
      begruendung: `Kein anderes Concept verweist auf ${c.id}. Ohne eingehende Verweise ist es im Graphen nur über die Suche auffindbar.`,
      fundstellen: [{ datei: c.datei, zeile: 1, ort: "Concept" }],
    });
  }
  return befunde;
}

function abgelaufen(korpus: Korpus, schema: Schema, stichtag: string): LintBefund[] {
  const { feld, letzterTagInklusiv, nurWenn } = schema.signale.abgelaufen;
  const befunde: LintBefund[] = [];
  for (const c of sortiert(korpus)) {
    const ende = c.daten[feld];
    if (typeof ende !== "string" || !istGueltigesDatum(ende)) continue;
    if (!erfuellt(c.daten, nurWenn)) continue;
    const vorbei = letzterTagInklusiv ? stichtag > ende : stichtag >= ende;
    if (!vorbei) continue;
    const stand = Object.keys(nurWenn).map((k) => `${k}: ${String(c.daten[k])}`).join(", ");
    befunde.push({
      art: "abgelaufen",
      concept: c.id,
      titel: `Lint: Abgelaufen ${c.id}`,
      begruendung: `${feld}: ${ende} liegt vor dem Stichtag ${stichtag}, aber ${stand}. Archivieren oder Gültigkeit verlängern.`,
      fundstellen: [{ datei: c.datei, zeile: c.zeile(feld), ort: `Feld ${feld}` }],
    });
  }
  return befunde;
}

function abhaengigkeiten(korpus: Korpus, schema: Schema): LintBefund[] {
  const { werte, propagiertUeber, nachfolgerKante } = schema.signale.abgekuendigt;
  const befunde: LintBefund[] = [];
  for (const c of sortiert(korpus)) {
    for (const r of c.ausgehend) {
      if (r.quelle !== "kante" || !propagiertUeber.includes(r.name)) continue;
      const ziel = korpus.concepts.get(r.ziel);
      if (!ziel || !erfuelltEinesVon(ziel.daten, werte)) continue;
      const grund = Object.keys(werte)
        .filter((k) => (werte[k] ?? []).includes(ziel.daten[k]))
        .map((k) => `${k}: ${String(ziel.daten[k])}`)
        .join(", ");
      const nachfolger = nachfolgerKante
        ? (korpus.eingehend.get(ziel.id) ?? []).filter((e) => e.quelle === "kante" && e.name === nachfolgerKante).map((e) => e.von)
        : [];
      const hinweis = nachfolger.length > 0
        ? ` Nachfolger laut ${nachfolgerKante}: ${[...new Set(nachfolger)].sort().join(", ")}. Verweis umstellen und Inhalt prüfen.`
        : " Prüfen, ob der Inhalt noch stimmt.";
      befunde.push({
        art: "abhaengigkeit",
        concept: c.id,
        titel: `Lint: Abhängigkeit prüfen ${c.id} (Ziel ${ziel.id})`,
        begruendung: `${c.id} hängt per ${r.name} von ${ziel.id} ab, und das ist abgekündigt (${grund}).${hinweis}`,
        fundstellen: [fundstelle(korpus, r)],
      });
    }
  }
  return befunde;
}

function sortiert(korpus: Korpus): Concept[] {
  return [...korpus.concepts.values()].sort((a, b) => a.id.localeCompare(b.id));
}
