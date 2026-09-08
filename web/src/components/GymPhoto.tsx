"use client";

import { useState } from "react";
import GymFallback from "@/components/GymFallback";

type Props = {
  src?: string | null;
  name: string;
  size?: number;
  shape?: "square" | "circle";
};

export default function GymPhoto(props: Props) {
  // 사진 주소가 바뀌면 실패 상태도 새로 시작한다.
  return <Photo key={props.src ?? ""} {...props} />;
}

function Photo({ src, name, size = 84, shape = "square" }: Props) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <GymFallback name={name} size={size} shape={shape} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={`shrink-0 object-cover ${shape === "circle" ? "rounded-full" : "rounded-lg"}`} />
  );
}
