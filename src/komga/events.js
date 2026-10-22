// -----------------------------------------------------------------------------
// The Server-Sent Events of Komga (`GET /sse/v1/events`): a book or a series
// added by a scan, a reading progress of the account. They only wake the hub
// up (src/hub.js reads the server a few seconds later): the regular reading
// stays the source of truth, so a lost event or a proxy that buffers the
// stream only delays the scene events until the next reading.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';

// A line longer than this is dropped (Komga sends small JSON payloads).
const MAX_LINE = 64 * 1024;

/**
 * Splits a text/event-stream into events. Feed it chunks; it calls
 * `onEvent({ type, data })` at each blank line that ends an event.
 */
export function createEventParser(onEvent) {
  let buffer = '';
  let type = '';
  let data = [];
  const line = (raw) => {
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (text === '') {
      if (type || data.length > 0) {
        onEvent({ type: type || 'message', data: data.join('\n') });
      }
      type = '';
      data = [];
      return;
    }
    if (text.startsWith(':')) {
      return; // a comment (keep-alive)
    }
    const colon = text.indexOf(':');
    const field = colon === -1 ? text : text.slice(0, colon);
    const value = colon === -1 ? '' : text.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') {
      type = value;
    } else if (field === 'data') {
      data.push(value);
    }
  };
  return (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) !== -1) {
      line(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
    }
    if (buffer.length > MAX_LINE) {
      buffer = '';
    }
  };
}

/**
 * Opens the event stream. The emitter sends `open`, `event` ({ type, data })
 * and once `close` (with an Error, or nothing when the server ended it).
 * @param {string} url absolute URL of /sse/v1/events
 * @param {Record<string, string>} headers authentication headers
 * @param {object} [options]
 * @param {number} [options.idleMs] close a stream silent for this long
 * @returns {EventEmitter & { close: () => void }}
 */
export function openEventStream(url, headers, { idleMs = 10 * 60_000 } = {}) {
  const stream = new EventEmitter();
  const target = new URL(url);
  let closed = false;
  const finish = (err) => {
    if (!closed) {
      closed = true;
      stream.emit('close', err);
    }
  };
  const request = (target.protocol === 'https:' ? https : http).request(
    target,
    { headers: { accept: 'text/event-stream', ...headers }, timeout: idleMs },
    (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        request.destroy();
        finish(
          Object.assign(new Error(`HTTP ${response.statusCode}`), { status: response.statusCode }),
        );
        return;
      }
      stream.emit('open');
      response.setEncoding('utf8');
      const parse = createEventParser((event) => stream.emit('event', event));
      response.on('data', parse);
      response.on('end', () => finish());
      response.on('error', finish);
    },
  );
  request.on('timeout', () => {
    request.destroy(Object.assign(new Error('Event stream idle'), { code: 'ETIMEDOUT' }));
  });
  request.on('error', finish);
  request.end();
  stream.close = () => {
    closed = true;
    request.destroy();
  };
  return stream;
}
