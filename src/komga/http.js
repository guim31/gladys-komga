// -----------------------------------------------------------------------------
// The one function that talks to the network: an HTTP(S) request on
// node:http / node:https, with a JSON body, answering the body as text (JSON
// API) or as bytes (covers). Bounded in time and size.
//
// The client takes this function as a parameter: the tests replace it with
// an in-memory Komga server (test/helpers/fakeKomga.js).
// -----------------------------------------------------------------------------

import http from 'node:http';
import https from 'node:https';

const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * @param {string} url absolute URL
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {Record<string, string>} [options.headers]
 * @param {unknown} [options.json] body, sent as JSON
 * @param {boolean} [options.binary] answer the body as a Buffer
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ status: number, headers: Record<string, string>, body: string|Buffer }>}
 */
export function httpRequest(
  url,
  { method = 'GET', headers = {}, json, binary = false, timeoutMs = 15_000 } = {},
) {
  const target = new URL(url);
  const isHttps = target.protocol === 'https:';
  const payload = json === undefined ? undefined : Buffer.from(JSON.stringify(json));
  const requestHeaders = {
    accept: binary ? 'image/*' : 'application/json',
    ...headers,
    ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}),
  };

  return new Promise((resolve, reject) => {
    const request = (isHttps ? https : http).request(
      target,
      { method, headers: requestHeaders, timeout: timeoutMs },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            request.destroy(new Error('Response too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          const body = Buffer.concat(chunks);
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: binary ? body : body.toString('utf8'),
          });
        });
        response.on('error', reject);
      },
    );
    request.on('timeout', () => {
      const error = new Error(`Timed out after ${timeoutMs} ms`);
      error.code = 'ETIMEDOUT';
      request.destroy(error);
    });
    request.on('error', reject);
    request.end(payload);
  });
}
