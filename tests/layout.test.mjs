import test from 'node:test';
import assert from 'node:assert/strict';
import { layout, constrain, fitViewport, rectFromViewport } from '../web/src/layout.js';

test('two streams are stacked and three prioritize the bottom pane', () => {
  const two = layout(2);
  assert.equal(two[0].x, two[1].x);
  assert.equal(two[0].w, 1);
  assert.equal(two[1].y, .5);
  const three = layout(3);
  assert.equal(three[0].y, three[1].y);
  assert.ok(three[2].h > three[0].h);
  assert.equal(three[2].w, 1);
});
test('layouts fill available space without overlapping for 2–9 players', () => {
  for (let count = 2; count <= 9; count++) {
    const rects = layout(count);
    assert.equal(rects.length, count);
    assert.ok(Math.abs(rects.reduce((sum, r) => sum + r.w * r.h, 0) - 1) < 1e-10);
    for (const [i, a] of rects.entries()) {
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= 1.000001 && a.y + a.h <= 1.000001);
      for (const b of rects.slice(i + 1)) {
        const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-9 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-9;
        assert.equal(overlap, false);
      }
    }
  }
});
test('dragged and resized panes stay in bounds', () => {
  assert.deepEqual(constrain({ x: -2, y: 2, w: 3, h: .01 }), { x: 0, y: .85, w: 1, h: .15 });
});

test('manual geometry starts from the visible fitted pane rather than its allocation cell', () => {
  assert.deepEqual(rectFromViewport({ left: 250, top: 125, width: 500, height: 250 },
    { left: 100, top: 50, width: 1000, height: 500 }), { x: .15, y: .15, w: .5, h: .5 });
});

test('four automatic streams are maximized and packed together', () => {
  const panes = layout(4).map(cell => fitViewport(cell, 1264, 606, 16 / 9));
  assert.ok(panes.every(pane => Math.abs((pane.w - 2) / (pane.h - 2) - 16 / 9) < 1e-10));
  assert.ok(panes[1].x - (panes[0].x + panes[0].w) <= 2.000001);
  assert.ok(panes[2].y - (panes[0].y + panes[0].h) <= 2.000001);
});

test('equal preset gives every window the same allocation at odd counts', () => {
  for (const count of [3, 5, 7, 9]) {
    const cells = layout(count, 'equal');
    assert.ok(cells.every(r => r.w === cells[0].w && r.h === cells[0].h));
  }
});
test('main presets reserve exactly half the screen for the selected main allocation', () => {
  for (const preset of ['main-left', 'main-top']) {
    for (let count = 2; count <= 9; count++) {
      const [main, ...rest] = layout(count, preset);
      assert.equal(main.w * main.h, .5);
      for (const r of rest) assert.ok(preset === 'main-left' ? r.x >= .5 : r.y >= .5);
    }
  }
});
