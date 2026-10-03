// Datenmodell des Korpus und Einlesen vom Dateisystem.
//
// Das Modell (Concepts mit allen aus- und eingehenden Referenzen) ist die
// gemeinsame Grundlage für Validator und Lint. validate --json gibt es mit
// aus, damit eine spätere Zugriffsschicht (M2) einen Index pro Commit
// lesen kann, statt Dateien einzeln zu durchsuchen.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Schema } from "./schema.ts";

/** Eine Datei im Korpus, Pfad relativ zum Repo-Root mit / als Trenner */
export interface Dokument {
  datei: string;
  inhalt: string;
}

export type Ebene = "fehler" | "warnung";

export interface Befund {
  datei: string;
  zeile: number;
  ebene: Ebene;
  regel: string;
  text: string;
}

export type ReferenzQuelle = "kante" | "feld" | "wikilink";

export interface Referenz {
  von: string;
  ziel: string;
  /** Woher die Referenz stammt */
  quelle: ReferenzQuelle;
  /** Kantentyp, Feldname oder "wikilink" */
  name: string;
  zeile: number;
}

export interface Concept {
  /** Dateipfad ohne Endung, z. B. systeme/ticketsystem */
  id: string;
  datei: string;
  /** Typ laut Ordner; der Pfad ist die ID und bestimmt den Typ */
  typ: string;
  daten: Record<string, unknown>;
  body: string;
  ausgehend: Referenz[];
  /** Dateizeile eines Frontmatter-Felds (1, wenn nicht vorhanden) */
  zeile: (...pfad: (string | number)[]) => number;
}

export interface Korpus {
  concepts: Map<string, Concept>;
  /** Alle IDs, die als Datei existieren, auch wenn die Datei kaputt ist */
  ids: Set<string>;
  /** Ziel-ID -> Referenzen, die darauf zeigen (auch auf fehlende Ziele) */
  eingehend: Map<string, Referenz[]>;
}

/**
 * Liest alle Dateien unterhalb der Typ-Ordner. Unterordner werden mit
 * eingelesen, damit der Validator sie melden kann. Dateien und Ordner, die
 * mit einem Punkt beginnen, werden übersprungen.
 */
export function ladeDokumente(root: string, schema: Schema): Dokument[] {
  const dokumente: Dokument[] = [];
  const lauf = (relativ: string): void => {
    for (const name of readdirSync(join(root, relativ)).sort()) {
      if (name.startsWith(".")) continue;
      const rel = `${relativ}/${name}`;
      const abs = join(root, rel);
      if (statSync(abs).isDirectory()) lauf(rel);
      else dokumente.push({ datei: rel, inhalt: readFileSync(abs, "utf8") });
    }
  };
  for (const typ of schema.typen.values()) {
    let existiert = false;
    try {
      existiert = statSync(join(root, typ.ordner)).isDirectory();
    } catch {
      existiert = false;
    }
    if (existiert) lauf(typ.ordner);
  }
  return dokumente;
}

export function berechneEingehend(concepts: Iterable<Concept>): Map<string, Referenz[]> {
  const eingehend = new Map<string, Referenz[]>();
  for (const c of concepts) {
    for (const r of c.ausgehend) {
      const liste = eingehend.get(r.ziel) ?? [];
      liste.push(r);
      eingehend.set(r.ziel, liste);
    }
  }
  return eingehend;
}

/** Serialisierbare Sicht auf den Korpus für --json */
export function korpusAlsJson(korpus: Korpus): unknown {
  return {
    concepts: [...korpus.concepts.values()].map((c) => ({
      id: c.id,
      datei: c.datei,
      typ: c.typ,
      frontmatter: c.daten,
      ausgehend: c.ausgehend.map(({ ziel, quelle, name, zeile }) => ({ ziel, quelle, name, zeile })),
      eingehend: (korpus.eingehend.get(c.id) ?? []).map(({ von, quelle, name }) => ({ von, quelle, name })),
    })),
    fehlende_ziele: [...korpus.eingehend.keys()].filter((z) => !korpus.ids.has(z)).sort(),
  };
}
