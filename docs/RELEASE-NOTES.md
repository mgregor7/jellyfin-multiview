Multiview 0.2.7 for Jellyfin Server/Web 12.1.

The Add stream browser now presents Jellyfin artwork in responsive media cards, with title metadata and placeholders when artwork is unavailable. Image requests retain the signed-in user's authentication and reverse-proxy base path.

The browser remembers the containing folder of the most recently added stream. Before another stream has been selected, it uses the initial stream's Jellyfin ancestry. A new Back button clears an active search first, then moves to the parent folder.

Search results are limited to playable movies, episodes and generic video items such as `.strm` entries. Folders and non-video metadata remain available during ordinary browsing but no longer appear in recursive search results.

Update the plugin, restart Jellyfin when active streams have finished, and hard-refresh the web client. Existing ../Multiview/Client.js loaders need no Compose changes.
