import test from 'node:test';
import assert from 'node:assert/strict';
import { seekTarget, playbackSample } from '../web/src/media.js';
import { fitViewport, CHROME } from '../web/src/layout.js';

test('seek clamps within DVR ranges and avoids discontinuity gaps', () => {
  const ranges = [{ start: 100, end: 120 }, { start: 130, end: 150 }];
  assert.equal(seekTarget(ranges, 0), 100);
  assert.equal(seekTarget(ranges, 999), 150);
  assert.equal(seekTarget(ranges, 128), 130);
  assert.equal(seekTarget([], 10), null);
});
test('fitted windows match the intrinsic video aspect without cropping or filling the row', () => {
  for (const aspect of [16 / 9, 4 / 3, 9 / 16]) {
    const r = fitViewport({ x: 0, y: 0, w: 1, h: .5 }, 1400, 900, aspect);
    assert.ok(Math.abs((r.w - 2) / (r.h - CHROME) - aspect) < .00001);
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1400 && r.y + r.h <= 450);
  }
});
test('diagnostics distinguish a deliberate pause from a stalled stream', () => {
  const video = { currentTime: 10, paused: false, readyState: 2, networkState: 2, buffered: { length: 0 },
    getVideoPlaybackQuality: () => ({ totalVideoFrames: 10, droppedVideoFrames: 0 }) };
  const first = playbackSample(video, undefined, 0);
  assert.equal(playbackSample(video, first, 6000).state, 'Stalled');
  video.paused = true;
  assert.equal(playbackSample(video, first, 6000).state, 'Paused');
  video.paused = false; video.currentTime = 11; video.readyState = 4;
  assert.equal(playbackSample(video, first, 6000).state, 'Playing');
});
