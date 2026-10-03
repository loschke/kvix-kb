import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { planeIssues, syncIssues, type GhRunner } from "../lib/issues.ts";
import { ladeDokumente, type Dokument } from "../lib/korpus.ts";
import { lintReportMarkdown } from "../lib/lint-report.ts";
import { lintKorpus, type BefundArt, type LintBefund } from "../lib/lint.ts";
import { ladeSchema } from "../lib/schema.ts";
import { validateKorpus } from "../lib/validate.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const schema = ladeSchema(join(ROOT, "schema/taxonomie.yaml"));
const STICHTAG = "2026-10-01";
// Eingefrorener Seed-Stand (Ausgangscommit). Der lebende Korpus im Repo-Root
// ändert sich mit jedem Concept-PR und wird von "npm run validate" geprüft,
// nicht von den Tests.
const SEED = join(import.meta.dirname, "fixtures/seed");

// Pflichtfelder je Typ, damit jedes Test-Concept den Validator passiert
const TYP_DEFAULTS: Record<string, Record<string, unknown>> = {
  regelung: { verbindlichkeit: "verbindlich", gueltig_ab: "2026-01-01", quellen: ["archiv/x.md"] },
  prozess: { ausloeser: "a", ergebnis: "e", beteiligte_rollen: ["rollen/leitung"], systeme: [] },
  leistung: { zielgruppe: "z", ansprechpartner: "rollen/leitung", lebenszyklus: "aktiv" },
  leitfaden: { zweck: "z", vorbedingungen: "v" },
  rolle: { aufgaben: ["a"], kontaktweg: "Funktionspostfach x@beispiel.example", vertretung: "rollen/leitung" },
  orgeinheit: { auftrag: "a", leitung: "rollen/leitung" },
  begriff: { definition: "d", synonyme: [] },
  system: { zweck: "z", zugang: "prozesse/basis", betreiber: "orgeinheiten/bereich", lebenszyklus: "aktiv" },
};

function concept(id: string, felder: Record<string, unknown> = {}, links: Record<string, string[]> = {}, body = ""): Dokument {
  const ordner = id.split("/")[0]!;
  const typ = schema.ordnerZuTyp.get(ordner)!;
  const daten = {
    typ,
    titel: id,
    authority: "canonical",
    owner: "orgeinheiten/bereich",
    visibility: "internal",
    status: "active",
    quellen: [],
    last_verified: "2026-09-01",
    ...TYP_DEFAULTS[typ],
    ...(typ === "regelung" ? { quellen: ["archiv/x.md"] } : {}),
    ...felder,
    links: typ === "regelung" && !links.gilt_fuer ? { gilt_fuer: ["orgeinheiten/bereich"], ...links } : links,
  };
  return { datei: `${id}.md`, inhalt: `---\n${stringify(daten)}---\n${body}\n` };
}

// Grundgerüst: verweist gegenseitig aufeinander, damit keiner Orphan ist
const BASIS = [
  concept("orgeinheiten/bereich", {}, { related_to: ["rollen/leitung", "prozesse/basis"] }),
  concept("rollen/leitung", {}, { belongs_to: ["orgeinheiten/bereich"] }),
  concept("prozesse/basis", {}, { related_to: ["rollen/leitung"] }, "Siehe [[orgeinheiten/bereich]]."),
];

function lint(dokumente: Dokument[], stichtag = STICHTAG): LintBefund[] {
  const { befunde: validierung, korpus } = validateKorpus([...BASIS, ...dokumente], schema);
  const fehler = validierung.filter((b) => b.ebene === "fehler");
  expect(fehler, "Test-Concepts müssen den Validator passieren").toEqual([]);
  return lintKorpus(korpus, schema, stichtag);
}

const von = (b: LintBefund[], art: BefundArt): string[] => b.filter((x) => x.art === art).map((x) => x.concept).sort();

describe("Grundgerüst", () => {
  it("hat keine Befunde", () => {
    expect(lint([])).toEqual([]);
  });
});

