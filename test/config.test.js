import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseServerUrl } from '../src/config.js';

test('the address typed by the user becomes a base URL', () => {
  assert.equal(parseServerUrl('192.0.2.10:25600'), 'http://192.0.2.10:25600');
  assert.equal(parseServerUrl(' http://192.0.2.10:25600/ '), 'http://192.0.2.10:25600');
  assert.equal(parseServerUrl('https://example.org/komga/'), 'https://example.org/komga');
  assert.equal(
    parseServerUrl('http://192.0.2.10:25600/series/0S09NT9YS3TF5?x=1#top'),
    'http://192.0.2.10:25600',
  );
  assert.equal(parseServerUrl('https://example.org/komga/dashboard'), 'https://example.org/komga');
  assert.equal(parseServerUrl('http://user:secret@192.0.2.10:25600'), null);
  assert.equal(parseServerUrl('ftp://192.0.2.10'), null);
  assert.equal(parseServerUrl(''), null);
  assert.equal(parseServerUrl(42), null);
});

test('normalizeConfig: defaults, incomplete configuration', () => {
  assert.deepEqual(normalizeConfig({}), {
    url: null,
    credentials: null,
    incomplete: false,
    pollIntervalMs: 300_000,
    language: DEFAULT_CONFIG.language,
  });
  assert.equal(normalizeConfig({ server_url: '192.0.2.10:25600' }).incomplete, true);
  assert.equal(
    normalizeConfig({ server_url: '192.0.2.10:25600', username: 'a@example.org' }).incomplete,
    true,
  );
  const config = normalizeConfig({
    server_url: '192.0.2.10:25600',
    api_key: ' abc ',
    username: 'a@example.org',
    password: 'p',
    poll_interval: '60',
    language: 'de',
  });
  assert.deepEqual(config, {
    url: 'http://192.0.2.10:25600',
    credentials: { apiKey: 'abc' },
    incomplete: false,
    pollIntervalMs: 60_000,
    language: 'de',
  });
  assert.deepEqual(
    normalizeConfig({ server_url: 'nas:25600', username: ' a@example.org ', password: ' p ' })
      .credentials,
    { username: 'a@example.org', password: ' p ' },
  );
  assert.equal(normalizeConfig({ poll_interval: '7', language: 'it' }).pollIntervalMs, 300_000);
});
