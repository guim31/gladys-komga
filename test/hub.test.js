// -----------------------------------------------------------------------------
// The hub against the fake Komga server: device states, scene events and
// their cursors, a reader account, the password of older servers, the books
// of the day, the event stream, the scene actions and the connection status.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { KEYS } from '../src/devices.js';
import { TRIGGERS, WIDGET_KEYS, advanceCursor, transportOf } from '../src/hub.js';
import {
  ADMIN,
  FakeKomga,
  SERVER_URL,
  createClock,
  createWorld,
  serverDevice,
  serverFeature,
} from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const state = (w, key) => w.fake.lastState(serverFeature(w.gladys, key));
const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);

test('the Komga device carries the counts of the server', async (t) => {
  const w = await world(t);
  const [device] = w.fake.discoveredDevices;
  assert.equal(device.external_id, serverDevice(w.gladys));
  assert.equal(device.should_poll, false);
  assert.deepEqual(device.params, [
    { name: 'KOMGA_URL', value: SERVER_URL },
    { name: 'KOMGA_USER', value: 'admin@example.org' },
  ]);
  assert.equal(state(w, KEYS.ONLINE), 1);
  assert.equal(state(w, KEYS.LIBRARIES), 2);
  assert.equal(state(w, KEYS.SERIES), 4);
  assert.equal(state(w, KEYS.BOOKS), 6);
  assert.equal(state(w, KEYS.READING), 2); // Blue Skies (a book started), Red Planet (1 of 2)
  assert.equal(state(w, KEYS.BOOKS_TODAY), 1); // Red Planet v01
  assert.equal(state(w, KEYS.VERSION), '1.29.1');
});

test('a reader account: no version feature, no scan', async (t) => {
  const w = await world(t, { server: new FakeKomga({ admin: false }) });
  const [device] = w.fake.discoveredDevices;
  assert.ok(!device.features.some((feature) => feature.external_id.endsWith(':version')));
  assert.deepEqual(device.params.at(-1), { name: 'KOMGA_USER', value: 'reader@example.org' });
  assert.equal(state(w, KEYS.BOOKS), 6);
  assert.ok(!w.server.requests.some((request) => request.path === '/actuator/info'));
  const ack = await w.fake.sceneAction('scan_library', {});
  assert.equal(ack.success, false);
  assert.match(ack.error, /not an administrator/);
  const content = await w.fake.widgetGet(WIDGET_KEYS.RECENTLY_ADDED, { language: 'en' });
  assert.ok(!content.data.content.components.some((component) => component.type === 'button'));
});

test('older servers: the e-mail and password, sent as HTTP Basic', async (t) => {
  const w = await world(t, {
    config: { server_url: SERVER_URL, username: ADMIN.email, password: ADMIN.password },
  });
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(state(w, KEYS.SERIES), 4);
  assert.ok(w.server.requests.every((request) => request.headers.Authorization));
  // The API key wins when both are given.
  await w.fake.configUpdated({
    server_url: SERVER_URL,
    api_key: w.server.apiKey,
    username: ADMIN.email,
    password: 'wrong',
  });
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.ok(w.server.requests.at(-1).headers['X-API-Key']);
});

test('a new series fires series_added once, with its library and book count', async (t) => {
  const w = await world(t);
  assert.equal(w.fake.sceneEvents.length, 0, 'the first reading is the starting point');
  w.clock.advance(60_000);
  w.server.addSeries(w.clock.now(), {
    title: 'Fresh Arrival',
    books: 2,
    libraryId: w.server.libraries[1].id,
  });
  await w.hub.refresh();
  await w.hub.refresh();
  assert.deepEqual(
    events(w, TRIGGERS.SERIES_ADDED).map((event) => event.data),
    [{ title: 'Fresh Arrival', library: 'Manga', books: 2 }],
  );
  // Its books are not announced as new books of an existing series.
  assert.equal(events(w, TRIGGERS.BOOK_ADDED).length, 0);
  assert.equal(state(w, KEYS.BOOKS), 8);
});

test('series created within the same second are all announced', async (t) => {
  const w = await world(t);
  // Komga dates have one-second precision: the cursor keeps the ids of its second.
  const at = w.clock.now() + 60_000;
  w.server.addSeries(at, { title: 'First' });
  await w.hub.refresh();
  w.server.addSeries(at, { title: 'Second' });
  await w.hub.refresh();
  assert.deepEqual(
    events(w, TRIGGERS.SERIES_ADDED).map((event) => event.data.title),
    ['First', 'Second'],
  );
});

