// Trennt Frontmatter und Body und parst das YAML mit Zeilenbezug.
//
// Bewusst die Bibliothek "yaml" statt gray-matter (Entscheidung F7):
// - sie liefert Positionen, daraus werden Zeilennummern im Report
// - YAML 1.2 Core-Schema: 2026-10-10 bleibt ein String, wird nie zum Date

import { isMap, isPair, isScalar, isSeq, LineCounter, parseDocument, type Node, type YAMLMap } from "yaml";

export interface Frontmatter {
  /** Geparstes Frontmatter als einfaches Objekt */
  daten: Record<string, unknown>;
  /** Text nach dem schließenden --- */
  body: string;
  /** Dateizeile, in der der Body beginnt (1-basiert) */
  bodyStartZeile: number;
  /** Dateizeile eines Felds, eines Listeneintrags oder einer Kante */
  zeile: (...pfad: (string | number)[]) => number;
}

export type FrontmatterErgebnis =
  | { ok: true; frontmatter: Frontmatter }
  | { ok: false; regel: "frontmatter-fehlt" | "frontmatter-ungueltig"; zeile: number; text: string };

const OEFFNUNG = /^---[ \t]*\r?\n/;
const SCHLUSS = /^---[ \t]*\r?$/m;

export function leseFrontmatter(inhalt: string): FrontmatterErgebnis {
  const text = inhalt.replace(/^﻿/, "");
  const auf = OEFFNUNG.exec(text);
  if (!auf) {
    return { ok: false, regel: "frontmatter-fehlt", zeile: 1, text: "Datei beginnt nicht mit einem ---Frontmatter-Block" };
  }
  const rest = text.slice(auf[0].length);
  const zu = SCHLUSS.exec(rest);
  if (!zu) {
    return { ok: false, regel: "frontmatter-fehlt", zeile: 1, text: "Frontmatter-Block wird nicht mit --- geschlossen" };
  }
  const yamlText = rest.slice(0, zu.index);
  // Das YAML beginnt in Dateizeile 2 (Zeile 1 ist ---)
  const versatz = 1;
  const nachSchluss = rest.slice(zu.index + zu[0].length).replace(/^\r?\n/, "");
  // yamlText endet mit dem Zeilenumbruch vor dem schließenden ---,
  // die Anzahl der Umbrüche ist also die Anzahl der YAML-Zeilen.
  const yamlZeilen = (yamlText.match(/\n/g) ?? []).length;
  // Zeile 1: ---, dann die YAML-Zeilen, dann ---, danach der Body
  const bodyStartZeile = yamlZeilen + 3;

  const lc = new LineCounter();
  const doc = parseDocument(yamlText, { lineCounter: lc, prettyErrors: true, uniqueKeys: true });
  const fehler = doc.errors[0];
  if (fehler) {
    const z = fehler.linePos?.[0]?.line ?? 1;
    return {
      ok: false,
      regel: "frontmatter-ungueltig",
      zeile: z + versatz,
      text: `YAML nicht lesbar: ${fehler.message.split("\n")[0]}`,
    };
  }
  const daten = doc.toJS({ maxAliasCount: 0 }) as unknown;
  if (typeof daten !== "object" || daten === null || Array.isArray(daten)) {
    return { ok: false, regel: "frontmatter-ungueltig", zeile: 2, text: "Frontmatter ist keine Map aus Feldern" };
  }

  const zeileVon = (offset: number | undefined): number =>
    offset === undefined ? 1 : lc.linePos(offset).line + versatz;

  const zeile = (...pfad: (string | number)[]): number => {
    let knoten: unknown = doc.contents;
    let letzte = zeileVon((doc.contents as Node | null)?.range?.[0]);
    for (const schritt of pfad) {
      if (isMap(knoten)) {
        const paar = (knoten as YAMLMap).items.find(
          (it) => isPair(it) && isScalar(it.key) && it.key.value === schritt,
        );
        if (!paar) return letzte;
        letzte = zeileVon((paar.key as Node).range?.[0]);
        knoten = paar.value;
      } else if (isSeq(knoten) && typeof schritt === "number") {
        const el = knoten.items[schritt];
        if (!el) return letzte;
        letzte = zeileVon((el as Node).range?.[0]);
        knoten = el;
      } else {
        return letzte;
      }
    }
    return letzte;
  };

  return {
    ok: true,
    frontmatter: { daten: daten as Record<string, unknown>, body: nachSchluss, bodyStartZeile, zeile },
  };
}

export interface Wikilink {
  ziel: string;
  zeile: number;
}

/**
 * Findet [[pfad]] und [[pfad|Anzeige]] im Body. Code-Blöcke (``` und ~~~)
 * und Inline-Code werden übersprungen.
 */
export function findeWikilinks(body: string, startZeile: number): Wikilink[] {
  const links: Wikilink[] = [];
  let imCodeBlock = false;
  body.split("\n").forEach((zeileText, i) => {
    if (/^\s*(```|~~~)/.test(zeileText)) {
      imCodeBlock = !imCodeBlock;
      return;
    }
    if (imCodeBlock) return;
    const ohneInlineCode = zeileText.replace(/`[^`]*`/g, "");
    for (const m of ohneInlineCode.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g)) {
      links.push({ ziel: (m[1] ?? "").trim(), zeile: startZeile + i });
    }
  });
  return links;
}
