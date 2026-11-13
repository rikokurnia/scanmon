"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { expandUPCE, validateBarcode } from "@/lib/barcode";
import { recordScan } from "@/lib/hunt-progress";
export type ScanState = "idle" | "requesting" | "scanning" | "found" | "error";
export function useScanner(active: boolean) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const controls = useRef<IScannerControls | null>(null);
  const generation = useRef(0);
  const lastCode = useRef("");
  const [state, setState] = useState<ScanState>("idle");
  const [code, setCode] = useState("");
  const [snapshot, setSnapshot] = useState("");
  const [message, setMessage] = useState("");
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const stop = useCallback(() => {
    generation.current++;
    controls.current?.stop();
    controls.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setTorch(false);
    setTorchSupported(false);
  }, []);
  useEffect(() => {
    return () => stop();
  }, [active, stop]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        stop();
        setState((current) => (current === "found" ? "found" : "idle"));
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [stop]);
  const accept = useCallback(
    (input: string) => {
      const valid = validateBarcode(input);
      if (!valid) return false;
      if (lastCode.current === valid) return true;
      if (video.current?.videoWidth) {
        const canvas = document.createElement("canvas");
        canvas.width = video.current.videoWidth;
        canvas.height = video.current.videoHeight;
        canvas.getContext("2d")?.drawImage(video.current, 0, 0);
        setSnapshot(canvas.toDataURL("image/jpeg", 0.9));
      }
      recordScan(valid);
      lastCode.current = valid;
      setCode(valid);
      setState("found");
      setMessage("");
      stop();
      return true;
    },
    [stop],
  );
  async function start() {
    stop();
    const session = generation.current;
    lastCode.current = "";
    setCode("");
    setSnapshot("");
    setMessage("");
    setState("requesting");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera access needs HTTPS or localhost. You can enter a barcode in Settings.",
        );
      const [
        { BrowserMultiFormatReader },
        {
          BarcodeFormat,
          DecodeHintType,
          NotFoundException,
          ChecksumException,
          FormatException,
        },
      ] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      if (session !== generation.current) return;
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (session !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const track = media.getVideoTracks()[0];
      track.addEventListener(
        "ended",
        () => {
          if (session === generation.current) {
            stop();
            setState("error");
            setMessage(
              "Camera disconnected. Try again or enter a barcode in Settings.",
            );
          }
        },
        { once: true },
      );
      const capabilities =
        track.getCapabilities?.() as MediaTrackCapabilities & {
          torch?: boolean;
        };
      setTorchSupported(Boolean(capabilities?.torch));
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 180,
      });
      const scanner = await reader.decodeFromStream(
        media,
        video.current!,
        (result, error, scannerControls) => {
          if (session !== generation.current) {
            scannerControls.stop();
            return;
          }
          if (result) {
            const raw = result.getText();
            const valid =
              result.getBarcodeFormat() === BarcodeFormat.UPC_E
                ? expandUPCE(raw)
                : validateBarcode(raw);
            if (valid) {
              accept(valid);
              scannerControls.stop();
            }
          } else if (
            error &&
            !(error instanceof NotFoundException) &&
            !(error instanceof ChecksumException) &&
            !(error instanceof FormatException)
          ) {
            stop();
            setState("error");
            setMessage(
              "The camera could not read this frame. Try again or use manual entry in Settings.",
            );
          }
        },
      );
      if (session !== generation.current) {
        scanner.stop();
        return;
      }
      controls.current = scanner;
      setState("scanning");
    } catch (error) {
      if (session !== generation.current) return;
      stop();
      setState("error");
      const name = error instanceof Error ? error.name : "";
      setMessage(
        name === "NotAllowedError"
          ? "Camera permission is off. Allow camera access in your browser settings, then try again. Or enter the code in Settings."
          : name === "NotFoundError"
            ? "No camera found. Use Help to enter your barcode manually."
            : name === "NotReadableError"
              ? "Camera is busy. Close other apps using it and try again."
              : error instanceof Error
                ? error.message
                : "Camera unavailable. Try again or enter a barcode in Settings.",
      );
    }
  }
  async function toggleTorch() {
    if (!torchSupported || !stream.current) {
      setMessage(
        state === "scanning"
          ? "Flash unavailable on this camera. Try brighter, even lighting."
          : "Flash unavailable. Start the camera first; supported cameras can turn on the light.",
      );
      return;
    }
    try {
      await stream.current.getVideoTracks()[0].applyConstraints({
        advanced: [{ torch: !torch } as MediaTrackConstraintSet],
      });
      setTorch(!torch);
      setMessage("");
    } catch {
      setTorchSupported(false);
      setTorch(false);
      setMessage("Flash unavailable in this browser. Try brighter lighting.");
    }
  }
  // ZXing 1D results expose scan-line endpoints, not reliable rectangular bounds.
  // Keep the guide centered instead of inventing a bounding box.
  return {
    video,
    state,
    code,
    message,
    snapshot,
    torch,
    torchSupported,
    start,
    accept,
    toggleTorch,
  };
}
