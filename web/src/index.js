import { layout, constrain, fitViewport, HEADER, CHROME } from './layout.js';
import { JellyfinApi } from './api.js';
import { StreamPlayer } from './player.js';
import css from './multiview.css';
import { PRESETS } from './layout.js';
import { seekRanges, seekTarget, playbackSample } from './media.js';

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
    this.preset = 'sports';
    this.snap = true;
    this.mainTile = null;
    this.browseApi = new JellyfinApi(client, undefined, false);
    this.paintCount = 0;
    this.originalStyle = video.getAttribute('style');
    this.containerStyle = this.container.getAttribute('style');
    this.originalMuted = video.muted;
    this.root = el('section', 'mv-root');
    this.root.setAttribute('aria-label', 'Multiview');
    this.toolbar = el('header', 'mv-toolbar');
    this.toolbar.append(el('strong', '', 'MULTIVIEW'));
    this.counter = el('span', 'mv-counter');
    this.addButton = button('+ Add stream', () => this.openBrowser());
    this.layoutButton = button('Auto layout ▾', () => this.toggleLayouts(), 'Auto layout');
    this.layoutButton.setAttribute('aria-expanded', 'false');
    this.fullscreenButton = button('Fullscreen', () => this.toggleFullscreen());
    this.collapseButton = button('Hide toolbar', () => this.setCollapsed(true));
    this.showToolbar = button('Show toolbar', () => this.setCollapsed(false));
    this.showToolbar.classList.add('mv-show-toolbar');
    this.showToolbar.hidden = true;
    this.toolbar.append(this.counter, this.addButton, this.layoutButton, this.fullscreenButton,
      button('Diagnostics', () => this.toggleDiagnostics()), this.collapseButton, button('Exit multiview', () => this.close()));
    this.stage = el('div', 'mv-stage');
    this.notice = el('div', 'mv-notice');
    this.notice.setAttribute('role', 'status');
    this.root.append(this.toolbar, this.stage, this.notice, this.showToolbar);
    // Do not let Multiview controls reach Jellyfin's delegated playback handlers.
    for (const event of ['click', 'dblclick', 'pointerdown', 'pointerup', 'keydown', 'keyup']) {
      this.root.addEventListener(event, e => e.stopPropagation());
    }
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
    this.onFullscreen = () => {
      const label = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
      this.fullscreenButton.textContent = label;
      this.fullscreenButton.setAttribute('aria-label', label);
      this.paint();
    };
    document.addEventListener('fullscreenchange', this.onFullscreen);
    this.gamepadTimer = setInterval(() => this.pollGamepad(), 120);
    this.monitor = setInterval(() => this.updatePlayback(), 1000);
  }
  say(message) { if (this.notice.textContent !== message) this.notice.textContent = message; }
  setCollapsed(collapsed) {
    this.root.classList.toggle('mv-collapsed', collapsed);
    this.toolbar.hidden = collapsed;
    this.showToolbar.hidden = !collapsed;
    this.closeLayouts();
    (collapsed ? this.showToolbar : this.collapseButton).focus();
    this.paint();
  }
  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        if (!this.container.requestFullscreen) throw new Error('Fullscreen is not available in this browser.');
        // Fullscreen the existing parent: the original video is never moved.
        await this.container.requestFullscreen();
        this.ownsFullscreen = true;
      }
    } catch (error) { this.say(error.message || 'Unable to enter fullscreen.'); }
  }
  toggleLayouts() {
    if (this.layoutMenu) { this.closeLayouts(); return; }
    this.layoutMenu = el('div', 'mv-layout-menu');
    this.layoutMenu.setAttribute('role', 'group');
    this.layoutMenu.setAttribute('aria-label', 'Layout presets');
    for (const [id, name] of PRESETS) {
      const choice = button(name, () => { this.preset = id; this.arrange(); this.closeLayouts(); });
      choice.setAttribute('aria-pressed', String(id === this.preset));
      this.layoutMenu.append(choice);
    }
    const fit = button('Fit windows to video', () => {
      this.snap = !this.snap;
      fit.setAttribute('aria-pressed', String(this.snap));
      this.paint();
    });
    fit.setAttribute('aria-pressed', String(this.snap));
    this.layoutMenu.append(fit);
    this.root.append(this.layoutMenu);
    this.layoutButton.setAttribute('aria-expanded', 'true');
    this.layoutMenu.querySelector('button').focus();
  }
  closeLayouts() {
    const focused = this.layoutMenu?.contains(document.activeElement);
    this.layoutMenu?.remove(); this.layoutMenu = null;
    if (focused && !this.toolbar.hidden) this.layoutButton.focus();
    this.layoutButton.setAttribute('aria-expanded', 'false');
  }
  toggleDiagnostics() {
    if (this.diagnostics) { this.diagnostics.remove(); this.diagnostics = null; return; }
    this.diagnostics = el('pre', 'mv-diagnostics');
    this.diagnostics.setAttribute('aria-label', 'Playback diagnostics');
    this.root.append(this.diagnostics);
    this.updatePlayback();
  }
  updatePlayback() {
    for (const tile of this.tiles) {
      tile.sample = playbackSample(tile.video, tile.sample);
      this.updateControls(tile);
      if (tile.original && tile.sample.state === 'Stalled') {
        tile.status.textContent = tile.sample.buffer < .1 ? 'No buffered data. Check stream/server connection.' : 'Playback stalled with buffered data. See Diagnostics.';
      } else if (tile.original && tile.sample.state === 'Playing') tile.status.textContent = '';
    }
    if (this.diagnostics) this.diagnostics.textContent = this.tiles.map((tile, i) => {
      const s = tile.sample;
      return `${i + 1}. ${tile.name}: ${s.state}\n  buffer ${s.buffer.toFixed(1)}s · ready ${s.readyState} · network ${s.networkState}\n  frames ${s.frames ?? 'n/a'} · dropped ${s.dropped ?? 'n/a'} · time ${s.time.toFixed(1)}s`;
    }).join('\n\n');
  }
  updateControls(tile) {
    const { video } = tile;
    const label = video.paused ? 'Play' : 'Pause';
    if (tile.play.textContent !== label) tile.play.textContent = label;
    tile.play.setAttribute('aria-label', `${label} ${tile.name}`);
    const ranges = seekRanges(video);
    tile.back.disabled = tile.forward.disabled = tile.seek.disabled = tile.latest.disabled = !ranges.length;
    if (ranges.length) {
      tile.seek.min = String(ranges[0].start);
      tile.seek.max = String(ranges.at(-1).end);
      if (document.activeElement !== tile.seek) tile.seek.value = String(video.currentTime);
    }
    tile.volume.value = String(video.volume);
    const audioLabel = video.muted ? 'Listen' : 'Audio on';
    if (tile.audio.textContent !== audioLabel) tile.audio.textContent = audioLabel;
  }
  seek(tile, target) {
    const value = seekTarget(seekRanges(tile.video), target);
    if (value === null) { this.say('This stream does not currently offer a seekable buffer.'); return; }
    try { tile.video.currentTime = value; }
    catch { this.say('Seeking is unavailable for this stream.'); }
  }
  async togglePlay(tile) {
    if (!tile.video.paused) tile.video.pause();
    else try { await tile.video.play(); } catch { tile.status.textContent = 'Unable to play. The stream may have disconnected.'; }
    this.updateControls(tile);
  }
  addTile(video, name, original = false) {
    const node = el('article', `mv-tile${original ? ' mv-original-tile' : ''}`);
    const heading = el('div', 'mv-tile-heading');
    const title = el('span', 'mv-title', name);
    heading.append(title);
    const audio = button(original && !video.muted ? 'Audio on' : 'Listen', () => this.listen(tile));
    const tile = { video, node, heading, original, audio, name, listeners: [] };
    if (!this.mainTile) this.mainTile = tile;
    tile.main = button('★', () => {
      this.mainTile = tile;
      for (const entry of this.tiles) entry.main.setAttribute('aria-pressed', String(entry === tile));
      this.arrange();
    }, `Use ${name} as main window`);
    tile.main.setAttribute('aria-pressed', String(this.mainTile === tile));
    heading.append(tile.main);
    const status = el('div', 'mv-status');
    status.setAttribute('role', 'status');
    tile.status = status;
    heading.append(audio);
    if (!original) {
      heading.append(button('×', () => this.remove(tile), `Remove ${name}`));
      node.append(video);
    }
    const move = button('↔', () => {}, `Move ${name}: use arrow keys`);
    move.classList.add('mv-move');
    move.title = 'Drag to move. Arrow keys move; Shift + arrows resize.';
    const resize = button('↘', () => {}, `Resize ${name}: use arrow keys`);
    resize.classList.add('mv-resize');
    heading.prepend(move);
    const controls = el('div', 'mv-controls');
    const row = el('div', 'mv-control-row');
    tile.play = button(video.paused ? 'Play' : 'Pause', () => this.togglePlay(tile));
    tile.back = button('−10s', () => this.seek(tile, video.currentTime - 10), `Rewind ${name} 10 seconds`);
    tile.forward = button('+10s', () => this.seek(tile, video.currentTime + 10), `Forward ${name} 10 seconds`);
    tile.latest = button('Latest', () => this.seek(tile, seekRanges(video).at(-1)?.end), `Jump ${name} to latest available position`);
    tile.volume = el('input', 'mv-volume'); tile.volume.type = 'range';
    tile.volume.min = '0'; tile.volume.max = '1'; tile.volume.step = '.05';
    tile.volume.setAttribute('aria-label', `Volume ${name}`);
    tile.volume.addEventListener('input', () => { video.volume = Number(tile.volume.value); });
    tile.seek = el('input', 'mv-seek'); tile.seek.type = 'range'; tile.seek.step = '.1';
    tile.seek.setAttribute('aria-label', `Seek ${name}`);
    tile.seek.addEventListener('change', () => this.seek(tile, Number(tile.seek.value)));
    row.append(tile.play, tile.back, tile.forward, tile.latest, tile.volume);
    controls.append(row, tile.seek);
    node.append(heading, controls, status, resize);
    const watch = (event, handler) => { video.addEventListener(event, handler); tile.listeners.push([event, handler]); };
    for (const event of ['play', 'pause', 'volumechange', 'durationchange', 'progress']) watch(event, () => this.updateControls(tile));
    watch('loadedmetadata', () => { this.updateControls(tile); this.paint(); });
    watch('resize', () => this.paint());
    this.stage.append(node);
    this.tiles.push(tile);
    this.bindGeometry(tile, move, false);
    this.bindGeometry(tile, resize, true);
    this.updateControls(tile);
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
    const positions = layout(this.tiles.length, this.preset);
    const ordered = this.preset.startsWith('main-')
      ? [this.mainTile, ...this.tiles.filter(tile => tile !== this.mainTile)] : this.tiles;
    ordered.forEach((tile, i) => { tile.rect = positions[i]; });
    this.counter.textContent = `${this.tiles.length} / ${MAX_STREAMS} streams`;
    this.paint();
  }
  paint() {
    if (this.closed || this.paintFrame) return;
    this.paintFrame = requestAnimationFrame(() => {
      this.paintFrame = null;
      if (this.closed) return;
      this.paintCount++;
      const bounds = this.stage.getBoundingClientRect();
      this.tiles.forEach(tile => {
        if (!tile.rect) return;
        const aspect = tile.video.videoWidth && tile.video.videoHeight ? tile.video.videoWidth / tile.video.videoHeight : 16 / 9;
        const g = fitViewport(tile.rect, bounds.width, bounds.height, aspect, this.snap);
        Object.assign(tile.node.style, { left: `${g.x}px`, top: `${g.y}px`, width: `${g.w}px`, height: `${g.h}px` });
        if (tile.original) {
          // Keep the original in its existing DOM location; only its CSS box changes.
          for (const [key, value] of Object.entries({ left: bounds.left + g.x + 1,
            top: bounds.top + g.y + HEADER + 1, width: g.w - 2, height: g.h - CHROME })) {
            tile.video.style.setProperty(key, `${Math.max(0, value)}px`, 'important');
          }
        }
      });
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
    for (const [event, handler] of tile.listeners) tile.video.removeEventListener(event, handler);
    tile.node.remove();
    this.tiles = this.tiles.filter(t => t !== tile);
    if (this.mainTile === tile) {
      this.mainTile = this.tiles[0];
      this.mainTile.main.setAttribute('aria-pressed', 'true');
    }
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
    this.closeLayouts();
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
      const data = await this.browseApi.browse(current?.Id, this.search.value.trim(), startIndex, abort.signal);
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
      if (document.fullscreenElement) void document.exitFullscreen();
      else if (this.layoutMenu) { this.closeLayouts(); this.layoutButton.focus(); }
      else this.sidebar ? this.closeBrowser() : this.close();
    } else if (event.key === 'Tab') {
      const controls = this.focusable();
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
  focusable() {
    return [...this.root.querySelectorAll('button:not(:disabled), input:not(:disabled)')].filter(node => node.getClientRects().length > 0);
  }
  pollGamepad() {
    if (this.closed) return;
    let pad;
    try { pad = navigator.getGamepads?.().find(p => p?.connected); } catch { return; }
    if (!pad) { this.previousButtons = []; return; }
    const pressed = pad?.buttons.map(b => b.pressed) || [];
    const rising = index => pressed[index] && !this.previousButtons?.[index];
    if (!pressed.some((value, i) => value && !this.previousButtons?.[i])) { this.previousButtons = pressed; return; }
    const controls = this.focusable();
    if (rising(0)) document.activeElement?.click();
    if (rising(1)) this.sidebar ? this.closeBrowser() : this.close();
    if ([12, 13, 14, 15].some(rising) && controls.length) {
      const step = rising(12) || rising(14) ? -1 : 1;
      const index = Math.max(0, controls.indexOf(document.activeElement));
      controls[(index + step + controls.length) % controls.length].focus();
    }
    this.previousButtons = pressed;

  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.closeBrowser();
    clearInterval(this.gamepadTimer);
    clearInterval(this.monitor);
    cancelAnimationFrame(this.paintFrame);
    document.removeEventListener('fullscreenchange', this.onFullscreen);
    if (this.ownsFullscreen && document.fullscreenElement === this.container) void document.exitFullscreen().catch(() => {});
    this.resize.disconnect();
    document.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('hashchange', this.onRoute);
    window.removeEventListener('popstate', this.onRoute);
    window.removeEventListener('pagehide', this.onUnload);
    this.original.removeEventListener('ended', this.onEnded);
    this.original.removeEventListener('emptied', this.onEnded);
    this.tiles.forEach(tile => {
      for (const [event, handler] of tile.listeners) tile.video.removeEventListener(event, handler);
      if (!tile.original) void tile.player?.stop();
    });
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
  window.JellyfinMultiview = { version: '0.2.1', close: () => active?.close(), diagnostics: () => active?.tiles.map(t => ({ name: t.name, ...t.sample })), paintCount: () => active?.paintCount };
}
