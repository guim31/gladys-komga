# Komga

Connect your [Komga](https://komga.org) server (comics, manga, books,
self-hosted) to Gladys: the counts of your libraries, your series in progress
and the books read today, the latest additions with their covers on the
dashboard, and scenes that react when a new series or a new book arrives, or
when you finish a series.

The integration was tested against a real Komga 1.29.1 server (the official
Docker image), not yet in a real Gladys installation: feedback welcome on the
[Gladys forum](https://community.gladysassistant.com) or in the
[issues](https://github.com/guim31/gladys-komga/issues).

## Requirements

- Gladys Assistant 5.1.0 or later.
- A **Komga** server reachable from Gladys: on your network, or on the
  Internet behind a reverse proxy. Tested with Komga 1.29.
- An **API key** of your Komga account (Komga 1.12 and later): in Komga,
  **Account settings** → **API Keys**, create a key and copy it. On an older
  Komga, the e-mail and password of the account work instead. The integration
  sees what this account sees: its libraries, its reading progress.
- An **administrator** account also gives the version of Komga and allows the
  library scans; a reader account works for everything else.

## Setup

1. Install the integration from the Gladys catalog.
2. In **Configuration**, enter the **Server URL** with its port (for example
   `http://192.168.1.20:25600`; behind a reverse proxy,
   `https://example.org/komga`) and the **API key** (or, on an older Komga,
   the **E-mail** and the **Password** of the account).
3. If you wish, choose how often the server is read (every 5 minutes by
   default) and the language of the names.
4. Save, then click **Test the connection**: it shows the version, the
   account (administrator or reader) and the counts it finds.
5. In the **Discovery** tab, add the **Komga** device.

## Device

**Komga** (one device for the server, seen through your account):

| Feature                | Meaning                                           |
| ---------------------- | ------------------------------------------------- |
| **Online**             | 1 while the integration reads the server          |
| **Libraries**          | libraries your account can see                    |
| **Series**             | series of these libraries                         |
| **Books**              | books (volumes, issues) of these libraries        |
| **Series in progress** | series you started and did not finish             |
| **Books read today**   | books you finished today (among the last 20 read) |
| **Version**            | version of Komga (administrator account only)     |

## Dashboard

- **Komga: recently added**: a grid of the last series added, with their
  covers, the date, the library and the number of books, the number of series
  and books, and (administrator account) a **Scan the libraries** button, the
  same as the scene action below.
- **Komga: keep reading**: your books in progress with their covers, the page
  reached and the progress, the number of series in progress and the books
  read today.

## Scenes

### Triggers

- **New series added**: a new series (comic, manga, book) appears in a
  library after a scan. Filter: the library, exactly as shown in Komga.
  Information: series title, library, number of books.
- **New book**: a new book (volume, issue) is added to a series already in
  Komga. Filter: the series you follow, its title exactly as shown in Komga.
  Information: series title, book title, library.
- **Series read to the end**: you finish the last unread book of a series, or
  mark the series as read. Filter: the library. Information: series title,
  library, number of books.

### Actions

- **Scan Komga libraries**: Komga looks for new files in one library (its
  name, any case) or in all of them; it scans in the background, and the new
  series show a few seconds later. Administrator account only. Result: the
  number of libraries scanned.
- **Read the latest Komga additions**: a sentence for a notification or a
  speaker, for example _"2 new series on Komga in the last 7 days: Blue Skies
  and Green Leaf."_ Results: the sentence, the number of new series, the title
  of the latest one (12 series at most).

### Scene ideas

- **New volume of my manga**: when _New book_ with your series, send a
  notification "New volume of {series}: {title}".
- **Sunday digest**: every Sunday at 10 am, _Read the latest Komga additions_,
  then send the sentence as a message.
- **After the download**: every night at 3 am, _Scan Komga libraries_, so the
  files your download tools dropped show up in the morning.

## Troubleshooting

- **"the server does not answer"**: check the address and the port from the
  Gladys machine. Gladys runs the integration in a container: `localhost` is
  the container itself, use the IP address of the machine.
- **"API key or password refused"**: the key was deleted in Komga, or the
  password changed; create a new key.
- **"this account is not an administrator"**: the scan needs an
  administrator account.
- **"no Komga server at this address"** or **"the address redirects"**: a
  server behind a reverse proxy needs its base path
  (`https://example.org/komga`); a login page of the proxy blocks the API.
- **"certificate refused"**: HTTPS with a self-signed certificate is not
  supported; use the `http://` address of your network.
- The integration only logs its lifecycle; with `LOG_LEVEL=debug`, it also
  logs each event, with the titles.

## Limitations

- The server is read every 1 to 15 minutes. The integration also listens to
  the events of Komga (a book or a series added, a reading progress) to read
  it again within seconds; a reverse proxy that buffers these events only
  delays the scenes until the next reading.
- At most 10 events of one kind per reading (a first big scan announces 10
  series, not hundreds). New books older than 24 hours are not announced (a
  Gladys stopped two days does not replay them).
- **Series read to the end** and **Books read today** follow the 20 books
  read last.
- One Komga account and one server per installation of the integration.
- Not affiliated with the Komga project.
