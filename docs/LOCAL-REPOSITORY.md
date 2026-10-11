# Install through a repository on your host

Copy **jellyfin-multiview-local-repo.zip** to the Jellyfin host and extract it into a dedicated directory. This is the transfer bundle; the inner `multiview_0.2.5.0.zip` is the package Jellyfin downloads. Do not add either ZIP's path as a repository URL.

## Jellyfin installed directly on the host (or Docker host networking)

From the extracted directory, run:

```sh
python3 serve-repository.py
```

On Windows, `py -3 serve-repository.py` works with the Python launcher. Python 3.9+ is required. The helper listens on `127.0.0.1:8765`, checks the plugin archive's checksum, and updates its download URL in the manifest. It serves only the extracted directory. It does not install files into Jellyfin.

In Jellyfin:

1. Open **Dashboard → Plugins → Repositories** and add a repository.
2. Name: **Local Multiview**.
3. URL: **http://127.0.0.1:8765/manifest.json**.
4. Save, open the plugin catalog, select **Multiview 0.2.5.0**, and install.
5. Restart Jellyfin and verify Multiview appears under installed plugins.

The plugin targets Jellyfin **12.1**. Leave the helper running during installation and future catalog/update checks. You may stop it afterward, but disable the repository in Jellyfin while it is offline to avoid failed repository checks. Port 8765 is separate from Jellyfin's usual port 8096; Jellyfin does not automatically serve arbitrary files copied onto its host.

If 8765 is occupied, use `python3 serve-repository.py --port 8766` and add the printed repository URL instead. The helper also changes the manifest's ZIP download URL to that port.

## Jellyfin in Docker bridge networking

`localhost`/`127.0.0.1` inside Jellyfin refers to the **container**, not the host. A helper running on the host must instead use an address reachable from the container. For example, replace `192.168.1.20` below with your host's actual LAN address:

```sh
python3 serve-repository.py --bind 0.0.0.0 --base-url http://192.168.1.20:8765
```

Add `http://192.168.1.20:8765/manifest.json` in Jellyfin. Both the manifest and ZIP download must be reachable from the container; changing only the repository URL is insufficient because the manifest contains an absolute ZIP URL. Allow the container to reach that host port. This command makes the repository available on the host's network interfaces, so serve only this dedicated directory. Alternatively, run the helper in Jellyfin's network namespace to keep using loopback.

## Required web integration

**Catalog installation installs the server plugin only. This version does not automatically modify Jellyfin Web.** After installing the plugin, run the included client installer from the extracted directory with Node.js available:

```sh
node scripts/install-web.mjs /actual/path/to/jellyfin-web
```

Use an account with write access to that directory. The command backs up `index.html`, copies the bundled `multiview.js`, and registers it once. The path must refer to the web files Jellyfin actually serves, not the plugin folder. For Docker, modify the actual mounted web directory or prepare a persistent custom image; a host directory that is not mounted into the container will have no effect. Repeat this step after Jellyfin Web upgrades. If you already have a JavaScript injector, load `<server-base>/Multiview/Client.js` once instead.

Reload Jellyfin in Chrome, start a library video, then select **Multiview**. Installing the server plugin alone will not show the button. This workflow does not add Roku support; Xbox remains unverified.

## Troubleshooting

- Empty catalog: check the URL from the Jellyfin process/container, the helper's terminal requests, server logs, and server version.
- ZIP download failure: check `sourceUrl` in `manifest.json`; rerun the helper with the correct `--base-url` rather than editing only the repository entry.
- Checksum mismatch: keep the ZIP and manifest from the same generated bundle. The catalog checksum is MD5, as required by Jellyfin's installer; the transfer bundle also has a SHA-256 file.
- Plugin installed but no button: complete the web integration above and reload the web client.

No Jellyfin server was contacted when producing this bundle. Package structure, checksums and local HTTP downloads are tested locally; installation against your running server remains to be verified.

Developer rebuild: first create the normal distribution with `python3 scripts/package.py`, then run `python3 scripts/package-repository.py`.