describe("Fehlendes Linkziel", () => {
  it("ein Befund je fehlendem Ziel, mit allen Fundstellen", () => {
    const b = lint([
      concept("begriffe/a", {}, { related_to: ["prozesse/fehlt", "prozesse/basis"] }),
      concept("begriffe/b", { owner: "rollen/fehlt-auch" }, { related_to: ["begriffe/a"] }, "Siehe [[prozesse/fehlt]]."),
    ]).filter((x) => x.art === "fehlendes-linkziel");
    expect(b.map((x) => x.concept)).toEqual(["prozesse/fehlt", "rollen/fehlt-auch"]);
    expect(b[0]?.fundstellen.map((f) => f.ort)).toEqual(["Kante related_to", "Wikilink"]);
    expect(b[0]?.titel).toBe("Lint: Fehlendes Linkziel prozesse/fehlt");
  });
});

describe("Orphan", () => {
  it("meldet Concepts ohne eingehenden Verweis; Selbstverweise zählen nicht", () => {
    const b = lint([
      concept("begriffe/allein"),
      concept("begriffe/selbst", {}, { related_to: ["begriffe/selbst"] }),
      concept("begriffe/verlinkt", {}, { related_to: ["prozesse/basis"] }, "[[begriffe/allein]]"),
    ]);
    expect(von(b, "orphan")).toEqual(["begriffe/selbst", "begriffe/verlinkt"]);
  });
});

describe("Ungeprüft (Turnus aus dem Profil)", () => {
  const verlinkt = (id: string, felder: Record<string, unknown>): Dokument[] => [
    concept(id, felder, { related_to: ["prozesse/basis"] }),
    concept(`begriffe/zeiger-${id.replace("/", "-")}`, {}, { related_to: [id] }),
  ];

  it("Regelung: 90 Tage; Grenze genau am Turnus ist noch kein Befund", () => {
    expect(von(lint(verlinkt("regelungen/r", { last_verified: "2026-07-03" })), "ungeprueft")).toEqual([]); // 90 Tage
    expect(von(lint(verlinkt("regelungen/r", { last_verified: "2026-07-02" })), "ungeprueft")).toEqual(["regelungen/r"]); // 91
  });

  it("volatilitaet hoch halbiert den Turnus", () => {
    // Prozess: 180 Tage, mit hoch 90. 2026-06-15 bis 2026-10-01 sind 108 Tage
    expect(von(lint(verlinkt("prozesse/p", { last_verified: "2026-06-15" })), "ungeprueft")).toEqual([]);
    const b = lint(verlinkt("prozesse/p", { last_verified: "2026-06-15", volatilitaet: "hoch" }));
    expect(von(b, "ungeprueft")).toEqual(["prozesse/p"]);
    expect(b.find((x) => x.art === "ungeprueft")?.begruendung).toContain("Turnus 90 Tage");
  });

  it("volatilitaet niedrig verdoppelt den Turnus", () => {
    // Rolle: 365 Tage, mit niedrig 730. 2025-01-01 bis 2026-10-01 sind 638 Tage
    expect(von(lint(verlinkt("rollen/r", { last_verified: "2025-01-01" })), "ungeprueft")).toEqual(["rollen/r"]);
    expect(von(lint(verlinkt("rollen/r", { last_verified: "2025-01-01", volatilitaet: "niedrig" })), "ungeprueft")).toEqual([]);
  });

  it("Begriffe verfallen nicht", () => {
    expect(von(lint(verlinkt("begriffe/alt", { last_verified: "2010-01-01" })), "ungeprueft")).toEqual([]);
  });
});

