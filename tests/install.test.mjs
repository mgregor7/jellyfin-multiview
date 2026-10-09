import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

test('web installation is idempotent and uninstall preserves unrelated edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'multiview-install-'));
  const index = join(directory, 'index.html');
  const original = '<html><body><p>Jellyfin fixture</p></body></html>';
  const installer = resolve('scripts/install-web.mjs');
  try {
    await writeFile(index, original);
    execFileSync(process.execPath, [installer, directory]);
    execFileSync(process.execPath, [installer, directory]);
    let html = await readFile(index, 'utf8');
    assert.equal(html.match(/data-jellyfin-multiview/g).length, 1);
    assert.equal(await readFile(`${index}.before-multiview`, 'utf8'), original);
    html = html.replace('<p>', '<p class="custom">');
    await writeFile(index, html);
    execFileSync(process.execPath, [installer, directory, '--uninstall']);
    assert.equal(await readFile(index, 'utf8'), original.replace('<p>', '<p class="custom">'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
