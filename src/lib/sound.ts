/** Shared client audio. No browser APIs run during SSR or module import. */
export type Sound =
  "click" | "scan-beep" | "reveal" | "coin" | "hit" | "victory";
const KEY = "scanmon:sound-muted";
let muted = false;
let context: AudioContext | undefined;
let master: GainNode | undefined;
let music: AudioBufferSourceNode | undefined;
let musicLoading = false;
let unlocked = false;
let generation = 0;
const listeners = new Set<() => void>();
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const recent = new Map<Sound, number>();
const heard = new Set<string>();
const active = new Set<AudioBufferSourceNode>();
const channels = new Map<Sound, AudioBufferSourceNode>();
export const isSoundMuted = () => muted;
export const subscribeSound = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
function notify() {
  listeners.forEach((fn) => fn());
}
export function setSoundMuted(value: boolean) {
  muted = value;
  generation++;
  if (master && context)
    master.gain.setValueAtTime(value ? 0 : 1, context.currentTime);
  if (value) {
    active.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    });
    active.clear();
  } else unlockSound();
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    /* Private browsing. */
  }
  notify();
}
async function buffer(name: Sound | "bgm") {
  if (!context) return null;
  if (!buffers.has(name)) {
    const audio = context;
    buffers.set(
      name,
      fetch(`/sounds/${name}.mp3`)
        .then(async (res) => {
          if (!res.ok) throw new Error("Audio unavailable");
          return audio.decodeAudioData(await res.arrayBuffer());
        })
        .catch(() => {
          buffers.delete(name);
          return null;
        }),
    );
  }
  return buffers.get(name)!;
}
function startMusic() {
  if (!context || !master || music || musicLoading) return;
  musicLoading = true;
  void buffer("bgm").then((data) => {
    musicLoading = false;
    if (!data || !context || !master || music) return;
    const volume = context.createGain();
    volume.gain.value = 0.25;
    volume.connect(master);
    music = context.createBufferSource();
    music.buffer = data;
    music.loop = true;
    music.connect(volume);
    music.start();
  });
}
/** Called synchronously within the first gesture; async game events can then play safely. */
export function unlockSound() {
  if (typeof window === "undefined" || muted || document.hidden) return;
  try {
    if (!context) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(context.destination);
    }
    unlocked = true;
    void context
      .resume()
      .then(startMusic)
      .catch(() => {});
  } catch {
    /* Audio is optional; a blocked/unsupported device must not affect gameplay. */
  }
}
export function playSound(name: Sound) {
  if (!unlocked || muted || !context || document.hidden) return;
  const now = Date.now();
  // Coalesce simultaneous impacts/clicks instead of stacking six loud samples.
  if (now - (recent.get(name) ?? 0) < (name === "hit" ? 160 : 70)) return;
  recent.set(name, now);
  const requested = generation;
  void buffer(name).then((data) => {
    if (
      !data ||
      muted ||
      requested !== generation ||
      !context ||
      !master ||
      document.hidden
    )
      return;
    try {
      const previous = channels.get(name);
      if (previous) {
        try {
          previous.stop();
        } catch {
          /* Already ended. */
        }
      }
      const source = context.createBufferSource();
      source.buffer = data;
      source.connect(master);
      active.add(source);
      channels.set(name, source);
      source.onended = () => {
        active.delete(source);
        if (channels.get(name) === source) channels.delete(name);
        source.disconnect();
      };
      source.start();
    } catch {
      /* Failed audio never rejects a game action. */
    }
  });
}
export function playSoundOnce(name: Sound, eventId: string) {
  const key = name + ":" + eventId;
  if (heard.has(key)) return;
  heard.add(key);
  if (heard.size > 512) heard.delete(heard.values().next().value!);
  playSound(name);
}
/** One root listener covers navigation, dialogs, tabs and dynamically mounted game controls. */
export function installSound() {
  try {
    muted = localStorage.getItem(KEY) === "true";
  } catch {
    /* Storage unavailable. */
  }
  notify();
  const gesture = () => unlockSound();
  const click = (event: MouseEvent) => {
    unlockSound();
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest(
      'button, a[href], [role="button"], [role="tab"], summary',
    );
    if (control && !control.matches(':disabled, [aria-disabled="true"]'))
      playSound("click");
    else if (target?.matches("dialog[open]")) playSound("click");
  };
  const key = (event: KeyboardEvent) => {
    if (event.repeat) return;
    unlockSound();
    if (
      (event.key === "Escape" && document.querySelector("dialog[open]")) ||
      (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) &&
        event.target instanceof Element &&
        event.target.matches('[role="tab"]'))
    )
      playSound("click");
  };
  const visibility = () => {
    if (document.hidden) {
      generation++;
      void context?.suspend().catch(() => {});
    } else if (unlocked) unlockSound();
  };
  const storage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) {
      try {
        setSoundMuted(localStorage.getItem(KEY) === "true");
      } catch {
        /* Storage unavailable. */
      }
    }
  };
  document.addEventListener("pointerdown", gesture, true);
  document.addEventListener("keydown", key, true);
  document.addEventListener("click", click, true);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("storage", storage);
  return () => {
    document.removeEventListener("pointerdown", gesture, true);
    document.removeEventListener("keydown", key, true);
    document.removeEventListener("click", click, true);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("storage", storage);
  };
}