describe("Signale: abgekündigt (Fälle A1 bis A5 aus docs/PLAN.md)", () => {
  const ziele = [
    // eingestellt, aber noch active (A1, A3)
    concept("systeme/abgeloest", { lebenszyklus: "eingestellt" }, { related_to: ["prozesse/basis"] }),
    // archiviert und ersetzt (A2)
    concept("regelungen/alt", { status: "archived" }),
    concept("regelungen/neu", {}, { ersetzt: ["regelungen/alt"] }),
    // Entwurf (A4)
    concept("regelungen/entwurf", { status: "draft", gueltig_ab: null }),
  ];
  const leitfaden = (id: string, links: Record<string, string[]>): Dokument => concept(id, {}, links);
  const b = lint([
    ...ziele,
    leitfaden("leitfaeden/a1", { abhaengig_von: ["systeme/abgeloest"] }),
    leitfaden("leitfaeden/a2", { abhaengig_von: ["regelungen/alt"] }),
    leitfaden("leitfaeden/a4", { abhaengig_von: ["regelungen/entwurf"] }),
    leitfaden("leitfaeden/a5", { abhaengig_von: ["prozesse/basis"], related_to: ["systeme/abgeloest"], belongs_to: ["regelungen/alt"] }),
  ]);
  const flags = b.filter((x) => x.art === "abhaengigkeit");

  it("A1/A3: Ziel mit lebenszyklus eingestellt flaggt, auch wenn status active", () => {
    const f = flags.find((x) => x.concept === "leitfaeden/a1");
    expect(f?.begruendung).toContain("lebenszyklus: eingestellt");
  });

  it("A2: archiviertes Ziel flaggt und nennt den Nachfolger", () => {
    const f = flags.find((x) => x.concept === "leitfaeden/a2");
    expect(f?.begruendung).toContain("status: archived");
    expect(f?.begruendung).toContain("Nachfolger laut ersetzt: regelungen/neu");
    expect(f?.titel).toBe("Lint: Abhängigkeit prüfen leitfaeden/a2 (Ziel regelungen/alt)");
  });

  it("A4: Entwurf ist nicht abgekündigt", () => {
    expect(flags.find((x) => x.concept === "leitfaeden/a4")).toBeUndefined();
  });

  it("A5: related_to und belongs_to geben nichts weiter", () => {
    expect(flags.find((x) => x.concept === "leitfaeden/a5")).toBeUndefined();
  });

  it("genau zwei Flags insgesamt", () => {
    expect(flags.map((x) => x.concept).sort()).toEqual(["leitfaeden/a1", "leitfaeden/a2"]);
  });
});

describe("Signale: abgelaufen (Fälle B1 bis B5 aus docs/PLAN.md)", () => {
  const b = lint([
    concept("regelungen/b1", { gueltig_bis: "2026-06-30" }),
    concept("regelungen/b2", { gueltig_bis: "2026-06-30", status: "archived" }),
    concept("regelungen/b3", { gueltig_bis: "2026-06-30", status: "draft", gueltig_ab: null }),
    concept("regelungen/b4", { gueltig_bis: STICHTAG }),
    concept("regelungen/b5", { gueltig_ab: "2027-01-01" }),
  ]);

  it("B1 ist abgelaufen, B2 bis B5 nicht", () => {
    expect(von(b, "abgelaufen")).toEqual(["regelungen/b1"]);
  });

  it("B4: gueltig_bis ist der letzte gültige Tag, ab dem Folgetag abgelaufen", () => {
    const morgen = lint([concept("regelungen/b4", { gueltig_bis: STICHTAG })], "2026-10-02");
    expect(von(morgen, "abgelaufen")).toEqual(["regelungen/b4"]);
  });
});

