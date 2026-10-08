// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import QRCode from "qrcode";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { describe, expect, it } from "vitest";

import { ZXING_WASM_PATH } from "./kiosk-scanner";

const committed = resolve(process.cwd(), "public", ZXING_WASM_PATH.replace(/^\//, ""));
const installed = resolve(process.cwd(), "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm");
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

describe("self-hosted zxing wasm (ADR 0030)", () => {
  it("is the exact file the installed zxing-wasm ships", () => {
    expect(sha(committed), "re-copy node_modules/zxing-wasm/dist/reader/zxing_reader.wasm to public/vendor").toBe(
      sha(installed),
    );
  });

  it("starts with the wasm magic number", () => {
    expect([...readFileSync(committed).subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
  });

  it("reads a family QR code from an image with the committed wasm", async () => {
    prepareZXingModule({
      overrides: { wasmBinary: readFileSync(committed).buffer as ArrayBuffer },
      fireImmediately: false,
    });
    const code = "HK7M2QX9";
    const qr = QRCode.create(code, { errorCorrectionLevel: "M" });
    const scale = 8;
    const margin = 4;
    const size = (qr.modules.size + margin * 2) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < qr.modules.size; y++) {
      for (let x = 0; x < qr.modules.size; x++) {
        if (!qr.modules.get(x, y)) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const i = (((y + margin) * scale + dy) * size + (x + margin) * scale + dx) * 4;
            pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
          }
        }
      }
    }
    const image = { data: pixels, width: size, height: size, colorSpace: "srgb" } as ImageData;
    const results = await readBarcodes(image, { formats: ["QRCode"], maxNumberOfSymbols: 1 });
    expect(results.map((r) => r.text)).toEqual([code]);
  });
});
