import { test, expect } from '@playwright/test';

let media;
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4173');
  const bytes = await page.evaluate(async () => {
    const stream = document.querySelector('video').srcObject;
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    const done = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start();
    await new Promise(resolve => setTimeout(resolve, 1800));
    recorder.stop(); await done;
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  });
  media = Buffer.from(bytes);
  await page.close();
});

async function fixture(page, { delay = 0 } = {}) {
  const requests = [];
  await page.route('**/jellyfin/**', async route => {
    const request = route.request(), url = new URL(request.url());
    requests.push({ path: url.pathname, method: request.method(), body: request.postDataJSON(), query: Object.fromEntries(url.searchParams) });
    if (url.pathname.includes('/stream.')) {
      await route.fulfill({ status: 200, contentType: 'video/webm', body: media });
      return;
    }
    let body = {};
    if (url.pathname.endsWith('/Items')) {
      body = url.searchParams.has('ParentId') || url.searchParams.has('SearchTerm') ? {
        Items: Array.from({ length: 10 }, (_, i) => ({ Id: `sport-${i}`, Name: `Sport ${i}`, MediaType: 'Video' })), TotalRecordCount: 10
      } : { Items: [{ Id: 'sports', Name: 'Sports', IsFolder: true }], TotalRecordCount: 1 };
    } else if (url.pathname.endsWith('/PlaybackInfo')) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      body = { PlaySessionId: `session-${requests.length}`, MediaSources: [{ Id: 'source', Container: 'mp4', SupportsDirectPlay: true, LiveStreamId: `live-${requests.length}` }] };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('http://127.0.0.1:4173');
  await expect(page.getByRole('button', { name: '▦ Multiview' })).toBeVisible();
  await page.evaluate(() => { window.playbackEvents = []; window.initialParent = original.parentNode; window.initialSource = original.srcObject; });
  return requests;
}
async function add(page, index) {
  await page.getByRole('button', { name: '+ Add stream' }).click();
  await page.getByRole('button', { name: '▸ Sports' }).click();
  await page.getByRole('button', { name: `+ Sport ${index}`, exact: true }).click();
  await expect(page.locator('.mv-sidebar')).toHaveCount(0);
  await page.locator('.mv-video').evaluateAll(videos => videos.forEach(video => { video.loop = true; }));
}

test('original keeps playing through entry, browsing, geometry changes and exit', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await fixture(page);
  const before = await page.evaluate(() => original.currentTime);
  await page.getByRole('button', { name: '▦ Multiview' }).click();
  await page.getByRole('button', { name: '+ Add stream' }).click();
  await expect(page.locator('.mv-sidebar')).toBeVisible();
  await page.getByRole('button', { name: 'Close library' }).click();
  const handle = page.getByRole('button', { name: 'Move Current stream: use arrow keys' });
  await handle.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowDown');
  const resize = await page.locator('.mv-resize').boundingBox();
  await page.mouse.move(resize.x + 5, resize.y + 5); await page.mouse.down();
  await page.mouse.move(resize.x - 120, resize.y - 70); await page.mouse.up();
  await page.getByRole('button', { name: 'Auto layout' }).click();
  await page.getByRole('button', { name: 'Sports (automatic)', exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/multiview-single.png' });
  await page.getByRole('button', { name: 'Exit multiview' }).click();
  const state = await page.evaluate(() => ({ sameParent: original.parentNode === initialParent, sameSource: original.srcObject === initialSource, paused: original.paused, time: original.currentTime, events: playbackEvents, style: original.getAttribute('style') }));
  expect(state.sameParent).toBe(true); expect(state.sameSource).toBe(true); expect(state.paused).toBe(false);
  expect(state.time).toBeGreaterThan(before); expect(state.events).toEqual([]);
  expect(state.style).toBe('width:100vw;height:100vh'); expect(errors).toEqual([]);
});

test('library selection adds persistent players, arranges 2/3/4 and releases sessions on exit', async ({ page }) => {
  const requests = await fixture(page);
  await page.getByRole('button', { name: '▦ Multiview' }).click();
  for (let i = 0; i < 3; i++) {
    await add(page, i);
    await expect(page.locator('.mv-tile')).toHaveCount(i + 2);
    await expect.poll(() => requests.filter(r => r.path.endsWith('/PlaybackInfo')).length).toBe(i + 1);
    await page.waitForTimeout(100);
    const rects = await page.locator('.mv-tile').evaluateAll(nodes => nodes.map(n => ({ top: n.offsetTop, left: n.offsetLeft, width: n.offsetWidth, height: n.offsetHeight })));
    if (i === 0) { expect(rects[0].left).toBe(rects[1].left); expect(rects[1].top).toBeGreaterThan(rects[0].top); }
    if (i === 1) { expect(rects[0].top).toBe(rects[1].top); expect(rects[2].height).toBeGreaterThan(rects[0].height); }
    if (i === 2) { expect(rects[0].width).toBe(rects[3].width); expect(rects[2].top).toBe(rects[3].top); }
  }
  await expect.poll(() => requests.filter(r => r.path.endsWith('/Sessions/Playing')).length).toBe(3);
  await page.evaluate(() => { window.addedNodes = [...document.querySelectorAll('.mv-video')]; window.addedSources = addedNodes.map(v => v.src); });
  const framesBefore = await page.locator('.mv-video').evaluateAll(videos => videos.map(v => v.getVideoPlaybackQuality().totalVideoFrames));
  await page.getByRole('button', { name: 'Auto layout' }).click();
  await page.getByRole('button', { name: 'Sports (automatic)', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  expect(await page.evaluate(() => addedNodes.every((v, i) => v === document.querySelectorAll('.mv-video')[i] && v.src === addedSources[i]))).toBe(true);
  await page.waitForTimeout(250);
  const framesAfter = await page.locator('.mv-video').evaluateAll(videos => videos.map(v => v.getVideoPlaybackQuality().totalVideoFrames));
  framesAfter.forEach((value, i) => expect(value).toBeGreaterThan(framesBefore[i]));
  await page.screenshot({ path: 'artifacts/multiview-grid.png' });
  await page.getByRole('button', { name: 'Exit multiview' }).click();
  await expect.poll(() => requests.filter(r => r.path.endsWith('/LiveStreams/Close')).length).toBe(3);
  await expect.poll(() => requests.filter(r => r.method === 'DELETE').length).toBe(3);
  await expect.poll(() => requests.filter(r => r.path.endsWith('/Sessions/Playing/Stopped')).length).toBe(3);
  expect(new Set(requests.filter(r => r.method === 'DELETE').map(r => r.query.DeviceId)).size).toBe(3);
  expect(await page.evaluate(() => playbackEvents)).toEqual([]);
});

test('closing while playback negotiation is in flight cleans up the eventual stream', async ({ page }) => {
  const requests = await fixture(page, { delay: 500 });
  await page.getByRole('button', { name: '▦ Multiview' }).click();
  await add(page, 0);
  await page.getByRole('button', { name: 'Exit multiview' }).click();
  await expect.poll(() => requests.filter(r => r.path.endsWith('/LiveStreams/Close')).length).toBe(1);
  await expect(page.locator('.mv-root')).toHaveCount(0);
});

test('search finds library videos and Escape closes sidebar before multiview', async ({ page }) => {
  await fixture(page);
  await page.getByRole('button', { name: '▦ Multiview' }).click();
  await page.getByRole('button', { name: '+ Add stream' }).click();
  await page.getByRole('searchbox').fill('Sport');
  await expect(page.getByRole('button', { name: '+ Sport 0', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.mv-sidebar')).toHaveCount(0);
  await expect(page.locator('.mv-root')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.mv-root')).toHaveCount(0);
});

test('audio selection, duplicate rejection and removal preserve other streams', async ({ page }) => {
  const requests = await fixture(page);
  await page.getByRole('button', { name: '▦ Multiview' }).click();
  await add(page, 0);
  await add(page, 1);
  await expect.poll(() => requests.filter(r => r.path.endsWith('/Sessions/Playing')).length).toBe(2);
  const tiles = page.locator('.mv-tile');
  await tiles.nth(1).getByRole('button', { name: 'Listen', exact: true }).click();
  expect(await page.locator('video').evaluateAll(videos => videos.map(v => v.muted))).toEqual([true, false, true]);
  await tiles.nth(2).getByRole('button', { name: 'Listen', exact: true }).click();
  expect(await page.locator('video').evaluateAll(videos => videos.map(v => v.muted))).toEqual([true, true, false]);
  await page.getByRole('button', { name: '+ Add stream' }).click();
  await page.getByRole('button', { name: '▸ Sports' }).click();
  await page.getByRole('button', { name: '+ Sport 0', exact: true }).click();
  await expect(page.locator('.mv-notice')).toHaveText('This stream is already in multiview.');
  await expect(tiles).toHaveCount(3);
  await page.screenshot({ path: 'artifacts/multiview-library.png' });
  await page.getByRole('button', { name: 'Close library' }).click();
  await page.screenshot({ path: 'artifacts/multiview-three.png' });
  await page.getByRole('button', { name: 'Remove Sport 0' }).click();
  await expect.poll(() => requests.filter(r => r.path.endsWith('/Sessions/Playing/Stopped')).length).toBe(1);
  await expect(tiles).toHaveCount(2);
  expect(await page.evaluate(() => original.paused)).toBe(false);
  await page.getByRole('button', { name: 'Exit multiview' }).click();
});

test('failed secondary playback releases resources and leaves the original playing', async ({ page }) => {
  const requests = await fixture(page);
  await page.route('**/jellyfin/Videos/**/stream.*', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.getByRole('button', { name: '▦ Multiview' }).click();
  await add(page, 0);
  await expect.poll(() => requests.filter(r => r.path.endsWith('/LiveStreams/Close')).length).toBe(1);
  await expect(page.locator('.mv-tile').nth(1).locator('.mv-status')).toContainText('Stream failed');
  expect(await page.evaluate(() => ({ paused: original.paused, events: playbackEvents }))).toEqual({ paused: false, events: [] });
  await page.getByRole('button', { name: 'Exit multiview' }).click();
});

test('independent pause/play and bounded seeking leave other players running', async ({ page }) => {
  await fixture(page);
  // Use decoded, seekable video for the original as well as the secondary player.
  await page.evaluate(async bytes => {
    original.srcObject = null;
    const source = new MediaSource();
    original.src = URL.createObjectURL(source);
    original.loop = true;
    await new Promise(resolve => source.addEventListener('sourceopen', resolve, { once: true }));
    const buffer = source.addSourceBuffer('video/webm; codecs="vp8"');
    const appended = new Promise(resolve => buffer.addEventListener('updateend', resolve, { once: true }));
    buffer.appendBuffer(new Uint8Array(bytes));
    await appended;
    source.endOfStream();
    await original.play();
  }, [...media]);
  await page.getByRole('button', { name: '▦ Multiview' }).click();
  await add(page, 0);
  await page.getByRole('button', { name: 'Pause Sport 0', exact: true }).click();
  expect(await page.evaluate(() => original.paused)).toBe(false);
  expect(await page.locator('.mv-video').evaluate(v => v.paused)).toBe(true);
  await page.getByRole('button', { name: 'Play Sport 0', exact: true }).click();
  await page.getByRole('button', { name: 'Pause Current stream', exact: true }).click();
  expect(await page.locator('.mv-video').evaluate(v => v.paused)).toBe(false);
  await page.getByRole('button', { name: 'Rewind Current stream 10 seconds', exact: true }).click();
  expect(await page.evaluate(() => original.currentTime)).toBeLessThan(.1);
  await page.getByRole('button', { name: 'Forward Current stream 10 seconds', exact: true }).click();
  const seek = await page.evaluate(() => ({ time: original.currentTime, end: original.seekable.end(original.seekable.length - 1) }));
  expect(seek.time).toBeLessThanOrEqual(seek.end);
  await page.getByRole('button', { name: 'Play Current stream', exact: true }).click();
  await page.getByRole('slider', { name: 'Volume Sport 0', exact: true }).fill('0.3');
  expect(await page.locator('.mv-video').evaluate(v => v.volume)).toBeCloseTo(.3);
});

test('layout presets, main selection, aspect fit, collapsed toolbar and fullscreen preserve players', async ({ page }) => {
  const requests = await fixture(page);
  await page.getByRole('button', { name: '▦ Multiview' }).click();
  await add(page, 0); await add(page, 1);
  await page.evaluate(() => { window.savedVideos = [...document.querySelectorAll('video')]; });
  for (const name of ['Equal windows', 'Main left · 50 / 50', 'Main top · 50 / 50', 'Side by side', 'Over / under']) {
    await page.getByRole('button', { name: 'Auto layout', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Auto layout', exact: true }).click();
  await page.getByRole('button', { name: 'Main left · 50 / 50', exact: true }).click();
  await page.getByRole('button', { name: 'Use Sport 1 as main window', exact: true }).click();
  await page.waitForTimeout(100);
  const rects = await page.locator('.mv-tile').evaluateAll(nodes => nodes.map(n => ({ x: n.offsetLeft, w: n.clientWidth, h: n.clientHeight })));
  expect(rects[2].x).toBeLessThan(rects[0].x);
  rects.forEach(r => expect(r.w / (r.h - 88)).toBeCloseTo(16 / 9, 1));
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('videoPlayerContainer'))).toBe(true);
  await page.getByRole('button', { name: 'Hide toolbar', exact: true }).click();
  await expect(page.locator('.mv-toolbar')).toBeHidden();
  await page.getByRole('button', { name: 'Show toolbar', exact: true }).click();
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  expect(await page.evaluate(() => savedVideos.every((v, i) => v === document.querySelectorAll('video')[i]))).toBe(true);
  expect(requests.filter(r => r.path.endsWith('/PlaybackInfo')).length).toBe(2);
  expect(await page.evaluate(() => playbackEvents)).toEqual([]);
  await page.screenshot({ path: 'artifacts/multiview-0.2-main.png' });
});

test('first decoded stream keeps advancing beyond initial buffer while controls and layout are idle', async ({ page }) => {
  test.setTimeout(30000);
  await fixture(page);
  await page.evaluate(async () => {
    original.srcObject = null;
    original.src = '/jellyfin/Videos/original/stream.webm';
    original.loop = true;
    await original.play();
    window.playbackEvents = [];
    window.initialParent = original.parentNode;
    window.initialSource = original.src;
  });
  await page.getByRole('button', { name: '▦ Multiview' }).click();
  for (let i = 0; i < 3; i++) await add(page, i);
  await page.getByRole('button', { name: 'Hide toolbar', exact: true }).click();
  await page.waitForTimeout(200);
  const baseline = await page.evaluate(() => ({ frames: original.getVideoPlaybackQuality().totalVideoFrames, paints: JellyfinMultiview.paintCount() }));
  await page.waitForTimeout(10000);
  const state = await page.evaluate(() => ({ frames: original.getVideoPlaybackQuality().totalVideoFrames, paints: JellyfinMultiview.paintCount(), paused: original.paused,
    sameParent: original.parentNode === initialParent, sameSource: original.src === initialSource, events: playbackEvents }));
  expect(state.frames - baseline.frames).toBeGreaterThan(100);
  expect(state.paints - baseline.paints).toBeLessThan(5);
  expect(state.paused).toBe(false); expect(state.sameParent).toBe(true); expect(state.sameSource).toBe(true); expect(state.events).toEqual([]);
  await page.getByRole('button', { name: 'Show toolbar', exact: true }).click();
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await expect(page.getByLabel('Playback diagnostics')).toContainText('Current stream: Playing');
});

test('HLS manifests and segments carry the pane device identity without touching original playback', async ({ page }) => {
  await fixture(page);
  const headers = [];
  await page.route('**/jellyfin/Items/*/PlaybackInfo', route => route.fulfill({ json: {
    PlaySessionId: 'hls-session', MediaSources: [{ Id: 'hls-source', SupportsTranscoding: true, TranscodingSubProtocol: 'hls', TranscodingUrl: '/Videos/hls/master.m3u8?api_key=old' }]
  } }));
  await page.route('**/jellyfin/Videos/hls/**', async route => {
    headers.push(route.request().headers().authorization);
    if (route.request().url().includes('master.m3u8')) await route.fulfill({ contentType: 'application/vnd.apple.mpegurl', body: '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:2,\nsegment.ts\n#EXT-X-ENDLIST\n' });
    else await route.fulfill({ status: 200, contentType: 'video/mp2t', body: Buffer.alloc(188 * 3) });
  });
  await page.getByRole('button', { name: '▦ Multiview' }).click();
  await add(page, 0);
  await expect.poll(() => headers.length).toBeGreaterThanOrEqual(2);
  expect(headers.every(h => /DeviceId="browser-multiview-/.test(h))).toBe(true);
  expect(await page.evaluate(() => playbackEvents)).toEqual([]);
});
