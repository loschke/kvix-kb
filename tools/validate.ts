// Validator für den Concept-Korpus.
//
//   npm run validate                 Report für Menschen
//   npm run validate -- --json       maschinenlesbar, inkl. Korpus-Modell
//   npm run validate -- --root <dir> anderen Korpus prüfen (Tests, Werkbank-Export)
//
// Exit-Codes: 0 = keine Fehler (Warnungen möglich), 1 = Fehler,
//             2 = Taxonomie ungültig oder Aufruf falsch

import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { korpusAlsJson, ladeDokumente } from "./lib/korpus.ts";
import { alsGithubAnnotationen, alsText, zaehle } from "./lib/report.ts";
import { ladeSchema, SchemaFehler, type Schema } from "./lib/schema.ts";
import { validateKorpus } from "./lib/validate.ts";

export interface Ausgabe {
  out: (text: string) => void;
  err: (text: string) => void;
}

const HILFE = `Aufruf: npm run validate -- [--json] [--root <verzeichnis>] [--schema <datei>]

  --json            Ergebnis als JSON (Befunde und Korpus-Modell)
  --root <dir>      Wurzel des Korpus (Default: aktuelles Verzeichnis)
  --schema <datei>  Taxonomie (Default: <root>/schema/taxonomie.yaml)`;

export function main(argv: string[], aus: Ausgabe = konsole, env: NodeJS.ProcessEnv = process.env): number {
  let json = false;
  let root = process.cwd();
  let schemaPfad: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") json = true;
    else if (a === "--root" && argv[i + 1]) root = resolve(argv[++i]!);
    else if (a === "--schema" && argv[i + 1]) schemaPfad = resolve(argv[++i]!);
    else if (a === "--help" || a === "-h") {
      aus.out(HILFE);
      return 0;
    } else {
      aus.err(`Unbekannte Option: ${a}\n\n${HILFE}`);
      return 2;
    }
  }

  let schema: Schema;
  try {
    schema = ladeSchema(schemaPfad ?? join(root, "schema", "taxonomie.yaml"));
  } catch (e) {
    aus.err(e instanceof SchemaFehler ? e.message : `Taxonomie nicht ladbar: ${(e as Error).message}`);
    return 2;
  }

  const { befunde, korpus } = validateKorpus(ladeDokumente(root, schema), schema);
  const { fehler, warnungen } = zaehle(befunde);
  const exitCode = fehler > 0 ? 1 : 0;

  if (json) {
    aus.out(JSON.stringify({
      ok: fehler === 0,
      zusammenfassung: { concepts: korpus.concepts.size, fehler, warnungen, profil: schema.profil.name },
      befunde,
      korpus: korpusAlsJson(korpus),
    }, null, 2));
    return exitCode;
  }

  if (env.GITHUB_ACTIONS === "true" && befunde.length > 0) aus.out(alsGithubAnnotationen(befunde));
  aus.out(`Validierung: ${korpus.concepts.size} Concepts, ${fehler} Fehler, ${warnungen} Warnungen (Profil ${schema.profil.name})`);
  const fehlendeZiele = [...korpus.eingehend.keys()].filter((z) => !korpus.ids.has(z));
  if (fehlendeZiele.length > 0) {
    aus.out(`Fehlende Linkziele: ${fehlendeZiele.length} verschiedene (${fehlendeZiele.sort().join(", ")})`);
  }
  if (befunde.length > 0) aus.out(`\n${alsText(befunde)}`);
  if (warnungen > 0 && fehler === 0) {
    aus.out(`\nWarnungen brechen die Validierung nicht. Fehlende Linkziele verfolgt der Lint (npm run lint).`);
  }
  aus.out(exitCode === 0 ? `\nErgebnis: gültig` : `\nErgebnis: ungültig, ${fehler} Fehler`);
  return exitCode;
}

const konsole: Ausgabe = {
  out: (t) => console.log(t),
  err: (t) => console.error(t),
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
