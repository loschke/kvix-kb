---
typ: prozess
titel: "Kundenrückmeldung bearbeiten"
authority: canonical
owner: orgeinheiten/kundenmanagement
visibility: internal
status: active
ausloeser: "Neue Rückmeldung eines Mandats-Endkunden im Ticketsystem"
ergebnis: "Beantwortete Rückmeldung, Bewertung und Maßnahme dokumentiert"
beteiligte_rollen:
  - rollen/sachbearbeitung-korrespondenz
  - rollen/teamleitung-korrespondenz
systeme: [systeme/ticketsystem]
quellen:
  - archiv/operations/mitschrift-jour-fixe-2026-10-08.pdf
  - archiv/it/systemlandschaft-2026-09-12.xlsx
last_verified: 2026-10-18
links:
  abhaengig_von: [systeme/ticketsystem]
  belongs_to: [orgeinheiten/operations]
  related_to: [leistungen/korrespondenzbearbeitung]
---

## Ablauf

1. Rückmeldung geht automatisch als Ticket ein und wird nach Mandat und
   Vorgangsart klassifiziert.
2. Sachbearbeitung prüft den zugehörigen Vorgang und erstellt die Antwort.
3. Bei Bewertung "kritisch" übernimmt die Teamleitung vor Versand die Freigabe.
4. Antwort wird versendet, Bewertung und ggf. Maßnahme im Ticket dokumentiert.
5. Der wöchentliche Export speist die Auswertung
   (siehe [[leitfaeden/rueckmeldungsexport-auswerten]]).

## Hinweis aus der Konsolidierung

Dieser Prozess war zuvor nirgends dokumentiert, sondern nur in einer nicht
freigegebenen Jour-Fixe-Mitschrift und gelebter Praxis enthalten. Die
Erstfassung wurde durch den Owner bestätigt.
