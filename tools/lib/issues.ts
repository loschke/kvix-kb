// Lint-Befunde als GitHub-Issues über die gh-CLI.
//
// Duplikate: Vor dem Anlegen werden die offenen Issues gelesen. Gibt es ein
// offenes Issue mit gleichem Titel, wird keins angelegt. Der Titel ist je
// Befund stabil (kein Datum, keine Zählung darin).

import { execFileSync } from "node:child_process";
import { issueText, type LinkBasis } from "./lint-report.ts";
import { BEFUND_ARTEN, type LintBefund } from "./lint.ts";

/** Führt gh mit Argumenten aus und gibt stdout zurück. In Tests ersetzbar. */
export type GhRunner = (args: string[], stdin?: string) => string;

export const ghCli: GhRunner = (args, stdin) =>
  execFileSync("gh", args, { encoding: "utf8", input: stdin, stdio: ["pipe", "pipe", "pipe"] });

export const LINT_LABEL = { name: "lint", farbe: "BFD4F2", beschreibung: "Automatischer Befund des Lint-Laufs" };

export interface OffenesIssue {
  number: number;
  title: string;
}

export interface IssuePlan {
  anlegen: LintBefund[];
  vorhanden: { befund: LintBefund; nummer: number }[];
  /** Offene Lint-Issues, zu denen es keinen aktuellen Befund mehr gibt */
  ohneBefund: OffenesIssue[];
}

export function planeIssues(befunde: LintBefund[], offen: OffenesIssue[]): IssuePlan {
  const nachTitel = new Map(offen.map((i) => [i.title, i.number]));
  const aktuelleTitel = new Set(befunde.map((b) => b.titel));
  const plan: IssuePlan = { anlegen: [], vorhanden: [], ohneBefund: [] };
  for (const b of befunde) {
    const nr = nachTitel.get(b.titel);
    if (nr === undefined) plan.anlegen.push(b);
    else plan.vorhanden.push({ befund: b, nummer: nr });
  }
  plan.ohneBefund = offen.filter((i) => i.title.startsWith("Lint: ") && !aktuelleTitel.has(i.title));
  return plan;
}

export interface SyncOptionen {
  stichtag: string;
  linkBasis?: LinkBasis;
  /** Nur planen, nichts anlegen */
  trockenlauf: boolean;
}

export interface SyncErgebnis extends IssuePlan {
  angelegt: { titel: string; url: string }[];
}

export function syncIssues(befunde: LintBefund[], gh: GhRunner, opt: SyncOptionen): SyncErgebnis {
  const offen = JSON.parse(
    gh(["issue", "list", "--state", "open", "--limit", "1000", "--json", "number,title"]),
  ) as OffenesIssue[];
  const plan = planeIssues(befunde, offen);
  const ergebnis: SyncErgebnis = { ...plan, angelegt: [] };
  if (opt.trockenlauf || plan.anlegen.length === 0) return ergebnis;

  // Labels anlegen bzw. aktualisieren (--force ist idempotent)
  const arten = new Set(plan.anlegen.map((b) => b.art));
  gh(["label", "create", LINT_LABEL.name, "--color", LINT_LABEL.farbe, "--description", LINT_LABEL.beschreibung, "--force"]);
  for (const art of arten) {
    const a = BEFUND_ARTEN[art];
    gh(["label", "create", a.label, "--color", a.farbe, "--description", a.erklaerung, "--force"]);
  }

  for (const b of plan.anlegen) {
    const textOpt: { stichtag: string; linkBasis?: LinkBasis } = { stichtag: opt.stichtag };
    if (opt.linkBasis) textOpt.linkBasis = opt.linkBasis;
    const url = gh(
      ["issue", "create", "--title", b.titel, "--label", LINT_LABEL.name, "--label", BEFUND_ARTEN[b.art].label, "--body-file", "-"],
      issueText(b, textOpt),
    ).trim();
    ergebnis.angelegt.push({ titel: b.titel, url });
  }
  return ergebnis;
}
