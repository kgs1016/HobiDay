"use client";

import { useState } from "react";
import { AvatarFallback } from "@/components/icons";

/** 이미 서명된 사진 주소. 사진이 없거나 만료되어도 프로필 버튼은 유지한다. */
export default function PersonAvatar({ url, size = 40 }: { url?: string; size?: number }) {
  const [failed, setFailed] = useState<string>();
  return url && failed !== url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} onError={() => setFailed(url)}
      className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : <AvatarFallback size={size} />;
}
