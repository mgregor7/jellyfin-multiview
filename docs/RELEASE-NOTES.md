Multiview 0.2.2 for Jellyfin Server/Web 12.1.

Hovering a pane raises its video, border, controls, and resize handle above overlapping panes. The pane stays in front until another pane is hovered. Layer changes preserve DOM nodes, media sources, playback, and layout. The original video remains in its existing parent with its layer paired to its controls. Toolbar, library sidebar, and menus remain above panes.

Includes the HLS startup fix and auto-hiding controls from 0.2.1. This release does not claim to fix the separately reported original-stream stall, which remains under investigation.

Update the plugin, restart Jellyfin, and hard-refresh the browser. Existing ../Multiview/Client.js loaders need no Compose changes.
