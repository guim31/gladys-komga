// -----------------------------------------------------------------------------
// An in-memory Komga server behind the `request` seam of the client
// (src/komga/http.js). Series, books and answers come from a real 1.29.1
// server (test/fixtures/komga/), with the behaviors that matter: the API key
// or the account password, the admin-only routes, series and books added by a
// scan, reading progress, thumbnails, a server that does not answer.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/komga/${name}.json`, import.meta.url), 'utf8'));

// A real series thumbnail (200 × 300 JPEG) of the test library.
export const COVER = readFileSync(
  new URL('../fixtures/komga/series-thumbnail.jpg', import.meta.url),
);

export const API_KEY = '0123456789abcdef0123456789abcdef';
export const VERSION = fixture('actuator-info').build.version;
export const ADMIN = { email: 'admin@example.org', password: 'adminpass1' };

const json = (status, body) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const plain = (status, body = '') => ({ status, headers: { 'content-type': 'text/plain' }, body });

/** "2026-10-22T10:53:03Z" from epoch ms (Komga writes whole seconds, UTC). */
export const komgaDate = (at) =>
  new Date(Math.floor(at / 1000) * 1000).toISOString().replace('.000Z', 'Z');

const page = (list, size) =>
  json(200, { content: list.slice(0, size), totalElements: list.length, size, number: 0 });

const byDesc = (key) => (a, b) =>
  String(key(b)).localeCompare(String(key(a))) || b.id.localeCompare(a.id);

export class FakeKomga {
  constructor({ apiKey = API_KEY, admin = true, urlBase = '' } = {}) {
    this.apiKey = apiKey;
    this.admin = admin;
    this.urlBase = urlBase;
    this.online = true;
    this.libraries = fixture('libraries');
    // Series and books as the server stores them (the counts are computed).
    this.series = new Map(fixture('series-new').content.map((series) => [series.id, series]));
    this.books = new Map(fixture('books-latest').content.map((book) => [book.id, book]));
    this.nextId = 1;
    this.scans = [];
    this.requests = [];
    this.failNext = null;
  }

  user() {
    return this.admin
      ? { ...fixture('users-me') }
      : {
          ...fixture('users-me'),
          id: '0S09NYDZ53RDJ',
          email: 'reader@example.org',
          roles: ['PAGE_STREAMING', 'USER'],
        };
  }

  newId() {
    return `0T00000000${String(this.nextId++).padStart(3, '0')}`;
  }

  /** A scan finds a new series (with `books` books) at `at`. */
  addSeries(at, { title = 'New Series', books = 1, libraryId = this.libraries[0].id } = {}) {
    const [template] = fixture('series-new').content;
    const id = this.newId();
    this.series.set(id, {
      ...template,
      id,
      libraryId,
      name: title,
      created: komgaDate(at),
      metadata: { ...template.metadata, title },
    });
    for (let index = 0; index < books; index += 1) {
      this.addBook(id, at, `${title} v${String(index + 1).padStart(2, '0')}`);
    }
    return id;
  }

  /** A scan adds a book to a series at `at`. */
  addBook(seriesId, at, title = 'New Book', pages = 4) {
    const [template] = fixture('books-latest').content;
    const series = this.series.get(seriesId);
    const id = this.newId();
    this.books.set(id, {
      ...template,
      id,
      seriesId,
      seriesTitle: series.metadata.title,
      libraryId: series.libraryId,
      name: title,
      created: komgaDate(at),
      media: { ...template.media, pagesCount: pages },
      metadata: { ...template.metadata, title },
      readProgress: null,
    });
    return id;
  }

  /** The account reads a book up to `page` (or to the end) at `at`. */
  read(bookId, at, pageNumber = null) {
    const book = this.books.get(bookId);
    const pages = book.media.pagesCount;
    const completed = pageNumber === null || pageNumber >= pages;
    book.readProgress = {
      page: completed ? pages : pageNumber,
      completed,
      readDate: komgaDate(at),
      created: komgaDate(at),
      lastModified: komgaDate(at),
      deviceId: '',
      deviceName: '',
    };
  }

  bookOf(title) {
    return [...this.books.values()].find((book) => book.metadata.title === title).id;
  }

  seriesOf(title) {
    return [...this.series.values()].find((series) => series.metadata.title === title).id;
  }

