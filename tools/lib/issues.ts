// Lint-Befunde als Issues in einem Ticketsystem.
//
// Der Kern (planen, abgleichen, anlegen) kennt nur die Schnittstelle
// Ticketsystem. Treiber gibt es für GitHub (gh-CLI) und GitLab (REST-API).
//
// Duplikate: Vor dem Anlegen werden die offenen Issues gelesen. Gibt es ein
// offenes Issue mit gleichem Titel, wird keins angelegt. Der Titel ist je
// Befund stabil (kein Datum, keine Zählung darin).

import { execFileSync } from "node:child_process";
import { issueText, type LinkBasis } from "./lint-report.ts";
import { BEFUND_ARTEN, type LintBefund } from "./lint.ts";

export const LINT_LABEL = { name: "lint", farbe: "BFD4F2", beschreibung: "Automatischer Befund des Lint-Laufs" };

export interface OffenesIssue {
  number: number;
  title: string;
}

export interface Label {
  name: string;
  /** Hex ohne #, z. B. BFD4F2 */
  farbe: string;
  beschreibung: string;
}

/** Was der Lint von einem Ticketsystem braucht. Mehr nicht. */
export interface Ticketsystem {
  /** Alle offenen Issues des Projekts */
  offeneIssues(): OffenesIssue[];
  /** Legt das Label an oder bringt es auf den Stand (idempotent) */
  labelSichern(label: Label): void;
  /** Legt ein Issue an und gibt dessen URL zurück */
  issueAnlegen(titel: string, labels: string[], text: string): string;
}

// --- GitHub ---------------------------------------------------------------

/** Führt gh mit Argumenten aus und gibt stdout zurück. In Tests ersetzbar. */
export type GhRunner = (args: string[], stdin?: string) => string;

export const ghCli: GhRunner = (args, stdin) =>
  execFileSync("gh", args, { encoding: "utf8", input: stdin, stdio: ["pipe", "pipe", "pipe"] });

export function githubTicketsystem(gh: GhRunner = ghCli): Ticketsystem {
  return {
    offeneIssues: () =>
      JSON.parse(gh(["issue", "list", "--state", "open", "--limit", "1000", "--json", "number,title"])) as OffenesIssue[],
    // --force ist idempotent
    labelSichern: (l) => {
      gh(["label", "create", l.name, "--color", l.farbe, "--description", l.beschreibung, "--force"]);
    },
    issueAnlegen: (titel, labels, text) =>
      gh(["issue", "create", "--title", titel, ...labels.flatMap((l) => ["--label", l]), "--body-file", "-"], text).trim(),
  };
}

// --- GitLab ---------------------------------------------------------------

export interface GitlabAntwort {
  status: number;
  body: string;
}

/** Ruft die GitLab-REST-API auf (Pfad relativ zu /api/v4). In Tests ersetzbar. */
export type GitlabApi = (methode: "GET" | "POST" | "PUT", pfad: string, body?: Record<string, unknown>) => GitlabAntwort;

// Läuft in einem Kindprozess, damit der Aufruf synchron bleibt wie bei gh.
// URL, Token und Body kommen über stdin, der Token steht in keiner Prozessliste.
const HTTP_SKRIPT = `
const teile = [];
process.stdin.on("data", (d) => teile.push(d)).on("end", async () => {
  const a = JSON.parse(Buffer.concat(teile).toString("utf8"));
  try {
    const r = await fetch(a.url, {
      method: a.methode,
      headers: { "PRIVATE-TOKEN": a.token, "Content-Type": "application/json" },
      body: a.body === undefined ? undefined : JSON.stringify(a.body),
    });
    process.stdout.write(JSON.stringify({ status: r.status, body: await r.text() }));
  } catch (e) {
    process.stderr.write(String((e && e.cause) || e));
    process.exit(1);
  }
});`;

/** apiUrl z. B. https://vaults.sevenx.cloud/api/v4 (in GitLab CI: CI_API_V4_URL) */
export function gitlabHttp(apiUrl: string, token: string): GitlabApi {
  return (methode, pfad, body) => {
    const stdout = execFileSync(process.execPath, ["-e", HTTP_SKRIPT], {
      encoding: "utf8",
      input: JSON.stringify({ url: `${apiUrl}${pfad}`, methode, token, body }),
      stdio: ["pipe", "pipe", "pipe"],
    });
    return JSON.parse(stdout) as GitlabAntwort;
  };
}

const SEITE = 100;

export function gitlabTicketsystem(api: GitlabApi, projekt: string): Ticketsystem {
  const basis = `/projects/${encodeURIComponent(projekt)}`;
  const ruf = (methode: "GET" | "POST" | "PUT", pfad: string, body?: Record<string, unknown>, erlaubt: number[] = []): GitlabAntwort => {
    const r = api(methode, pfad, body);
    if (r.status >= 400 && !erlaubt.includes(r.status)) {
      throw new Error(`GitLab-API ${methode} ${pfad}: ${r.status} ${r.body.slice(0, 200)}`);
    }
    return r;
  };
  return {
    offeneIssues: () => {
      const alle: OffenesIssue[] = [];
      for (let seite = 1; ; seite++) {
        const r = ruf("GET", `${basis}/issues?state=opened&per_page=${SEITE}&page=${seite}`);
        const teil = JSON.parse(r.body) as { iid: number; title: string }[];
        alle.push(...teil.map((i) => ({ number: i.iid, title: i.title })));
        if (teil.length < SEITE) return alle;
      }
    },
    // Anlegen ist bei GitLab nicht idempotent: 409, wenn es das Label gibt.
    // Dann auf den Stand bringen, wie gh es mit --force tut.
    labelSichern: (l) => {
      const werte = { color: `#${l.farbe}`, description: l.beschreibung };
      const r = ruf("POST", `${basis}/labels`, { name: l.name, ...werte }, [409]);
      if (r.status === 409) ruf("PUT", `${basis}/labels/${encodeURIComponent(l.name)}`, werte);
    },
    issueAnlegen: (titel, labels, text) => {
      const r = ruf("POST", `${basis}/issues`, { title: titel, description: text, labels: labels.join(",") });
      return (JSON.parse(r.body) as { web_url: string }).web_url;
    },
  };
}

// --- Kern -----------------------------------------------------------------

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

/** Ein GhRunner als zweites Argument steht für das GitHub-Ticketsystem. */
export function syncIssues(befunde: LintBefund[], system: Ticketsystem | GhRunner, opt: SyncOptionen): SyncErgebnis {
  const ts = typeof system === "function" ? githubTicketsystem(system) : system;
  const plan = planeIssues(befunde, ts.offeneIssues());
  const ergebnis: SyncErgebnis = { ...plan, angelegt: [] };
  if (opt.trockenlauf || plan.anlegen.length === 0) return ergebnis;

  const arten = new Set(plan.anlegen.map((b) => b.art));
  ts.labelSichern(LINT_LABEL);
  for (const art of arten) {
    const a = BEFUND_ARTEN[art];
    ts.labelSichern({ name: a.label, farbe: a.farbe, beschreibung: a.erklaerung });
  }

  for (const b of plan.anlegen) {
    const textOpt: { stichtag: string; linkBasis?: LinkBasis } = { stichtag: opt.stichtag };
    if (opt.linkBasis) textOpt.linkBasis = opt.linkBasis;
    const url = ts.issueAnlegen(b.titel, [LINT_LABEL.name, BEFUND_ARTEN[b.art].label], issueText(b, textOpt));
    ergebnis.angelegt.push({ titel: b.titel, url });
  }
  return ergebnis;
}
