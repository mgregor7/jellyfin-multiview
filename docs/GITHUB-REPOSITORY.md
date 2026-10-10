# Publish the Jellyfin repository on GitHub

Use a **public** GitHub repository so Jellyfin can fetch the catalog and package without GitHub credentials. Keep source files, package-lock.json, scripts and `.github/workflows/release.yml` in it. Do not upload node_modules, server/bin, server/obj, or local credentials.

The first upload of the release workflow to `main` starts publishing automatically. To run it manually, open **Actions → Publish Jellyfin plugin → Run workflow** on the default branch. The workflow builds and tests the project, compiles the DLL, checks package hashes, and publishes a release containing the catalog manifest and root-level DLL package. It uses GitHub's built-in workflow token; a personal access token is not needed in repository secrets. Actions must be enabled and organization policy must permit write access to repository contents.

After the workflow succeeds, add this URL in **Jellyfin Dashboard → Plugins → Repositories**:

```text
https://github.com/OWNER/REPO/releases/latest/download/manifest.json
```

For this repository, use `https://github.com/mgregor7/jellyfin-multiview/releases/latest/download/manifest.json`. Replace `OWNER/REPO` with the actual repository when forking. The URL will return 404 until a published release with the `manifest.json` asset exists. Jellyfin follows the redirect to the latest published release. Its manifest points to that release's version-specific plugin ZIP so the URL and checksum remain paired.

Open the catalog, install Multiview, and restart Jellyfin. **Then install the web script** as described in README.md. GitHub hosting changes how Jellyfin downloads the plugin; it does not remove that web integration requirement.

## Why the plugin may be absent

- Server older than **12.1.0.0**: the current build targets that ABI, so Jellyfin filters it out. Confirm the **server** version in Dashboard. Do not simply lower targetAbi; rebuild against the intended server API/runtime.
- Manifest unreachable: a localhost repository is resolved by the server/container, not your browser. GitHub removes this localhost dependency, but the server still needs outbound HTTPS access.
- Repository disabled, incorrect URL, no published release, or malformed manifest: check server logs when refreshing the catalog.

The workflow publishes version `0.2.2.0` and refuses to overwrite an existing release. Before a subsequent release, update the project version and versioned package names together. The packaging scripts currently target this version explicitly.

For a local preparation without publishing:

```sh
python3 scripts/package-github.py --repository OWNER/REPO
```

This consumes the existing local repository bundle and writes release assets under `artifacts/github-release/`. It does not contact GitHub.
