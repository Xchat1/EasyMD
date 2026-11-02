# Asset sources and licenses

## EasyMD application icon

- Authoritative source: [`app-icon.svg`](./app-icon.svg).
- Created on 2026-11-02 for EasyMD with Codex using newly specified vector geometry: a blue rounded tile, a folded paper shape, and an E drawn from line segments.
- The design uses no font outlines, stock artwork, external images, or traced portions of the previous PNG/ICNS files.
- The SVG and its generated PNG/ICNS derivatives are part of EasyMD's original project assets and are distributed under the root [MIT license](../LICENSE), copyright 2026 Xchat1.
- The prior icon bitmaps had no verifiable source or author records in this repository. They have been replaced rather than assigned an assumed license.

To reproduce the icon exports on macOS:

```sh
node scripts/generate-icons.mjs
```

The exporter requires Node.js, macOS's built-in `sips` and `iconutil`, and Google Chrome at its standard application path. To use another Chrome/Chromium installation, set `EASYMD_CHROME_BIN` to its executable path. It renders only the local SVG in a temporary browser profile with external resources blocked, then uses the native tools for the PNG sizes and ICNS container. It adds no npm or runtime dependency. Pixel rasterization may vary with the browser/OS version; `app-icon.svg` remains the design source.

Generated files:

| File | Size |
| --- | --- |
| `assets/app-icon.png` | 1024 × 1024 |
| `assets/app-icon.icns` | macOS icon set, 16–1024 pixels including Retina variants |
| `public/favicon.png` | 64 × 64 |
| `public/apple-touch-icon.png` | 180 × 180 |
| `public/icon-192.png`, `public/icon-app-192.png`, `public/icon-large-192.png` | 192 × 192 |
| `public/icon-512.png`, `public/icon-app-512.png`, `public/icon-large-512.png` | 512 × 512 |

## README screenshots

The files in [`screenshots/`](./screenshots/) were captured from EasyMD running with demonstration documents on 2026-11-02. They show the project UI and sample content; they do not contain personal user documents. UI components and rendered text may include the project's separately licensed open-source dependencies, whose notices remain in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Third-party UI assets and fonts

Lucide icons and the KaTeX fonts keep their upstream licenses. Their provenance and full license texts are included in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) and the relevant files in [`scripts/licenses/`](../scripts/licenses/). The application icon above does not embed those third-party icons or fonts.
