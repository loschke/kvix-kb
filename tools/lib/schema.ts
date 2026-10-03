// Lädt schema/taxonomie.yaml und prüft die Datei selbst auf Konsistenz.
// Kein Typname, kein Feldname, kein Wert ist hier hartkodiert: Alles, was
// Validator und Lint über Concepts wissen, kommt aus dieser Datei.

import { readFileSync } from "node:fs";
import { parse } from "yaml";

export type FeldArt =
  | "typ"
  | "text"
  | "enum"
  | "datum"
  | "referenz"
  | "referenz_liste"
  | "text_liste"
  | "pfad_liste"
  | "kanten";

const FELD_ARTEN: readonly FeldArt[] = [
  "typ",
  "text",
  "enum",
  "datum",
  "referenz",
  "referenz_liste",
  "text_liste",
  "pfad_liste",
  "kanten",
];

export type Strenge = "fehler" | "warnung";

/** Bedingung der Form { feld: [erlaubte Werte] }; alle Felder müssen passen. */
export type Bedingung = Record<string, unknown[]>;

export interface FeldDef {
  name: string;
  art: FeldArt;
  pflicht: boolean;
  werte?: string[];
  ziel?: string[];
  zielStrenge: Strenge;
  praefix?: string;
  leerErlaubt: boolean;
  nullErlaubtWenn?: Bedingung;
}

export interface KanteDef {
  name: string;
  beschreibung?: string;
  ziel?: string[];
  zielStrenge: Strenge;
}

export interface TypDef {
  name: string;
  ordner: string;
  felder: Map<string, FeldDef>;
  kantenPflicht: string[];
}

export interface Regel {
  id: string;
  beschreibung: string;
  wenn: Bedingung;
  dann: { mindestensEins: string };
}

export interface GateDef {
  name: string;
  beschreibung?: string;
  /** Listenfelder, die bei Concepts dieses Gates nicht leer sein dürfen */
  mindestensEins: string[];
}

export interface Profil {
  name: string;
  beschreibung?: string;
  gates: Map<string, GateDef>;
  typGate: Map<string, string>;
  /** Tage seit last_verified; null = kein Verfall */
  turnusTage: Map<string, number | null>;
  volatilitaetFaktor: Map<string, number>;
}

export interface Signale {
  abgekuendigt: {
    werte: Bedingung;
    propagiertUeber: string[];
    nachfolgerKante?: string;
  };
  abgelaufen: {
    feld: string;
    letzterTagInklusiv: boolean;
    nurWenn: Bedingung;
  };
}

export interface Schema {
  version: number;
  conceptEndung: string;
  typOrdnerFlach: boolean;
  archivPraefix: string;
  basisFelder: Map<string, FeldDef>;
  regeln: Regel[];
  kanten: Map<string, KanteDef>;
  kantenExtensionPraefix?: string;
  typen: Map<string, TypDef>;
  /** Ordnername -> Typname */
  ordnerZuTyp: Map<string, string>;
  signale: Signale;
  profil: Profil;
}

/** Die Taxonomie ist selbst fehlerhaft. Enthält alle gefundenen Probleme. */
export class SchemaFehler extends Error {
  constructor(public readonly probleme: string[]) {
    super(`schema/taxonomie.yaml ist ungültig:\n- ${probleme.join("\n- ")}`);
    this.name = "SchemaFehler";
  }
}

type Roh = Record<string, unknown>;

