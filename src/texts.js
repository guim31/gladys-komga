// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widgets (src/widgets.js):
// connection status, errors, the "Test the connection" report, the scene
// action errors and sentences. Four languages, the four of the Gladys
// interface; German says "du", Spanish "usted". test/i18n.test.js checks
// every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './komga/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noServer: {
    en: 'Enter the address of your Komga server and an API key in the configuration.',
    fr: "Saisissez l'adresse de votre serveur Komga et une clé d'API dans la configuration.",
    de: 'Gib die Adresse deines Komga-Servers und einen API-Schlüssel in der Konfiguration ein.',
    es: 'Introduzca la dirección de su servidor Komga y una clave de API en la configuración.',
  },
  invalid: {
    en: 'The configuration is incomplete: address (e.g. http://192.168.1.2:25600) and API key (or e-mail and password).',
    fr: "La configuration est incomplète : adresse (ex. http://192.168.1.2:25600) et clé d'API (ou e-mail et mot de passe).",
    de: 'Die Konfiguration ist unvollständig: Adresse (z. B. http://192.168.1.2:25600) und API-Schlüssel (oder E-Mail und Passwort).',
    es: 'La configuración está incompleta: dirección (p. ej. http://192.168.1.2:25600) y clave de API (o correo y contraseña).',
  },
};

// One short explanation per error kind (src/komga/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'the server does not answer',
    fr: 'le serveur ne répond pas',
    de: 'der Server antwortet nicht',
    es: 'el servidor no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use the http:// address on your network',
    fr: 'certificat refusé : utilisez l’adresse en http:// de votre réseau',
    de: 'Zertifikat abgelehnt: Verwende die http://-Adresse in deinem Netzwerk',
    es: 'certificado rechazado: use la dirección http:// de su red',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API key or password refused',
    fr: "clé d'API ou mot de passe refusé",
    de: 'API-Schlüssel oder Passwort abgelehnt',
    es: 'clave de API o contraseña rechazada',
  },
  [ERROR_KINDS.FORBIDDEN]: {
    en: 'this account is not an administrator: use the API key of an admin user',
    fr: "ce compte n'est pas administrateur : utilisez la clé d'API d'un admin",
    de: 'dieses Konto ist kein Administrator: Nimm den API-Schlüssel eines Admins',
    es: 'esta cuenta no es de administrador: use la clave de API de un usuario admin',
  },
  [ERROR_KINDS.NOT_KOMGA]: {
    en: 'no Komga server at this address',
    fr: 'aucun serveur Komga à cette adresse',
    de: 'kein Komga-Server unter dieser Adresse',
    es: 'no hay ningún servidor Komga en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the final address, with its path',
    fr: "l'adresse redirige : saisissez l'adresse finale, avec son chemin",
    de: 'die Adresse leitet um: Gib die endgültige Adresse mit ihrem Pfad ein',
    es: 'la dirección redirige: introduzca la dirección final, con su ruta',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (version, user) => `Komga${version ? ` ${version}` : ''}: connected as ${user}`,
    admin: () => 'administrator',
    reader: () => 'reader account: no version, no scan',
    library: (libraries, series, books) =>
      `${libraries} library(ies), ${series} series, ${books} book(s)`,
    reading: (count) => `${count} series in progress`,
  },
  fr: {
    ok: (version, user) => `Komga${version ? ` ${version}` : ''} : connecté en tant que ${user}`,
    admin: () => 'administrateur',
    reader: () => 'compte lecteur : ni version, ni scan',
    library: (libraries, series, books) =>
      `${libraries} bibliothèque(s), ${series} série(s), ${books} tome(s)`,
    reading: (count) => `${count} série(s) en cours`,
  },
  de: {
    ok: (version, user) => `Komga${version ? ` ${version}` : ''}: verbunden als ${user}`,
    admin: () => 'Administrator',
    reader: () => 'Leserkonto: keine Version, kein Scan',
    library: (libraries, series, books) =>
      `${libraries} Bibliothek(en), ${series} Serie(n), ${books} Band/Bände`,
    reading: (count) => `${count} laufende Serie(n)`,
  },
  es: {
    ok: (version, user) => `Komga${version ? ` ${version}` : ''}: conectado como ${user}`,
    admin: () => 'administrador',
    reader: () => 'cuenta de lector: sin versión ni escaneo',
    library: (libraries, series, books) =>
      `${libraries} biblioteca(s), ${series} serie(s), ${books} tomo(s)`,
    reading: (count) => `${count} serie(s) en curso`,
  },
};

// The sentence of the "Read the latest additions" scene action.
export const RECENT_TEXT = {
  en: {
    none: (days) => `Nothing new on Komga in the last ${days} days.`,
    some: (count, days, titles) =>
      `${count} new series on Komga in the last ${days} days: ${titles}.`,
    more: (count) => `${count} more`,
    and: ' and ',
  },
  fr: {
    none: (days) => `Rien de nouveau sur Komga ces ${days} derniers jours.`,
    some: (count, days, titles) =>
      `${count} nouvelle(s) série(s) sur Komga ces ${days} derniers jours : ${titles}.`,
    more: (count) => `${count} autre(s)`,
    and: ' et ',
  },
  de: {
    none: (days) => `Nichts Neues auf Komga in den letzten ${days} Tagen.`,
    some: (count, days, titles) =>
      `${count} neue Serie(n) auf Komga in den letzten ${days} Tagen: ${titles}.`,
    more: (count) => `${count} weitere`,
    and: ' und ',
  },
  es: {
    none: (days) => `Nada nuevo en Komga en los últimos ${days} días.`,
    some: (count, days, titles) =>
      `${count} serie(s) nueva(s) en Komga en los últimos ${days} días: ${titles}.`,
    more: (count) => `${count} más`,
    and: ' y ',
  },
};

// Errors of the scene actions and widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  noServer: {
    en: 'No Komga server is configured.',
    fr: "Aucun serveur Komga n'est configuré.",
    de: 'Kein Komga-Server ist konfiguriert.',
    es: 'No hay ningún servidor Komga configurado.',
  },
  unknownLibrary: {
    en: 'No library of this name on the Komga server.',
    fr: 'Aucune bibliothèque de ce nom sur le serveur Komga.',
    de: 'Keine Bibliothek mit diesem Namen auf dem Komga-Server.',
    es: 'No hay ninguna biblioteca con este nombre en el servidor Komga.',
  },
};

// Toast of the "Scan the libraries" widget button (≤ 200 characters).
export const DONE_TEXT = {
  en: { scanned: (count) => `Scan of ${count} library(ies) started.` },
  fr: { scanned: (count) => `Scan de ${count} bibliothèque(s) lancé.` },
  de: { scanned: (count) => `Scan von ${count} Bibliothek(en) gestartet.` },
  es: { scanned: (count) => `Escaneo de ${count} biblioteca(s) iniciado.` },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** Every language of a table, rendered by `render(table[language], language)`. */
export const everyLanguage = (table, render) =>
  Object.fromEntries(
    Object.entries(table).map(([language, text]) => [language, render(text, language)]),
  );

/** "A, B and 2 more" in the words of a language. */
export function listOf(titles, total, text) {
  const shown = titles.slice(0, 3);
  const rest = total - shown.length;
  const parts = rest > 0 ? [...shown, text.more(rest)] : shown;
  return parts.length <= 1
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')}${text.and}${parts.at(-1)}`;
}
