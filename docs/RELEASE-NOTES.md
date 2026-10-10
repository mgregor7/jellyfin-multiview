Multiview 0.2.0 for Jellyfin Server/Web 12.1.

- Individual play/pause, ±10-second seek, timeline, latest available position and volume controls, including for the original stream. Seeking depends on the source's available DVR/seekable buffer.
- Windows fit the video's aspect ratio by default. Disable fitting in the layout picker if you prefer filled allocation cells.
- Collapsible top toolbar and fullscreen for the entire multiview surface.
- Layout picker: automatic sports layout, equal windows, main left (50/50), main top (50/50), side by side, and over/under. Use a pane's star to select the main window.
- Removes animation-frame gamepad polling and unnecessary focus scans, coalesces geometry updates, and bounds secondary HLS buffers. Media requests use supported ApiKey authentication; HLS requests carry the secondary pane's identity.
- Playback diagnostics show pause/buffer/stall state, buffered seconds and decoded/dropped frames. Original stream source and DOM parent are preserved. The reported production freeze has not been reproduced against the user's server; these changes address identified overhead and request isolation, not a proven server-side root cause.

**Upgrading with the existing `/Multiview/Client.js` loader:** update Multiview in Jellyfin's plugin catalog, restart Jellyfin, then hard-refresh Chrome (Ctrl+Shift+R). No Compose mount changes are needed.

**Static multiview.js installation:** update the plugin and rerun the web installer from `jellyfin-multiview-0.2.0.zip` to replace the static script.

Repository URL: https://github.com/mgregor7/jellyfin-multiview/releases/latest/download/manifest.json

Chrome is the primary target. Xbox is unverified and Roku is not supported.
