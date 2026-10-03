// Markdown-Ausgabe für den Lint: Report-Datei und Issue-Texte.

import { BEFUND_ARTEN, type BefundArt, type Fundstelle, type LintBefund } from "./lint.ts";

export interface LinkBasis {
  /** z. B. https://github.com/loschke/kvix-kb */
  repoUrl: string;
  /** Commit-SHA oder Branch, auf den die Links zeigen */
  ref: string;
  /** Pfadteil vor dem Ref. GitHub: blob (Default), GitLab: -/blob */
  blobPfad?: string;
}

export interface ReportKontext {
  stichtag: string;
  profil: string;
  concepts: number;
  validierung?: { fehler: number; warnungen: number };
  linkBasis?: LinkBasis;
}

const REIHENFOLGE: BefundArt[] = ["fehlendes-linkziel", "abgelaufen", "abhaengigkeit", "ungeprueft", "orphan"];

export function fundstelleAlsLink(f: Fundstelle, basis?: LinkBasis): string {
  const text = `${f.datei}:${f.zeile}`;
  const ziel = basis ? `${basis.repoUrl}/${basis.blobPfad ?? "blob"}/${basis.ref}/${f.datei}#L${f.zeile}` : `${f.datei}#L${f.zeile}`;
  return `[${text}](${ziel}) (${f.ort})`;
}

export function lintReportMarkdown(befunde: LintBefund[], k: ReportKontext): string {
  const z: string[] = [];
  z.push("# Lint-Report", "");
  z.push(`Stichtag **${k.stichtag}** · Profil **${k.profil}** · ${k.concepts} Concepts · **${befunde.length} Befunde**`);
  if (k.validierung) {
    z.push("", `Validierung: ${k.validierung.fehler} Fehler, ${k.validierung.warnungen} Warnungen.`);
  }
  z.push("", "Lint-Befunde sind keine CI-Fehler. Sie zeigen, was in der Wissensbasis gepflegt werden muss.", "");
  z.push("| Befund | Anzahl | Bedeutung |", "|---|---|---|");
  for (const art of REIHENFOLGE) {
    const n = befunde.filter((b) => b.art === art).length;
    z.push(`| ${BEFUND_ARTEN[art].titel} | ${n} | ${BEFUND_ARTEN[art].erklaerung} |`);
  }
  for (const art of REIHENFOLGE) {
    const liste = befunde.filter((b) => b.art === art);
    if (liste.length === 0) continue;
    z.push("", `## ${BEFUND_ARTEN[art].titel} (${liste.length})`);
    for (const b of liste) {
      const ueberschrift = b.titel.replace(`Lint: ${BEFUND_ARTEN[art].titel} `, "");
      z.push("", `### ${ueberschrift}`, "", b.begruendung, "");
      for (const f of b.fundstellen) z.push(`- ${fundstelleAlsLink(f, k.linkBasis)}`);
    }
  }
  return `${z.join("\n")}\n`;
}

export function issueText(b: LintBefund, k: { stichtag: string; linkBasis?: LinkBasis }): string {
  const art = BEFUND_ARTEN[b.art];
  return [
    `**Befund:** ${art.titel}  `,
    `**Betroffen:** \`${b.concept}\``,
    "",
    b.begruendung,
    "",
    "**Fundstellen**",
    "",
    ...b.fundstellen.map((f) => `- ${fundstelleAlsLink(f, k.linkBasis)}`),
    "",
    "---",
    `Automatisch angelegt vom Lint-Lauf (Stichtag ${k.stichtag}). ${art.erklaerung} ` +
      "Ein erneuter Lauf legt für denselben Befund kein zweites Issue an, solange dieses offen ist.",
  ].join("\n");
}
