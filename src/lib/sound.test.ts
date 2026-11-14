import { test } from "node:test";
import assert from "node:assert/strict";
import {
  installSound,
  unlockSound,
  playSound,
  playSoundOnce,
  setSoundMuted,
  isSoundMuted,
} from "./sound";

test("audio requires a gesture, keeps one music loop, persists mute and cancels pending sounds", async () => {
  const globals = [
    "window",
    "document",
    "localStorage",
    "AudioContext",
    "fetch",
  ] as const;
  const saved = globals.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  );
  const values = new Map<string, string>();
  values.set("scanmon:sound-muted", "true");
  const sources: Source[] = [];
  const requests: string[] = [];
  const gains: { value: number; setValueAtTime(value: number): void }[] = [];
  let contexts = 0,
    suspended = 0;
  let release: (() => void) | undefined;
  const document = Object.assign(new EventTarget(), { hidden: false });
  class Source {
    buffer: { name: string } | null = null;
    loop = false;
    stopped = false;
    onended?: () => void;
    connect() {}
    disconnect() {}
    start() {
      sources.push(this);
    }
    stop() {
      this.stopped = true;
      this.onended?.();
    }
  }
  class Context {
    currentTime = 0;
    destination = {};
    constructor() {
      contexts++;
    }
    createGain() {
      const gain = {
        value: 1,
        setValueAtTime(value: number) {
          this.value = value;
        },
      };
      gains.push(gain);
      return { gain, connect() {} };
    }
    createBufferSource() {
      return new Source();
    }
    async decodeAudioData(data: ArrayBuffer) {
      return { name: new TextDecoder().decode(data) };
    }
    async resume() {}
    async suspend() {
      suspended++;
    }
  }
  Object.assign(globalThis, {
    window: new EventTarget(),
    document,
    AudioContext: Context,
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
    fetch: async (url: string) => {
      requests.push(url);
      if (url.includes("reveal"))
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return {
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(url).buffer,
      };
    },
  });
  const flush = async () => {
    await new Promise((resolve) => setImmediate(resolve));
  };
  const count = (name: string) =>
    sources.filter((source) => source.buffer?.name === `/sounds/${name}.mp3`)
      .length;
  let cleanup: (() => void) | undefined;
  try {
    playSound("hit");
    assert.equal(requests.length, 0, "SSR/initial render cannot start audio");
    cleanup = installSound();
    assert.equal(isSoundMuted(), true);
    unlockSound();
    assert.equal(contexts, 0, "saved mute prevents autoplay");
    setSoundMuted(false);
    await flush();
    unlockSound();
    unlockSound();
    await flush();
    assert.equal(contexts, 1);
    assert.equal(count("bgm"), 1);
    assert.equal(sources[0].loop, true);
    assert.equal(gains[1].value, 0.25);
    playSound("hit");
    playSound("hit");
    await flush();
    assert.equal(
      count("hit"),
      1,
      "simultaneous six-character impacts are coalesced",
    );
    playSound("reveal");
    setSoundMuted(true);
    release?.();
    await flush();
    assert.equal(count("reveal"), 0, "muting cancels an in-flight decode");
    assert.equal(gains[0].value, 0);
    assert.equal(values.get("scanmon:sound-muted"), "true");
    assert.ok(sources.filter((s) => !s.loop).every((s) => s.stopped));
    setSoundMuted(false);
    playSoundOnce("victory", "match-1");
    playSoundOnce("victory", "match-1");
    await flush();
    assert.equal(count("victory"), 1);
    assert.equal(
      count("bgm"),
      1,
      "unmute/navigation never starts a second music loop",
    );
    document.hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    playSound("coin");
    await flush();
    assert.equal(suspended, 1);
    assert.equal(count("coin"), 0);
  } finally {
    cleanup?.();
    globals.forEach((key, i) => {
      if (saved[i]) Object.defineProperty(globalThis, key, saved[i]!);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
});