function istObjekt(x: unknown): x is Roh {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function istStringListe(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((e) => typeof e === "string");
}

export function ladeSchema(pfad: string): Schema {
  return parseSchema(readFileSync(pfad, "utf8"));
}

export function parseSchema(text: string): Schema {
  let roh: unknown;
  try {
    roh = parse(text);
  } catch (e) {
    throw new SchemaFehler([`YAML nicht lesbar: ${(e as Error).message}`]);
  }
  const p: string[] = [];
  if (!istObjekt(roh)) throw new SchemaFehler(["Wurzel ist keine Map"]);

  const ablage = istObjekt(roh.ablage) ? roh.ablage : (p.push("ablage fehlt"), {});

  // Typen zuerst, weil Felder und Kanten auf Typnamen verweisen
  const typen = new Map<string, TypDef>();
  const ordnerZuTyp = new Map<string, string>();
  const typenRoh = istObjekt(roh.typen) ? roh.typen : (p.push("typen fehlt"), {});
  const typNamen = new Set(Object.keys(typenRoh));

  const leseFeld = (name: string, def: unknown, ort: string): FeldDef | undefined => {
    if (!istObjekt(def)) {
      p.push(`${ort}.${name}: keine Map`);
      return undefined;
    }
    const art = def.art as FeldArt;
    if (!FELD_ARTEN.includes(art)) {
      p.push(`${ort}.${name}: unbekannte art "${String(def.art)}"`);
      return undefined;
    }
    const feld: FeldDef = {
      name,
      art,
      pflicht: def.pflicht === true,
      zielStrenge: leseStrenge(def.ziel_strenge, `${ort}.${name}`),
      leerErlaubt: def.leer_erlaubt === true,
    };
    if (art === "enum") {
      if (!istStringListe(def.werte) || def.werte.length === 0) {
        p.push(`${ort}.${name}: enum braucht werte`);
      } else feld.werte = def.werte;
    }
    if (art === "referenz" || art === "referenz_liste") {
      if (def.ziel !== undefined) feld.ziel = leseZiel(def.ziel, `${ort}.${name}`);
    }
    if (art === "pfad_liste") {
      if (typeof def.praefix !== "string") p.push(`${ort}.${name}: pfad_liste braucht praefix`);
      else feld.praefix = def.praefix;
    }
    if (def.null_erlaubt_wenn !== undefined) {
      feld.nullErlaubtWenn = leseBedingung(def.null_erlaubt_wenn, `${ort}.${name}.null_erlaubt_wenn`);
    }
    return feld;
  };

  const leseStrenge = (x: unknown, ort: string): Strenge => {
    if (x === undefined) return "fehler";
    if (x === "fehler" || x === "warnung") return x;
    p.push(`${ort}: ziel_strenge muss fehler oder warnung sein`);
    return "fehler";
  };

  const leseZiel = (x: unknown, ort: string): string[] | undefined => {
    if (!istStringListe(x)) {
      p.push(`${ort}: ziel muss eine Liste von Typnamen sein`);
      return undefined;
    }
    for (const t of x) if (!typNamen.has(t)) p.push(`${ort}: unbekannter Zieltyp "${t}"`);
    return x;
  };

  const leseBedingung = (x: unknown, ort: string): Bedingung => {
    if (!istObjekt(x)) {
      p.push(`${ort}: Bedingung muss eine Map sein`);
      return {};
    }
    const b: Bedingung = {};
    for (const [k, v] of Object.entries(x)) {
      if (!Array.isArray(v)) p.push(`${ort}.${k}: Werte müssen eine Liste sein`);
      else b[k] = v;
    }
    return b;
  };

  // Basisfelder
  const basisFelder = new Map<string, FeldDef>();
  if (!istObjekt(roh.basis_felder)) p.push("basis_felder fehlt");
  else {
    for (const [name, def] of Object.entries(roh.basis_felder)) {
      const f = leseFeld(name, def, "basis_felder");
      if (f) basisFelder.set(name, f);
    }
  }
  const typFelder = [...basisFelder.values()].filter((f) => f.art === "typ");
  if (typFelder.length !== 1) p.push("basis_felder braucht genau ein Feld mit art: typ");
  if (![...basisFelder.values()].some((f) => f.art === "kanten")) {
    p.push("basis_felder braucht ein Feld mit art: kanten");
  }

  for (const [name, def] of Object.entries(typenRoh)) {
    if (!istObjekt(def)) {
      p.push(`typen.${name}: keine Map`);
      continue;
    }
    if (typeof def.ordner !== "string" || def.ordner.includes("/")) {
      p.push(`typen.${name}: ordner fehlt oder enthält "/"`);
      continue;
    }
    if (ordnerZuTyp.has(def.ordner)) p.push(`typen.${name}: ordner "${def.ordner}" doppelt vergeben`);
    ordnerZuTyp.set(def.ordner, name);
    const felder = new Map<string, FeldDef>();
    if (def.felder !== undefined && !istObjekt(def.felder)) p.push(`typen.${name}.felder: keine Map`);
    for (const [fname, fdef] of Object.entries(istObjekt(def.felder) ? def.felder : {})) {
      if (basisFelder.has(fname)) p.push(`typen.${name}.${fname}: überschreibt ein Basisfeld`);
      const f = leseFeld(fname, fdef, `typen.${name}`);
      if (f) felder.set(fname, f);
    }
    const kantenPflicht = def.kanten_pflicht === undefined ? [] : def.kanten_pflicht;
    if (!istStringListe(kantenPflicht)) p.push(`typen.${name}.kanten_pflicht: keine Liste`);
    typen.set(name, {
      name,
      ordner: def.ordner,
      felder,
      kantenPflicht: istStringListe(kantenPflicht) ? kantenPflicht : [],
    });
  }

  // Kanten
  const kanten = new Map<string, KanteDef>();
  if (!istObjekt(roh.kanten)) p.push("kanten fehlt");
  else {
    for (const [name, def] of Object.entries(roh.kanten)) {
      const d = istObjekt(def) ? def : {};
      const kante: KanteDef = {
        name,
        zielStrenge: leseStrenge(d.ziel_strenge, `kanten.${name}`),
      };
      if (typeof d.beschreibung === "string") kante.beschreibung = d.beschreibung;
      if (d.ziel !== undefined) {
        const ziel = leseZiel(d.ziel, `kanten.${name}`);
        if (ziel) kante.ziel = ziel;
      }
      kanten.set(name, kante);
    }
  }
  for (const t of typen.values()) {
    for (const k of t.kantenPflicht) {
      if (!kanten.has(k)) p.push(`typen.${t.name}.kanten_pflicht: unbekannte Kante "${k}"`);
    }
  }

  const alleFeldnamen = new Set([...basisFelder.keys(), ...[...typen.values()].flatMap((t) => [...t.felder.keys()])]);

  // Regeln
  const regeln: Regel[] = [];
  if (roh.regeln !== undefined) {
    if (!Array.isArray(roh.regeln)) p.push("regeln: keine Liste");
    else {
      roh.regeln.forEach((r, i) => {
        const ort = `regeln[${i}]`;
        if (!istObjekt(r) || typeof r.id !== "string" || !istObjekt(r.dann)) {
          p.push(`${ort}: braucht id, wenn und dann`);
          return;
        }
        const me = r.dann.mindestens_eins;
        if (typeof me !== "string" || !alleFeldnamen.has(me)) {
          p.push(`${ort}.dann.mindestens_eins: unbekanntes Feld "${String(me)}"`);
          return;
        }
        regeln.push({
          id: r.id,
          beschreibung: typeof r.beschreibung === "string" ? r.beschreibung : r.id,
          wenn: leseBedingung(r.wenn, `${ort}.wenn`),
          dann: { mindestensEins: me },
        });
      });
    }
  }

  // Signale
  const s = istObjekt(roh.signale) ? roh.signale : (p.push("signale fehlt"), {} as Roh);
  const ab = istObjekt(s.abgekuendigt) ? s.abgekuendigt : (p.push("signale.abgekuendigt fehlt"), {} as Roh);
  const al = istObjekt(s.abgelaufen) ? s.abgelaufen : (p.push("signale.abgelaufen fehlt"), {} as Roh);
  const propagiertUeber = istStringListe(ab.propagiert_ueber) ? ab.propagiert_ueber : [];
  for (const k of propagiertUeber) if (!kanten.has(k)) p.push(`signale.abgekuendigt.propagiert_ueber: unbekannte Kante "${k}"`);
  if (typeof ab.nachfolger_kante === "string" && !kanten.has(ab.nachfolger_kante)) {
    p.push(`signale.abgekuendigt.nachfolger_kante: unbekannte Kante "${ab.nachfolger_kante}"`);
  }
  if (typeof al.feld !== "string" || !alleFeldnamen.has(al.feld)) {
    p.push(`signale.abgelaufen.feld: unbekanntes Feld "${String(al.feld)}"`);
  }
  const signale: Signale = {
    abgekuendigt: {
      werte: leseBedingung(ab.werte, "signale.abgekuendigt.werte"),
      propagiertUeber,
    },
    abgelaufen: {
      feld: typeof al.feld === "string" ? al.feld : "",
      letzterTagInklusiv: al.letzter_tag_inklusiv !== false,
      nurWenn: leseBedingung(al.nur_wenn ?? {}, "signale.abgelaufen.nur_wenn"),
    },
  };
  if (typeof ab.nachfolger_kante === "string") signale.abgekuendigt.nachfolgerKante = ab.nachfolger_kante;

  // Profil
  const profil = leseProfil(roh, typNamen, p);
  for (const g of profil?.gates.values() ?? []) {
    for (const f of g.mindestensEins) {
      if (!alleFeldnamen.has(f)) p.push(`profile: Gate ${g.name}, mindestens_eins: unbekanntes Feld "${f}"`);
    }
  }

  if (p.length > 0) throw new SchemaFehler(p);

  const schema: Schema = {
    version: typeof roh.version === "number" ? roh.version : 0,
    conceptEndung: typeof ablage.concept_endung === "string" ? ablage.concept_endung : ".md",
    typOrdnerFlach: ablage.typ_ordner_flach !== false,
    archivPraefix: typeof ablage.archiv_praefix === "string" ? ablage.archiv_praefix : "archiv/",
    basisFelder,
    regeln,
    kanten,
    typen,
    ordnerZuTyp,
    signale,
    profil: profil!,
  };
  if (typeof roh.kanten_extension_praefix === "string") {
    schema.kantenExtensionPraefix = roh.kanten_extension_praefix;
  }
  return schema;
}

function leseProfil(roh: Roh, typNamen: Set<string>, p: string[]): Profil | undefined {
  const name = roh.aktives_profil;
  if (typeof name !== "string") {
    p.push("aktives_profil fehlt");
    return undefined;
  }
  const alle = istObjekt(roh.profile) ? roh.profile : {};
  const d = alle[name];
  if (!istObjekt(d)) {
    p.push(`profile.${name} fehlt`);
    return undefined;
  }
  const ort = `profile.${name}`;
  const gates = new Map<string, GateDef>();
  for (const [g, gd] of Object.entries(istObjekt(d.gates) ? d.gates : {})) {
    const gg = istObjekt(gd) ? gd : {};
    const me = gg.mindestens_eins ?? [];
    if (!istStringListe(me)) p.push(`${ort}.gates.${g}.mindestens_eins: keine Liste`);
    const gate: GateDef = { name: g, mindestensEins: istStringListe(me) ? me : [] };
    if (typeof gg.beschreibung === "string") gate.beschreibung = gg.beschreibung;
    gates.set(g, gate);
  }
  const typGate = new Map<string, string>();
  const turnusTage = new Map<string, number | null>();
  const tg = istObjekt(d.typ_gate) ? d.typ_gate : {};
  const tt = istObjekt(d.turnus_tage) ? d.turnus_tage : {};
  for (const t of typNamen) {
    const g = tg[t];
    if (typeof g !== "string" || !gates.has(g)) p.push(`${ort}.typ_gate.${t}: fehlt oder unbekanntes Gate`);
    else typGate.set(t, g);
    const n = tt[t];
    if (n === null || (typeof n === "number" && n > 0)) turnusTage.set(t, n);
    else p.push(`${ort}.turnus_tage.${t}: muss positive Zahl oder null sein`);
  }
  for (const t of [...Object.keys(tg), ...Object.keys(tt)]) {
    if (!typNamen.has(t)) p.push(`${ort}: unbekannter Typ "${t}"`);
  }
  const volatilitaetFaktor = new Map<string, number>();
  for (const [k, v] of Object.entries(istObjekt(d.volatilitaet_faktor) ? d.volatilitaet_faktor : {})) {
    if (typeof v !== "number" || v <= 0) p.push(`${ort}.volatilitaet_faktor.${k}: muss positive Zahl sein`);
    else volatilitaetFaktor.set(k, v);
  }
  const profil: Profil = { name, gates, typGate, turnusTage, volatilitaetFaktor };
  if (typeof d.beschreibung === "string") profil.beschreibung = d.beschreibung;
  return profil;
}

/** Alle Felddefinitionen, die für einen Typ gelten (Basis plus typspezifisch). */
export function felderFuer(schema: Schema, typ: string | undefined): Map<string, FeldDef> {
  const t = typ === undefined ? undefined : schema.typen.get(typ);
  return new Map([...schema.basisFelder, ...(t ? t.felder : [])]);
}

/** Prüft, ob ein Frontmatter-Objekt alle Werte einer Bedingung erfüllt. */
export function erfuellt(fm: Record<string, unknown>, b: Bedingung): boolean {
  return Object.entries(b).every(([feld, werte]) => werte.includes(fm[feld]));
}

/** Erfüllt ein Objekt irgendeine der Bedingungs-Zeilen (ODER über Felder)? */
export function erfuelltEinesVon(fm: Record<string, unknown>, b: Bedingung): boolean {
  return Object.entries(b).some(([feld, werte]) => werte.includes(fm[feld]));
}
