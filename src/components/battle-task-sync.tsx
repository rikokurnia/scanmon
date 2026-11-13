"use client";
import { useEffect } from "react";
import { useBattle } from "@/app/battle/battle-store";
import { recordBattleTask } from "@/lib/hunt-progress";
/** Lives above route changes so a win reaches Tomo even when the player leaves Battle. */
export default function BattleTaskSync() {
  const { snapshot } = useBattle();
  useEffect(() => {
    if (snapshot.battle) recordBattleTask(snapshot.battle);
  }, [snapshot.battle]);
  return null;
}
