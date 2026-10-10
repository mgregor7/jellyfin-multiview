# Playback investigation and limits

The user reported the first stream freezing after a few seconds, with audio stopping too. We cannot access that Jellyfin server, its FFmpeg logs, or the actual sports stream. The precise production cause is unconfirmed.

## Identified problems addressed in 0.2.0

- The gamepad loop previously ran every animation frame and queried all controls even without a connected gamepad. It now polls at 120 ms and scans controls only on an actual button press.
- Drag events and resize observations could request redundant layout reads/writes. Rendering is coalesced to at most one update per animation frame and does not touch video src, currentTime, play/pause, or DOM ownership.
- Every library browse created a fresh device identifier. Browsing now reuses the original device; actual secondary players retain distinct identifiers.
- Direct URLs used legacy `api_key`. Jellyfin 12 supports `ApiKey`; URLs are now normalized to that spelling.
- HLS manifest/segment requests did not carry the pane's full Authorization identity. Same-server HLS requests now use the same identity as negotiation/reporting. The authorization header is not attached to third-party segment origins.
- HLS had a short target buffer but an unbounded-by-us maximum. Secondary players now use a 15 s target, 30 s maximum buffer and 10 s back buffer. Progress reports are coalesced while one is pending and use a 15 s request timeout.
- Multiview control events now stop bubbling into Jellyfin's delegated playback controls.

These are confirmed code issues, not proof that any specific one caused the reported freeze. No watchdog automatically restarts or seeks the original player; deliberate pauses are respected.

## If it freezes again

Open **Diagnostics** in the toolbar. For the first stream:

- `Paused`: playback was paused; use its Play control. The monitor never automatically resumes it.
- `Stalled` and buffer near zero: the player has run out of buffered content. Inspect Network requests and Jellyfin/FFmpeg logs for failures, slow transcoding or upstream disconnects.
- `Stalled` with buffered data: decoding or the player may be stuck. Record ready/network state and decoded/dropped frame counts.
- `Playing` with rapidly increasing dropped frames: the device may be unable to render/decode the aggregate workload. Try fewer streams and compare.

The toolbar diagnostic text contains no stream URLs or access tokens. Server/provider concurrency limits, CPU/GPU decoding capacity and HTTP connection limits still apply. Browser-only generated-media tests cannot certify real provider HLS or server transcoding performance.

## Regression coverage

Tests exercise an already-playing original video without replacing its node/source; independent transport controls; preset changes; viewport fitting; fullscreen/collapse; primary playback with three secondary decoded videos for ten seconds past setup; bounded idle geometry work; and same-server HLS manifest/segment authorization. Unit checks distinguish stalls from intentional pauses and clamp seeking to actual DVR ranges.

## Added HLS streams failing in 0.2.0 (fixed in 0.2.1)

A user HAR showed successful PlaybackInfo negotiation followed by cleanup with no secondary playlist request. The HLS request setup called `isServerUrl`, which called `ApiClient.getUrl` with an empty path. Jellyfin Web 12.1 uses jellyfin-apiclient 1.11.0, whose implementation rejects empty paths with `Url name cannot be empty`. The exception prevented the XHR from being sent.

The origin comparison now builds a nonempty `System/Info/Public` URL without fetching it. Unit and browser fixtures enforce the real client restriction; the pre-fix unit check fails and the corrected check passes. This explains the added-stream startup regression, not the separate original-stream freeze previously reported. The private HAR is excluded from source control.
