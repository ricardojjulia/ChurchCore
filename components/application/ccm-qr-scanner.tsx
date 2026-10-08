"use client";

import { useEffect, useRef } from "react";

import { ZXING_WASM_PATH } from "@/lib/kiosk-scanner";

/**
 * Camera QR reader for the children's check-in kiosk (G2.2). Opens the rear
 * camera, looks for a QR code a few times a second, reports the first one it
 * reads and stops the camera. A missing or blocked camera, or a reader that
 * fails to load, calls `onUnavailable` so the kiosk offers the typed code.
 * The camera is stopped whenever this unmounts (idle reset, leaving the
 * screen). Loaded with next/dynamic (ssr: false); the zxing wasm is served
 * from /vendor so nothing is fetched from a third-party CDN.
 */
export default function CcmQrScanner({
  label,
  onCode,
  onUnavailable,
}: {
  label: string;
  onCode: (rawValue: string) => void;
  onUnavailable: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  const onUnavailableRef = useRef(onUnavailable);

  useEffect(() => {
    onCodeRef.current = onCode;
    onUnavailableRef.current = onUnavailable;
  }, [onCode, onUnavailable]);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let stream: MediaStream | null = null;

    const stop = () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        onUnavailableRef.current();
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        if (!stopped) onUnavailableRef.current();
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      try {
        const video = videoRef.current;
        if (!video) throw new Error("no video element");
        video.srcObject = stream;
        await video.play();

        const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
        prepareZXingModule({
          overrides: {
            locateFile: (path: string, prefix: string) =>
              path.endsWith(".wasm") ? ZXING_WASM_PATH : prefix + path,
          },
        });
        const detector = new BarcodeDetector({ formats: ["qr_code"] });

        const scan = async () => {
          if (stopped) return;
          try {
            const found = await detector.detect(video);
            const value = found.find((item) => item.rawValue)?.rawValue;
            if (value && !stopped) {
              // Read once, then stop: the camera is off before the lookup starts.
              stop();
              onCodeRef.current(value);
              return;
            }
          } catch {
            // A frame that cannot be read is skipped; try the next one.
          }
          if (!stopped) timer = window.setTimeout(scan, 250);
        };
        void scan();
      } catch {
        if (!stopped) {
          stop();
          onUnavailableRef.current();
        }
      }
    }

    void start();
    return stop;
  }, []);

  return (
    <video
      ref={videoRef}
      aria-label={label}
      muted
      playsInline
      style={{
        width: "100%",
        maxHeight: 360,
        borderRadius: 16,
        objectFit: "cover",
        background: "var(--mantine-color-dark-8)",
      }}
    />
  );
}
