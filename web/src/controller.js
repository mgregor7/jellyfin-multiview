// Choose the closest visible control in the requested screen direction.
export function directionalTarget(nodes, current, direction) {
  if (!nodes.length) return null;
  if (!nodes.includes(current)) return nodes[0];
  const origin = current.getBoundingClientRect();
  const ox = origin.left + origin.width / 2, oy = origin.top + origin.height / 2;
  let best = null, score = Infinity;
  for (const node of nodes) {
    if (node === current) continue;
    const r = node.getBoundingClientRect();
    const dx = r.left + r.width / 2 - ox, dy = r.top + r.height / 2 - oy;
    const forward = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
    const across = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (forward <= 1) continue;
    const distance = forward + across * 3;
    if (distance < score) { best = node; score = distance; }
  }
  return best || current;
}

export function padDirection(pad) {
  const down = i => pad.buttons[i]?.pressed;
  if (down(12)) return 'up';
  if (down(13)) return 'down';
  if (down(14)) return 'left';
  if (down(15)) return 'right';
  const x = pad.axes?.[0] || 0, y = pad.axes?.[1] || 0;
  if (Math.max(Math.abs(x), Math.abs(y)) < .55) return null;
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
}
