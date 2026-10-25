export const PRESETS = [
  ['sports', 'Sports (automatic)'],
  ['equal', 'Equal windows'],
  ['main-left', 'Main left · 50 / 50'],
  ['main-top', 'Main top · 50 / 50'],
  ['columns', 'Side by side'],
  ['stack', 'Over / under']
];

function grid(count, equal = false) {
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / columns);
    const inRow = Math.min(columns, count - row * columns);
    return { x: equal ? ((i % columns) + (columns - inRow) / 2) / columns : (i % columns) / inRow,
      y: row / rows, w: 1 / (equal ? columns : inRow), h: 1 / rows };
  });
}

// These are allocation cells. Aspect fitting never changes the players or their order.
export function layout(count, preset = 'sports') {
  if (!Number.isInteger(count) || count < 1) return [];
  if (count === 1) return [preset === 'sports' ? { x: .2, y: .16, w: .6, h: .65 } : { x: 0, y: 0, w: 1, h: 1 }];
  if (preset === 'columns') return Array.from({ length: count }, (_, i) => ({ x: i / count, y: 0, w: 1 / count, h: 1 }));
  if (preset === 'stack') return Array.from({ length: count }, (_, i) => ({ x: 0, y: i / count, w: 1, h: 1 / count }));
  if (preset === 'main-left' || preset === 'main-top') {
    const left = preset === 'main-left';
    return [{ x: 0, y: 0, w: left ? .5 : 1, h: left ? 1 : .5 },
      ...grid(count - 1, true).map(r => left
        ? { x: .5 + r.y / 2, y: r.x, w: r.h / 2, h: r.w }
        : { x: r.x, y: .5 + r.y / 2, w: r.w, h: r.h / 2 })];
  }
  if (preset === 'equal') return grid(count, true);
  if (count === 2) return layout(count, 'stack');
  if (count === 3) return [
    { x: 0, y: 0, w: .5, h: .44 },
    { x: .5, y: 0, w: .5, h: .44 },
    { x: 0, y: .44, w: 1, h: .56 }
  ];
  return grid(count);
}
export function constrain(rect) {
  const w = Math.max(.15, Math.min(1, rect.w));
  const h = Math.max(.15, Math.min(1, rect.h));
  return { x: Math.max(0, Math.min(1 - w, rect.x)), y: Math.max(0, Math.min(1 - h, rect.y)), w, h };
}

export const FRAME = 2;
export function fitViewport(cell, width, height, aspect, snap = true) {
  // The heading and transport controls overlay the picture. Only the border is
  // outside the usable video area, so don't sacrifice 88px of every auto pane.
  let w = Math.max(FRAME + 1, cell.w * width - 2);
  let h = Math.max(FRAME + 1, cell.h * height - 2);
  if (snap && Number.isFinite(aspect) && aspect > 0) {
    const mediaWidth = Math.min(w - FRAME, (h - FRAME) * aspect);
    w = Math.max(FRAME + 1, mediaWidth + FRAME);
    h = Math.max(FRAME + 1, mediaWidth / aspect + FRAME);
  }
  const align = (start, size, fitted, total) => {
    const center = start + size / 2;
    if (center < .5 - 1e-9) return (start + size) * total - fitted;
    if (center > .5 + 1e-9) return start * total;
    return start * total + (size * total - fitted) / 2;
  };
  // Pack fitted panes toward the middle instead of centering each one in its
  // allocation. This leaves unused letterbox space at the outside edge rather
  // than creating a large gutter between neighboring streams.
  return { x: align(cell.x, cell.w, w, width), y: align(cell.y, cell.h, h, height), w, h };
}

export function rectFromViewport(box, bounds) {
  return constrain({ x: (box.left - bounds.left) / bounds.width,
    y: (box.top - bounds.top) / bounds.height,
    w: box.width / bounds.width, h: box.height / bounds.height });
}
