import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ladeDokumente, type Befund, type Dokument } from "../lib/korpus.ts";
import { ladeSchema } from "../lib/schema.ts";
import { validateConcept, validateKorpus } from "../lib/validate.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const FIX = join(import.meta.dirname, "fixtures");
const schema = ladeSchema(join(ROOT, "schema/taxonomie.yaml"));
const gueltig = ladeDokumente(join(FIX, "gueltig"), schema);

function kaputt(fixture: string, ziel: string): Dokument {
  return { datei: ziel, inhalt: readFileSync(join(FIX, "kaputt", fixture), "utf8") };
}

/** Befunde für genau eine eingeschleuste Datei im sonst gültigen Korpus */
function befundeFuer(fixture: string, ziel: string): Befund[] {
  return validateKorpus([...gueltig, kaputt(fixture, ziel)], schema).befunde.filter((b) => b.datei === ziel);
}

const kurz = (b: Befund[]): string[] => b.map((x) => `${x.ebene}:${x.regel}`).sort();

describe("gültiger Fixture-Korpus", () => {
  it("hat keine Befunde", () => {
    const { befunde, korpus } = validateKorpus(gueltig, schema);
    expect(befunde).toEqual([]);
    expect(korpus.concepts.size).toBe(9);
  });

  it("überspringt Wikilinks in Code, löst Aliase und ignoriert archiv/-Links", () => {
    const { korpus } = validateKorpus(gueltig, schema);
    const prozess = korpus.concepts.get("prozesse/antrag-bearbeiten")!;
    expect(prozess.ausgehend.filter((r) => r.quelle === "wikilink").map((r) => r.ziel)).toEqual(["systeme/werkzeug"]);
    const leitfaden = korpus.concepts.get("leitfaeden/anleitung")!;
    expect(leitfaden.ausgehend.filter((r) => r.quelle === "wikilink").map((r) => r.ziel)).toEqual(["regelungen/nutzung"]);
  });

  it("lässt Datumswerte als String (nie Date)", () => {
    const { korpus } = validateKorpus(gueltig, schema);
    const regelung = korpus.concepts.get("regelungen/nutzung")!;
    expect(regelung.daten.last_verified).toBe("2026-09-01");
    expect(regelung.daten.gueltig_ab).toBe("2026-01-01");
  });

  it("sammelt eingehende Referenzen aus Kanten, Feldern und Wikilinks", () => {
    const { korpus } = validateKorpus(gueltig, schema);
    const quellen = new Set((korpus.eingehend.get("systeme/werkzeug") ?? []).map((r) => `${r.quelle}:${r.name}`));
    expect(quellen).toEqual(new Set(["feld:systeme", "wikilink:wikilink", "kante:related_to", "kante:abhaengig_von"]));
  });
});

describe("gezielt kaputte Concepts: jede Datei verletzt genau eine Regel", () => {
  const faelle: [fixture: string, ziel: string, erwartet: string[]][] = [
    ["frontmatter-fehlt.md", "begriffe/a.md", ["fehler:frontmatter-fehlt"]],
    ["frontmatter-ungueltig.md", "begriffe/a.md", ["fehler:frontmatter-ungueltig"]],
    ["pflichtfeld-fehlt.md", "begriffe/a.md", ["fehler:pflichtfeld-fehlt"]],
    ["wert-unzulaessig.md", "begriffe/a.md", ["fehler:wert-unzulaessig"]],
    ["typ-ordner.md", "begriffe/a.md", ["fehler:typ-ordner"]],
    ["typ-unbekannt.md", "begriffe/a.md", ["fehler:typ-unbekannt"]],
    ["datum-format.md", "begriffe/a.md", ["fehler:datum-format"]],
    ["datum-ungueltig.md", "begriffe/a.md", ["fehler:datum-format"]],
    ["derived-ohne-quelle.md", "begriffe/a.md", ["fehler:derived-braucht-quelle"]],
    ["kante-unbekannt.md", "begriffe/a.md", ["fehler:kante-unbekannt"]],
    ["kante-pflicht.md", "leitfaeden/a.md", ["fehler:kante-pflicht"]],
    ["ziel-typ-fehler.md", "begriffe/a.md", ["fehler:ziel-typ"]],
    ["ziel-typ-warnung.md", "regelungen/a.md", ["warnung:ziel-typ"]],
    ["wert-null.md", "regelungen/a.md", ["fehler:wert-null"]],
    ["null-bei-draft-ok.md", "regelungen/a.md", []],
    ["gate-ohne-quelle.md", "regelungen/a.md", ["fehler:gate-pflicht"]],
    ["linkziel-fehlt.md", "begriffe/a.md", ["warnung:linkziel-fehlt", "warnung:linkziel-fehlt", "warnung:linkziel-fehlt"]],
    ["feld-unbekannt.md", "begriffe/a.md", ["warnung:feld-unbekannt"]],
    ["referenz-form.md", "begriffe/a.md", ["fehler:referenz-form"]],
    ["pfad-form.md", "begriffe/a.md", ["fehler:pfad-form"]],
    ["liste-leer.md", "rollen/a.md", ["fehler:liste-leer"]],
    ["unterordner.md", "begriffe/unter/a.md", ["fehler:unterordner"]],
  ];

  it.each(faelle)("%s", (fixture, ziel, erwartet) => {
    expect(kurz(befundeFuer(fixture, ziel))).toEqual([...erwartet].sort());
  });

  it("meldet die richtige Zeile", () => {
    const [wert] = befundeFuer("wert-unzulaessig.md", "begriffe/a.md");
    expect(wert?.zeile).toBe(7); // visibility: geheim
    const links = befundeFuer("linkziel-fehlt.md", "begriffe/a.md");
    expect(links.map((b) => b.zeile)).toEqual([6, 14, 17]); // owner, related_to-Eintrag, Wikilink im Body
    const [kante] = befundeFuer("kante-unbekannt.md", "begriffe/a.md");
    expect(kante?.zeile).toBe(14);
  });

  it("ein kaputtes Concept bleibt als Linkziel existent", () => {
    const korpus = [...gueltig, kaputt("frontmatter-fehlt.md", "begriffe/kaputt.md"), {
      datei: "begriffe/zeiger.md",
      inhalt: readFileSync(join(FIX, "gueltig/begriffe/fachwort.md"), "utf8").replace(
        "related_to: [leistungen/service]",
        "related_to: [begriffe/kaputt]",
      ),
    }];
    const befunde = validateKorpus(korpus, schema).befunde.filter((b) => b.datei === "begriffe/zeiger.md");
    expect(befunde).toEqual([]);
  });
});