test('a new book of an existing series fires book_added', async (t) => {
  const w = await world(t);
  w.clock.advance(60_000);
  w.server.addBook(w.server.seriesOf('Green Leaf'), w.clock.now(), 'Green Leaf v02');
  await w.hub.refresh();
  await w.hub.refresh();
  assert.deepEqual(
    events(w, TRIGGERS.BOOK_ADDED).map((event) => event.data),
    [{ series: 'Green Leaf', title: 'Green Leaf v02', library: 'Manga' }],
  );
  assert.equal(events(w, TRIGGERS.SERIES_ADDED).length, 0);
});

test('a big scan: the books of new series beyond the last 12 stay quiet', async (t) => {
  const w = await world(t);
  w.clock.advance(60_000);
  for (let index = 0; index < 14; index += 1) {
    w.server.addSeries(w.clock.now(), { title: `Batch ${index}` });
  }
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.SERIES_ADDED).length, 10, 'at most 10 per reading');
  assert.equal(events(w, TRIGGERS.BOOK_ADDED).length, 0);
});

test('a book added days ago (a server back from a long outage) is not news', async (t) => {
  const w = await world(t);
  w.clock.advance(3 * 24 * 60 * 60_000);
  w.server.addBook(w.server.seriesOf('Green Leaf'), w.clock.now() - 2 * 24 * 60 * 60_000);
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.BOOK_ADDED).length, 0);
});

test('a series read to the end fires series_finished once, again after a new book', async (t) => {
  const w = await world(t);
  w.clock.advance(60_000);
  // Started, not finished: nothing.
  w.server.read(w.server.bookOf('Green Leaf v01'), w.clock.now(), 2);
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.SERIES_FINISHED).length, 0);
  w.clock.advance(60_000);
  w.server.read(w.server.bookOf('Green Leaf v01'), w.clock.now());
  await w.hub.refresh();
  await w.hub.refresh();
  assert.deepEqual(
    events(w, TRIGGERS.SERIES_FINISHED).map((event) => event.data),
    [{ title: 'Green Leaf', library: 'Manga', books: 1 }],
  );
  assert.equal(state(w, KEYS.BOOKS_TODAY), 2);
  // A finished book of a series still unfinished: nothing.
  w.server.read(w.server.bookOf('Blue Skies v01'), w.clock.now());
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.SERIES_FINISHED).length, 1);
  // A new volume, read in one go: finishing the series is news again.
  w.clock.advance(60_000);
  const book = w.server.addBook(w.server.seriesOf('Green Leaf'), w.clock.now(), 'Green Leaf v02');
  w.server.read(book, w.clock.now());
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.SERIES_FINISHED).length, 2);
  assert.equal(events(w, TRIGGERS.SERIES_FINISHED)[1].data.books, 2);
});

test('the books of the day start again at midnight', async (t) => {
  const w = await world(t);
  w.clock.time = Date.parse('2026-10-23T00:05:00Z');
  await w.hub.refresh();
  assert.equal(state(w, KEYS.BOOKS_TODAY), 0);
});

test('the cursors survive a restart: nothing is announced twice', async (t) => {
  const clock = createClock();
  const server = new FakeKomga();
  const first = await createWorld({ clock, server });
  clock.advance(60_000);
  server.addSeries(clock.now());
  server.read(server.bookOf('Red Planet v02'), clock.now());
  await first.hub.refresh();
  assert.equal(first.fake.sceneEvents.length, 2);
  await first.app.stop();
  const second = await world(t, { clock, server, dataDir: first.dataDir });
  await second.hub.refresh();
  assert.equal(second.fake.sceneEvents.length, 0);
});

test('another server starts its cursors again', async (t) => {
  const clock = createClock();
  const other = 'http://192.0.2.11:25600';
  const servers = { [SERVER_URL]: new FakeKomga(), [other]: new FakeKomga() };
  const w = await world(t, { clock, servers });
  clock.advance(60_000);
  servers[other].addSeries(clock.now());
  await w.fake.configUpdated({ server_url: other, api_key: servers[other].apiKey, language: 'en' });
  assert.equal(w.fake.sceneEvents.length, 0);
});

