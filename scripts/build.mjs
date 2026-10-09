import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['web/src/index.js'], outfile: 'dist/multiview.js', bundle: true, minify: true, format: 'iife', target: ['chrome100'], legalComments: 'linked', loader: { '.css': 'text' } });
await copyFile('web/src/multiview.css', 'dist/multiview.css');
