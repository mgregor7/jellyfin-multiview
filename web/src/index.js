import { layout, constrain } from './layout.js';
import { JellyfinApi } from './api.js';
import { StreamPlayer } from './player.js';
import css from './multiview.css';

const MAX_STREAMS = 9;
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (text, action, label = text) => {
  const node = el('button', 'mv-button', text);
  node.type = 'button';
  node.setAttribute('aria-label', label);
  node.addEventListener('click', action);
  return node;
};

export class Multiview {
  constructor(video, client) {
    this.original = video;
    this.client = client;
    this.container = video.closest('.videoPlayerContainer');
    this.tiles = [];
    this.pending = new Set();
    this.closed = false;
    this.originalStyle = video.getAttribute('style');
    this.containerStyle = this.container.getAttribute('style');
    this.originalMuted = video.muted;
    this.root = el('section', 'mv-root');
    this.root.setAttribute('aria-label', 'Multiview');
    this.toolbar = el('header', 'mv-toolbar');
    this.toolbar.append(el('strong', '', 'MULTIVIEW'));
    this.counter = el('span', 'mv-counter');
    this.addButton = button('+ Add stream', () => this.openBrowser());
    this.toolbar.append(this.counter, this.addButton, button('Auto layout', () => this.arrange()), button('Exit multiview', () => this.close()));
    this.stage = el('div', 'mv-stage');
    this.notice = el('div', 'mv-notice');
    this.notice.setAttribute('role', 'status');
    this.root.append(this.toolbar, this.stage, this.notice);
    this.container.classList.add('mv-active');
    this.container.append(this.root);
    video.classList.add('mv-original-video');
    this.addTile(video, 'Current stream', true);
    this.resize = new ResizeObserver(() => this.paint());
    this.resize.observe(this.stage);
    this.onKey = event => this.key(event);
    this.onRoute = () => this.close();
    this.onUnload = () => this.close();
    this.onEnded = () => this.close();
    document.addEventListener('keydown', this.onKey, true);
    window.addEventListener('hashchange', this.onRoute);
    window.addEventListener('popstate', this.onRoute);
    window.addEventListener('pagehide', this.onUnload);
    video.addEventListener('ended', this.onEnded);
    video.addEventListener('emptied', this.onEnded);
    this.addButton.focus();
    this.gamepadFrame = requestAnimationFrame(() => this.pollGamepad());
  }
  say(message) { this.notice.textContent = message; }
  addTile(video, name, original = false) {
    const node = el('article', `mv-tile${original ? ' mv-original-tile' : ''}`);
    const heading = el('div', 'mv-tile-heading');
    const title = el('span', 'mv-title', name);
    heading.append(title);
    const audio = button(original && !video.muted ? 'Audio on' : 'Listen', () => this.listen(tile));
    const tile = { video, node, heading, original, audio };
    const status = el('div', 'mv-status');
    status.setAttribute('role', 'status');
    tile.status = status;
    heading.append(audio);
    if (!original) {
      heading.append(button('Play', () => video.play().catch(() => { status.textContent = 'Unable to play this stream.'; })),
        button('×', () => this.remove(tile), `Remove ${name}`));
      node.append(video);
    }
    const move = button('↔', () => {}, `Move ${name}: use arrow keys`);
    move.classList.add('mv-move');
    move.title = 'Drag to move. Arrow keys move; Shift + arrows resize.';
    const resize = button('↘', () => {}, `Resize ${name}: use arrow keys`);
    resize.classList.add('mv-resize');
    heading.prepend(move);
    node.append(heading, status, resize);
    this.stage.append(node);
    this.tiles.push(tile);
    this.bindGeometry(tile, move, false);
    this.bindGeometry(tile, resize, true);
    this.arrange();
    return tile;
  }
  bindGeometry(tile, handle, resizing) {
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      handle.focus();
      handle.setPointerCapture(event.pointerId);
      const initial = { ...tile.rect }, x = event.clientX, y = event.clientY;
      const bounds = this.stage.getBoundingClientRect();
      const update = move => {
        const dx = (move.clientX - x) / bounds.width, dy = (move.clientY - y) / bounds.height;
        tile.rect = constrain(resizing ? { ...initial, w: initial.w + dx, h: initial.h + dy } : { ...initial, x: initial.x + dx, y: initial.y + dy });
        this.paint();
      };
      const end = () => {
        handle.removeEventListener('pointermove', update);
        handle.removeEventListener('lostpointercapture', end);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
      };
      handle.addEventListener('pointermove', update);
      handle.addEventListener('lostpointercapture', end);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });
    handle.addEventListener('keydown', event => {
      const offset = { ArrowLeft: [-.025, 0], ArrowRight: [.025, 0], ArrowUp: [0, -.025], ArrowDown: [0, .025] }[event.key];
      if (!offset) return;
      event.preventDefault(); event.stopPropagation();
      const [dx, dy] = offset, r = tile.rect;
      tile.rect = constrain(resizing || event.shiftKey ? { ...r, w: r.w + dx, h: r.h + dy } : { ...r, x: r.x + dx, y: r.y + dy });
      this.paint();
    });
  }
  arrange() {
    const positions = layout(this.tiles.length);
    this.tiles.forEach((tile, i) => { tile.rect = positions[i]; });
    this.counter.textContent = `${this.tiles.length} / ${MAX_STREAMS} streams`;
    this.paint();
  }
  paint() {
    if (this.closed) return;
    const bounds = this.stage.getBoundingClientRect();
    this.tiles.forEach(tile => {
      const r = tile.rect;
      if (!r) return;
      const geometry = { left: `${r.x * bounds.width + 4}px`, top: `${r.y * bounds.height + 4}px`, width: `${Math.max(0, r.w * bounds.width - 8)}px`, height: `${Math.max(0, r.h * bounds.height - 8)}px` };
      Object.assign(tile.node.style, geometry);
      if (tile.original) {
        Object.assign(tile.video.style, geometry, {
          left: `${bounds.left + r.x * bounds.width + 4}px`, top: `${bounds.top + r.y * bounds.height + 40}px`,
          height: `${Math.max(0, r.h * bounds.height - 44)}px`
        });
      }
    });
  }
  listen(selected) {
    const muteAll = !selected.video.muted;
    for (const tile of this.tiles) {
      tile.video.muted = muteAll || tile !== selected;
      tile.audio.textContent = tile.video.muted ? 'Listen' : 'Audio on';
      tile.player?.started && void tile.player.report('/Progress');
    }
  }
  remove(tile) {
    void tile.player?.stop();
    tile.node.remove();
    this.tiles = this.tiles.filter(t => t !== tile);
    this.arrange();
    this.addButton.focus();
  }
  async add(item, selectionButton) {
    if (this.pending.has(item.Id) || this.tiles.some(t => t.item?.Id === item.Id)) { this.say('This stream is already in multiview.'); return; }
    if (this.tiles.length >= MAX_STREAMS) { this.say(`Up to ${MAX_STREAMS} streams are supported.`); return; }
    this.pending.add(item.Id);
    selectionButton.disabled = true;
    const video = el('video', 'mv-video');
    video.playsInline = true;
    video.muted = true;
    const tile = this.addTile(video, item.Name || 'Stream');
    tile.item = item;
    tile.status.textContent = 'Connecting…';
    tile.player = new StreamPlayer(new JellyfinApi(this.client), item, video, message => { tile.status.textContent = message; });
    this.closeBrowser();
    try { await tile.player.start(); }
    finally { this.pending.delete(item.Id); }
  }
  openBrowser() {
    if (this.sidebar) return;
    this.root.classList.add('mv-browsing');
    this.sidebar = el('aside', 'mv-sidebar');
    this.sidebar.setAttribute('aria-label', 'Browse library');
    const heading = el('div', 'mv-sidebar-heading');
    heading.append(el('h2', '', 'Add a stream'), button('×', () => this.closeBrowser(), 'Close library'));
    this.search = el('input', 'mv-search');
    this.search.type = 'search';
    this.search.placeholder = 'Search this library';
    this.search.setAttribute('aria-label', 'Search library');
    this.breadcrumb = el('div', 'mv-breadcrumb');
    this.results = el('div', 'mv-results');
    this.results.setAttribute('aria-live', 'polite');
    this.sidebar.append(heading, this.search, this.breadcrumb, this.results);
    this.root.append(this.sidebar);
    this.path = [];
    this.search.addEventListener('input', () => {
      clearTimeout(this.searchTimer);
      this.browseAbort?.abort();
      this.searchTimer = setTimeout(() => this.loadItems(), 250);
    });
    this.loadItems();
    this.search.focus();
    this.paint();
  }
  async loadItems(startIndex = 0) {
    if (!this.sidebar) return;
    this.browseAbort?.abort();
    const abort = this.browseAbort = new AbortController();
    const current = this.path.at(-1);
    this.breadcrumb.replaceChildren(button('Libraries', () => { this.path = []; this.search.value = ''; this.loadItems(); }));
    this.path.forEach((part, index) => this.breadcrumb.append(button(part.Name, () => { this.path = this.path.slice(0, index + 1); this.search.value = ''; this.loadItems(); })));
    if (!startIndex) this.results.replaceChildren(el('p', '', 'Loading…'));
    try {
      const data = await new JellyfinApi(this.client).browse(current?.Id, this.search.value.trim(), startIndex, abort.signal);
      if (abort.signal.aborted || !this.sidebar) return;
      if (!startIndex) this.results.replaceChildren();
      const items = (data.Items || []).filter(item => item.IsFolder || item.MediaType === 'Video');
      for (const item of items) {
        const row = button(`${item.IsFolder ? '▸ ' : '+ '}${item.Name || 'Untitled'}`, () => {
          if (item.IsFolder) { this.path.push(item); this.search.value = ''; this.loadItems(); }
          else void this.add(item, row);
        });
        row.classList.add('mv-library-item');
        this.results.append(row);
      }
      const next = startIndex + (data.Items || []).length;
      if (next < data.TotalRecordCount) {
        const more = button('Load more', () => { more.remove(); this.loadItems(next); });
        this.results.append(more);
      }
      if (!this.results.childElementCount) this.results.append(el('p', '', 'No videos or folders found.'));
    } catch (error) {
      if (abort.signal.aborted || !this.sidebar) return;
      this.results.replaceChildren(el('p', '', error.message), button('Try again', () => this.loadItems()));
    }
  }
  closeBrowser() {
    clearTimeout(this.searchTimer);
    this.browseAbort?.abort();
    this.sidebar?.remove();
    this.sidebar = null;
    this.root.classList.remove('mv-browsing');
    this.addButton.focus();
    this.paint();
  }
  key(event) {
    // Keep Jellyfin's global playback hotkeys from pausing the original during browsing.
    const inside = this.root.contains(event.target);
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      this.sidebar ? this.closeBrowser() : this.close();
    } else if (event.key === 'Tab') {
      const controls = [...this.root.querySelectorAll('button:not(:disabled), input')];
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && (index < 0 || index === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
      event.stopPropagation();
    } else if (inside) {
      // Stop bubbling to the host, while allowing the control's own default behavior.
      // The root listener runs after target handlers (e.g. geometry arrow keys).
    }
  }
  pollGamepad() {
    if (this.closed) return;
    const pad = navigator.getGamepads?.().find(p => p?.connected);
    const pressed = pad?.buttons.map(b => b.pressed) || [];
    const rising = index => pressed[index] && !this.previousButtons?.[index];
    const controls = [...this.root.querySelectorAll('button:not(:disabled), input')];
    if (rising(0)) document.activeElement?.click();
    if (rising(1)) this.sidebar ? this.closeBrowser() : this.close();
    if ([12, 13, 14, 15].some(rising) && controls.length) {
      const step = rising(12) || rising(14) ? -1 : 1;
      const index = Math.max(0, controls.indexOf(document.activeElement));
      controls[(index + step + controls.length) % controls.length].focus();
    }
    this.previousButtons = pressed;
    if (!this.closed) this.gamepadFrame = requestAnimationFrame(() => this.pollGamepad());
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.closeBrowser();
    cancelAnimationFrame(this.gamepadFrame);
    this.resize.disconnect();
    document.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('hashchange', this.onRoute);
    window.removeEventListener('popstate', this.onRoute);
    window.removeEventListener('pagehide', this.onUnload);
    this.original.removeEventListener('ended', this.onEnded);
    this.original.removeEventListener('emptied', this.onEnded);
    this.tiles.forEach(tile => { if (!tile.original) void tile.player?.stop(); });
    this.original.classList.remove('mv-original-video');
    this.container.classList.remove('mv-active');
    if (this.originalStyle === null) this.original.removeAttribute('style'); else this.original.setAttribute('style', this.originalStyle);
    if (this.containerStyle === null) this.container.removeAttribute('style'); else this.container.setAttribute('style', this.containerStyle);
    this.original.muted = this.originalMuted;
    this.root.remove();
  }
}

if (!window.JellyfinMultiview) {
  const style = el('style'); style.textContent = css; document.head.append(style);
  let active;
  const launch = button('▦ Multiview', () => {
    const video = document.querySelector('.videoPlayerContainer video:not(.mv-video)');
    if (!video || !window.ApiClient || (active && !active.closed)) return;
    active = new Multiview(video, window.ApiClient);
    active.root.addEventListener('keydown', event => event.stopPropagation());
    launch.hidden = true;
  });
  launch.classList.add('mv-launch');
  launch.hidden = true;
  document.body.append(launch);
  const refresh = () => {
    const video = document.querySelector('.videoPlayerContainer video:not(.mv-video)');
    if (active && !active.closed && (!active.original.isConnected || !window.ApiClient?.accessToken())) active.close();
    launch.hidden = !!(active && !active.closed) || !video || video.readyState < 1 || !window.ApiClient?.accessToken();
  };
  const observer = new MutationObserver(refresh);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('loadedmetadata', refresh, true);
  document.addEventListener('emptied', refresh, true);
  refresh();
  window.JellyfinMultiview = { version: '0.1.0', close: () => active?.close() };
}
