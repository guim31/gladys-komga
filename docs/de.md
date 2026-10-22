# Komga

Verbinde deinen [Komga](https://komga.org)-Server (Comics, Manga, Bücher,
selbst gehostet) mit Gladys: die Zahlen deiner Bibliotheken, deine laufenden
Serien und die heute gelesenen Bände, die neuesten Zugänge mit ihren Covern
auf dem Dashboard und Szenen, die reagieren, wenn eine neue Serie oder ein
neuer Band ankommt oder du eine Serie beendest.

Die Integration wurde mit einem echten Komga-1.29.1-Server (dem offiziellen
Docker-Image) getestet, noch nicht in einer echten Gladys-Installation:
Rückmeldungen sind im [Gladys-Forum](https://community.gladysassistant.com)
oder in den [Issues](https://github.com/guim31/gladys-komga/issues)
willkommen.

## Voraussetzungen

- Gladys Assistant 5.1.0 oder neuer.
- Ein **Komga**-Server, den Gladys erreicht: in deinem Netzwerk oder im
  Internet hinter einem Reverse Proxy. Getestet mit Komga 1.29.
- Ein **API-Schlüssel** deines Komga-Kontos (ab Komga 1.12): in Komga unter
  **Kontoeinstellungen** → **API-Schlüssel** einen Schlüssel erstellen und
  kopieren. Bei einem älteren Komga gehen stattdessen E-Mail und Passwort des
  Kontos. Die Integration sieht, was dieses Konto sieht: seine Bibliotheken,
  seinen Lesefortschritt.
- Ein **Administrator**-Konto liefert zusätzlich die Version von Komga und
  erlaubt die Bibliotheks-Scans; ein Leserkonto reicht für alles andere.

## Einrichtung

1. Installiere die Integration aus dem Gladys-Katalog.
2. Gib unter **Konfiguration** die **Server-URL** mit Port ein (zum Beispiel
   `http://192.168.1.20:25600`; hinter einem Reverse Proxy
   `https://example.org/komga`) und den **API-Schlüssel** (oder, bei einem
   älteren Komga, **E-Mail** und **Passwort** des Kontos).
3. Wähle bei Bedarf, wie oft der Server gelesen wird (standardmäßig alle 5
   Minuten), und die Sprache der Namen.
4. Speichere und klicke auf **Verbindung testen**: Du siehst die Version, das
   Konto (Administrator oder Leser) und die gefundenen Zahlen.
5. Füge im Tab **Erkennung** das Gerät **Komga** hinzu.

## Gerät

**Komga** (ein Gerät für den Server, aus Sicht deines Kontos):

| Funktion                 | Bedeutung                                             |
| ------------------------ | ----------------------------------------------------- |
| **Online**               | 1, solange die Integration den Server liest           |
| **Bibliotheken**         | Bibliotheken, die dein Konto sieht                    |
| **Serien**               | Serien dieser Bibliotheken                            |
| **Bände**                | Bände (Ausgaben, Hefte) dieser Bibliotheken           |
| **Laufende Serien**      | begonnene, nicht beendete Serien                      |
| **Heute gelesene Bände** | heute beendete Bände (unter den 20 zuletzt gelesenen) |
| **Version**              | Version von Komga (nur mit Administrator-Konto)       |

## Dashboard

- **Komga: neu hinzugefügt**: ein Raster der zuletzt hinzugefügten Serien mit
  Covern, Datum, Bibliothek und Bandanzahl, die Zahl der Serien und Bände und
  (mit Administrator-Konto) ein Knopf **Bibliotheken scannen**, derselbe wie
  die Szenenaktion unten.
- **Komga: weiterlesen**: deine angefangenen Bände mit Covern, erreichter
  Seite und Fortschritt, die Zahl der laufenden Serien und die heute gelesenen
  Bände.

## Szenen

### Auslöser

- **Neue Serie hinzugefügt**: Eine neue Serie (Comic, Manga, Buch) erscheint
  nach einem Scan in einer Bibliothek. Filter: die Bibliothek, genau wie in
  Komga angezeigt. Informationen: Titel der Serie, Bibliothek, Bandanzahl.
- **Neuer Band**: Ein neuer Band (Ausgabe, Heft) kommt zu einer Serie hinzu,
  die schon in Komga ist. Filter: die Serie, der du folgst, ihr Titel genau
  wie in Komga. Informationen: Titel der Serie, Titel des Bandes, Bibliothek.
- **Serie zu Ende gelesen**: Du beendest den letzten ungelesenen Band einer
  Serie oder markierst die Serie als gelesen. Filter: die Bibliothek.
  Informationen: Titel der Serie, Bibliothek, Bandanzahl.

### Aktionen

- **Komga-Bibliotheken scannen**: Komga sucht neue Dateien in einer
  Bibliothek (ihr Name, Groß- und Kleinschreibung egal) oder in allen; der
  Scan läuft im Hintergrund, die neuen Serien erscheinen einige Sekunden
  später. Nur mit Administrator-Konto. Ergebnis: die Zahl der gescannten
  Bibliotheken.
- **Neueste Komga-Zugänge vorlesen**: ein Satz für eine Benachrichtigung oder
  einen Lautsprecher, zum Beispiel _„2 neue Serie(n) auf Komga in den letzten
  7 Tagen: Blue Skies und Green Leaf.“_ Ergebnisse: der Satz, die Zahl der
  neuen Serien, der Titel der neuesten (höchstens 12 Serien).

### Szenen-Ideen

- **Neuer Band meines Mangas**: bei _Neuer Band_ mit deiner Serie die
  Benachrichtigung „Neuer Band von {series}: {title}“ senden.
- **Sonntags-Übersicht**: jeden Sonntag um 10 Uhr _Neueste Komga-Zugänge
  vorlesen_ und den Satz als Nachricht senden.
- **Nach den Downloads**: jede Nacht um 3 Uhr _Komga-Bibliotheken scannen_,
  damit die Dateien deiner Download-Werkzeuge am Morgen da sind.

## Fehlerbehebung

- **„der Server antwortet nicht“**: Prüfe Adresse und Port von der
  Gladys-Maschine aus. Gladys führt die Integration in einem Container aus:
  `localhost` ist der Container selbst, nimm die IP-Adresse der Maschine.
- **„API-Schlüssel oder Passwort abgelehnt“**: Der Schlüssel wurde in Komga
  gelöscht oder das Passwort geändert; erstelle einen neuen Schlüssel.
- **„dieses Konto ist kein Administrator“**: Der Scan braucht ein
  Administrator-Konto.
- **„kein Komga-Server unter dieser Adresse“** oder **„die Adresse leitet
  um“**: Ein Server hinter einem Reverse Proxy braucht seinen Basispfad
  (`https://example.org/komga`); eine Anmeldeseite des Proxys blockiert die
  API.
- **„Zertifikat abgelehnt“**: HTTPS mit selbst signiertem Zertifikat wird
  nicht unterstützt; verwende die `http://`-Adresse in deinem Netzwerk.
- Die Integration protokolliert nur ihren Lebenszyklus; mit
  `LOG_LEVEL=debug` protokolliert sie auch jedes Ereignis mit den Titeln.

## Einschränkungen

- Der Server wird alle 1 bis 15 Minuten gelesen. Die Integration hört auch
  auf die Ereignisse von Komga (ein Band oder eine Serie hinzugefügt, ein
  Lesefortschritt), um ihn innerhalb von Sekunden erneut zu lesen; ein Reverse
  Proxy, der diese Ereignisse zurückhält, verzögert die Szenen nur bis zum
  nächsten Lesen.
- Höchstens 10 Ereignisse einer Art pro Lesen (ein erster großer Scan meldet
  10 Serien, nicht Hunderte). Bände, die vor mehr als 24 Stunden hinzukamen,
  werden nicht gemeldet (ein zwei Tage gestopptes Gladys spielt sie nicht
  nach).
- **Serie zu Ende gelesen** und **Heute gelesene Bände** verfolgen die 20
  zuletzt gelesenen Bände.
- Ein Komga-Konto und ein Server pro Installation der Integration.
- Nicht mit dem Komga-Projekt verbunden.
