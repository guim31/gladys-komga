// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Komga server: its address and the API key of a user (Komga 1.12+), or
// the e-mail and password of the account for older servers (an
// administrator's for the version and the library scans).
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Reading intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['60', '300', '900'];

export const DEFAULT_CONFIG = {
  server_url: '',
  api_key: '',
  username: '',
  password: '',
  poll_interval: '300',
  language: 'fr',
};

// Pages of the web client a user may copy from the browser.
const CLIENT_PAGES =
  /\/(dashboard|libraries|series|book|oneshot|collections|readlists|readlist|login|settings|account|history|import|media-management|startup|search)(\/.*)?$/i;

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10:25600`), or the URL copied from the browser, with the base path
 * of a server behind a reverse proxy (`https://example.org/komga/`). HTTP by
 * default; the query, the fragment, a trailing slash and the page of the web
 * client dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/base]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const typed = raw.trim();
  if (!typed) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `http://${typed}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs and the device params.
  if (url.username || url.password) {
    return null;
  }
  const path = url.pathname.replace(CLIENT_PAGES, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };
  const typed = text('server_url');
  const url = parseServerUrl(typed);
  const apiKey = text('api_key');
  const username = text('username');
  // A password is taken as typed: spaces may be part of it.
  const password = typeof source.password === 'string' ? source.password : '';
  // The API key first; the account otherwise.
  const credentials = apiKey ? { apiKey } : username && password ? { username, password } : null;
  return {
    url: url && credentials ? url : null,
    credentials: url && credentials ? credentials : null,
    // Something typed, but not usable: the status says so.
    incomplete: Boolean(typed || apiKey || username || password) && !(url && credentials),
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
