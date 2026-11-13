"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import SettingsModal from "./near/settings-modal";
import { useScanner } from "./use-scanner";
import BattleTaskSync from "./battle-task-sync";
import ScanReveal from "./scan-reveal";
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
export default function ScanShell({
  children,
  googleEnabled,
}: {
  children: React.ReactNode;
  googleEnabled: boolean;
}) {
  const path = usePathname();
  return (
    <>
      <BattleTaskSync />
      <ShellContent key={path} path={path} googleEnabled={googleEnabled}>
        {children}
      </ShellContent>
    </>
  );
}
function ShellContent({
  children,
  path,
  googleEnabled,
}: {
  children: React.ReactNode;
  path: string;
  googleEnabled: boolean;
}) {
  const isScan = path === "/" || path === "/scan";
  const { video, state, code, message, start, resume, result } =
    useScanner(isScan);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [revealing, setRevealing] = useState(false);
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
            onClick={() => setSettingsOpen(true)}
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
                {found && !revealing && (
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
                        ? "Allow camera access, then tap to try again."
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
              {found && !revealing && (
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
                {found && !revealing && (
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
                    <button
                      className="scan-button"
                      onClick={() => setRevealing(true)}
                    >
                      <span className="button-glint" aria-hidden="true" />
                      Reveal
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
                  <button onClick={() => setSettingsOpen(true)}>
                    Open settings
                  </button>
                </div>
              )}
            </div>
          </>
        )}
        {isScan && revealing && result && (
          <ScanReveal
            onConnect={() => setSettingsOpen(true)}
            result={result}
            onClose={() => {
              setRevealing(false);
              resume();
            }}
          />
        )}
        {isScan && <TomoCompanion onScan={start} />}
        {children}
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {tabs.map(([label, href, asset]) => {
          const selected =
            href === "/"
              ? isScan
              : path === href || path.startsWith(`${href}/`);
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
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        googleEnabled={googleEnabled}
      />
    </div>
  );
}
