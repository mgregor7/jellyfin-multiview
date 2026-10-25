Multiview 0.2.6 for Jellyfin Server/Web 12.1.

Automatic layouts now maximize the visible video area. Pane headings and transport controls overlay the picture instead of permanently reducing its dimensions, and aspect-fitted panes pack together so a four-stream grid has no unnecessary internal gutters.

Move and resize controls now begin from the pane's actual visible bounds rather than its larger invisible auto-layout allocation. Panes can therefore move all the way to an available stage edge, and resizing no longer jumps or stops against hidden geometry. Selecting an automatic layout restores automatic sizing.

Update the plugin, restart Jellyfin when active streams have finished, and hard-refresh the web client. Existing ../Multiview/Client.js loaders need no Compose changes.
