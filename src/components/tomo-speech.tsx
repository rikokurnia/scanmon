"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
const phrases = ["Tasks await!", "Let’s hunt!", "Scan & discover!"];
const subscribe = (cb: () => void) => {
  const q = matchMedia("(prefers-reduced-motion: reduce)");
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};
export default function TomoSpeech() {
  const reduced = useSyncExternalStore(
    subscribe,
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const [text, setText] = useState("");
  useEffect(() => {
    if (reduced) return;
    let phrase = 0,
      index = 0,
      deleting = false,
      timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const message = phrases[phrase];
      index += deleting ? -1 : 1;
      setText(message.slice(0, index));
      let delay = deleting ? 35 : 75;
      if (index === message.length) {
        deleting = true;
        delay = 2200;
      } else if (index === 0) {
        deleting = false;
        phrase = (phrase + 1) % phrases.length;
        delay = 300;
      }
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 150);
    return () => clearTimeout(timer);
  }, [reduced]);
  return (
    <span className="tomo-bubble" aria-hidden="true">
      <span className="tomo-typed">
        {reduced ? phrases[0] : text}
        <i />
      </span>
      <span>✦</span>
    </span>
  );
}