  seriesDto(series) {
    const books = [...this.books.values()].filter((book) => book.seriesId === series.id);
    const read = books.filter((book) => book.readProgress?.completed).length;
    const inProgress = books.filter(
      (book) => book.readProgress && !book.readProgress.completed,
    ).length;
    return {
      ...series,
      booksCount: books.length,
      booksReadCount: read,
      booksInProgressCount: inProgress,
      booksUnreadCount: books.length - read - inProgress,
    };
  }

  authorized(headers) {
    if (headers['X-API-Key'] !== undefined) {
      return headers['X-API-Key'] === this.apiKey;
    }
    const basic = String(headers.Authorization ?? '').replace(/^Basic /, '');
    return Buffer.from(basic, 'base64').toString('utf8') === `${ADMIN.email}:${ADMIN.password}`;
  }

  /** The `request` function given to the client. */
  handle(url, { method = 'GET', headers = {}, binary } = {}) {
    const { pathname, searchParams } = new URL(url);
    this.requests.push({
      method,
      path: pathname,
      query: Object.fromEntries(searchParams),
      headers,
    });
    if (!this.online) {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }
    if (this.failNext) {
      const status = this.failNext;
      this.failNext = null;
      return plain(status);
    }
    if (!pathname.startsWith(this.urlBase)) {
      return { status: 404, headers: { 'content-type': 'text/html' }, body: 'Not found' };
    }
    if (!this.authorized(headers)) {
      return json(401, { status: 401, error: 'Unauthorized' });
    }
    return this.route(pathname.slice(this.urlBase.length), method, searchParams, binary);
  }

  route(path, method, searchParams, binary) {
    const size = Number(searchParams.get('size') ?? 20);
    const allSeries = [...this.series.values()].map((series) => this.seriesDto(series));
    const allBooks = [...this.books.values()];
    const admin = () => (this.admin ? null : json(403, { status: 403, error: 'Forbidden' }));
    if (path === '/api/v2/users/me') {
      return json(200, this.user());
    }
    if (path === '/actuator/info') {
      return admin() ?? json(200, fixture('actuator-info'));
    }
    if (path === '/api/v1/libraries') {
      return json(200, this.libraries);
    }
    if (path === '/api/v1/series/new') {
      return page(allSeries.sort(byDesc((series) => series.created)), size);
    }
    if (path === '/api/v1/books/latest') {
      return page(allBooks.sort(byDesc((book) => book.created)), size);
    }
    if (path === '/api/v1/series' && searchParams.get('read_status') === 'IN_PROGRESS') {
      const list = allSeries.filter(
        (series) =>
          (series.booksReadCount > 0 || series.booksInProgressCount > 0) &&
          series.booksReadCount < series.booksCount,
      );
      return page(list, size);
    }
    if (path === '/api/v1/books' && searchParams.get('sort') === 'readProgress.readDate,desc') {
      const status = searchParams.get('read_status');
      const list = allBooks
        .filter((book) =>
          status === 'READ'
            ? book.readProgress?.completed
            : book.readProgress && !book.readProgress.completed,
        )
        .sort(byDesc((book) => book.readProgress.readDate));
      return page(list, size);
    }
    const scan = /^\/api\/v1\/libraries\/([^/]+)\/scan$/.exec(path);
    if (scan && method === 'POST') {
      if (!this.admin) {
        return admin();
      }
      this.scans.push(scan[1]);
      return plain(202);
    }
    const thumbnail = /^\/api\/v1\/(series|books)\/([^/]+)\/thumbnail$/.exec(path);
    if (thumbnail) {
      return binary
        ? { status: 200, headers: { 'content-type': 'image/jpeg' }, body: COVER }
        : json(400, {});
    }
    const one = /^\/api\/v1\/series\/([^/]+)$/.exec(path);
    if (one && this.series.has(one[1])) {
      return json(200, this.seriesDto(this.series.get(one[1])));
    }
    return json(404, { status: 404, error: 'Not Found' });
  }
}

/** A network of fake servers by base URL, as the `request` seam. */
export function createNetwork(servers) {
  return {
    servers,
    async request(url, options) {
      const base = Object.keys(servers).find((prefix) => url.startsWith(prefix));
      if (!base) {
        const error = new Error('getaddrinfo ENOTFOUND');
        error.code = 'ENOTFOUND';
        throw error;
      }
      return servers[base].handle(url, options);
    },
  };
}
