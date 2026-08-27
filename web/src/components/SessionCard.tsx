import Link from "next/link";
import { slotsLeft, type Session } from "@/lib/mock";
import { AvatarFallback, PhotoIcon } from "@/components/icons";

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
  gymPhotoUrl,
}: {
  session: Session;
  /* 사진 버킷이 비공개라 서명 URL 을 목록에서 한 번에 받아 넘긴다 */
  hostPhotoUrl?: string;
  /* 클라이밍짐 사진 — 아직 데이터가 없어 자리만 잡아둔다.
     URL 이 넘어오면 그대로 그려진다. */
  gymPhotoUrl?: string;
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
      className={`shrink-0 text-[12px] font-medium ${
        s.myStatus === "confirmed" ? "text-accent" : "text-muted"
      }`}
    >
      {mine}
    </span>
  ) : full ? (
    <span className="shrink-0 text-[12px] font-medium text-faint">마감</span>
  ) : (
    <span className="shrink-0 text-[12px] font-medium text-ink">
      {[left.male > 0 && `남 ${left.male}`, left.female > 0 && `여 ${left.female}`]
        .filter(Boolean)
        .join(" · ")}
      <span className="font-normal text-muted"> 남음</span>
    </span>
  );

  return (
    <Link
      href={`/session?id=${s.id}`}
      className="flex gap-3.5 rounded-xl border border-line bg-surface p-3 transition-colors active:bg-surface2"
    >
      {/* 클라이밍짐 사진 */}
      {gymPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={gymPhotoUrl}
          alt=""
          className="h-24 w-24 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg bg-surface2 text-faint">
          <PhotoIcon size={26} />
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 장소 */}
        <p className="truncate text-[15px] font-semibold tracking-tight">
          <span className="align-middle">{s.gym}</span>
          {s.isAway && (
            <span className="ml-1.5 align-middle text-[11px] font-normal text-faint">
              원정
            </span>
          )}
        </p>

        {/* 일시 */}
        <p className="mt-0.5 text-[13px] text-muted">
          {s.date} · {s.start}–{s.end}
        </p>

        {/* 구하는 나이대 · 사람 조건 — 사진 옆 좁은 폭이라 레벨은 짧게 */}
        <p className="mt-0.5 truncate text-[12.5px] text-muted">
          {s.levelMin === s.levelMax
            ? `L${s.levelMin}`
            : `L${s.levelMin}–L${s.levelMax}`}{" "}
          · {ageLabel(s.ageMin, s.ageMax)}
        </p>

        {/* 호스트 프로필 · 자리 현황 */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
          {s.host ? (
            <div className="flex min-w-0 items-center gap-1.5">
              {hostPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hostPhotoUrl}
                  alt=""
                  className="h-5 w-5 shrink-0 rounded-full object-cover"
                />
              ) : (
                <AvatarFallback size={20} />
              )}
              <p className="truncate text-[12px] text-muted">
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
      </div>
    </Link>
  );
}
