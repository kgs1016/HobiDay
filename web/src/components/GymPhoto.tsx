"use client";

import { useState } from "react";
import GymFallback from "@/components/GymFallback";

type Props = {
  src?: string | null;
  name: string;
  size?: number;
  shape?: "square" | "circle";
  wide?: boolean;
};

export default function GymPhoto(props: Props) {
  // 사진 주소가 바뀌면 실패 상태도 새로 시작한다.
  return <Photo key={props.src ?? ""} {...props} />;
}

function Photo({ src, name, size = 84, shape = "square", wide = false }: Props) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return wide ? (
    <div role="img" aria-label={`${name} 이미지 준비중`} className="flex aspect-[8/5] w-full items-center justify-center rounded-2xl bg-accent-soft text-sm text-accent-strong">이미지 준비중</div>
  ) : <GymFallback name={name} size={size} shape={shape} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={wide ? `${name} 대표사진` : ""} width={wide ? 1200 : size} height={wide ? 750 : size} loading={wide ? "eager" : "lazy"}
      onError={() => setFailed(true)}
      style={wide ? undefined : { width: size, height: size }}
      className={wide ? "aspect-[8/5] w-full rounded-2xl bg-surface2 object-contain" : `shrink-0 object-cover ${shape === "circle" ? "rounded-full" : "rounded-lg"}`} />
  );
}
