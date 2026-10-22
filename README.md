# Komga for Gladys Assistant

External integration connecting a [Komga](https://komga.org) server
(self-hosted media server for comics, manga and books) to
[Gladys Assistant](https://gladysassistant.com), built on the official
[JavaScript SDK](https://github.com/GladysAssistant/integration-sdk-js) and the
[integration template](https://github.com/GladysAssistant/integration-template-js).

## Features

| Surface           | What you get                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Komga device      | Online, libraries, series, books, series in progress, books read today, version (admin account)                            |
| Scene triggers    | `series_added` (filter: library), `book_added` (a new book of an existing series; filter: series), `series_finished`       |
| Scene actions     | `scan_library` (one library or all, admin account), `read_latest_additions` (the series of the last 7 days as a sentence)  |
| Dashboard widgets | `recently_added` (cover grid, series and book counts, "Scan the libraries" button), `continue_reading` (books in progress) |

Texts and documentation in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- A Komga server (tested with 1.29.1) reachable from Gladys, on the local
  network or behind a reverse proxy, and an **API key** of a Komga account
  (Account settings → API Keys, Komga 1.12 and later). Older servers: the
  e-mail and password of the account. An administrator account adds the
  version and the library scans.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-komga`
   (or install **Komga** from the catalog once it is listed).
2. In **Configuration**, enter the address of your server
   (`http://192.168.1.20:25600`, or `https://example.org/komga` behind a
   reverse proxy) and the API key. Save, then click **Test the connection**.
3. Open the **Discover** tab and add the **Komga** device.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- REST API of Komga, every request authenticated by the `X-API-Key` header
  (or HTTP Basic). `GET /api/v2/users/me` tells whether the account is an
  administrator.
- One reading every 1 to 15 minutes (5 by default), on a timer of the
  container (`should_poll: false`): libraries, new series, latest books,
  series in progress, books in progress and books read last (sorted by read
  date), and hourly the version (`/actuator/info`, admin). About seven light
  requests.
- The Server-Sent Events of Komga (`/sse/v1/events`: `SeriesAdded`,
  `BookAdded`, `ReadProgressChanged`…) only bring the next reading forward, 5
  seconds after a burst: the readings stay the source of truth.
- Scene events come from cursors kept in `/data` (newest creation or reading
  time, with the ids of that second, since Komga dates have one-second
  precision): announced once, also across restarts; the first reading of a
  server is the starting point. A book whose series is new is announced as a
  new series, not as a new book.
- The covers of the widgets are the thumbnails of Komga, served through the
  widget image proxy of Gladys: the browser never sees the server nor the key.
- Transport badge: `local` for a private address, `cloud` for a server reached
  over the Internet.
- Quiet logs: the lifecycle and the errors at info, once; titles only at
  debug.

## Checked against a real server

The client, the parsers and the scenarios were checked against **Komga
1.29.1** (the official image `gotson/komga`) with generated CBZ files: the
answers in `test/fixtures/komga/` are real (event stream included), and the
integration ran in its locked-down container (read-only, no capabilities,
256 MB) against that server: new series and new book after a scan, books read
to the end, a reader account, a refused key, the e-mail and password. It has
not yet run in a real Gladys installation: feedback welcome.

## Limitations

- "Series read to the end" and "Books read today" follow the 20 books read
  last.
- No reading control, no metadata editing: the integration only reads, and
  asks for scans.
- One server and one Komga account per installation of the integration.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against a fake Komga server built from real answers
(`test/fixtures/komga/`) and the fake Gladys of the SDK; they never touch the
network. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Komga](https://github.com/gotson/komga) (MIT) by Gauthier Roebroeck and
  contributors; its REST API was read to choose the routes. No code was copied
  from it. The logo of the cover is the official Komga logo,
  `komga-webui/src/assets/logo.svg` of that repository (MIT).
- Built on the official
  [integration template](https://github.com/GladysAssistant/integration-template-js)
  and [SDK](https://github.com/GladysAssistant/integration-sdk-js), after
  [gladys-kavita](https://github.com/guim31/gladys-kavita), whose
  architecture, widgets and scenes it mirrors.

## Disclaimer

Not affiliated with, nor endorsed by, the Komga project.

## License

[Apache-2.0](LICENSE)
