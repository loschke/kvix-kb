// Ausgabeformate für Befunde: Text für Menschen, Annotationen für GitHub.

import type { Befund } from "./korpus.ts";

const EBENE_TEXT = { fehler: "FEHLER ", warnung: "WARNUNG" } as const;

export function zaehle(befunde: Befund[]): { fehler: number; warnungen: number } {
  return {
    fehler: befunde.filter((b) => b.ebene === "fehler").length,
    warnungen: befunde.filter((b) => b.ebene === "warnung").length,
  };
}

/** Eine Zeile je Befund: datei:zeile  EBENE  regel  Text */
export function alsText(befunde: Befund[]): string {
  if (befunde.length === 0) return "";
  const breite = Math.max(...befunde.map((b) => `${b.datei}:${b.zeile}`.length));
  const regelBreite = Math.max(...befunde.map((b) => b.regel.length));
  return befunde
    .map((b) => {
      const ort = `${b.datei}:${b.zeile}`.padEnd(breite);
      return `${ort}  ${EBENE_TEXT[b.ebene]}  ${b.regel.padEnd(regelBreite)}  ${b.text}`;
    })
    .join("\n");
}

/** GitHub-Actions-Workflow-Kommandos; erscheinen als Anmerkung an der Zeile im PR. */
export function alsGithubAnnotationen(befunde: Befund[]): string {
  const esc = (s: string): string => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  const escProp = (s: string): string => esc(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
  return befunde
    .map((b) => {
      const art = b.ebene === "fehler" ? "error" : "warning";
      return `::${art} file=${escProp(b.datei)},line=${b.zeile},title=${escProp(b.regel)}::${esc(b.text)}`;
    })
    .join("\n");
}
