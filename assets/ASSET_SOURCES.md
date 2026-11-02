# Asset sources and licenses

## EasyMD application icon

- Authoritative source: [`app-icon-source.png`](./app-icon-source.png), 1254 × 1254 pixels.
- This is the established EasyMD icon: a three-dimensional blue rounded tile, folded white document and dark blue **Md** lettering. The original project image-generation output from 2026-11-01 was recovered and preserved byte-for-byte, matching the existing EasyMD PWA and the maintainer's reference.
- Original generation output identifier: `exec-9844bc99-22b8-4d73-ab67-9ee34c4a605c.png`.
- Source SHA-256: `1dcb2c93b5d0879ac001bd9bc82edf47ba79fa4a0f728dab8056d1d3329f7518`.
- Version 1.0.0 mistakenly substituted a different E icon during release preparation. Version 1.0.1 restores the original Md artwork at the maintainer's explicit request. The E SVG is removed so it cannot become the build source again.
- These are project icon assets; the root [license](../LICENSE) and separately retained third-party notices remain in the distribution. This record documents the recovered source and export chain without inventing an external stock-art license or a new human artist attribution.

To reproduce the icon exports on macOS:

```sh
node scripts/generate-icons.mjs
```

The exporter requires Node.js and macOS's built-in `sips` and `iconutil`. It checks the original source fingerprint and only resizes that image to the PNG sizes and ICNS members. It does not redraw the icon, generate new artwork, open a browser or access the network. Export metadata may vary with the OS version; `app-icon-source.png` remains the unchanged design source.

Generated files:

| File | Size |
| --- | --- |
| `assets/app-icon-source.png` | 1254 × 1254, preserved original |
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
