Multiview for Jellyfin Server/Web 12.1.

- Over/under for two streams; two upper panes and a larger lower pane for three; grids for four through nine.
- Move and resize viewports without restarting their players.
- Browse library videos in a sidebar while playback continues.

To add this repository to Jellyfin, use this release's `manifest.json` download URL. The stable URL is `https://github.com/OWNER/REPO/releases/latest/download/manifest.json`, with OWNER/REPO replaced by this repository's name.

**Web installation is also required.** Download the manual distribution ZIP (`jellyfin-multiview-0.1.0.zip`), extract it, and run `node scripts/install-web.mjs /path/to/jellyfin-web`. The catalog package installs the server DLL; it does not automatically inject the web script.

Chrome is the primary target. Local Chromium tests use generated media and mocked Jellyfin responses; real server streams still need validation. Xbox is unverified and Roku is not supported.
