// -----------------------------------------------------------------------------
// The hub: reads the Komga server on a timer of the container, publishes the
// states of the Komga device when they change, fires the scene events, and
// serves the scene actions and the widgets.
//
// One reading every `pollIntervalMs` (1 to 15 minutes, configuration), about
// seven light requests: the libraries, the last series created, the last books
// created, the series in progress, the books in progress and the books read
// last of the account. The version (administrator) is read hourly. The Komga
// event stream (Server-Sent Events) only brings the next reading forward when
// a book or a series is added or a reading progresses.
//
// Scene events, compared with cursors kept under /data (announced once, also
// across restarts; the first reading of a server is the starting point). A
// cursor is the newest creation (or reading) time seen, with the ids seen at
// that very second (Komga dates have one-second precision):
// - a new series: created after the series cursor;
// - a new book of a series that existed before: created after the book cursor;
// - a series read to the end: a book read since the reading cursor completes
//   its series (all its books read), once per book count of the series.
//
// Gladys never polls the device (should_poll: false): the scene events must
// fire even before the device is added.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { KomgaClient, ERROR_KINDS } from './komga/client.js';
import { openEventStream } from './komga/events.js';
import { parseBookList, parseLibraries, parseSeries, parseSeriesList } from './komga/model.js';
import { buildServerDevice, featureValues, serverIds } from './devices.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  RECENT_TEXT,
  REPORT_TEXT,
  everyLanguage,
  labelled,
  listOf,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'komga-hub' });

// Widget keys (manifest `widgets`): permanent once published.
export const WIDGET_KEYS = Object.freeze({
  RECENTLY_ADDED: 'recently_added',
  CONTINUE_READING: 'continue_reading',
});

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  SERIES_ADDED: 'series_added',
  BOOK_ADDED: 'book_added',
  SERIES_FINISHED: 'series_finished',
});

// Events of the stream that bring the next reading forward.
const WAKE_EVENTS = new Set([
  'SeriesAdded',
  'BookAdded',
  'ReadProgressChanged',
  'ReadProgressSeriesChanged',
]);

export const HUB_TIMINGS = {
  // The version changes with an update: read it hourly.
  versionMs: 60 * 60_000,
  // New books older than this are not announced (a server back after days).
  eventMaxAgeMs: 24 * 60 * 60_000,
  // At most this many scene events of one kind per reading (a first big scan).
  maxEventsPerRead: 10,
  // Republish an unchanged value this often (Gladys flags a value older than 48 h).
  heartbeatMs: 12 * 60 * 60_000,
  // After a scan, read the server again this soon (Komga scans in the background).
  recheckAfterMs: 60_000,
  // After an event of the stream, read the server this soon (a scan sends many).
  eventDelayMs: 5_000,
  // The event stream, closed or refused, is opened again after this (doubling).
  streamRetryMs: 60_000,
  streamRetryMaxMs: 15 * 60_000,
  // Items kept for the widgets and the cursors.
  recentCount: 12,
  booksCount: 20,
  inProgressCount: 8,
  readCount: 20,
  // "Read the latest additions": the window, in days.
  recentDays: 7,
};

const MAX_FINISHED = 500;
const MAX_CURSOR_IDS = 200;

const signature = (config) => JSON.stringify([config.url, config.credentials]);

const emptySnapshot = () => ({
  reachable: null,
  version: null,
  libraries: null,
  series: null,
  books: null,
  reading: null,
  booksToday: null,
});

const emptySaved = (url = null) => ({
  url,
  userId: null,
  series: null,
  books: null,
  read: null,
  finished: {},
});

