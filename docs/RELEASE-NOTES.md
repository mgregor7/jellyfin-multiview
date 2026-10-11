Multiview 0.2.5 for Jellyfin Server/Web 12.1.

The initial pane resolves its stream title and item identity from Jellyfin's playback session, with the native playback title as a fallback.

A centered Restart stream button appears on playback errors or after fifteen seconds of stalled playback, prolonged buffering, or connection startup. Intentional pauses do not trigger it. Restart reconnects the selected stream in its existing pane, preserving layout and audio settings. It negotiates a fresh playback session; this is not a guaranteed resume at the prior playback position. Restarting the initial stream converts it to an independent multiview player. Other panes retain their players.

Exit fullscreen now clears nested Jellyfin/multiview fullscreen layers, synchronizes the initial button label, and guards overlapping fullscreen requests.

Browser tests cover initial titles, restarting initial and added streams independently, original-player teardown, and nested fullscreen exit. Xbox/native embedded-browser behavior still needs physical-device validation.

Update the plugin, restart Jellyfin, and reload the client. Existing ../Multiview/Client.js loaders need no Compose changes.
