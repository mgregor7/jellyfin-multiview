// Run only when ready to install: this script edits the specified web directory.
import { readFile, writeFile, copyFile, access, unlink } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const uninstall = args.includes('--uninstall');
const directory = args.find(arg => !arg.startsWith('--'));
if (!directory || args.some(arg => arg.startsWith('--') && arg !== '--uninstall')) {
  console.error('Usage: node scripts/install-web.mjs /path/to/jellyfin-web [--uninstall]');
  process.exit(1);
}
const index = join(resolve(directory), 'index.html');
const marker = '<script defer src="multiview.js" data-jellyfin-multiview="0.2.0"></script>';
const pattern = /<script\b[^>]*\bdata-jellyfin-multiview="[^"]*"[^>]*><\/script>\s*/g;
const html = await readFile(index, 'utf8');
if (uninstall) {
  await writeFile(index, html.replace(pattern, ''));
  await unlink(join(resolve(directory), 'multiview.js')).catch(error => { if (error.code !== 'ENOENT') throw error; });
  console.log('Removed Multiview from the specified web directory.');
} else {
  if (!html.includes('</body>')) throw new Error('Expected Jellyfin index.html with </body>; no changes made.');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  await access(join(root, 'dist/multiview.js'));
  try { await copyFile(index, `${index}.before-multiview`, 1); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await copyFile(join(root, 'dist/multiview.js'), join(resolve(directory), 'multiview.js'));
  await writeFile(index, html.replace(pattern, '').replace('</body>', `${marker}\n</body>`));
  console.log('Installed Multiview. Reload Jellyfin Web; repeat after Jellyfin Web upgrades.');
}