/** The local day of a time (the supervisor sets TZ to the zone of Gladys). */
export function dayOf(at) {
  const date = new Date(at);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The items newer than a cursor `{ at, ids }`, and the cursor moved to the
 * newest of them. Without a cursor yet, nothing is new: the newest becomes it
 * (`emptyAt` when there is none, so that a library shared later with the
 * account does not replay its history).
 * @param {{ at: number, ids: string[] }|null} cursor
 * @param {Array<{ id: string }>} items
 * @param {(item: object) => number|null} timeOf
 * @param {number} [emptyAt]
 */
export function advanceCursor(cursor, items, timeOf, emptyAt = 0) {
  const dated = items.filter((item) => Number.isFinite(timeOf(item)));
  const newest = dated.reduce((max, item) => Math.max(max, timeOf(item)), -Infinity);
  const valid = cursor && Number.isFinite(cursor.at) && Array.isArray(cursor.ids);
  if (!valid) {
    const at = Number.isFinite(newest) ? newest : emptyAt;
    const ids = dated.filter((item) => timeOf(item) === at).map((item) => item.id);
    return { fresh: [], cursor: { at, ids: ids.slice(0, MAX_CURSOR_IDS) }, changed: true };
  }
  const known = new Set(cursor.ids);
  const fresh = dated
    .filter(
      (item) => timeOf(item) > cursor.at || (timeOf(item) === cursor.at && !known.has(item.id)),
    )
    .sort((a, b) => timeOf(a) - timeOf(b));
  if (fresh.length === 0) {
    return { fresh, cursor, changed: false };
  }
  const at = Math.max(cursor.at, newest);
  const ids = [
    ...(at === cursor.at ? cursor.ids : []),
    ...fresh.filter((item) => timeOf(item) === at).map((item) => item.id),
  ];
  return { fresh, cursor: { at, ids: ids.slice(-MAX_CURSOR_IDS) }, changed: true };
}

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:|[^.]+$)|\.(local|lan|home|internal|localdomain|home\.arpa)$/i;

/** The transport badge: a server on the home network, or reached over the Internet. */
export function transportOf(url) {
  try {
    const { hostname } = new URL(url);
    return PRIVATE_HOST.test(hostname) ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.CLOUD;
  } catch {
    return DEVICE_TRANSPORTS.LOCAL;
  }
}

