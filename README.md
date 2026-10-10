# Jellyfin Multiview

Plugin project targeting **Jellyfin Server/Web 12.1**. Nothing is installed into a Jellyfin server by building this project.

## Install from GitHub

In **Dashboard → Plugins → Repositories**, add **Multiview** with this URL:

```text
https://github.com/mgregor7/jellyfin-multiview/releases/latest/download/manifest.json
```

Open the catalog, install **Multiview**, and restart Jellyfin. Remove or disable the old localhost repository if its helper is no longer running. A server older than **12.1.0.0** will filter this build out of the catalog.

**The web integration is also required.** Download `jellyfin-multiview-0.2.1.zip` from [Releases](https://github.com/mgregor7/jellyfin-multiview/releases/latest), extract it, and run from that directory:

```sh
node scripts/install-web.mjs /actual/path/to/jellyfin-web
```

Reload Jellyfin Web and start a library video. See the installation details below for Docker, permissions, and existing JavaScript injectors.

Start a library video normally, select **Multiview**, and use **+ Add stream** to browse folders or search your library. Selecting a video adds it and closes the sidebar. The original player stays mounted in its original container; added videos have independent players and playback sessions.

- **1:** smaller, centered picture-in-picture-style viewport.
- **2:** over/under.
- **3:** two upper panes (44% height), one full-width lower pane (56%).
- **4:** 2 × 2 grid.
- **5–9:** balanced rows; incomplete last rows expand to fill their width.
- **Auto layout** opens presets: sports, equal windows, main left 50/50, main top 50/50, side by side, and over/under. Select a pane's star to make it the main window. The 50/50 split allocates screen space; video fitting keeps the actual picture undistorted inside that space.
- Window dimensions fit each video's intrinsic aspect ratio by default; toggle **Fit windows to video** in the layout picker to fill allocation cells instead.
- Every pane, including the original, has play/pause, ±10-second seek, timeline, latest available position and volume controls. Rewind/seek requires a seekable buffer from the source; it cannot create a DVR buffer that the provider does not offer.
- **Hide toolbar** makes more room; **Show toolbar** brings it back. **Fullscreen** expands the existing player container without moving video nodes.
- **Diagnostics** shows playback state, buffer and decoded/dropped frame counts. See [the performance investigation](docs/PERFORMANCE.md) for findings and limitations.
- Drag the ↔ handle to move a pane, or ↘ to resize it. Focus a handle and use arrows; Shift + arrows also resizes. **Auto layout** restores the layout.
- **Listen** selects one audio source; selecting the audible pane again mutes all. Added streams start muted.
- **Exit multiview** stops added streams and restores the original player's styling and mute setting. Escape closes the sidebar first, then exits multiview.

Geometry changes do not assign stream URLs, recreate videos, seek, pause, or restart players. Browser/hardware resource limits, network interruptions, provider connection limits and server transcoding capacity can still affect playback.

## Client support

| Client | Status |
| --- | --- |
| Chrome / Jellyfin Web 12.1 | Implemented; automated Chromium tests with real local video playback and mocked Jellyfin API responses pass. Needs testing against your server and scraper streams. |
| Xbox Edge | Same web integration; not tested on a console. |
| Jellyfin Xbox app | Candidate when it loads the modified server web client and uses HTML video. Basic gamepad controls are included (D-pad focus, A activate, B back). Console memory/decoder limits and host gamepad interactions are unverified. |
| Roku Jellyfin app | **Not implemented.** It cannot load this web script. A Roku client change and a separately designed video composition solution are needed; this DLL cannot provide the requested Roku UI by itself. |

Native/external players that do not expose Jellyfin Web's `.videoPlayerContainer video` are not supported. The current integration intentionally targets the normal HTML video player. Native video-only fullscreen (as distinct from the supported whole-multiview fullscreen), subtitle rendering in multiview, synchronized playback, and Live TV channel browsing are outside this first version. The sidebar targets **videos in libraries**, including scraper `.strm` entries negotiated through Jellyfin.

## Upgrade from 0.1.0

If your mounted `index.html` loads `../Multiview/Client.js`, update the plugin in Jellyfin, restart, and hard-refresh Chrome. Keep the existing Compose mount. If you copied a static `multiview.js` into the web directory, rerun the installer from the new ZIP as well.

## Files ready for later installation

`artifacts/jellyfin-multiview-0.2.1.zip` contains:

- `plugin/Jellyfin.Plugin.Multiview.dll` — server plugin, compiled for .NET 10 / Jellyfin 12.1.
- `dist/multiview.js` — self-contained client script, including HLS playback and styles. No runtime CDN dependency.
- `scripts/install-web.mjs` — explicit installer/uninstaller for a web directory you choose.
- This guide and third-party notices.

The **DLL alone cannot inject controls into Jellyfin Web**. Install the client script as well using one of the methods below. The plugin provides a dashboard information page and serves the same script at `<server-base>/Multiview/Client.js`; library and playback requests use Jellyfin's existing authenticated API and the signed-in user's access rights.

### Install later

1. Stop Jellyfin, create a `Multiview` directory under its configured **plugins** directory, copy `Jellyfin.Plugin.Multiview.dll` there, and start Jellyfin. Only copy this plugin DLL, not Jellyfin's own dependency DLLs. Verify it appears in Dashboard → Plugins.
2. Install the web script using **one** method:
   - **Web directory method:** unpack this distribution and run `node scripts/install-web.mjs /path/to/jellyfin-web`. It backs up `index.html` once as `index.html.before-multiview`, copies `dist/multiview.js`, and adds a relative script tag. Run it with an account that can write the web directory. With Docker, prepare/mount the modified web directory or bake it into a custom image; ephemeral container changes do not survive replacement.
   - **Existing JavaScript injection setup:** load the plugin's `<server-base>/Multiview/Client.js` once using your injector. Preserve any reverse-proxy base path. Do not include tokens in the script URL; this endpoint only serves public code.
3. Reload the web client (clear cached page data if necessary), start a library video, then select **Multiview** at the upper right.

Repeat the web installation after Jellyfin Web upgrades. Validate changes against new client versions because the integration uses Web's player DOM and `window.ApiClient`, which are not stable public extension contracts. A packaged native client may load its own web assets; modifying the server web directory does not change those assets.

To remove the web integration: `node scripts/install-web.mjs /path/to/jellyfin-web --uninstall`. Remove the plugin via Dashboard and restart Jellyfin. The web uninstaller removes only its tagged script and `multiview.js`, preserving other edits.

### Resource use and permissions

Each added pane negotiates playback through `/Items/{id}/PlaybackInfo` with an H.264/AAC profile and an 8 Mbps per-stream limit. Compatible MP4 sources use direct playback; other formats use Jellyfin's HLS response with bundled hls.js. Users need permission to play the chosen media and transcode when required. Each secondary player has a separate device identity and play session so stop/progress reports do not replace the original session.

Closing/removing streams reports playback stopped, releases opened live sources, destroys HLS instances and stops that player's active encoding. Cleanup during a hard browser crash or network loss cannot be guaranteed; Jellyfin's own timeout behavior still applies. There is no shared administrator token or custom proxy bypassing library permissions. Media URLs carry the current user's playback token as required by Jellyfin; do not share those URLs.

## Build locally

Requires Node.js 24+, npm, and the .NET 10 SDK.

```sh
npm ci
npm run build
dotnet build server/Jellyfin.Plugin.Multiview.csproj -c Release
python3 scripts/package.py
```

The package command does not install anything. Rebuild the web bundle before rebuilding the DLL, because the DLL embeds that bundle.

## Tests

```sh
npm test
npx playwright install chromium
npm run build
npm run test:browser
```

Linux Chromium also requires its platform runtime libraries. The browser tests serve a loopback fixture, generate a short video locally, and mock Jellyfin API responses; no Jellyfin credentials or external streams are used. They verify playback continuity, layouts, resize/move, sidebar selection/search, audio selection, duplicate handling, session cleanup and negotiation cancellation. Screenshots are written to `artifacts/`.

These checks are not an end-to-end certification of Jellyfin, your sports provider, Xbox or Roku. See `docs/VALIDATION.md` for the later server/hardware checklist.

## References

- [Jellyfin Web 12.1 HTML video player](https://github.com/jellyfin/jellyfin-web/blob/v12.1/src/plugins/htmlVideoPlayer/plugin.js)
- [Jellyfin Web API client integration](https://github.com/jellyfin/jellyfin-web/blob/v12.1/src/lib/jellyfin-apiclient/ServerConnections.js)
- [Jellyfin 12.1 media negotiation endpoints](https://github.com/jellyfin/jellyfin/blob/v12.1/Jellyfin.Api/Controllers/MediaInfoController.cs)
- [Jellyfin Xbox Chromium architecture](https://jellyfin.org/posts/xbox-v0.9.0/)
- [Roku video node API](https://developer.roku.com/dev/docs/video)

## Local plugin repository

For installation through Jellyfin's catalog without public hosting, transfer
`artifacts/jellyfin-multiview-local-repo.zip` to the host and follow
[the local repository instructions](docs/LOCAL-REPOSITORY.md). The bundle includes
a catalog-compatible plugin ZIP, matching manifest, and a Python HTTP helper.
The default repository URL is `http://127.0.0.1:8765/manifest.json`.
Catalog installation still requires the separate web integration step described above.

Generate this additional bundle from the existing distribution with:

```sh
python3 scripts/package-repository.py
```

## GitHub plugin repository

See [GitHub publishing instructions](docs/GITHUB-REPOSITORY.md) for the included
**Publish Jellyfin plugin** workflow. It publishes a downloadable manifest and
plugin package so Jellyfin can install from a public GitHub URL instead of
localhost. The repository URL becomes usable only after a release is published.

Pane borders and controls hide two seconds after the pointer leaves. Hover over a pane or focus its controls with the keyboard to reveal them. Video position and size stay fixed during the transition.
