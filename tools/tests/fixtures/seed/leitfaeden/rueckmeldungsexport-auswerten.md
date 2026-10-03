---
typ: leitfaden
titel: "Wöchentlichen Rückmeldungsexport auswerten"
authority: canonical
owner: orgeinheiten/kundenmanagement
visibility: internal
status: active
zweck: "Den automatischen Ticketsystem-Export in die Wochenauswertung überführen"
vorbedingungen: "Zugriff auf das Reporting des Ticketsystems"
quellen:
  - archiv/ticketsystem/export-kundenrueckmeldungen-2026-09-26.csv
last_verified: 2026-10-18
links:
  abhaengig_von: [systeme/ticketsystem, prozesse/kundenrueckmeldung-bearbeiten]
  belongs_to: [orgeinheiten/kundenmanagement]
---

## Schritte

1. Export der letzten Kalenderwoche aus dem Ticketsystem-Reporting laden.
2. Rückmeldungen nach Mandat und Bewertung gruppieren.
3. Kritische Bewertungen mit Freitext einzeln sichten und der Teamleitung melden.
4. Kennzahlen (Anzahl, Anteil kritisch, Antwortzeit) in die Wochenauswertung
   übernehmen.

## Hinweis

Ändert sich das Exportformat des Ticketsystems, muss dieser Leitfaden
geprüft werden (abhaengig_von greift, der Staleness-Agent flaggt automatisch).