export class KomgaHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/komga/http.js)
   * @param {Function|null} [options.openStream] event stream seam (src/komga/events.js), null: none
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, openStream, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.openStream = openStream === undefined ? openEventStream : openStream;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.client = null;
    this.signature = null;
    this.snapshot = emptySnapshot();
    this.error = null;
    this.libraries = [];
    this.recent = [];
    this.inProgress = [];
    this.versionAt = 0;
    /** Last value published per feature external id: { value, at }. */
    this.published = new Map();
    this.transport = null;
    this.connection = null;
    this.devicesKey = null;
    this.saved = emptySaved();
    this.timer = null;
    this.recheckTimer = null;
    this.stream = null;
    this.streamTimer = null;
    this.streamRetryMs = this.timings.streamRetryMs;
    this.running = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  // --- Logs ------------------------------------------------------------------

  /** Log a problem once (`level` warn or error), its repeats at debug. */
  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  /** The problem `key` is gone: the next occurrence is logged again. */
  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = { ...emptySaved(), ...saved };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.transport = null;
    this.connection = null;
    this.devicesKey = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    if (signature(config) !== this.signature) {
      this.signature = signature(config);
      this.reset();
      this.client = config.url
        ? new KomgaClient({
            url: config.url,
            credentials: config.credentials,
            request: this.request,
          })
        : null;
      // Another server: its cursors start again from now.
      if (config.url && this.saved.url !== config.url) {
        this.saved = emptySaved(config.url);
        this.store.save(this.saved);
      }
    }
    try {
      await this.publishDevices();
      await this.refresh();
    } finally {
      // Even after a failure: the next tick tries again.
      this.schedule();
      this.listen();
    }
  }

  reset() {
    this.published.clear();
    this.snapshot = emptySnapshot();
    this.error = null;
    this.libraries = [];
    this.recent = [];
    this.inProgress = [];
    this.versionAt = 0;
    this.transport = null;
    this.closeStream();
    this.streamRetryMs = this.timings.streamRetryMs;
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.recheckTimer);
    this.closeStream();
    await this.running?.catch(() => {});
    await this.store.flush();
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.timer = setTimeout(async () => {
      try {
        await this.refresh();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Reading failed', err, 'error');
      }
      this.schedule();
    }, this.config.pollIntervalMs);
  }

  /** One more reading soon, without moving the regular timer. */
  recheck(delayMs = this.timings.recheckAfterMs) {
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    // An earlier recheck stays: a scan sends events for a while.
    if (this.recheckTimer && this.recheckAt <= this.now() + delayMs) {
      return;
    }
    clearTimeout(this.recheckTimer);
    this.recheckAt = this.now() + delayMs;
    this.recheckTimer = setTimeout(() => {
      this.recheckTimer = null;
      this.refresh().catch((err) => this.problem('poll', 'Reading failed', err, 'error'));
    }, delayMs);
  }

  // --- Event stream ------------------------------------------------------------

  /** Open the event stream of the server, once it is known to answer. */
  listen() {
    if (
      !this.timersEnabled ||
      this.stopped ||
      !this.client ||
      !this.openStream ||
      this.stream ||
      this.streamTimer
    ) {
      return;
    }
    const client = this.client;
    let stream;
    try {
      stream = this.openStream(`${client.url}/sse/v1/events`, client.headers);
    } catch (err) {
      // A header Node refuses (a pasted key with a line break): readings go on without it.
      this.problem('stream', `Komga: event stream not opened (${err.code ?? err.message})`);
      return;
    }
    this.stream = stream;
    stream.on('open', () => {
      this.streamRetryMs = this.timings.streamRetryMs;
      this.resolved('stream', 'Komga: event stream back');
      logger.debug('Komga: event stream open');
    });
    stream.on('event', ({ type }) => {
      if (WAKE_EVENTS.has(type)) {
        logger.debug(`Komga event: ${type}`);
        this.recheck(this.timings.eventDelayMs);
      }
    });
    stream.on('close', (err) => {
      if (this.stream !== stream) {
        return;
      }
      this.stream = null;
      if (err) {
        // A server down is already told by the readings: this stays in debug.
        this.problem('stream', `Komga: event stream closed (${err.message})`, undefined, 'debug');
      }
      const delay = this.streamRetryMs;
      this.streamRetryMs = Math.min(this.streamRetryMs * 2, this.timings.streamRetryMaxMs);
      this.streamTimer = setTimeout(() => {
        this.streamTimer = null;
        if (this.client === client) {
          this.listen();
        }
      }, delay);
    });
  }

  closeStream() {
    clearTimeout(this.streamTimer);
    this.streamTimer = null;
    const stream = this.stream;
    this.stream = null;
    stream?.close();
  }

  // --- Reading the server ------------------------------------------------------

  /** One reading. Concurrent calls share the reading in progress. */
  refresh() {
    if (this.running && this.runningClient === this.client) {
      return this.running;
    }
    // A reading of a previous configuration may still run: this one follows it.
    const previous = this.running ?? Promise.resolve();
    const run = previous
      .catch(() => {})
      .then(() => this.read())
      .finally(() => {
        if (this.running === run) {
          this.running = null;
        }
      });
    this.running = run;
    this.runningClient = this.client;
    return run;
  }

  async read() {
    if (!this.client) {
      await this.afterChanges(new Set());
      return;
    }
    const client = this.guarded(this.client);
    const changed = new Set();
    try {
      await this.readServer(client, changed);
      if (client.stale()) {
        return; // reconfigured meanwhile
      }
      if (this.error) {
        logger.info('Komga: connection restored');
      } else if (this.snapshot.reachable === null) {
        const role = this.client.user?.admin ? 'administrator' : 'reader';
        const version = this.snapshot.version ? `version ${this.snapshot.version}, ` : '';
        logger.info(`Komga: connected, ${version}${role} account`);
      }
      if (this.snapshot.reachable !== true) {
        changed.add(WIDGET_KEYS.RECENTLY_ADDED).add(WIDGET_KEYS.CONTINUE_READING);
      }
      this.error = null;
      this.snapshot.reachable = true;
      await this.publishDevices();
      await this.publishServer();
    } catch (err) {
      if (err.stale) {
        return; // reconfigured meanwhile: this reading is dropped
      }
      if (!err.kind) {
        throw err;
      }
      if (client.stale()) {
        return;
      }
      await this.applyFailure(err, changed);
    }
    await this.afterChanges(changed);
  }

  /**
   * The client of a reading: after each answer, a reading whose client was
   * replaced (a new address or key) stops before it changes anything.
   */
  guarded(client) {
    const stale = () => client !== this.client;
    return new Proxy(client, {
      get(target, name) {
        if (name === 'stale') {
          return stale;
        }
        const value = target[name];
        if (typeof value !== 'function') {
          return value;
        }
        return async (...args) => {
          const answer = await value.apply(target, args);
          if (stale()) {
            throw Object.assign(new Error('Reconfigured during the reading'), { stale: true });
          }
          return answer;
        };
      },
    });
  }

  async applyFailure(err, changed) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    if (this.snapshot.reachable !== false) {
      changed.add(WIDGET_KEYS.RECENTLY_ADDED).add(WIDGET_KEYS.CONTINUE_READING);
    }
    this.snapshot.reachable = false;
    // One warning when the problem starts (or changes), not one per reading.
    if (wasError !== err.kind) {
      logger.warn(`Komga: ${err.message}`);
    } else {
      logger.debug(`Komga: ${err.message} (again)`);
    }
    await this.publishServer();
  }

  async readServer(client, changed) {
    const now = this.now();
    if (!this.client.user) {
      await client.login();
    }
    const user = this.client.user;
    if (user.admin && (!this.snapshot.version || now - this.versionAt >= this.timings.versionMs)) {
      this.snapshot.version = (await this.optional(client, 'version')) ?? this.snapshot.version;
      this.versionAt = now;
    } else if (!user.admin) {
      this.snapshot.version = null;
    }
    if (this.saved.userId !== user.id) {
      // Another account sees other libraries: every cursor starts again.
      Object.assign(this.saved, { ...emptySaved(this.saved.url), userId: user.id });
      this.store.save(this.saved);
    }

    this.libraries = parseLibraries(await client.libraries());
    this.snapshot.libraries = this.libraries.length;

    const series = await client.newSeries(this.timings.recentCount);
    const recent = parseSeriesList(series.items, this.libraries);
    this.snapshot.series = series.total ?? recent.length;

    const books = await client.latestBooks(this.timings.booksCount);
    const latest = parseBookList(books.items, this.libraries);
    this.snapshot.books = books.total ?? latest.length;

    this.snapshot.reading = (await client.seriesInProgress()).total;

    const progress = await client.booksByReadDate('IN_PROGRESS', this.timings.inProgressCount);
    const inProgress = parseBookList(progress.items, this.libraries);

    const read = parseBookList(
      (await client.booksByReadDate('READ', this.timings.readCount)).items,
      this.libraries,
    );
    const today = dayOf(now);
    this.snapshot.booksToday = read.filter(
      (book) => book.completed && book.readAt !== null && dayOf(book.readAt) === today,
    ).length;

    if (JSON.stringify(recent) !== JSON.stringify(this.recent)) {
      changed.add(WIDGET_KEYS.RECENTLY_ADDED);
    }
    if (JSON.stringify(inProgress) !== JSON.stringify(this.inProgress)) {
      changed.add(WIDGET_KEYS.CONTINUE_READING);
    }
    this.recent = recent;
    this.inProgress = inProgress;

    const seriesCursor = this.saved.series;
    const newSeries = await this.announceSeries(recent);
    await this.announceBooks(client, latest, recent, seriesCursor, newSeries);
    await this.announceFinished(client, read);
  }

  /**
   * A figure the device can do without: its failure (a route of another
   * Komga version, a 500) leaves it empty instead of the server offline.
   */
  async optional(client, method, ...args) {
    try {
      const answer = await client[method](...args);
      this.resolved(`optional-${method}`);
      return answer;
    } catch (err) {
      if (
        !err.kind ||
        ![ERROR_KINDS.HTTP, ERROR_KINDS.FORBIDDEN, ERROR_KINDS.NOT_KOMGA].includes(err.kind)
      ) {
        throw err;
      }
      this.problem(`optional-${method}`, `Komga: ${err.message}, figure left empty`);
      return null;
    }
  }

  /**
   * The items newer than a saved cursor, and `commit()` to move the cursor.
   * Committed only once the requests a scene event needs have answered: a
   * reading that fails halfway announces the same items at the next one.
   */
  advance(name, items, timeOf) {
    const { fresh, cursor, changed } = advanceCursor(this.saved[name], items, timeOf, this.now());
    const commit = () => {
      if (changed) {
        this.saved[name] = cursor;
        this.store.save(this.saved);
      }
    };
    return { fresh, commit };
  }

  /** New series, created after the cursor. Returns their ids. */
  async announceSeries(recent) {
    const { fresh, commit } = this.advance('series', recent, (series) => series.createdAt);
    commit();
    for (const series of fresh.slice(-this.timings.maxEventsPerRead)) {
      logger.debug(`New series: "${series.title}" (${series.library})`);
      await this.fire(TRIGGERS.SERIES_ADDED, {
        title: series.title,
        library: series.library,
        books: series.books,
      });
    }
    return new Set(fresh.map((series) => series.id));
  }

  /** New books of series that existed before (a new series is announced as such). */
  async announceBooks(client, latest, recent, seriesCursor, newSeries) {
    const hadCursor = Boolean(this.saved.books);
    const { fresh, commit } = this.advance('books', latest, (book) => book.createdAt);
    if (!hadCursor || !seriesCursor || fresh.length === 0) {
      commit();
      return;
    }
    const minAt = this.now() - this.timings.eventMaxAgeMs;
    const candidates = fresh
      .filter((book) => book.createdAt >= minAt && !newSeries.has(book.seriesId))
      .slice(-this.timings.maxEventsPerRead);
    const created = new Map(recent.map((series) => [series.id, series.createdAt]));
    for (const book of candidates) {
      if (!created.has(book.seriesId) && book.seriesId) {
        // A server down here throws: the cursor stays, the next reading retries.
        const series = parseSeries(await this.optional(client, 'series', book.seriesId));
        created.set(book.seriesId, series?.createdAt ?? null);
      }
    }
    commit();
    // The series of a big scan, beyond the list of the last series: new too.
    const announced = candidates.filter((book) => {
      const seriesAt = created.get(book.seriesId);
      return seriesAt === null || seriesAt === undefined || seriesAt <= seriesCursor.at;
    });
    for (const book of announced) {
      logger.debug(`New book: "${book.title}" (${book.series})`);
      await this.fire(TRIGGERS.BOOK_ADDED, {
        series: book.series,
        title: book.title,
        library: book.library,
      });
    }
  }

  /** Series read to the end by a book read since the previous reading. */
  async announceFinished(client, read) {
    const { fresh, commit } = this.advance('read', read, (book) =>
      book.completed ? book.readAt : null,
    );
    const seriesIds = [...new Set(fresh.map((book) => book.seriesId).filter(Boolean))].slice(
      -this.timings.maxEventsPerRead,
    );
    // Every series first (a server down throws before the cursor moves).
    const list = [];
    for (const seriesId of seriesIds) {
      list.push(parseSeries(await this.optional(client, 'series', seriesId), this.libraries));
    }
    commit();
    for (const series of list) {
      if (!series?.finished) {
        continue;
      }
      // Once per book count: a new volume read to the end is news again.
      const finished = { ...this.saved.finished };
      if (finished[series.id] === series.books) {
        continue;
      }
      delete finished[series.id];
      finished[series.id] = series.books;
      this.saved.finished = Object.fromEntries(Object.entries(finished).slice(-MAX_FINISHED));
      this.store.save(this.saved);
      logger.debug(`Finished: "${series.title}"`);
      await this.fire(TRIGGERS.SERIES_FINISHED, {
        title: series.title,
        library: series.library,
        books: series.books,
      });
    }
  }

  /** Fire a scene event (the data keys are the ones the manifest declares). */
  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  async publishDevices() {
    const devices = this.config?.url
      ? [
          buildServerDevice(
            this.gladys,
            {
              url: this.config.url,
              user: this.client?.user?.name,
              admin: this.client?.user?.admin,
            },
            this.config.language,
          ),
        ]
      : [];
    const key = JSON.stringify(devices);
    if (key === this.devicesKey) {
      return;
    }
    // Even an empty list: the Discovery tab then shows no stale device.
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesKey = key;
      this.resolved('devices');
    } catch (err) {
      // Sent again at the next reading.
      this.problem('devices', `Devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: publish the device again, read the server. */
  async rediscover() {
    this.devicesKey = null;
    await this.publishDevices();
    await this.refresh();
  }

  /** The user added the device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (device.external_id !== serverIds(this.gladys).device) {
      return;
    }
    await this.publishServer({ force: true });
    for (const key of Object.values(WIDGET_KEYS)) {
      this.gladys.requestWidgetRefresh(key);
    }
  }

  async publishServer({ force = false } = {}) {
    const now = this.now();
    const stale = this.snapshot.reachable === false;
    const states = [];
    for (const { key, externalId, value, text } of featureValues(this.gladys, this.snapshot)) {
      if (value === null) {
        continue;
      }
      const last = this.published.get(externalId);
      // While the server is down, the last values are not republished as fresh.
      const frozen = stale && key !== 'online';
      const fresh =
        last && last.value === value && (frozen || now - last.at < this.timings.heartbeatMs);
      if (!force && fresh) {
        continue;
      }
      states.push(
        text
          ? { device_feature_external_id: externalId, text: String(value) }
          : { device_feature_external_id: externalId, state: value },
      );
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishStates(states);
      for (const state of states) {
        this.published.set(state.device_feature_external_id, {
          value: state.text ?? state.state,
          at: now,
        });
      }
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(changed) {
    await this.publishTransport();
    await this.publishConnectionStatus();
    for (const key of changed) {
      this.gladys.requestWidgetRefresh(key);
    }
  }

  async publishTransport() {
    if (this.snapshot.reachable === null || !this.config?.url) {
      return;
    }
    const transport = this.snapshot.reachable
      ? transportOf(this.config.url)
      : DEVICE_TRANSPORTS.UNREACHABLE;
    if (transport === this.transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([
        { external_id: serverIds(this.gladys).device, transport },
      ]);
      this.transport = transport;
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config?.url) {
      return {
        connected: false,
        message: this.config?.incomplete ? CONNECTION_TEXT.invalid : CONNECTION_TEXT.noServer,
      };
    }
    if (this.error) {
      return {
        connected: false,
        message: everyLanguage(ERROR_TEXT[this.error.kind], (text, language) =>
          labelled('Komga', text, language).slice(0, 200),
        ),
      };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  // --- Commands --------------------------------------------------------------------------

  requireClient() {
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.noServer, this.config?.language));
    }
    return this.client;
  }

  /** The error of an action, in the language of the configuration. */
  actionError(err) {
    if (!err.kind) {
      return err;
    }
    const text = pick(ERROR_TEXT[err.kind], this.config.language);
    return new Error(labelled('Komga', text, this.config.language));
  }

  /**
   * Ask Komga to scan one library (by its name, any case) or all of them for
   * new files (administrator account). Komga scans in the background: the new
   * series show at the reading that follows.
   * @returns {Promise<{ libraries: number }>}
   */
  async scanLibraries(name = '') {
    const client = this.requireClient();
    try {
      const libraries = parseLibraries(await client.libraries());
      const wanted = String(name ?? '')
        .trim()
        .toLowerCase();
      const targets = wanted
        ? libraries.filter((library) => library.name.toLowerCase() === wanted)
        : libraries;
      if (targets.length === 0) {
        throw new Error(pick(ACTION_TEXT.unknownLibrary, this.config.language));
      }
      for (const library of targets) {
        await client.scanLibrary(library.id);
      }
      logger.info(`Scan of ${targets.length} library(ies) started`);
      this.recheck();
      return { libraries: targets.length };
    } catch (err) {
      if (err.kind) {
        logger.warn(`Library scan failed: ${err.message}`);
      }
      throw this.actionError(err);
    }
  }

  /**
   * The series added in the last days, as a sentence for a message. Reads the
   * server now.
   * @returns {Promise<{ sentence: object, count: number, title: string }>}
   */
  async latestAdditions() {
    this.requireClient();
    await this.refresh();
    if (this.error) {
      throw this.actionError(this.error);
    }
    const days = this.timings.recentDays;
    const since = this.now() - days * 24 * 60 * 60_000;
    const fresh = this.recent.filter((series) => (series.createdAt ?? 0) >= since);
    const titles = fresh.map((series) => series.title);
    return {
      sentence: everyLanguage(RECENT_TEXT, (text) =>
        (fresh.length === 0
          ? text.none(days)
          : text.some(fresh.length, days, listOf(titles, fresh.length, text))
        ).slice(0, 1000),
      ),
      count: fresh.length,
      title: titles[0] ?? '',
    };
  }

  /** "Test the connection": read the server now, one line. */
  async testConnection() {
    await this.refresh();
    const status = this.connectionStatus();
    if (!status.connected) {
      return status.message;
    }
    const user = this.client.user;
    return everyLanguage(REPORT_TEXT, (text) =>
      [
        `${text.ok(this.snapshot.version, user.name)} (${user.admin ? text.admin() : text.reader()})`,
        text.library(
          this.snapshot.libraries ?? 0,
          this.snapshot.series ?? 0,
          this.snapshot.books ?? 0,
        ),
        text.reading(this.snapshot.reading ?? 0),
      ].join(', '),
    );
  }
}

export { ERROR_KINDS };
