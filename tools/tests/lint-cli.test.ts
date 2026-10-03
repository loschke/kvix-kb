import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { GhRunner } from "../lib/issues.ts";
import { main } from "../lint.ts";

const ROOT = resolve(import.meta.dirname, "../..");

function lauf(argv: string[], env: NodeJS.ProcessEnv = {}, gh?: GhRunner) {
  const out: string[] = [];
  const err: string[] = [];
  const report = join(mkdtempSync(join(tmpdir(), "kvix-lint-")), "lint-report.md");
  const code = main(["--root", ROOT, "--report", report, ...argv], { out: (t) => out.push(t), err: (t) => err.push(t) }, env, gh);
  return { code, out: out.join("\n"), err: err.join("\n"), report: () => readFileSync(report, "utf8") };
}

describe("lint CLI", () => {
  it("Exit 0 mit Befunden, schreibt den Report", () => {
    const r = lauf(["--stichtag", "2026-10-03"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("11 Befunde");
    expect(r.report()).toContain("### prozesse/systemzugang-beantragen");
  });

  it("verlinkt in GitHub Actions auf den geprüften Commit", () => {
    const env = { GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: "loschke/kvix-kb", GITHUB_SHA: "abc123" };
    const r = lauf(["--stichtag", "2026-10-03"], env);
    expect(r.report()).toContain("(https://github.com/loschke/kvix-kb/blob/abc123/systeme/ticketsystem.md#L9)");
  });

  it("Exit 2 bei ungültigem Stichtag", () => {
    expect(lauf(["--stichtag", "03.10.2026"]).code).toBe(2);
  });

  it("--issues --trockenlauf zeigt, was angelegt würde", () => {
    const gh: GhRunner = (args) => (args[1] === "list" ? "[]" : "");
    const r = lauf(["--stichtag", "2026-10-03", "--issues", "--trockenlauf"], {}, gh);
    expect(r.out).toContain("Issues (Trockenlauf): 11 neu, 0 bereits offen");
    expect(r.out).toContain("würde anlegen: Lint: Fehlendes Linkziel prozesse/systemzugang-beantragen");
  });

  it("Exit 1, wenn gh scheitert", () => {
    const gh: GhRunner = () => {
      throw new Error("gh nicht angemeldet");
    };
    const r = lauf(["--issues"], {}, gh);
    expect(r.code).toBe(1);
    expect(r.err).toContain("gh nicht angemeldet");
  });
});
