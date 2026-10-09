// Normalized rectangles keep layout independent of player state and screen size.
export function layout(count) {
  if (!Number.isInteger(count) || count < 1) return [];
  if (count === 1) return [{ x: .2, y: .16, w: .6, h: .65 }];
  if (count === 2) return [0, 1].map(i => ({ x: 0, y: i / 2, w: 1, h: .5 }));
  if (count === 3) return [
    { x: 0, y: 0, w: .5, h: .44 },
    { x: .5, y: 0, w: .5, h: .44 },
    { x: 0, y: .44, w: 1, h: .56 }
  ];
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / columns);
    const inRow = Math.min(columns, count - row * columns);
    return { x: (i % columns) / inRow, y: row / rows, w: 1 / inRow, h: 1 / rows };
  });
}
export function constrain(rect) {
  const w = Math.max(.15, Math.min(1, rect.w));
  const h = Math.max(.15, Math.min(1, rect.h));
  return { x: Math.max(0, Math.min(1 - w, rect.x)), y: Math.max(0, Math.min(1 - h, rect.y)), w, h };
}
