import test from 'node:test';
import assert from 'node:assert/strict';
import { JellyfinApi, randomId } from '../web/src/api.js';
const client = {
  getCurrentUserId: () => 'user1', deviceId: () => 'main', accessToken: () => 'secret',
  getUrl: (path, query) => `https://example.test/jellyfin/${path}?${new URLSearchParams(query)}`
};
test('library browsing preserves the server prefix and uses the signed-in user', async () => {
  let captured;
  const api = new JellyfinApi(client, async (url, init) => {
    captured = { url: new URL(url), init };
    return new Response(JSON.stringify({ Items: [] }));
  });
  await api.browse('sports', 'A & B', 60);
  assert.equal(captured.url.pathname, '/jellyfin/Users/user1/Items');
  assert.equal(captured.url.searchParams.get('SearchTerm'), 'A & B');
  assert.equal(captured.url.searchParams.get('ParentId'), 'sports');
  assert.equal(captured.url.searchParams.get('StartIndex'), '60');
  assert.match(captured.init.headers.Authorization, /Token="secret"/);
  assert.equal(captured.url.searchParams.has('api_key'), false);
  assert.notEqual(api.deviceId, new JellyfinApi(client).deviceId);
});
test('authorization failures propagate without leaking response content', async () => {
  const api = new JellyfinApi(client, async () => new Response('private details', { status: 403 }));
  await assert.rejects(api.browse(), { message: 'Jellyfin request failed (403).' });
});

test('session IDs work on HTTP LAN origins without randomUUID', () => {
  const provider = { getRandomValues: bytes => crypto.getRandomValues(bytes) };
  assert.match(randomId(provider), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(randomId(provider), randomId(provider));
});

test('media URLs use supported Jellyfin authentication and the pane identity', () => {
  const api = new JellyfinApi(client);
  const url = new URL(api.mediaUrl('Videos/id/master.m3u8', { api_key: 'old', PlaySessionId: 'session' }));
  assert.equal(url.searchParams.get('ApiKey'), 'secret');
  assert.equal(url.searchParams.has('api_key'), false);
  assert.equal(url.searchParams.get('DeviceId'), api.deviceId);
  assert.equal(url.searchParams.get('PlaySessionId'), 'session');
  assert.equal(api.isServerUrl('https://other.test/segment.ts'), false);
  assert.equal(api.isServerUrl('https://example.test/jellyfin/segment.ts'), true);
});
test('library browsing can reuse the main identity without creating a new device each request', () => {
  const api = new JellyfinApi(client, undefined, false);
  assert.equal(api.deviceId, 'main');
});
