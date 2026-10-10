import test from 'node:test';
import assert from 'node:assert/strict';
import { StreamPlayer } from '../web/src/player.js';

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