test('another account on the same server starts every cursor again', async (t) => {
  const clock = createClock();
  const server = new FakeKomga();
  const w = await world(t, { clock, server });
  server.admin = false;
  w.hub.saved.series = { at: 0, ids: [] }; // the reader would see "new" series
  clock.advance(60_000);
  // The key now belongs to another account: the next reading asks again.
  w.hub.client.user = null;
  await w.hub.refresh();
  assert.equal(w.hub.saved.userId, '0S09NYDZ53RDJ');
  assert.equal(w.fake.sceneEvents.length, 0);
});

test('a failing version leaves its figure empty, the server online', async (t) => {
  const w = await world(t);
  const route = w.server.route.bind(w.server);
  w.server.route = (path, ...rest) =>
    path === '/actuator/info' ? { status: 404, headers: {}, body: '' } : route(path, ...rest);
  w.hub.reset();
  await w.hub.refresh();
  assert.equal(state(w, KEYS.ONLINE), 1);
  assert.equal(w.hub.snapshot.version, null);
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('a refused key and a server down: offline, a status, the last values kept', async (t) => {
  const w = await world(t, { config: { server_url: SERVER_URL, api_key: 'wrong' } });
  assert.equal(state(w, KEYS.ONLINE), 0);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /API key or password refused/);

  const ok = await world(t);
  ok.server.online = false;
  await ok.hub.refresh();
  assert.equal(state(ok, KEYS.ONLINE), 0);
  assert.equal(state(ok, KEYS.SERIES), 4);
  assert.match(ok.fake.connectionStatus.message.fr, /Komga : le serveur ne répond pas/);
  ok.server.online = true;
  await ok.hub.refresh();
  assert.equal(ok.fake.connectionStatus.connected, true);
});

test('something else at the address is not taken for Komga', async (t) => {
  const server = new FakeKomga({ urlBase: '/komga' });
  const w = await world(t, { server });
  assert.match(w.fake.connectionStatus.message.en, /no Komga server at this address/);
  await w.fake.configUpdated({ server_url: `${SERVER_URL}/komga/`, api_key: server.apiKey });
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('the transport badge: local on the home network, cloud beyond', async (t) => {
  assert.equal(transportOf('http://192.168.1.20:25600'), 'local');
  assert.equal(transportOf('http://komga.local'), 'local');
  assert.equal(transportOf('http://nas:25600'), 'local');
  assert.equal(transportOf('https://books.example.org/komga'), 'cloud');
  const w = await world(t);
  assert.deepEqual(
    w.fake.transports.map((entry) => entry.transport),
    ['cloud'], // 192.0.2.10 is a documentation address, not a private one
  );
  assert.equal(w.fake.transports[0].device_external_id, serverDevice(w.gladys));
});

test('the device added: every state sent again, the widgets refreshed', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  await w.fake.deviceCreated(w.fake.discoveredDevices[0]);
  assert.ok(w.fake.states.length - before >= 7);
  assert.deepEqual(
    [...new Set(w.fake.widgetRefreshes.slice(-2))].sort(),
    Object.values(WIDGET_KEYS).sort(),
  );
});

test('scan_library: one library by name, or all of them', async (t) => {
  const w = await world(t);
  let ack = await w.fake.sceneAction('scan_library', { library: 'manga' });
  assert.equal(ack.success, true);
  assert.deepEqual(ack.data.outputs, { libraries: 1 });
  assert.deepEqual(w.server.scans, [w.server.libraries[1].id]);
  ack = await w.fake.sceneAction('scan_library', {});
  assert.deepEqual(ack.data.outputs, { libraries: 2 });
  ack = await w.fake.sceneAction('scan_library', { library: 'Nope' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /No library of this name/);
});

test('read_latest_additions: a sentence of the series of the last 7 days', async (t) => {
  const w = await world(t);
  let ack = await w.fake.sceneAction('read_latest_additions', {});
  assert.deepEqual(ack.data.outputs, {
    sentence:
      '4 new series on Komga in the last 7 days: Yellow Sun, Green Leaf, Blue Skies and 1 more.',
    count: 4,
    title: 'Yellow Sun',
  });
  w.clock.advance(8 * 24 * 60 * 60_000);
  ack = await w.fake.sceneAction('read_latest_additions', {});
  assert.equal(ack.data.outputs.sentence, 'Nothing new on Komga in the last 7 days.');
  assert.equal(ack.data.outputs.count, 0);
});

test('test_connection reports the version, the account and the counts', async (t) => {
  const w = await world(t);
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.equal(
    ack.data.message.en,
    'Komga 1.29.1: connected as admin@example.org (administrator), 2 library(ies), 4 series, 6 book(s), 2 series in progress',
  );
});

test('the container reads the server on its own timer, without onPoll', async (t) => {
  const w = await world(t, {
    timers: true,
    config: { server_url: SERVER_URL, api_key: new FakeKomga().apiKey, poll_interval: '60' },
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  w.hub.schedule();
  const reads = () =>
    w.server.requests.filter((request) => request.path === '/api/v1/libraries').length;
  const before = reads();
  t.mock.timers.tick(60_000);
  await w.hub.running;
  assert.equal(reads(), before + 1);
});

test('an event of the stream brings the next reading forward; a closed stream reopens', async (t) => {
  const streams = [];
  const openStream = (url, headers) => {
    const stream = Object.assign(new EventEmitter(), { url, headers, closed: false });
    stream.close = () => {
      stream.closed = true;
    };
    streams.push(stream);
    return stream;
  };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await world(t, { timers: true, openStream });
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, `${SERVER_URL}/sse/v1/events`);
  assert.equal(streams[0].headers['X-API-Key'], w.server.apiKey);
  const reads = () =>
    w.server.requests.filter((request) => request.path === '/api/v1/libraries').length;
  const before = reads();
  streams[0].emit('open');
  streams[0].emit('event', { type: 'TaskQueueStatus', data: '{}' });
  t.mock.timers.tick(5_000);
  assert.equal(reads(), before, 'not every event wakes the hub');
  w.server.addSeries(w.clock.now() + 1000, { title: 'Live' });
  streams[0].emit('event', { type: 'SeriesAdded', data: '{}' });
  streams[0].emit('event', { type: 'BookAdded', data: '{}' });
  t.mock.timers.tick(5_000);
  await w.hub.running;
  assert.equal(reads(), before + 1, 'one reading for a burst of events');
  assert.deepEqual(
    events(w, TRIGGERS.SERIES_ADDED).map((event) => event.data.title),
    ['Live'],
  );
  streams[0].emit('close', new Error('socket hang up'));
  t.mock.timers.tick(60_000);
  assert.equal(streams.length, 2);
  await w.app.stop();
  assert.equal(streams[1].closed, true);
});

test('advanceCursor: the first call only sets the cursor', () => {
  const items = [
    { id: 'a', at: 1000 },
    { id: 'b', at: 2000 },
    { id: 'c', at: 2000 },
  ];
  const first = advanceCursor(null, items, (item) => item.at);
  assert.deepEqual(first.fresh, []);
  assert.deepEqual(first.cursor, { at: 2000, ids: ['b', 'c'] });
  const next = advanceCursor(first.cursor, [...items, { id: 'd', at: 2000 }], (item) => item.at);
  assert.deepEqual(
    next.fresh.map((item) => item.id),
    ['d'],
  );
  assert.deepEqual(next.cursor, { at: 2000, ids: ['b', 'c', 'd'] });
});

test('advanceCursor: an empty list starts from now, not from the epoch', () => {
  const first = advanceCursor(null, [], (item) => item.at, 5000);
  assert.deepEqual(first.cursor, { at: 5000, ids: [] });
  const old = advanceCursor(first.cursor, [{ id: 'old', at: 1000 }], (item) => item.at);
  assert.deepEqual(old.fresh, []);
});

test('a server lost halfway: the finished series is announced at the next reading', async (t) => {
  const w = await world(t);
  w.clock.advance(60_000);
  w.server.read(w.server.bookOf('Red Planet v02'), w.clock.now());
  const route = w.server.route.bind(w.server);
  // The server stops answering when the series is asked, after the lists.
  w.server.route = (path, ...rest) => {
    if (/^\/api\/v1\/series\/[0-9A-Z]+$/.test(path)) {
      w.server.online = false;
      const error = new Error('socket hang up');
      error.code = 'ECONNRESET';
      throw error;
    }
    return route(path, ...rest);
  };
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.SERIES_FINISHED).length, 0);
  assert.equal(state(w, KEYS.ONLINE), 0);
  w.server.route = route;
  w.server.online = true;
  await w.hub.refresh();
  assert.deepEqual(
    events(w, TRIGGERS.SERIES_FINISHED).map((event) => event.data.title),
    ['Red Planet'],
  );
});
