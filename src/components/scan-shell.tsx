"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { useScanner } from "./use-scanner";
import TomoCompanion from "./tomo-companion";
const tabs = [
  ["Scan", "/", "scan"],
  ["Collection", "/collection", "collection"],
  ["Battle", "/battle", "battle"],
  ["Market", "/market", "market"],
] as const;
function Art({
  name,
  className = "",
  size = 64,
  alt = "",
}: {
  name: string;
  className?: string;
  size?: number;
  alt?: string;
}) {
  const folders: Record<string, string> = {
    flash: "icons/",
    help: "icons/",
    settings: "icons/",
    scan: "icons/",
    collection: "icons/",
    battle: "icons/",
    market: "icons/",
    "mystery-card": "stickers/",
    "foil-monster-card": "stickers/",
    "sparkle-yellow": "effects/",
    "scan-reaction-mint": "effects/",
  };
  return (
    <Image
      src={`/assets/${folders[name] ?? ""}${name}.png`}
      width={size}
      height={size}
      alt={alt}
      className={className}
      unoptimized
      priority
    />
  );
}
export default function ScanShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <ShellContent key={path} path={path}>
      {children}
    </ShellContent>
  );
}
function ShellContent({
  children,
  path,
}: {
  children: React.ReactNode;
  path: string;
}) {
  const isScan = path === "/" || path === "/scan";
  const { video, state, code, message, snapshot, start, accept } =
    useScanner(isScan);
  const dialog = useRef<HTMLDialogElement>(null);
  const [manual, setManual] = useState("");
  const [inputError, setInputError] = useState("");
  const found = state === "found";
  const busy = state === "requesting";
  return (
    <div className={`app-shell ${isScan ? "is-scan" : ""}`}>
      <header className="app-header">
        <Link href="/" className="brand" aria-label="scanMon home">
          <Art name="logo-scanmon" size={52} />
          <span className="logo-caption" aria-hidden="true">
            scan<span>Mon</span>
          </span>
        </Link>
        <div className="header-actions">
          <button
            className="help-button"
            onClick={() => dialog.current?.showModal()}
            aria-label="Settings"
          >
            <Art name="settings" size={44} />
          </button>
        </div>
      </header>
      <main
        className={isScan ? "scan-main" : "blank-main"}
        aria-label={
          isScan
            ? "Scan barcode"
            : `${tabs.find((t) => t[1] === path)?.[0] ?? ""} content`
        }
      >
        {isScan && (
          <>
            <section
              className={`camera-viewport ${state}`}
              aria-label="Barcode camera viewport"
            >
              <video
                ref={video}
                autoPlay
                playsInline
                muted
                aria-label="Rear camera preview"
              />
              {snapshot && (
                <Image
                  className="capture-frame"
                  src={snapshot}
                  alt="Last decoded barcode camera frame"
                  fill
                  unoptimized
                />
              )}
              <div className="camera-vignette" />
              <div
                className={`scan-guide ${found ? "locked" : ""}`}
                aria-hidden="true"
              >
                <i />
                <i />
                <i />
                <i />
                <span className="scan-line" />
                {found && (
                  <>
                    <Art
                      name="scan-reaction-mint"
                      className="reaction"
                      size={360}
                    />
                    <Art
                      name="sparkle-yellow"
                      className="sparkle sparkle-one"
                      size={42}
                    />
                    <Art
                      name="sparkle-yellow"
                      className="sparkle sparkle-two"
                      size={30}
                    />
                  </>
                )}
              </div>
              {state !== "scanning" && !found && (
                <div className="camera-idle">
                  <span className="tiny-barcode" aria-hidden="true" />
                  <p>
                    {busy
                      ? "Opening your camera…"
                      : state === "error"
                        ? "A little camera trouble"
                        : "Tap to start the camera"}
                  </p>
                  <span>
                    {busy
                      ? "Allow camera access to start exploring."
                      : state === "error"
                        ? "Try again, or enter your code in Settings."
                        : "Point it at a barcode on something nearby."}
                  </span>
                </div>
              )}
              {!found && state !== "scanning" && (
                <button
                  className="camera-start"
                  onClick={start}
                  disabled={busy}
                  aria-label={
                    state === "error" ? "Retry camera" : "Start camera"
                  }
                  aria-busy={busy}
                />
              )}
              {found && (
                <div className="found-feedback" role="status">
                  <div className="found-pill">
                    Barcode found <span>✓</span>
                  </div>
                  <p>
                    {code} <span>· Validated</span>
                  </p>
                </div>
              )}
            </section>
            <div className="instruction-region">
              <section className="instruction-panel">
                {found && (
                  <div className="success-action">
                    <Art
                      name="mystery-card"
                      className="sticker sticker-mystery"
                      size={76}
                    />
                    <Art
                      name="foil-monster-card"
                      className="sticker sticker-foil"
                      size={82}
                    />
                    <button className="scan-button" onClick={start}>
                      <span className="button-glint" aria-hidden="true" />
                      Scan barcode
                    </button>
                  </div>
                )}
              </section>
              {message && (
                <div
                  className="status-message"
                  role={state === "error" ? "alert" : "status"}
                >
                  {message}{" "}
                  <button onClick={() => dialog.current?.showModal()}>
                    Open settings
                  </button>
                </div>
              )}
            </div>
          </>
        )}
        {isScan && <TomoCompanion onScan={start} />}
        {children}
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {tabs.map(([label, href, asset]) => {
          const selected = href === "/" ? isScan : path === href;
          return (
            <Link
              href={href}
              key={label}
              className={`nav-tab ${selected ? "active" : ""}`}
              aria-current={selected ? "page" : undefined}
            >
              <Art name={asset} size={52} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <dialog
        ref={dialog}
        className="help-dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
        aria-labelledby="help-title"
      >
        <div className="dialog-heading">
          <span className="eyebrow">FIELD GUIDE · 01</span>
          <button
            onClick={() => dialog.current?.close()}
            aria-label="Close help"
            className="close-button"
          >
            ×
          </button>
        </div>
        <h2 id="help-title">Settings & scan guide</h2>
        <p>
          Tap the <strong>camera area</strong> and allow camera access. Point
          the rear camera at an EAN or UPC barcode on everyday packaging.
        </p>
        <ol>
          <li>Keep the whole barcode inside the mint guide.</li>
          <li>Use even lighting, avoid glare, and hold steady.</li>
          <li>
            Once a code is found, the yellow button lets you scan another.
          </li>
        </ol>
        <p className="help-note">
          Can’t read it? You can enter the printed digits below. This pass ends
          at a validated barcode.
        </p>
        {isScan && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (accept(manual)) {
                dialog.current?.close();
                setInputError("");
              } else
                setInputError(
                  "Enter a valid 8, 12, or 13-digit EAN/UPC barcode. Check every digit, including the last one.",
                );
            }}
          >
            <label htmlFor="manual-barcode">Manual barcode entry</label>
            <input
              id="manual-barcode"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 4006381333931"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              aria-invalid={!!inputError}
              aria-describedby={inputError ? "barcode-error" : "barcode-hint"}
            />
            <small id="barcode-hint">
              EAN-8, UPC-A, or EAN-13 · checksum verified
            </small>
            {inputError && (
              <p className="input-error" id="barcode-error" role="alert">
                {inputError}
              </p>
            )}
            <button className="manual-button" type="submit">
              Validate barcode <span aria-hidden="true">↗</span>
            </button>
          </form>
        )}
        <p className="local-note">No camera frames are uploaded or stored.</p>
      </dialog>
    </div>
  );
}
