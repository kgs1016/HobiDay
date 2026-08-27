import Link from "next/link";
import { levelRangeShort } from "@/lib/levels";
import { slotsLeft, type Session } from "@/lib/mock";
import { AvatarFallback } from "@/components/icons";

function ageLabel(min: number, max: number) {
  const band = (n: number) => {
    const decade = Math.floor(n / 10) * 10;
    const pos = n % 10 <= 3 ? "초반" : n % 10 <= 6 ? "중반" : "후반";
    return `${decade}대 ${pos}`;
  };
  const a = band(min);
  const b = band(max);
  return a === b ? a : `${a}~${b}`;
}

export default function SessionCard({
  session: s,
  hostPhotoUrl,
}: {
  session: Session;
  /* 사진 버킷이 비공개라 서명 URL 을 목록에서 한 번에 받아 넘긴다 */
  hostPhotoUrl?: string;
}) {
  const left = slotsLeft(s);
  const full = left.male <= 0 && left.female <= 0;
  /* 이미 신청했거나 내가 연 모임이면 목록에서부터 누를 일이 없다.
     cancelled 는 취소한 것이므로 다시 신청할 수 있어야 한다. */
  const mine =
    s.iAmHost
      ? "내가 연 모임"
      : s.myStatus === "waiting"
        ? "승인 대기"
        : s.myStatus === "confirmed"
          ? "참여 중"
          : null;

  /* 목록에서는 자리 현황만 보여준다 — 실제 신청은 상세 화면에서 한다 */
  const slots = mine ? (
    <span
      className={`text-[12.5px] font-medium ${
        s.myStatus === "confirmed" ? "text-accent" : "text-muted"
      }`}
    >
      {mine}
    </span>
  ) : full ? (
    <span className="text-[12.5px] font-medium text-faint">마감</span>
  ) : (
    <span className="text-[12.5px] font-medium text-ink">
      {[left.male > 0 && `남 ${left.male}`, left.female > 0 && `여 ${left.female}`]
        .filter(Boolean)
        .join(" · ")}
      <span className="font-normal text-muted"> 남음</span>
    </span>
  );

  return (
    <Link
      href={`/session?id=${s.id}`}
      className="block rounded-xl border border-line bg-surface p-4 transition-colors active:bg-surface2"
    >
      {/* 짐 · 시간 */}
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[15.5px] font-semibold tracking-tight">
          <span className="align-middle">{s.gym}</span>
          {s.isAway && (
            <span className="ml-1.5 align-middle text-[11.5px] font-normal text-faint">
              원정
            </span>
          )}
        </p>
        <p className="shrink-0 pt-0.5 text-[13px] text-muted">
          {s.date} · {s.start}–{s.end}
        </p>
      </div>

      {/* 레벨 · 나이 · 분위기 */}
      <p className="mt-1.5 text-[13.5px] text-muted">
        {levelRangeShort(s.levelMin, s.levelMax)} · {ageLabel(s.ageMin, s.ageMax)}
      </p>
      <p className="mt-0.5 text-[13px] text-faint">
        {s.intensity === "chill" ? "가볍게 즐겨요" : "집중해서 운동해요"}
      </p>

      {/* 호스트 · 자리 현황 */}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        {s.host ? (
          <div className="flex min-w-0 items-center gap-2">
            {hostPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hostPhotoUrl}
                alt=""
                className="h-7 w-7 shrink-0 rounded-full object-cover"
              />
            ) : (
              <AvatarFallback size={28} />
            )}
            <p className="truncate text-[12.5px] text-muted">
              {[
                s.host.age ? `${s.host.nickname} ${s.host.age}` : s.host.nickname,
                s.host.level && `L${s.host.level}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        ) : (
          <span />
        )}
        {slots}
      </div>
    </Link>
  );
}
