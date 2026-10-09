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
    const rects = await page.locator('.mv-tile').evaluateAll(nodes => nodes.map(n => ({ top: n.offsetTop, left: n.offsetLeft, width: n.offsetWidth, height: n.offsetHeight })));
    if (i === 0) { expect(rects[0].left).toBe(rects[1].left); expect(rects[1].top).toBeGreaterThan(rects[0].top); }
    if (i === 1) { expect(rects[0].top).toBe(rects[1].top); expect(rects[2].height).toBeGreaterThan(rects[0].height); }
    if (i === 2) { expect(rects[0].width).toBe(rects[3].width); expect(rects[2].top).toBe(rects[3].top); }
  }
  await expect.poll(() => requests.filter(r => r.path.endsWith('/Sessions/Playing')).length).toBe(3);
  await page.evaluate(() => { window.addedNodes = [...document.querySelectorAll('.mv-video')]; window.addedSources = addedNodes.map(v => v.src); });
  const framesBefore = await page.locator('.mv-video').evaluateAll(videos => videos.map(v => v.getVideoPlaybackQuality().totalVideoFrames));
  await page.getByRole('button', { name: 'Auto layout' }).click();
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
