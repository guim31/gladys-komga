// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+):
//
// - `recently_added`: a cover grid of the last series added to Komga, the
//   series and book counts, and (administrator account) a direct button to
//   scan the libraries for new files;
// - `continue_reading`: the books in progress of the account ("Keep reading"
//   of Komga), with their covers and progress, and the books read today.
//
// The figures are sent as values, not bound to device features, so the
// widgets work before the device is added to Gladys.
//
// Covers: the content declares a key per series, Gladys asks for its bytes
// through onWidgetGetImage, and the hub reads the thumbnail from Komga: the
// browser never loads a third-party URL, and the credentials never leave.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS, validateWidgetImage } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS } from './hub.js';
import { DONE_TEXT, everyLanguage, pick } from './texts.js';

// Action keys of the buttons: permanent once published.
export const ACTIONS = Object.freeze({
  SCAN: 'scan_libraries',
});

const MAX_ROWS = 8;
const MAX_CARDS = 12;
const MAX_IMAGE_BYTES = 300 * 1024;
// The core wants lowercase image keys; Komga ids are uppercase (Crockford base32).
const COVER_KEY = /^(series|book)-([0-9a-z]{1,32})$/;

export const TEXT = {
  configure: {
    en: 'Enter the address of your Komga server and an API key in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre serveur Komga et une clé d'API dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Komga-Servers und einen API-Schlüssel in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su servidor Komga y una clave de API en la configuración de la integración.',
  },
  unreachable: {
    en: 'The Komga server does not answer: see the status of the integration.',
    fr: "Le serveur Komga ne répond pas : voyez l'état de l'intégration.",
    de: 'Der Komga-Server antwortet nicht: Sieh dir den Status der Integration an.',
    es: 'El servidor Komga no responde: consulte el estado de la integración.',
  },
  nothingRead: {
    en: 'No book in progress.',
    fr: 'Aucun tome en cours.',
    de: 'Kein Band in Arbeit.',
    es: 'Ningún tomo en curso.',
  },
  empty: {
    en: 'Nothing has been added to the libraries yet.',
    fr: "Rien n'a encore été ajouté aux bibliothèques.",
    de: 'Den Bibliotheken wurde noch nichts hinzugefügt.',
    es: 'Todavía no se ha añadido nada a las bibliotecas.',
  },
  series: { en: 'Series', fr: 'Séries', de: 'Serien', es: 'Series' },
  books: { en: 'Books', fr: 'Tomes', de: 'Bände', es: 'Tomos' },
  inProgress: { en: 'In progress', fr: 'En cours', de: 'Laufend', es: 'En curso' },
  booksToday: {
    en: 'Read today',
    fr: "Lus aujourd'hui",
    de: 'Heute gelesen',
    es: 'Leídos hoy',
  },
  books_count: { en: 'books', fr: 'tomes', de: 'Bände', es: 'tomos' },
  page: { en: 'p.', fr: 'p.', de: 'S.', es: 'p.' },
  scan: {
    en: 'Scan the libraries',
    fr: 'Lancer un scan',
    de: 'Bibliotheken scannen',
    es: 'Escanear bibliotecas',
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/** Image key of the thumbnail of a series or a book (Komga ids are short strings). */
export const coverKey = (kind, id) => {
  const key = `${kind}-${String(id).toLowerCase()}`;
  return COVER_KEY.test(key) ? key : null;
};

// Komga makes a thumbnail for every series and book (a generated one at worst).
const withCover = (kind, id) => {
  const image = coverKey(kind, id);
  return image ? { image } : {};
};

async function getRecentlyAdded(hub, { language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.configure, language);
  }
  if (hub.error && hub.recent.length === 0) {
    return message(TEXT.unreachable, language);
  }
  const { series, books } = hub.snapshot;
  const components = [];
  if (series !== null) {
    components.push({
      type: 'value',
      value: series,
      label: t(TEXT.series, language),
      icon: 'book',
    });
  }
  if (books !== null) {
    components.push({
      type: 'value',
      value: books,
      label: t(TEXT.books, language),
      icon: 'layers',
    });
  }
  if (hub.recent.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.empty, language) });
  } else {
    components.push({
      type: 'card-list',
      display: 'grid',
      items: hub.recent.slice(0, MAX_CARDS).map((item) => ({
        title: fit(item.title, 60),
        ...(item.createdAt ? { date: new Date(item.createdAt).toISOString() } : {}),
        ...withCover('series', item.id),
        ...(item.library
          ? { badge: { text: fit(item.library, 16), color: WIDGET_COLORS.NEUTRAL } }
          : {}),
        description: fit(
          [item.library, item.books ? `${item.books} ${t(TEXT.books_count, language)}` : '']
            .filter(Boolean)
            .join('\n'),
          2000,
        ),
      })),
    });
  }
  if (hub.client.user?.admin) {
    components.push({
      type: 'button',
      label: t(TEXT.scan, language),
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: ACTIONS.SCAN },
    });
  }
  return { ttl_seconds: 300, components };
}

