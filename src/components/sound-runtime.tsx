"use client";
import { useEffect } from "react";
import { installSound } from "@/lib/sound";
export default function SoundRuntime() {
  useEffect(installSound, []);
  return null;
}
