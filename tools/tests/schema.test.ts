import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ladeSchema, parseSchema, SchemaFehler } from "../lib/schema.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const text = readFileSync(join(ROOT, "schema/taxonomie.yaml"), "utf8");

function probleme(yaml: string): string[] {
  try {
    parseSchema(yaml);
  } catch (e) {
    if (e instanceof SchemaFehler) return e.probleme;
    throw e;
  }
  return [];
}

describe("schema/taxonomie.yaml", () => {
  const schema = ladeSchema(join(ROOT, "schema/taxonomie.yaml"));

  it("enthält die acht Typen mit ihren Ordnern", () => {
    expect(Object.fromEntries([...schema.typen.values()].map((t) => [t.name, t.ordner]))).toEqual({
      regelung: "regelungen",
      prozess: "prozesse",
      leistung: "leistungen",
      leitfaden: "leitfaeden",
      rolle: "rollen",
      orgeinheit: "orgeinheiten",
      begriff: "begriffe",
      system: "systeme",
    });
  });

  it("enthält genau die fünf zulässigen Kanten", () => {
    expect([...schema.kanten.keys()]).toEqual(["belongs_to", "related_to", "gilt_fuer", "ersetzt", "abhaengig_von"]);
    expect(schema.kanten.get("gilt_fuer")?.zielStrenge).toBe("warnung");
  });

  it("trägt Gates und Turnusse als Profil", () => {
    expect(schema.profil.name).toBe("org-kb");
    expect(schema.profil.typGate.get("regelung")).toBe("G3");
    expect(schema.profil.gates.get("G3")?.mindestensEins).toEqual(["quellen"]);
    expect(schema.profil.turnusTage.get("regelung")).toBe(90);
    expect(schema.profil.turnusTage.get("begriff")).toBeNull();
    expect(schema.profil.volatilitaetFaktor.get("hoch")).toBe(0.5);
  });
});

describe("Selbstprüfung der Taxonomie", () => {
  it("meldet einen unbekannten Zieltyp", () => {
    const kaputt = text.replace("ziel: [rolle, orgeinheit]\n    pflicht: true", "ziel: [person]\n    pflicht: true");
    expect(probleme(kaputt).join("\n")).toContain('unbekannter Zieltyp "person"');
  });

  it("meldet einen Typ ohne Gate im aktiven Profil", () => {
    const kaputt = text.replace("      system: G1\n", "");
    expect(probleme(kaputt).join("\n")).toContain("typ_gate.system");
  });

  it("meldet eine unbekannte Kante in den Signalen", () => {
    const kaputt = text.replace("propagiert_ueber: [abhaengig_von]", "propagiert_ueber: [haengt_an]");
    expect(probleme(kaputt).join("\n")).toContain('unbekannte Kante "haengt_an"');
  });

  it("meldet eine unbekannte Feldart", () => {
    const kaputt = text.replace("art: datum\n    pflicht: true", "art: zeitpunkt\n    pflicht: true");
    expect(probleme(kaputt).join("\n")).toContain('unbekannte art "zeitpunkt"');
  });

  it("akzeptiert die echte Taxonomie ohne Probleme", () => {
    expect(probleme(text)).toEqual([]);
  });
});
