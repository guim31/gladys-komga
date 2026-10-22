import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authHeaders } from '../src/komga/client.js';
import { createEventParser } from '../src/komga/events.js';
import {
  parseBookList,
  parseDate,
  parseLibraries,
  parseSeries,
  parseSeriesList,
} from '../src/komga/model.js';
import { fixture } from './helpers/fakeKomga.js';

const libraries = parseLibraries(fixture('libraries'));

test('the series of a real answer', () => {
  const list = parseSeriesList(fixture('series-new').content, libraries);
  assert.deepEqual(
    list.map((series) => [series.title, series.library, series.books]),
    [
      ['Yellow Sun', 'Comics', 1],
      ['Green Leaf', 'Manga', 1],
      ['Blue Skies', 'Comics', 2],
      ['Red Planet', 'Comics', 2],
    ],
  );
  assert.equal(list[0].createdAt, Date.parse('2026-10-22T10:54:08Z'));
  const red = parseSeries(fixture('series-red-planet'), libraries);
  assert.equal(red.booksRead, 1);
  assert.equal(red.finished, false);
  assert.deepEqual(parseSeriesList(null), []);
  assert.deepEqual(parseSeriesList([{ name: 'no id' }, { id: '../x' }]), []);
});

test('the books of a real answer, with the reading progress', () => {
  const [started] = parseBookList(fixture('books-in-progress').content, libraries);
  assert.equal(started.series, 'Blue Skies');
  assert.equal(started.title, 'Blue Skies v01');
  assert.equal(started.page, 2);
  assert.equal(started.pages, 4);
  assert.equal(started.progress, 50);
  assert.equal(started.completed, false);
  const [done] = parseBookList(fixture('books-read').content, libraries);
  assert.equal(done.completed, true);
  assert.equal(done.readAt, Date.parse('2026-10-22T10:53:26Z'));
});

test('Komga dates: UTC, with or without the Z', () => {
  assert.equal(parseDate('2026-10-22T10:53:03Z'), Date.parse('2026-10-22T10:53:03Z'));
  assert.equal(parseDate('2026-10-22T10:53:03'), Date.parse('2026-10-22T10:53:03Z'));
  assert.equal(parseDate(''), null);
  assert.equal(parseDate(null), null);
  assert.equal(parseDate('garbage'), null);
});

test('the credentials: the API key header, or HTTP Basic', () => {
  assert.deepEqual(authHeaders({ apiKey: 'k' }), { 'X-API-Key': 'k' });
  assert.deepEqual(authHeaders({ username: 'a@example.org', password: 'p:w' }), {
    Authorization: `Basic ${Buffer.from('a@example.org:p:w').toString('base64')}`,
  });
});

test('the event stream of a real server (with its heartbeats), cut anywhere', () => {
  const raw = readFileSync(new URL('./fixtures/komga/sse-events.txt', import.meta.url), 'utf8');
  for (const size of [1, 7, raw.length]) {
    const received = [];
    const feed = createEventParser((event) => received.push(event));
    for (let index = 0; index < raw.length; index += size) {
      feed(raw.slice(index, index + size));
    }
    assert.deepEqual(
      received.map((event) => event.type),
      ['BookAdded', 'SeriesAdded', 'BookAdded', 'TaskQueueStatus', 'TaskQueueStatus'],
    );
    assert.equal(JSON.parse(received[1].data).libraryId, '0S09NT9F53PAK');
  }
  const received = [];
  const feed = createEventParser((event) => received.push(event));
  feed(': keep-alive\r\n\r\nevent: X\r\ndata: a\r\ndata: b\r\n\r\n');
  assert.deepEqual(received, [{ type: 'X', data: 'a\nb' }]);
});
