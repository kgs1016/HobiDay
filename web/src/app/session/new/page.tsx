"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LEVELS, type LevelId } from "@/lib/levels";
import {
  CAPACITY_CHOICES,
  GENDER_MODES,
  capacityChipLabel,
  type GenderMode,
} from "@/lib/capacity";
import { hasSupabase, currentUser, fetchMyProfileDb, createSession } from "@/lib/supabase";
import { isProfileComplete } from "@/lib/profileGate";

/** 빠른 선택용. 여기 없는 짐은 직접 입력한다 (서울·경기 전체 대상). */
const GYMS = [
  "더클라임 B홍대",
  "더클라임 연남",
  "더월클라이밍 연남",
  "홍대클라이밍",
  "써미트클라이밍",
];

const AGE_FROM = [
  ["20대 초반부터", 20],
  ["20대 중반부터", 24],
  ["20대 후반부터", 27],
  ["30대 초반부터", 30],
  ["30대 중반부터", 34],
] as const;

const AGE_TO = [
  ["20대 후반까지", 29],
  ["30대 초반까지", 33],
  ["30대 중반까지", 36],
  ["30대 후반까지", 39],
] as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[13.5px] font-bold">{label}</p>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
        active
          ? "bg-accent text-white"
          : "border border-line bg-surface text-muted"
      }`}
    >
      {children}
    </button>
  );
}

const inputCls =
  // iOS 는 16px 미만 입력창에 포커스하면 화면을 강제로 확대한다 — 16px 유지
  "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[16px] text-ink [color-scheme:dark]";

export default function NewSession() {
  const router = useRouter();
  const [gym, setGym] = useState(GYMS[0]);
  const [date, setDate] = useState("");
  /* 달력에서 지난 날짜를 아예 못 고르게 한다 (서버도 과거 30분 · 90일
     초과를 거부하니 같은 범위로 맞춘다).
     빌드 시점이 아니라 브라우저에서 계산해야 하므로 useEffect 로 넣는다 —
     프리렌더된 값이 박히면 하루만 지나도 어제 날짜가 min 이 된다. */
  const [range, setRange] = useState({ min: "", max: "" });
  useEffect(() => {
    const ymd = (d: Date) =>
      // toISOString 은 UTC 라 한국 오전 9시 이전에 하루가 밀린다
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
    const now = new Date();
    const in90 = new Date(now);
    in90.setDate(in90.getDate() + 90);
    setRange({ min: ymd(now), max: ymd(in90) });
  }, []);
  const [startTime, setStartTime] = useState("15:00");
  const [endTime, setEndTime] = useState("17:00");
  /* 성비를 먼저 고르고 정원을 고른다 — 정원의 뜻이 성비에 따라 달라진다.
     반반이면 성별당 인원(2 = 2:2), 무관이면 총 인원(4 = 4명). */
  const [genderMode, setGenderMode] = useState<GenderMode>("balanced");
  const [capacity, setCapacity] = useState(2);
  const [levelMin, setLevelMin] = useState<LevelId>(2);
  const [levelMax, setLevelMax] = useState<LevelId>(3);
  const [ageMin, setAgeMin] = useState<number>(27);
  const [ageMax, setAgeMax] = useState<number>(33);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  /* 모드를 바꾸면 정원도 그 모드에서 고를 수 있는 값으로 옮겨준다.
     그냥 두면 "무관인데 정원 1(혼자 하는 모임)" 이 만들어져 서버가
     거절한다. 2 는 양쪽 모드에 다 있어서 안전한 착지점이다. */
  const pickMode = (m: GenderMode) => {
    setGenderMode(m);
    if (!CAPACITY_CHOICES[m].includes(capacity)) setCapacity(2);
  };

  const toggleLevel = (id: LevelId) => {
    // 인접 1단계까지만 허용 — 클릭한 레벨을 포함해 범위 재계산
    if (id < levelMin) {
      if (levelMax - id <= 1) setLevelMin(id);
      else {
        setLevelMin(id);
        setLevelMax((id + 1) as LevelId);
      }
    } else if (id > levelMax) {
      if (id - levelMin <= 1) setLevelMax(id);
      else {
        setLevelMax(id);
        setLevelMin((id - 1) as LevelId);
      }
    } else {
      setLevelMin(id);
      setLevelMax(id);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasSupabase()) {
      alert("목데이터 단계예요 — Supabase 연결 후 실제로 등록됩니다.");
      router.push("/");
      return;
    }
    if (!date) return alert("날짜를 선택해주세요");
    if (endTime <= startTime) return alert("종료 시각이 시작보다 빨라요");
    // 서버도 막지만(지난 시각·30분 이내·90일 초과 거부) 여기서 먼저 알려주는
    // 게 친절하다. 달력이 지난 날짜를 막아줘도 "오늘 + 방금 지난 시각" 은
    // 통과되므로 필요하다.
    // 지난 시각과 임박은 고쳐야 할 게 다르다 — 지난 건 잘못 고른 것이고,
    // 임박은 제대로 골랐는데 규칙에 걸린 것이다. 그래서 문구를 나눈다.
    const startsAt = new Date(`${date}T${startTime}:00`);
    if (startsAt < new Date())
      return alert("이미 지난 시각이에요. 시간을 다시 골라주세요");
    if (startsAt < new Date(Date.now() + 30 * 60 * 1000))
      return alert("모임 시간이 너무 임박했어요. 지금부터 30분 뒤부터 열 수 있어요");

    setBusy(true);
    const user = await currentUser();
    if (!user) {
      setBusy(false);
      alert("모임을 만들려면 로그인이 필요해요");
      router.push("/login");
      return;
    }
    const profile = await fetchMyProfileDb();
    if (!isProfileComplete(profile)) {
      setBusy(false);
      alert(
        profile
          ? "프로필을 먼저 완성해주세요 (대표 사진·구력)"
          : "먼저 프로필을 만들어주세요 (모임 참여의 기본 정보예요)"
      );
      router.push("/profile/new");
      return;
    }

    const r = await createSession({
      gym,
      startsAt: new Date(`${date}T${startTime}:00`).toISOString(),
      endsAt: new Date(`${date}T${endTime}:00`).toISOString(),
      capacity,
      genderMode,
      levelMin,
      levelMax,
      ageMin,
      ageMax,
      note,
    });
    setBusy(false);

    if (r.error === "too_soon")
      return alert("모임 시간이 너무 임박했어요. 지금부터 30분 뒤부터 열 수 있어요");
    if (r.error === "past") return alert("이미 지난 시각이에요. 시간을 다시 골라주세요");
    if (r.error === "too_far") return alert("모임은 90일 안쪽으로만 열 수 있어요");
    if (r.error === "bad_capacity" || r.error === "bad_mode")
      return alert("정원을 다시 골라주세요");
    if (r.error) return alert(`등록 실패: ${r.error}`);
    alert(
      genderMode === "any"
        ? "모임을 열었어요! 정원이 차면 확정돼요."
        : "모임을 열었어요! 성비가 맞으면 확정돼요."
    );
    router.push("/");
  };

  return (
    <main className="px-4">
      <header className="flex items-center gap-3 pt-5 pb-4">
        <button onClick={() => router.back()} className="text-lg text-muted">
          ←
        </button>
        <h1 className="text-[19px] font-extrabold tracking-tight">모임 만들기</h1>
      </header>

      <form className="flex flex-col gap-6 pb-8" onSubmit={submit}>
        <Field label="짐">
          {/* 서울·경기 전체를 대상으로 하므로 목록으로 못 다 담는다.
              자주 쓰는 곳은 칩으로, 나머지는 직접 입력. */}
          <input
            value={gym}
            onChange={(e) => setGym(e.target.value)}
            placeholder="예: 더클라임 강남"
            className={inputCls}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {GYMS.map((g) => (
              <Chip key={g} active={gym === g} onClick={() => setGym(g)}>
                {g}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="날짜 · 시간">
          <div className="grid grid-cols-3 gap-2">
            <input
              type="date"
              value={date}
              min={range.min}
              max={range.max}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputCls}
            />
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={inputCls}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-muted">1.5~2시간을 권장해요</p>
        </Field>

        <Field label="성비">
          <div className="flex gap-1.5">
            {GENDER_MODES.map((m) => (
              <Chip
                key={m.id}
                active={genderMode === m.id}
                onClick={() => pickMode(m.id)}
              >
                {m.label}
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            {GENDER_MODES.find((m) => m.id === genderMode)?.hint}
          </p>
        </Field>

        <Field label="정원">
          <div className="flex gap-1.5">
            {CAPACITY_CHOICES[genderMode].map((c) => (
              <Chip key={c} active={capacity === c} onClick={() => setCapacity(c)}>
                {capacityChipLabel(c, genderMode)}
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            {genderMode === "any"
              ? `호스트 포함 ${capacity}명. 다 차면 확정돼요.`
              : capacity === 1
                ? "남 1 · 여 1. 단둘이 등반해요."
                : "남 2 · 여 2. 2명만 모이면 1:1로 진행돼요 — 성비가 적은 쪽에 맞춰져요."}
          </p>
        </Field>

        <Field label="레벨 범위 (인접 1단계까지)">
          <div className="flex gap-1.5">
            {LEVELS.map((l) => (
              <Chip
                key={l.id}
                active={l.id >= levelMin && l.id <= levelMax}
                onClick={() => toggleLevel(l.id)}
              >
                L{l.id}
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            {LEVELS.slice(levelMin - 1, levelMax)
              .map((l) => `L${l.id} ${l.name}(${l.colors})`)
              .join(" · ")}
          </p>
        </Field>

        <Field label="나이대">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={ageMin}
              onChange={(e) => setAgeMin(Number(e.target.value))}
              className={inputCls}
            >
              {AGE_FROM.map(([label, v]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={ageMax}
              onChange={(e) => setAgeMax(Number(e.target.value))}
              className={inputCls}
            >
              {AGE_TO.map(([label, v]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </Field>

        <Field label="한마디 (선택)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 초보도 환영해요, 같이 문제 풀어요"
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-[16px] text-ink placeholder:text-muted/60"
          />
        </Field>

        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-accent py-3.5 text-[15px] font-bold text-white disabled:opacity-50"
        >
          {busy ? "등록 중…" : "모임 등록하기"}
        </button>
      </form>
    </main>
  );
}
