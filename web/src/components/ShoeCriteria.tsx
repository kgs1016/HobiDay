import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";
import type { ShoeColorId } from "@/lib/shoeProgress";

/** 프로필에는 진입점만 두고 공통 안내 화면으로 연결한다. */
export default function ShoeCriteria({ current }: { current?: ShoeColorId }) {
  return <Link href={`/me/grades${current ? `?stage=${current}` : ""}`}
    className="mt-1 flex min-h-12 items-center justify-between gap-3 text-[13px] font-semibold text-ink">
    전체 단계 기준 보기<ChevronRightIcon size={16} className="text-muted" />
  </Link>;
}
