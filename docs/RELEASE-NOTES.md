Multiview 0.2.4 for Jellyfin Server/Web 12.1.

The initial stream now has a Remove button. Removing it leaves other streams running. If it ends while other panes exist, it is removed automatically and the remaining panes continue. Multiview moves into an independent container before Jellyfin's original player is stopped, so native player teardown and its route changes do not close the remaining panes. Only the original device session receives the stop command; a cleanup warning appears if this cannot be confirmed.

Removing the last pane exits multiview. Removing the main pane selects a remaining pane as main; active audio transfers to that pane when necessary.

Current Chrome uses a state-preserving DOM move to preserve active players. Older browsers without this API use reattachment and resume, which may briefly interrupt playback. Xbox embedded-browser behavior still requires hardware validation.

Update the plugin, restart Jellyfin, and reload the client. Existing ../Multiview/Client.js loaders need no Compose changes. This release does not claim to resolve the separately reported buffered original-stream stall.
