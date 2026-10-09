// Where the kiosk's QR reader loads its WebAssembly from. The file is a copy of
// node_modules/zxing-wasm/dist/reader/zxing_reader.wasm committed under
// public/vendor (ADR 0030); lib/kiosk-scanner.test.ts fails if the copy drifts
// from the installed package, so upgrading barcode-detector means re-copying it.
export const ZXING_WASM_PATH = "/vendor/zxing_reader.wasm";
