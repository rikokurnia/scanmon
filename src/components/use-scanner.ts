"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { expandUPCE, validateBarcode } from "@/lib/barcode";
import { resolveScanResult } from "@/lib/scan-result";
import { recordScan } from "@/lib/hunt-progress";
export type ScanState = "idle" | "requesting" | "scanning" | "found" | "error";
export function useScanner(active: boolean) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const controls = useRef<IScannerControls | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const resumeLoop = useRef<(() => void) | null>(null);
  const quietUntil = useRef(0);
  const [state, setState] = useState<ScanState>("idle");
  const [code, setCode] = useState("");
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
  const accept = useCallback((input: string) => {
    const valid = validateBarcode(input);
    if (!valid) return false;
    if (locked.current) return true;
    locked.current = true;
    recordScan(valid);
    setCode(valid);
    setState("found");
    setMessage("");
    controls.current?.stop();
    return true;
  }, []);
  async function start() {
    stop();
    const session = generation.current;
    locked.current = false;
    setCode("");
    setMessage("");
    setState("requesting");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera access needs HTTPS or localhost. Open the secure app link and try again.",
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
              "Camera disconnected. Tap the camera area to try again.",
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
      video.current!.srcObject = media;
      await video.current!.play();
      if (session !== generation.current) return;
      resumeLoop.current = () => {
        const scanner = reader.scan(video.current!, (result, error) => {
          if (
            session !== generation.current ||
            locked.current ||
            Date.now() < quietUntil.current
          )
            return;
          if (result) {
            const raw = result.getText();
            const valid =
              result.getBarcodeFormat() === BarcodeFormat.UPC_E
                ? expandUPCE(raw)
                : validateBarcode(raw);
            if (valid) accept(valid);
          } else if (
            error &&
            !(error instanceof NotFoundException) &&
            !(error instanceof ChecksumException) &&
            !(error instanceof FormatException)
          ) {
            stop();
            setState("error");
            setMessage(
              "Camera unavailable. Check camera access and tap to try again.",
            );
          }
        });
        controls.current = scanner;
        if (locked.current) scanner.stop();
      };
      setState("scanning");
      resumeLoop.current();
    } catch (error) {
      if (session !== generation.current) return;
      stop();
      setState("error");
      const name = error instanceof Error ? error.name : "";
      setMessage(
        name === "NotAllowedError"
          ? "Camera permission is off. Allow camera access in your browser settings, then try again."
          : name === "NotFoundError"
            ? "No camera found. Open scanMon on a device with a camera."
            : name === "NotReadableError"
              ? "Camera is busy. Close other apps using it and try again."
              : error instanceof Error
                ? error.message
                : "Camera unavailable. Check camera access and tap to try again.",
      );
    }
  }
  function resume() {
    locked.current = false;
    setCode("");
    if (stream.current?.active && resumeLoop.current) {
      quietUntil.current = Date.now() + 1000;
      setState("scanning");
      resumeLoop.current();
    } else void start();
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
    torch,
    torchSupported,
    start,
    accept,
    resume,
    result: code ? resolveScanResult(code) : null,
    toggleTorch,
  };
}
