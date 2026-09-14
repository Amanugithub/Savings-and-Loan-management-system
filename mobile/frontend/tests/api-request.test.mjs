import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from '../src/api-request.mjs';

test('mobile API adds the member bearer token and JSON headers', async () => {
  const originalFetch = globalThis.fetch;
  let received;
  globalThis.fetch = async (url, init) => {
    received = { url, init };
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const result = await request('/api/loans/me', 'member-token');
    assert.deepEqual(result, { ok: true });
    assert.equal(received.init.headers.Authorization, 'Bearer member-token');
    assert.equal(received.init.headers['Content-Type'], 'application/json');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mobile API preserves 409 responses for safe retry handling', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Already handled' }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    await assert.rejects(
      request('/api/loans/loan-1/guarantor-response', 'member-token', { method: 'PATCH' }),
      (error) => error.status === 409 && error.message === 'Already handled'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
