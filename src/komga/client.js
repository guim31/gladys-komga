// -----------------------------------------------------------------------------
// Komga REST API client. Authenticates every request with the API key of a
// user (`X-API-Key`, Komga 1.12+: Account settings → API Keys), or with the
// e-mail and password of the account (HTTP Basic) for older servers. The
// secrets travel only in headers: never logged, never in an error.
//
// `GET /api/v2/users/me` says who the account is and whether it is an
// administrator's (`ADMIN` role): the version (`/actuator/info`) and the
// library scans are admin routes, the rest works with any reader account and
// only sees the libraries shared with it.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // API key or password refused (401)
  FORBIDDEN: 'forbidden', // the account works but is not an administrator (403)
  NOT_KOMGA: 'not_komga', // something answers, not a Komga server
  REDIRECT: 'redirect', // the address redirects (HTTP to HTTPS, a login page)
  HTTP: 'http', // any other HTTP error
});

export class KomgaError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'KomgaError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

/** The authentication headers of a set of credentials. */
export function authHeaders({ apiKey, username, password }) {
  if (apiKey) {
    return { 'X-API-Key': apiKey };
  }
  return {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  };
}

export class KomgaClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, with the path of a reverse proxy if any
   * @param {{ apiKey?: string, username?: string, password?: string }} options.credentials
   * @param {Function} [options.request] HTTP seam (src/komga/http.js)
   */
  constructor({ url, credentials, request = httpRequest }) {
    this.url = url;
    this.headers = authHeaders(credentials);
    this.request = request;
    /** Who the account is: { id, name, admin }, known after login(). */
    this.user = null;
  }

  async send(path, { method = 'GET', binary = false } = {}) {
    let answer;
    try {
      answer = await this.request(`${this.url}${path}`, {
        method,
        binary,
        headers: this.headers,
      });
    } catch (err) {
      if (TLS_CODES.has(err.code)) {
        throw new KomgaError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
      }
      throw new KomgaError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
    }
    const route = path.split('?')[0];
    const { status, headers = {}, body } = answer;
    if (status === 401) {
      throw new KomgaError(ERROR_KINDS.AUTH, 'Credentials refused', { status });
    }
    if (status === 403) {
      throw new KomgaError(ERROR_KINDS.FORBIDDEN, `${route}: not an administrator account`, {
        status,
      });
    }
    if (status >= 300 && status < 400) {
      throw new KomgaError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status < 200 || status >= 300) {
      throw new KomgaError(ERROR_KINDS.HTTP, `${route} answered HTTP ${status}`, { status });
    }
    return { headers, body };
  }

  async get(path) {
    const route = path.split('?')[0];
    const { body } = await this.send(path);
    const text = String(body ?? '');
    try {
      return JSON.parse(text);
    } catch {
      // A reverse proxy's login page, another web application...
      throw new KomgaError(ERROR_KINDS.NOT_KOMGA, `${route} did not answer JSON`);
    }
  }

  /** A page of a Spring list: its items and its total. */
  async page(path) {
    const answer = await this.get(path);
    const total = Number(answer?.totalElements);
    return {
      items: Array.isArray(answer?.content) ? answer.content : [],
      total: Number.isFinite(total) ? total : null,
    };
  }

  /** Learn who the credentials belong to (and check they are Komga's). */
  async login() {
    let me;
    try {
      me = await this.get('/api/v2/users/me');
    } catch (err) {
      if (err.kind === ERROR_KINDS.HTTP && [404, 405].includes(err.status)) {
        throw new KomgaError(ERROR_KINDS.NOT_KOMGA, 'No Komga API at this address');
      }
      throw err;
    }
    if (typeof me?.id !== 'string' || !Array.isArray(me.roles)) {
      throw new KomgaError(ERROR_KINDS.NOT_KOMGA, 'No Komga user in the answer');
    }
    this.user = {
      id: me.id,
      name: String(me.email ?? ''),
      admin: me.roles.includes('ADMIN'),
    };
    return this.user;
  }

  /** The version of the server ("1.29.1"), administrator only. */
  async version() {
    const info = await this.get('/actuator/info');
    const version = String(info?.build?.version ?? '');
    if (!/^\d+\.\d+/.test(version)) {
      throw new KomgaError(ERROR_KINDS.NOT_KOMGA, '/actuator/info did not answer a version');
    }
    return version;
  }

  /** The libraries the account can see. */
  libraries() {
    return this.get('/api/v1/libraries');
  }

  /** The last series created, the newest first (the total counts every series). */
  newSeries(size) {
    return this.page(`/api/v1/series/new?page=0&size=${size}`);
  }

  /** The last books created, the newest first (the total counts every book). */
  latestBooks(size) {
    return this.page(`/api/v1/books/latest?page=0&size=${size}`);
  }

  /** The series in progress (only their count is used). */
  seriesInProgress() {
    return this.page('/api/v1/series?read_status=IN_PROGRESS&page=0&size=1');
  }

  /** Books of a read status, the last read first. */
  booksByReadDate(status, size) {
    return this.page(
      `/api/v1/books?read_status=${status}&sort=readProgress.readDate,desc&page=0&size=${size}`,
    );
  }

  /** One series, with its read counts. */
  series(seriesId) {
    return this.get(`/api/v1/series/${encodeURIComponent(seriesId)}`);
  }

  /** Scan one library for new files (admin); Komga scans in the background. */
  scanLibrary(libraryId) {
    return this.send(`/api/v1/libraries/${encodeURIComponent(libraryId)}/scan`, {
      method: 'POST',
    });
  }

  /** The thumbnail of a series or of a book (a JPEG). */
  async thumbnail(kind, id) {
    const { body, headers } = await this.send(
      `/api/v1/${kind === 'book' ? 'books' : 'series'}/${encodeURIComponent(id)}/thumbnail`,
      { binary: true },
    );
    return { body, contentType: String(headers['content-type'] ?? '') };
  }
}
