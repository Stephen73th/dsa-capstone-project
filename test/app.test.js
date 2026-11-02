import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createApp } from '../src/http/app.js';
import { Router } from '../src/http/router.js';

describe('HTTP App', () => {
  let server;
  let baseUrl;

  before(async () => {
    const router = new Router();
    router.post('/api/test-json', async ({ res, body }) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: body }));
    });

    const staticDir = resolve(process.cwd(), 'public');
    const app = createApp({ staticDir, router });
    server = app.server;

    await new Promise((resolveReady) => {
      // Listen on dynamic port 0
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolveReady();
      });
    });
  });

  after(async () => {
    await new Promise((resolveClose) => server.close(resolveClose));
  });

  it('GET /health returns 200 {"status":"ok"}', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    const data = await response.json();
    assert.deepEqual(data, { status: 'ok' });
  });

  it('unmatched /api paths return 404 with error payload shape', async () => {
    const response = await fetch(`${baseUrl}/api/nonexistent`);
    assert.equal(response.status, 404);
    const data = await response.json();
    assert.ok(data.error);
    assert.equal(data.error.code, 'NOT_FOUND');
    assert.ok(data.error.message);
  });

  it('malformed JSON returns 400 with BAD_REQUEST error code', async () => {
    const response = await fetch(`${baseUrl}/api/test-json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid-json{',
    });
    assert.equal(response.status, 400);
    const data = await response.json();
    assert.equal(data.error.code, 'BAD_REQUEST');
  });

  it('serves static files from public/', async () => {
    const response = await fetch(`${baseUrl}/index.html`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').includes('text/html'));
    const text = await response.text();
    assert.ok(text.includes('Event Ticketing Platform'));
  });

  it('blocks path traversal outside public/', async () => {
    // Attempt directory traversal
    const response = await fetch(`${baseUrl}/../package.json`);
    // Should be blocked (403 Forbidden or 404 Not Found)
    assert.ok([403, 404].includes(response.status));
  });
});