describe("Seed-Korpus (eingefrorener Ausgangsstand)", () => {
  const { korpus } = validateKorpus(ladeDokumente(SEED, schema), schema);

  it("findet genau die zehn fehlenden Linkziele und den Orphan ki-einsatz, sonst nichts", () => {
    const b = lintKorpus(korpus, schema, "2026-10-03");
    expect(b.filter((x) => x.art === "fehlendes-linkziel")).toHaveLength(10);
    expect(von(b, "orphan")).toEqual(["regelungen/ki-einsatz"]);
    expect(b).toHaveLength(11);
  });

  it("enthält die gepflanzte Lücke mit Fundstelle im Feld zugang", () => {
    const b = lintKorpus(korpus, schema, "2026-10-03");
    const luecke = b.find((x) => x.concept === "prozesse/systemzugang-beantragen");
    expect(luecke?.art).toBe("fehlendes-linkziel");
    expect(luecke?.fundstellen).toEqual([{ datei: "systeme/ticketsystem.md", zeile: 9, ort: "Feld zugang" }]);
  });

  it("zeigt mit späterem Stichtag Ungeprüftes, Begriffe ausgenommen", () => {
    const b = lintKorpus(korpus, schema, "2027-12-31");
    const ungeprueft = von(b, "ungeprueft");
    expect(ungeprueft).toHaveLength(7);
    expect(ungeprueft).not.toContain("begriffe/vorgang");
  });

  it("Report enthält die gepflanzte Lücke", () => {
    const md = lintReportMarkdown(lintKorpus(korpus, schema, "2026-10-03"), { stichtag: "2026-10-03", profil: "org-kb", concepts: 8 });
    expect(md).toContain("### prozesse/systemzugang-beantragen");
    expect(md).toContain("[systeme/ticketsystem.md:9](systeme/ticketsystem.md#L9) (Feld zugang)");
  });
});

describe("Issues", () => {
  const befund = (concept: string): LintBefund => ({
    art: "fehlendes-linkziel",
    concept,
    titel: `Lint: Fehlendes Linkziel ${concept}`,
    begruendung: "fehlt",
    fundstellen: [{ datei: "a.md", zeile: 1, ort: "Feld x" }],
  });

  it("legt nur an, was nicht schon offen ist, und nennt erledigte Issues", () => {
    const plan = planeIssues([befund("a/x"), befund("a/y")], [
      { number: 3, title: "Lint: Fehlendes Linkziel a/x" },
      { number: 4, title: "Lint: Orphan a/weg" },
      { number: 5, title: "Etwas anderes" },
    ]);
    expect(plan.anlegen.map((b) => b.concept)).toEqual(["a/y"]);
    expect(plan.vorhanden.map((v) => v.nummer)).toEqual([3]);
    expect(plan.ohneBefund.map((i) => i.number)).toEqual([4]);
  });

  it("ruft gh mit Labels und Text auf; zweiter Lauf legt nichts doppelt an", () => {
    const offen: { number: number; title: string }[] = [];
    const aufrufe: string[][] = [];
    const gh: GhRunner = (args, stdin) => {
      aufrufe.push(args);
      if (args[0] === "issue" && args[1] === "list") return JSON.stringify(offen);
      if (args[0] === "issue" && args[1] === "create") {
        const titel = args[args.indexOf("--title") + 1]!;
        expect(stdin).toContain("**Betroffen:**");
        offen.push({ number: offen.length + 1, title: titel });
        return `https://github.com/x/y/issues/${offen.length}\n`;
      }
      return "";
    };
    const erster = syncIssues([befund("a/x"), befund("a/y")], gh, { stichtag: STICHTAG, trockenlauf: false });
    expect(erster.angelegt.map((a) => a.url)).toEqual(["https://github.com/x/y/issues/1", "https://github.com/x/y/issues/2"]);
    expect(aufrufe.some((a) => a.join(" ").startsWith("label create lint:fehlendes-linkziel"))).toBe(true);
    const create = aufrufe.find((a) => a[1] === "create" && a[0] === "issue")!;
    expect(create).toEqual(expect.arrayContaining(["--label", "lint", "lint:fehlendes-linkziel"]));

    const zweiter = syncIssues([befund("a/x"), befund("a/y")], gh, { stichtag: STICHTAG, trockenlauf: false });
    expect(zweiter.angelegt).toEqual([]);
    expect(zweiter.vorhanden).toHaveLength(2);
  });

  it("Trockenlauf legt nichts an", () => {
    const aufrufe: string[][] = [];
    const gh: GhRunner = (args) => (aufrufe.push(args), args[1] === "list" ? "[]" : "");
    const r = syncIssues([befund("a/x")], gh, { stichtag: STICHTAG, trockenlauf: true });
    expect(r.anlegen).toHaveLength(1);
    expect(aufrufe).toHaveLength(1);
  });
});
