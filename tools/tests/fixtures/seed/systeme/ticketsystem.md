---
typ: system
titel: "Ticketsystem"
authority: canonical
owner: orgeinheiten/it
visibility: internal
status: active
zweck: "Erfassung, Bearbeitung und Auswertung von Kundenrückmeldungen inkl. automatischer Wochenexporte"
zugang: prozesse/systemzugang-beantragen
betreiber: orgeinheiten/it
lebenszyklus: aktiv
quellen:
  - archiv/it/systemlandschaft-2026-09-12.xlsx
last_verified: 2026-10-14
links:
  belongs_to: [orgeinheiten/it]
  related_to: [prozesse/kundenrueckmeldung-bearbeiten]
---

## Beschreibung

Zentrales System für Kundenrückmeldungen aller Mandate. Datenhaltung und
Betriebsform gemäß Systemlandschaft (Quelle). Erzeugt den automatischen
Wochenexport, auf dem [[leitfaeden/rueckmeldungsexport-auswerten]] aufsetzt.

## Hinweis

Das Zugangs-Ziel prozesse/systemzugang-beantragen existiert noch nicht als
Concept. Der Lint-Agent führt es als fehlendes Linkziel; dieser bewusst
offene Verweis dient im Beispielkorpus als Demonstration des
Wartungsmechanismus.
