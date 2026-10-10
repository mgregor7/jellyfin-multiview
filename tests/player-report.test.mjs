import test from 'node:test';
import assert from 'node:assert/strict';
import { StreamPlayer, playbackFailure } from '../web/src/player.js';

test('playback errors distinguish network, decoder and HLS HTTP failures without exposing tokens', () => {
  assert.match(playbackFailure({ code: 2 }), /network request failed/);
  assert.match(playbackFailure({ code: 3 }), /video decoding failed/);
  assert.match(playbackFailure({ code: 4 }), /unsupported format/);
  const message = playbackFailure({ details: 'manifestLoadError', response: { code: 401, url: 'https://private/?ApiKey=secret', text: 'secret' }, error: new Error('secret') }, true);
  assert.equal(message, 'HLS playback failed (manifestLoadError; HTTP 401).');
  assert.doesNotMatch(message, /secret|private/);
});

test('pending progress reports are coalesced and stopped still follows them', async () => {
  const calls = [];
  let release;
  const api = { request: async path => {
    calls.push(path);
    if (path.endsWith('/Progress')) await new Promise(resolve => { release = resolve; });
  } };
  const video = { currentTime: 1, paused: false, muted: true, volume: 1, duration: 5 };
  const player = new StreamPlayer(api, { Id: 'item' }, video, () => {});
  const progress = player.report('/Progress');
  await new Promise(resolve => setImmediate(resolve));
  const duplicate = player.report('/Progress');
  const stopped = player.report('/Stopped');
  release();
  await Promise.all([progress, duplicate, stopped]);
  assert.deepEqual(calls, ['Sessions/Playing/Progress', 'Sessions/Playing/Stopped']);
});
