# Validation on your Jellyfin installation

This project has not contacted or modified a Jellyfin installation. Local checks use Chromium with generated media and mocked API responses; the server DLL is compiled against Jellyfin 12.1 packages.

When you install it later:

1. Confirm Server and Web are 12.1 and the plugin loads without errors. Confirm the client script is loaded only once and the browser console has no errors.
2. Start one real scraper library video normally. Record its media source/session, select Multiview and verify audio/video continue without restarting.
3. Browse nested libraries and search while the first video remains visible. Check a restricted user only sees permitted items. Verify reverse-proxy base paths if used.
4. Add one, two, then three additional streams. Check over/under, larger lower pane for three, and 2 × 2 for four. Exercise HLS transcoding as well as direct MP4. Test a `.strm` source that requires opening if your provider uses it.
5. Move/resize each viewport with mouse and keyboard; open/close the sidebar and resize the browser. Network tools should show no new PlaybackInfo requests from layout changes.
6. Select audio from different panes. Check only one is audible. Remove a pane and confirm only its encoding/live-source session stops. Exit and confirm the original keeps playing.
7. Try an offline stream, missing permission, revoked session and a slow connection. Close multiview while a new stream is negotiating. Check server encodings and open sources are released.
8. Test 5–9 streams only within your provider's connection limits and the server/client's decoding and transcoding capacity. The local pane limit is nine, not a promise that every device can decode nine streams.
9. On Xbox, verify whether the app actually loads the modified server web assets. Test D-pad, A/B, handles, focus and audio. Record console model, client version and practical stream count. Treat Xbox as unverified until these checks pass.

Roku requires a separate project: client UI integration and a compositor capable of changing a single output stream's layout while inputs remain running. A fixed FFmpeg mosaic would not satisfy the requested interactive workflow on its own. No Roku support is shipped in this package.
