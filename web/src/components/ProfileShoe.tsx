"use client";

import { useEffect, useState } from "react";
import ShoeAchievement from "@/components/ShoeAchievement";
import StartingShoeDialog from "@/components/StartingShoeDialog";
import { fetchClimbingProgress } from "@/lib/climbingAscents";
import { type ClimbingProgress } from "@/lib/shoeProgress";

export default function ProfileShoe() {
  const [progress, setProgress] = useState<ClimbingProgress | null>(null);
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState<"set" | "reset" | null>(null);
  const load = async () => {
    try { const data = await fetchClimbingProgress(); setProgress(data); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "기록을 불러오지 못했어요"); }
  };
  useEffect(() => {
    let active = true;
    fetchClimbingProgress().then(
      data => { if (active) setProgress(data); },
      () => { if (active) setError("완등 기록을 불러오지 못했어요"); },
    );
    return () => { active = false; };
  }, []);

  return <>
    <ShoeAchievement progress={progress} error={error} onRetry={load} onStart={() => setChoosing("set")} onReset={() => setChoosing("reset")} />
    {choosing && <StartingShoeDialog reset={choosing === "reset"} onClose={() => setChoosing(null)} onSaved={data => {
      setProgress(data); setError(""); setChoosing(null);
    }} />}
  </>;
}
