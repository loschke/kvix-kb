# kvix-kb
Demo-Vault und Prototyp der wissen.work-Wissensbasis.
Vollständiger Auftrag: docs/BRIEFING.md (immer zuerst lesen).
Bauplan und Entscheidungen: docs/PLAN.md. Regeln für Concept-Änderungen: AGENTS.md.

## Regeln
- Deutsch in Commits, Doku, Issues
- Plan vor Umsetzung, kleine Commits, bei Unklarheit fragen statt raten
- Die gepflanzte Lücke (prozesse/systemzugang-beantragen) niemals reparieren
- Die 8 Seed-Concepts nicht verändern; Befunde melden statt fixen

## Bestandsbausteine für die Vorab-Prüfung (read-only)
- build.jetzt-Projekt (Mastra, vereinfachtes Wissensmanagement): `C:\Users\losch\Projekte\loschke-hub\build-jetzt-superagents`
  (Kern: `apps/agents/src/mastra/workflows/wissen.ts`, `packages/shared/src/wissenskarte.ts`, `docs/adr/0043-wissen-aus-quellen.md`)
- GitHub-Knowledge-MCP: `C:\Users\losch\Projekte\loschke-hub\mcp-hub`, Provider `github-kb` (`src/providers/github-kb/`, live unter mcp.loschke.ai)
- Bewertung beider Bausteine: docs/PLAN.md, Abschnitt 1

## Kvix-Fallakte (read-only, nur kopieren)
- Rohdokumente als Markdown: `C:\Users\losch\Projekte\loschke-hub\lernen-diy\public\planspiel\kvix\*.md`
- Dieselben als JSON: `C:\Users\losch\Projekte\loschke-hub\lernen-diy\src\content\fallakte\kvix\`
- `kvix-personenregister` nie kopieren (die KB führt keine Personen)
