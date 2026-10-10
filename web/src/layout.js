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

export const HEADER = 32;
export const FOOTER = 56;
export const CHROME = HEADER + FOOTER + 2;
export function fitViewport(cell, width, height, aspect, snap = true) {
  let w = Math.max(2, cell.w * width - 8);
  let h = Math.max(CHROME + 1, cell.h * height - 8);
  if (snap && Number.isFinite(aspect) && aspect > 0) {
    const mediaHeight = Math.max(1, h - CHROME);
    const mediaWidth = Math.min(w - 2, mediaHeight * aspect);
    w = Math.max(2, mediaWidth + 2);
    h = Math.max(CHROME + 1, mediaWidth / aspect + CHROME);
  }
  return { x: cell.x * width + (cell.w * width - w) / 2,
    y: cell.y * height + (cell.h * height - h) / 2, w, h };
}
