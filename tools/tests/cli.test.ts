import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../validate.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const FIX = join(import.meta.dirname, "fixtures");

function lauf(argv: string[], env: NodeJS.ProcessEnv = {}): { code: number; out: string; err: string } {
  const out: string[] = [];
  const err: string[] = [];
  const code = main(argv, { out: (t) => out.push(t), err: (t) => err.push(t) }, env);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("validate CLI", () => {
  it("Exit 0 auf dem Seed-Korpus, mit Hinweis auf fehlende Linkziele", () => {
    const r = lauf(["--root", ROOT]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("0 Fehler");
    expect(r.out).toContain("Fehlende Linkziele: 10 verschiedene");
    expect(r.out).toMatch(/systeme\/ticketsystem\.md:9 +WARNUNG +linkziel-fehlt/);
  });

  it("Exit 1, wenn ein Fehler gefunden wird", () => {
    const r = lauf(["--root", join(FIX, "andere-taxonomie")]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("Ergebnis: ungültig");
  });

  it("Exit 2 bei fehlender oder ungültiger Taxonomie", () => {
    expect(lauf(["--root", FIX]).code).toBe(2);
    expect(lauf(["--unbekannt"]).code).toBe(2);
  });

  it("--json liefert Befunde und Korpus-Modell", () => {
    const r = lauf(["--root", ROOT, "--json"]);
    const j = JSON.parse(r.out);
    expect(j.ok).toBe(true);
    expect(j.zusammenfassung).toMatchObject({ concepts: 8, fehler: 0, profil: "org-kb" });
    expect(j.korpus.fehlende_ziele).toContain("prozesse/systemzugang-beantragen");
    const ticket = j.korpus.concepts.find((c: { id: string }) => c.id === "systeme/ticketsystem");
    expect(ticket.frontmatter.last_verified).toBe("2026-10-14");
  });

  it("schreibt in GitHub Actions Annotationen an die Zeilen", () => {
    const r = lauf(["--root", ROOT], { GITHUB_ACTIONS: "true" });
    expect(r.out).toContain("::warning file=systeme/ticketsystem.md,line=9,title=linkziel-fehlt::");
  });
});
