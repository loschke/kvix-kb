# GitLab Runner einrichten

Stand 03.10.2026 · gehört zu Issue #17 · GitLab: `https://vaults.sevenx.cloud` (Coolify-Service `vaults-gitlab`)

Ohne Runner laufen auf GitLab keine Pipelines. Der Runner ist ein eigener Container auf demselben Hetzner-Host. Er startet für jeden Job einen frischen `node:22`-Container.

## Aufbau

| Punkt | Wert | Warum |
|---|---|---|
| Art | Instance-Runner | Gilt für alle Projekte der Instanz. Das Projekt kvix-kb gibt es auf GitLab noch nicht |
| Executor | Docker, Standard-Image `node:22` | Gleiche Laufzeit wie in GitHub Actions |
| Gleichzeitige Jobs | 1 (Standardwert des Runners, nicht gesondert gesetzt) | Der Host trägt auch GitLab und Coolify |
| Anmeldung | Selbst beim ersten Start, aus `RUNNER_TOKEN` | Der Token liegt nur in Coolify, nie im Repo oder im Chat |
| Konfiguration | Volume `runner-config` | Überlebt Neustarts und neue Deployments |

Die Compose-Datei liegt unter `infra/gitlab-runner/docker-compose.yml`.

## Schritte

**1. Token in GitLab erzeugen**

Admin → CI/CD → Runners → „Create instance runner".
„Run untagged jobs" anhaken, Tags leer lassen, Beschreibung `kvix-hetzner`. Erstellen.
GitLab zeigt den Token (`glrt-…`) genau einmal. Kopieren, Seite offen lassen.

**2. Service in Coolify anlegen**

Projekt wählen → „+ New" → „Docker Compose Empty".
Inhalt von `infra/gitlab-runner/docker-compose.yml` einfügen, Name `vaults-gitlab-runner`. Keine Domain vergeben, der Runner hat keine Weboberfläche.

**3. Token setzen und starten**

Im Service unter „Environment Variables": `RUNNER_TOKEN` mit dem kopierten Wert anlegen. Dann „Deploy".

**4. Prüfen**

- Coolify-Log des Service: `Runner registered successfully`, danach `Configuration loaded`.
- GitLab → Admin → CI/CD → Runners: `kvix-hetzner` steht auf „Online" (grüner Punkt).

## Wenn etwas hakt

| Zeichen | Ursache | Abhilfe |
|---|---|---|
| Log: `Verifying runner... is not valid` | Token falsch oder abgeschnitten | `RUNNER_TOKEN` neu setzen, neu deployen |
| Runner bleibt „Never contacted" | Container läuft nicht | Coolify-Log lesen |
| Token wurde in GitLab neu erzeugt | Die alte Anmeldung liegt noch im Volume | Volume `runner-config` des Service löschen, `RUNNER_TOKEN` neu setzen, deployen |
| Job scheitert später beim Klonen | Job-Container erreicht `vaults.sevenx.cloud` nicht | Melden. Dann bekommt der Runner das Docker-Netz von GitLab |

## Geprüft und nicht geprüft

Geprüft am 03.10.2026: Die Compose-Datei ist syntaktisch gültig. Der Anmeldebefehl läuft mit Runner 19.4.1 gegen `vaults.sevenx.cloud` und wird mit einem Platzhalter-Token wie erwartet abgelehnt. Befehl und Adresse stimmen also.

Nicht geprüft: die Anmeldung mit echtem Token und ein echter Job. Das zeigt erst Schritt 4 und danach die erste Pipeline.

## Sicherheit

Der Runner bekommt den Docker-Socket des Hosts. Wer auf dieser GitLab-Instanz Pipelines ändern darf, kann damit auf den Host zugreifen. Tragbar, solange die Registrierung zu ist und nur Rico Projekte anlegt. Sobald weitere Personen Zugang bekommen, gehört der Runner auf einen eigenen Server.

Images laufen mit `latest`, passend zu GitLab CE (`gitlab/gitlab-ce:latest`). GitLab und Runner zusammen aktualisieren.
