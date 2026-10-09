# ADR 0030: QR scanning and generation for the children's check-in kiosk (`barcode-detector`, `qrcode`)

- Status: Accepted
- Date: 2026-10-08
- Deciders: Ricardo Julia (approved in the G2.2 story, decision 3)
- Related: G2.2 (kiosk self check-in), ADR 0026 (design system), `docs/testing.md`

## Context

Each family gets a children's check-in code, shown on the member Family page as text and a QR code. The kiosk (a church-owned tablet, usually an iPad) reads that QR with its camera and falls back to typing the code. The repo had no QR reading or generation. Reading must work on iPad Safari, and nothing may be fetched from a third-party CDN at run time (a kiosk in a church lobby, a strict privacy posture for a children's screen).

## Decision

- **Reading: `barcode-detector` 3.2.x (MIT), ponyfill entry only** (`barcode-detector/ponyfill`, formats `qr_code`). It implements the standard `BarcodeDetector` API on top of `zxing-wasm` 3.1.3 (MIT, pinned by the package). The reader is loaded with a dynamic `import()` inside a client component loaded with `next/dynamic` (`ssr: false`), so it is not in any other page's bundle. The JS is about 58 KB; the WebAssembly is 1.09 MB (`zxing_reader.wasm`), fetched only when a family taps "Scan".
- **The wasm is self-hosted.** By default zxing-wasm loads its `.wasm` from the jsDelivr CDN. We override `locateFile` (`prepareZXingModule({ overrides: { locateFile } })`) to return `/vendor/zxing_reader.wasm`, a byte-identical copy committed under `public/vendor/`. `lib/kiosk-scanner.test.ts` fails if the copy differs from `node_modules/zxing-wasm/dist/reader/zxing_reader.wasm` (sha-256), so a dependency upgrade forces a re-copy, and the same test decodes a generated QR image with the committed file. Next serves `public/` as `application/wasm`; `proxy.ts` matches `/vendor` and the kiosk redirect lets `/vendor/*` and `.wasm` through.
- **Generating: `qrcode` 1.5.4 (MIT) + `@types/qrcode`.** Used server-side only (`QRCode.toDataURL`) in the Family page's server component, producing an `<img>` with alt text; it ships no code to the browser. Only codes that match `^[0-9A-HJKMNP-TV-Z]{8}$` are rendered. The QR content is the bare 8-character code.
- The camera is opened with `getUserMedia` (`facingMode: environment`), read once, and every track is stopped on read, unmount, or the kiosk's idle reset. A blocked or missing camera, or a reader that fails to load, shows the typed-code fallback.

## Alternatives considered

- **Native `BarcodeDetector` only:** not available in iPad Safari (the main kiosk device) or Firefox. Rejected as the sole path. The ponyfill implements the same API, so a later switch to the native one is a small change.
- **`html5-qrcode`:** unmaintained since 2022; bundles its own UI and an older reader.
- **`qr-scanner` (nimiq):** unmaintained since 2023.
- **`jsQR`:** pure JS, no maintenance since 2021, noticeably worse on small or angled codes.
- **Server-side decoding of uploaded frames:** sends camera images of a children's area to the server. Rejected.

## Consequences

- Two runtime dependencies (`barcode-detector`, `qrcode`) and one dev dependency; MIT throughout. `npm audit` reports are unchanged by these packages.
- 1.09 MB static asset in the repo and the deploy; cached by the browser after the first scan. If the wasm cannot load (offline tablet before first use), the kiosk shows the typed-code fallback.
- Upgrading `barcode-detector` needs a re-copy of the wasm (the test says so).
- Residual: real-iPad camera behaviour is not covered by CI (Chromium fake capture is); verify on a device before the first church uses it.
