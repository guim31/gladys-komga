// -----------------------------------------------------------------------------
// The two widgets: valid content for the core in every state (configured or
// not, server down, every language), covers served from Komga, the scan
// button of an administrator.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS } from '../src/hub.js';
import { ACTIONS } from '../src/widgets.js';
import { COVER, createWorld } from './helpers/world.js';

const lower = (id) => id.toLowerCase();

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, key, language = 'en') {
  const ack = await w.fake.widgetGet(key, { settings: {}, language });
  assert.equal(ack.success, true, ack.error);
  const { content: value } = ack.data;
  assert.deepEqual(validateWidgetContent(value), [], `${key} (${language})`);
  return value;
}

test('every widget is valid in every language and state', async (t) => {
  const configured = await world(t);
  configured.server.read(configured.server.bookOf('Green Leaf v01'), configured.clock.now(), 1);
  await configured.hub.refresh();
  const empty = await world(t, { config: {} });
  const down = await world(t);
  down.server.online = false;
  await down.hub.refresh();
  for (const w of [configured, empty, down]) {
    for (const key of Object.values(WIDGET_KEYS)) {
      for (const language of ['en', 'fr', 'de', 'es']) {
        await content(w, key, language);
      }
    }
  }
});

test('recently added: counts, a cover grid, the scan button', async (t) => {
  const w = await world(t);
  const { components } = await content(w, WIDGET_KEYS.RECENTLY_ADDED, 'fr');
  assert.deepEqual(
    components.filter((c) => c.type === 'value').map((c) => [c.label, c.value]),
    [
      ['Séries', 4],
      ['Tomes', 6],
    ],
  );
  const grid = components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    grid.items.map((item) => [item.title, item.image, item.badge.text]),
    [
      ['Yellow Sun', `series-${lower(w.server.seriesOf('Yellow Sun'))}`, 'Comics'],
      ['Green Leaf', `series-${lower(w.server.seriesOf('Green Leaf'))}`, 'Manga'],
      ['Blue Skies', `series-${lower(w.server.seriesOf('Blue Skies'))}`, 'Comics'],
      ['Red Planet', `series-${lower(w.server.seriesOf('Red Planet'))}`, 'Comics'],
    ],
  );
  assert.equal(grid.items[2].description, 'Comics\n2 tomes');
  const button = components.find((c) => c.type === 'button');
  assert.equal(button.action.key, ACTIONS.SCAN);
  const ack = await w.fake.widgetAction(WIDGET_KEYS.RECENTLY_ADDED, ACTIONS.SCAN);
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.fr, 'Scan de 2 bibliothèque(s) lancé.');
  assert.deepEqual(
    w.server.scans,
    w.server.libraries.map((library) => library.id),
  );
});

test('keep reading: the books in progress with their progress', async (t) => {
  const w = await world(t);
  const { components } = await content(w, WIDGET_KEYS.CONTINUE_READING);
  assert.deepEqual(
    components.filter((c) => c.type === 'value').map((c) => [c.label, c.value]),
    [
      ['In progress', 2],
      ['Read today', 1],
    ],
  );
  const [row] = components.find((c) => c.type === 'card-list').items;
  assert.deepEqual(row, {
    title: 'Blue Skies',
    subtitle: 'p. 2/4 · Blue Skies v01',
    image: `book-${lower(w.server.bookOf('Blue Skies v01'))}`,
    badge: { text: '50 %', color: row.badge.color },
  });
});

test('covers come from Komga, only for the keys the widgets declare', async (t) => {
  const w = await world(t);
  for (const key of [
    `series-${lower(w.server.seriesOf('Red Planet'))}`,
    `book-${lower(w.server.bookOf('Blue Skies v01'))}`,
  ]) {
    const ack = await w.fake.widgetGetImage(key);
    assert.equal(ack.success, true, ack.error);
    assert.equal(ack.data.image, COVER.toString('base64'));
  }
  assert.ok(w.server.requests.some((r) => /^\/api\/v1\/books\/[^/]+\/thumbnail$/.test(r.path)));
  for (const key of ['series-x/y', '../etc/passwd', 'cover-2', 'series-']) {
    assert.equal((await w.fake.widgetGetImage(key)).success, false, key);
  }
});
