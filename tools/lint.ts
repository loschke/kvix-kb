// Lint-Lauf über den Concept-Korpus.
//
//   npm run lint                               Report nach lint-report.md
//   npm run lint -- --stichtag 2026-12-31      anderer Stichtag (Default: heute)
//   npm run lint -- --issues                   zusätzlich GitHub-Issues anlegen
//   npm run lint -- --issues --trockenlauf     nur zeigen, was angelegt würde
//
// Exit-Codes: 0 = Lauf durchgeführt (Befunde sind keine Fehler),
//             1 = Issues konnten nicht angelegt werden,
//             2 = Taxonomie ungültig oder Aufruf falsch

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ghCli, syncIssues, type GhRunner } from "./lib/issues.ts";
import { ladeDokumente } from "./lib/korpus.ts";
import { lintReportMarkdown, type LinkBasis, type ReportKontext } from "./lib/lint-report.ts";
import { BEFUND_ARTEN, heute, lintKorpus } from "./lib/lint.ts";
import { zaehle } from "./lib/report.ts";
import { ladeSchema, SchemaFehler, type Schema } from "./lib/schema.ts";
import { istGueltigesDatum, validateKorpus } from "./lib/validate.ts";

export interface Ausgabe {
  out: (text: string) => void;
  err: (text: string) => void;
}

const HILFE = `Aufruf: npm run lint -- [Optionen]

  --stichtag <YYYY-MM-DD>  Bezugsdatum für Turnus und Gültigkeit (Default: heute)
  --report <datei>         Report-Datei (Default: lint-report.md)
  --json                   Befunde zusätzlich als JSON auf stdout
  --issues                 je Befund ein GitHub-Issue anlegen (ohne Duplikate)
  --trockenlauf            mit --issues: nur zeigen, was angelegt würde
  --root <dir>             Wurzel des Korpus (Default: aktuelles Verzeichnis)
  --schema <datei>         Taxonomie (Default: <root>/schema/taxonomie.yaml)`;

export function main(
  argv: string[],
  aus: Ausgabe = konsole,
  env: NodeJS.ProcessEnv = process.env,
  gh: GhRunner = ghCli,
): number {
  let root = process.cwd();
  let schemaPfad: string | undefined;
  let stichtag = heute();
  let reportPfad = "lint-report.md";
  let json = false;
  let issues = false;
  let trockenlauf = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const wert = argv[i + 1];
    if (a === "--root" && wert) (root = resolve(wert)), i++;
    else if (a === "--schema" && wert) (schemaPfad = resolve(wert)), i++;
    else if (a === "--stichtag" && wert) (stichtag = wert), i++;
    else if (a === "--report" && wert) (reportPfad = wert), i++;
    else if (a === "--json") json = true;
    else if (a === "--issues") issues = true;
    else if (a === "--trockenlauf") trockenlauf = true;
    else if (a === "--help" || a === "-h") {
      aus.out(HILFE);
      return 0;
    } else {
      aus.err(`Unbekannte Option: ${a}\n\n${HILFE}`);
      return 2;
    }
  }
  if (!istGueltigesDatum(stichtag)) {
    aus.err(`--stichtag "${stichtag}" ist kein Datum im Format YYYY-MM-DD`);
    return 2;
  }

  let schema: Schema;
  try {
    schema = ladeSchema(schemaPfad ?? join(root, "schema", "taxonomie.yaml"));
  } catch (e) {
    aus.err(e instanceof SchemaFehler ? e.message : `Taxonomie nicht ladbar: ${(e as Error).message}`);
    return 2;
  }

  const { befunde: validierung, korpus } = validateKorpus(ladeDokumente(root, schema), schema);
  const befunde = lintKorpus(korpus, schema, stichtag);

  const kontext: ReportKontext = {
    stichtag,
    profil: schema.profil.name,
    concepts: korpus.concepts.size,
    validierung: zaehle(validierung),
  };
  const linkBasis = linkBasisAusEnv(env);
  if (linkBasis) kontext.linkBasis = linkBasis;

  const report = lintReportMarkdown(befunde, kontext);
  writeFileSync(resolve(root, reportPfad), report, "utf8");

  if (json) aus.out(JSON.stringify({ stichtag, befunde }, null, 2));
  else {
    aus.out(`Lint: ${korpus.concepts.size} Concepts, ${befunde.length} Befunde (Stichtag ${stichtag}, Profil ${schema.profil.name})`);
    for (const art of Object.keys(BEFUND_ARTEN) as (keyof typeof BEFUND_ARTEN)[]) {
      const liste = befunde.filter((b) => b.art === art);
      if (liste.length === 0) continue;
      aus.out(`\n${BEFUND_ARTEN[art].titel} (${liste.length})`);
      for (const b of liste) aus.out(`  ${b.concept}: ${b.begruendung}`);
    }
    aus.out(`\nReport: ${reportPfad}`);
  }

  if (!issues) return 0;
  try {
    const opt: { stichtag: string; trockenlauf: boolean; linkBasis?: LinkBasis } = { stichtag, trockenlauf };
    if (linkBasis) opt.linkBasis = linkBasis;
    const r = syncIssues(befunde, gh, opt);
    const log = json ? aus.err : aus.out;
    log(`\nIssues${trockenlauf ? " (Trockenlauf)" : ""}: ${r.anlegen.length} neu, ${r.vorhanden.length} bereits offen`);
    for (const b of r.anlegen) {
      const url = r.angelegt.find((a) => a.titel === b.titel)?.url;
      log(`  ${trockenlauf ? "würde anlegen" : "angelegt"}: ${b.titel}${url ? `  ${url}` : ""}`);
    }
    for (const v of r.vorhanden) log(`  offen: #${v.nummer} ${v.befund.titel}`);
    for (const o of r.ohneBefund) log(`  ohne aktuellen Befund (bitte prüfen und schließen): #${o.number} ${o.title}`);
    return 0;
  } catch (e) {
    aus.err(`Issues konnten nicht angelegt werden: ${(e as Error).message}`);
    return 1;
  }
}

/** In GitHub Actions zeigen Links im Report auf den geprüften Commit. */
function linkBasisAusEnv(env: NodeJS.ProcessEnv): LinkBasis | undefined {
  const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repo, GITHUB_SHA: sha } = env;
  if (server && repo && sha) return { repoUrl: `${server}/${repo}`, ref: sha };
  return undefined;
}

const konsole: Ausgabe = {
  out: (t) => console.log(t),
  err: (t) => console.error(t),
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
