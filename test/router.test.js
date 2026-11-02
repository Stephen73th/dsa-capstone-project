import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '../src/http/router.js';

describe('Router', () => {
  it('registers and matches exact routes', () => {
    const router = new Router();
    const handler = () => {};
    router.get('/health', handler);

    const match = router.resolve('GET', '/health');
    assert.ok(match);
    assert.equal(match.handler, handler);
    assert.deepEqual(match.params, {});
  });

  it('extracts named parameters', () => {
    const router = new Router();
    const handler = () => {};
    router.get('/events/:id', handler);
    router.post('/events/:eventId/tiers/:tierId', handler);

    const match1 = router.resolve('GET', '/events/event-123');
    assert.ok(match1);
    assert.deepEqual(match1.params, { id: 'event-123' });

    const match2 = router.resolve('POST', '/events/e1/tiers/t2');
    assert.ok(match2);
    assert.deepEqual(match2.params, { eventId: 'e1', tierId: 't2' });
  });

  it('returns null for unmatched routes or methods', () => {
    const router = new Router();
    router.get('/health', () => {});

    assert.equal(router.resolve('POST', '/health'), null);
    assert.equal(router.resolve('GET', '/unknown'), null);
  });
});
