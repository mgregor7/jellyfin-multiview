Multiview 0.2.1 for Jellyfin Server/Web 12.1.

Fixes added HLS streams failing before the playlist request was sent. The origin check used an empty path with Jellyfin ApiClient.getUrl, which throws in the real client. It now uses a nonempty endpoint solely to determine the server origin.

Pane borders, headings, playback controls, scrub bars, and resize handles now hide two seconds after the pointer leaves. Hovering or keyboard focus reveals controls immediately without changing video geometry or playback.

Playback errors now distinguish browser network/decoder errors and HLS failure details with HTTP status where available, without displaying stream URLs or access tokens. Regression fixtures now reject empty URL paths like the real Jellyfin client.

Update the plugin, restart Jellyfin, and hard-refresh the browser. Existing installations using ../Multiview/Client.js need no Compose or loader changes. Static multiview.js installations should rerun the installer from jellyfin-multiview-0.2.1.zip.
