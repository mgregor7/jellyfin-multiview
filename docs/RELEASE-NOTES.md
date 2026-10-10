Multiview 0.2.3 for Jellyfin Server/Web 12.1.

Adds controller navigation for Xbox testing: D-pad/left stick navigates controls, A activates, B backs out of menus/library/fullscreen/multiview, LB/RB cycles panes, X toggles selected-pane playback, and Y opens the library. Left/right adjusts focused volume and seek sliders. On move/resize handles, A enters adjustment mode; directional input adjusts geometry and A/B finishes. Focus raises the pane and keeps its controls visible. Library and layout menus restrict directional navigation to their own controls.

The Multiview launch button now joins Jellyfin's native playback button row and inherits its visibility. A standalone fallback fades after three idle seconds and reveals on pointer or keyboard activity.

Validated with browser tests and simulated gamepad input. Xbox console and embedded-webview playback compatibility still require physical-device testing. This release does not resolve the separately reported original-stream stall.

Update the plugin, restart Jellyfin, and hard-refresh the browser. Existing ../Multiview/Client.js loaders need no Compose changes.
