# macOS preview packaging and release

The default configuration builds an **ad-hoc signed, unnotarized preview**, not a Developer ID release. It does not load signing secrets, import certificates, submit software to Apple, or provide automatic updates.

## Local builds

Use macOS, Node.js 24 and pnpm 10.20.0. Electron 45.2.1 and electron-builder 26.18.0 are pinned in the root package. Install the locked dependencies and allow Electron's normal runtime download:

```sh
pnpm install --frozen-lockfile
node node_modules/electron/install.js
pnpm test
pnpm build
DO_NOT_USE_HARD_LINKS=1 CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder --config electron-builder.yml --mac --arm64 --publish never
node .github/scripts/verify-macos-package.mjs arm64
```

Use `--x64` and `verify-macos-package.mjs x64` for Intel. The release workflow uses a native macOS runner for each architecture. The root project can expose the same build sequence as `desktop:package`.

Outputs go to `release/`, which is a generated directory and must remain excluded from source control. Each architecture produces `EasyMD-<version>-mac-<arch>.dmg`, a matching ZIP, `build-info-<arch>.json` and `SHA256SUMS-<arch>.txt`. The build information records the actual packaged `LSMinimumSystemVersion`, exact runtime/build-tool versions and source commit. The configuration deliberately leaves `minimumSystemVersion` unset to inherit Electron's own requirement.

`asar: false` preserves normal filesystem behavior for the local file service's `O_NOFOLLOW` and hard-link checks. `DO_NOT_USE_HARD_LINKS=1` also prevents a local unpacked app from retaining hard links to the source build. The app payload is limited to `desktop/`, `scripts/desktop-server.mjs`, `dist/`, `LICENSE` and the production `package.json`; project `node_modules`, tests, source documents and repository metadata are excluded. Electron itself is supplied as the runtime framework rather than copied from the project's production dependency tree.

The renderer build already includes EasyMD's original MIT license and third-party notices. Electron-builder 26.18.0 additionally retains the Electron runtime's `LICENSE.electron.txt` and `LICENSES.chromium.html` in the app's Resources folder. The configuration copies explicit duplicates into `Resources/licenses/`; missing runtime notices fail verification rather than silently shipping incomplete attribution.

The build uses the official patched minimatch 11, glob 14, asar 4 and universal 3 releases together. Compatibility tests exercise wildcard file traversal, ASAR creation and the real release file allowlist. Windows Squirrel tooling is explicitly excluded from this macOS-only build graph.

The `afterPack` hook disables Electron RunAsNode, Node options/inspector environment support and privileged file-protocol behavior before the app is signed.

## GitHub workflow

Push an existing version tag matching `package.json`, such as `v1.0.0`, or run `release-macos.yml` manually and supply that tag. The manual path verifies the tag exists and resolves to the checked-out commit. It does not create or move a tag.

The workflow:

1. Tests and packages arm64 on `macos-15` and x64 on `macos-15-intel`.
2. Verifies the ad-hoc signature, app payload, runtime licenses, minimum macOS requirement and per-architecture SHA-256 manifests.
3. Collects DMGs, ZIPs, build information and a combined `SHA256SUMS`.
4. Creates a **draft prerelease**, or refreshes an existing draft of that tag. It refuses to overwrite an already published release.

All third-party Actions are pinned to full commit SHAs. Build jobs have read-only repository access. Only the separate draft-release job receives `contents: write`; no signing or notarization secrets are referenced. Review both architecture packages and the draft notes before publishing the release manually. The release notes disclose the lack of Developer ID signing and notarization and link to Apple's per-app opening instructions rather than asking users to disable Gatekeeper.

## Future Developer ID signing and notarization

`.github/electron-builder-signed.cjs` is an opt-in entry point, excluded from the default workflow. It fails unless `EASYMD_DEVELOPER_IDENTITY` explicitly names a `Developer ID Application:` identity, enables hardened runtime, requires code signing and turns on electron-builder's notarization integration. It reads only the public identity name; it does not load or import a private key.

After the owner has separately configured an appropriate certificate and notarization authentication in a controlled signing environment, use that configuration instead:

```sh
DO_NOT_USE_HARD_LINKS=1 pnpm exec electron-builder --config .github/electron-builder-signed.cjs --mac --arm64 --publish never
```

Electron-builder supports notarization authentication via a configured Apple API key, Apple ID/app-specific password, or an existing named keychain profile. Keep the credentials outside the repository and outside command-line arguments. Do not enable this path merely by adding a notarization claim to the preview notes. A signed release also needs its own signature, notarization-ticket and Gatekeeper validation; the preview verifier intentionally accepts only ad-hoc signatures and must not be reused as evidence of notarization.

References: [Apple Developer ID distribution](https://developer.apple.com/developer-id/), [Apple Gatekeeper guidance](https://support.apple.com/en-us/102445), [Electron distribution](https://www.electronjs.org/docs/latest/tutorial/distribution-overview), and [GitHub runner architectures](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