async function getContinueReading(hub, { language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.configure, language);
  }
  if (hub.error && hub.inProgress.length === 0) {
    return message(TEXT.unreachable, language);
  }
  const { reading, booksToday } = hub.snapshot;
  const components = [
    {
      type: 'value',
      value: reading ?? hub.inProgress.length,
      label: t(TEXT.inProgress, language),
      icon: 'book-open',
    },
  ];
  if (booksToday !== null) {
    components.push({
      type: 'value',
      value: booksToday,
      label: t(TEXT.booksToday, language),
      icon: 'check-circle',
      color: booksToday > 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (hub.inProgress.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.nothingRead, language) });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: hub.inProgress.slice(0, MAX_ROWS).map((item) => ({
        title: fit(item.series || item.title, 60),
        // The core cuts a subtitle at 60 characters: the page first, the book after.
        subtitle: fit(
          [`${t(TEXT.page, language)} ${item.page}/${item.pages}`, item.series ? item.title : '']
            .filter(Boolean)
            .join(' · '),
          60,
        ),
        ...withCover('book', item.id),
        badge: { text: `${item.progress} %`, color: WIDGET_COLORS.INFO },
      })),
    });
  }
  return { ttl_seconds: 300, components };
}

async function recentlyAddedAction(hub, { actionKey }) {
  if (actionKey === ACTIONS.SCAN) {
    const { libraries } = await hub.scanLibraries();
    return { message: everyLanguage(DONE_TEXT, (text) => text.scanned(libraries)) };
  }
  throw new Error(`Unknown action ${actionKey}`);
}

async function noAction(hub, { actionKey }) {
  throw new Error(`Unknown action ${actionKey}`);
}

/**
 * Bytes of a cover, as raw base64 (onWidgetGetImage). Only the keys these
 * widgets declare, only from the configured server.
 */
export async function getImage(hub, imageKey) {
  const match = COVER_KEY.exec(String(imageKey));
  if (!match) {
    throw new Error(`Unknown image ${imageKey}`);
  }
  const client = hub.requireClient();
  const { body } = await client.thumbnail(match[1], match[2].toUpperCase());
  if (!Buffer.isBuffer(body) || body.length === 0 || body.length > MAX_IMAGE_BYTES) {
    throw new Error(`Cover ${imageKey} is empty or too large`);
  }
  const image = body.toString('base64');
  // The checks of the core (format, header, size): refused here, explained in
  // the logs (a custom WebP or AVIF thumbnail set in Komga, for instance).
  const problems = validateWidgetImage(image);
  if (problems.length > 0) {
    throw new Error(`Cover ${imageKey} refused: ${problems.join('; ')}`);
  }
  return image;
}

export const WIDGETS = {
  [WIDGET_KEYS.RECENTLY_ADDED]: { get: getRecentlyAdded, action: recentlyAddedAction },
  [WIDGET_KEYS.CONTINUE_READING]: { get: getContinueReading, action: noAction },
};