describe("validateConcept (Einzelprüfung, z. B. für die Werkbank)", () => {
  const dok = kaputt("linkziel-fehlt.md", "begriffe/a.md");

  it("prüft ohne bekannte IDs keine Linkziele", () => {
    expect(validateConcept(dok, schema)).toEqual([]);
  });

  it("meldet fehlende Ziele gegen eine bekannte ID-Menge", () => {
    const ids = new Set(["rollen/gibt-es-nicht"]);
    expect(kurz(validateConcept(dok, schema, ids))).toEqual(["warnung:linkziel-fehlt", "warnung:linkziel-fehlt"]);
  });
});

describe("Seed-Korpus (Repo-Root)", () => {
  const { befunde, korpus } = validateKorpus(ladeDokumente(ROOT, schema), schema);

  it("ist gültig: keine Fehler, nur Warnungen zu fehlenden Linkzielen", () => {
    expect(korpus.concepts.size).toBe(8);
    expect(befunde.filter((b) => b.ebene === "fehler")).toEqual([]);
    expect(new Set(befunde.map((b) => b.regel))).toEqual(new Set(["linkziel-fehlt"]));
  });

  it("findet genau die zehn fehlenden Linkziele aus docs/PLAN.md (B1)", () => {
    const fehlend = [...korpus.eingehend.keys()].filter((z) => !korpus.ids.has(z)).sort();
    expect(fehlend).toEqual([
      "orgeinheiten/it",
      "orgeinheiten/kundenmanagement",
      "orgeinheiten/kvix",
      "orgeinheiten/personal",
      "prozesse/systemzugang-beantragen",
      "regelungen/mitbestimmung-ki-einsatz",
      "rollen/leitung-kundenmanagement",
      "rollen/leitung-operations",
      "rollen/sachbearbeitung-korrespondenz",
      "rollen/teamleitung-fachsachbearbeitung",
    ]);
  });

  it("findet die gepflanzte Lücke im Feld zugang des Ticketsystems", () => {
    const luecke = befunde.find((b) => b.text.includes("prozesse/systemzugang-beantragen"));
    expect(luecke).toMatchObject({ datei: "systeme/ticketsystem.md", zeile: 9, ebene: "warnung", regel: "linkziel-fehlt" });
    expect(luecke?.text).toContain("Feld zugang");
  });
});

describe("andere Taxonomie (kein hartkodierter Typ)", () => {
  const root = join(FIX, "andere-taxonomie");
  const anderes = ladeSchema(join(root, "schema/taxonomie.yaml"));

  it("liest Typen, Kanten und Profil nur aus der Config", () => {
    expect([...anderes.typen.keys()]).toEqual(["projekt"]);
    expect(anderes.profil.name).toBe("team-raum");
    const { befunde, korpus } = validateKorpus(ladeDokumente(root, anderes), anderes);
    expect(korpus.concepts.size).toBe(2);
    // belongs_to ist in der Kvix-Taxonomie erlaubt, hier nicht
    expect(kurz(befunde)).toEqual(["fehler:kante-unbekannt"]);
  });

  it("lädt keine Kvix-Ordner, wenn die Taxonomie sie nicht kennt", () => {
    expect(ladeDokumente(ROOT, anderes)).toEqual([]);
  });
});
