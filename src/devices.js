// -----------------------------------------------------------------------------
// The Gladys device of the integration: one "Komga" device (identity
// `server:main`: moving the server to another address keeps the device and its
// history), seen through the account of the credentials:
//   online (input/binary), libraries, series, books (counter-sensor/integer),
//   reading (series in progress), books_today (books finished since midnight),
//   version (text/text, administrator account only).
//
// Every feature is read-only (category/type couples of the core table, see
// test/gladys-rules.test.js). should_poll: false: the integration reads the
// server on its own timer (src/hub.js).
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const SERVER_TYPE = 'server';
export const SERVER_ID = 'main';
export const URL_PARAM = 'KOMGA_URL';
export const USER_PARAM = 'KOMGA_USER';

// Suffixes of the feature external ids: permanent once published.
export const KEYS = Object.freeze({
  ONLINE: 'online',
  LIBRARIES: 'libraries',
  SERIES: 'series',
  BOOKS: 'books',
  READING: 'reading',
  BOOKS_TODAY: 'books_today',
  VERSION: 'version',
});

// Feature names, per language (Gladys does not tell a device integration the
// user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [KEYS.ONLINE]: 'Online',
    [KEYS.LIBRARIES]: 'Libraries',
    [KEYS.SERIES]: 'Series',
    [KEYS.BOOKS]: 'Books',
    [KEYS.READING]: 'Series in progress',
    [KEYS.BOOKS_TODAY]: 'Books read today',
    [KEYS.VERSION]: 'Version',
  },
  fr: {
    [KEYS.ONLINE]: 'En ligne',
    [KEYS.LIBRARIES]: 'Bibliothèques',
    [KEYS.SERIES]: 'Séries',
    [KEYS.BOOKS]: 'Tomes',
    [KEYS.READING]: 'Séries en cours',
    [KEYS.BOOKS_TODAY]: "Tomes lus aujourd'hui",
    [KEYS.VERSION]: 'Version',
  },
  de: {
    [KEYS.ONLINE]: 'Online',
    [KEYS.LIBRARIES]: 'Bibliotheken',
    [KEYS.SERIES]: 'Serien',
    [KEYS.BOOKS]: 'Bände',
    [KEYS.READING]: 'Laufende Serien',
    [KEYS.BOOKS_TODAY]: 'Heute gelesene Bände',
    [KEYS.VERSION]: 'Version',
  },
  es: {
    [KEYS.ONLINE]: 'En línea',
    [KEYS.LIBRARIES]: 'Bibliotecas',
    [KEYS.SERIES]: 'Series',
    [KEYS.BOOKS]: 'Tomos',
    [KEYS.READING]: 'Series en curso',
    [KEYS.BOOKS_TODAY]: 'Tomos leídos hoy',
    [KEYS.VERSION]: 'Versión',
  },
};

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 1_000_000;

const readOnly = { read_only: true, has_feedback: false };

const binary = (key, value) => ({
  key,
  definition: {
    ...readOnly,
    category: DEVICE_FEATURE_CATEGORIES.INPUT,
    type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
    keep_history: true,
    min: 0,
    max: 1,
  },
  value,
});

const counter = (key, value, max = COUNTER_MAX) => ({
  key,
  definition: {
    ...readOnly,
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    keep_history: true,
    min: 0,
    max,
  },
  value,
});

const textFeature = (key, value) => ({
  key,
  text: true,
  definition: {
    ...readOnly,
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    keep_history: false,
    min: 0,
    max: 0,
  },
  value,
});

// Order = display order in Gladys. `value` reads the snapshot of the hub.
export const FEATURES = [
  binary(KEYS.ONLINE, (s) => (s.reachable === null ? null : s.reachable ? 1 : 0)),
  counter(KEYS.LIBRARIES, (s) => s.libraries ?? null, 1000),
  counter(KEYS.SERIES, (s) => s.series ?? null),
  counter(KEYS.BOOKS, (s) => s.books ?? null),
  counter(KEYS.READING, (s) => s.reading ?? null, 100_000),
  // Counted among the last books read (src/hub.js): at most 20 a day.
  counter(KEYS.BOOKS_TODAY, (s) => s.booksToday ?? null, 1000),
  // Administrator account only (/actuator/info).
  textFeature(KEYS.VERSION, (s) => s.version || null),
];

export const serverIds = (gladys) => gladys.externalIds(SERVER_TYPE, SERVER_ID);

const namesOf = (language) => NAMES[language] ?? NAMES.en;

/**
 * The discovery payload of the Komga device. A reader account cannot read
 * the version (an admin route): the feature is left out rather than empty.
 */
export function buildServerDevice(gladys, { url, user, admin }, language = 'en') {
  const ids = serverIds(gladys);
  return {
    name: 'Komga',
    external_id: ids.device,
    should_poll: false,
    params: [{ name: URL_PARAM, value: url }, ...(user ? [{ name: USER_PARAM, value: user }] : [])],
    features: FEATURES.filter(({ key }) => admin !== false || key !== KEYS.VERSION).map(
      ({ key, definition }) => ({
        ...definition,
        name: namesOf(language)[key],
        external_id: ids.feature(key),
      }),
    ),
  };
}

/**
 * The value of every feature (null: nothing to publish).
 * @returns {Array<{ key: string, externalId: string, value: number|string|null, text: boolean }>}
 */
export function featureValues(gladys, snapshot) {
  const ids = serverIds(gladys);
  return FEATURES.map(({ key, value, text = false }) => ({
    key,
    externalId: ids.feature(key),
    value: value(snapshot),
    text,
  }));
}
