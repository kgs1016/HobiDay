"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import { CameraIcon } from "@/components/icons";
import { CAREERS, LEVELS, type CareerId, type LevelId } from "@/lib/levels";
import { loadMyProfile, saveMyProfile, type MyProfile } from "@/lib/myProfile";
import { isBasicProfileComplete } from "@/lib/profileGate";
import { downscaleImage } from "@/lib/imageResize";
import {
  PHOTO_MAX_BYTES,
  hasSupabase,
  currentUser,
  fetchMyProfileDb,
  signedPhotoUrls,
  uploadProfilePhoto,
  upsertMyProfileDb,
} from "@/lib/supabase";

const MBTI = [
  "ISTJ", "ISFJ", "INFJ", "INTJ", "ISTP", "ISFP", "INFP", "INTP",
  "ESTP", "ESFP", "ENFP", "ENTP", "ESTJ", "ESFJ", "ENFJ", "ENTJ",
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[13.5px] font-semibold">{label}</p>
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
      className={`rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors ${
        active
          ? "border-accent bg-accent-soft text-accent-strong"
          : "border-line bg-surface text-muted"
      }`}
    >
      {children}
    </button>
  );
}

const inputCls =
  // iOS 는 16px 미만 입력창에 포커스하면 화면을 강제로 확대한다 — 16px 유지
  "w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-[16px] text-ink placeholder:text-faint focus:border-accent focus:outline-none";

export default function ProfileNew() {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPublic, setIsPublic] = useState(false);

  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState<"m" | "f">("f");
  const [age, setAge] = useState("");
  const [area, setArea] = useState("");
  /* 레벨은 선택 — 기본값을 두면 "안 고른 사람" 과 "L2 인 사람" 이 안 갈린다 */
  const [level, setLevel] = useState<LevelId | null>(null);
  const [showLevelGuide, setShowLevelGuide] = useState(false);
  const [careerId, setCareerId] = useState<CareerId | null>(null);
  const [height, setHeight] = useState("");
  const [homeGym, setHomeGym] = useState("");
  const [mbti, setMbti] = useState("");
  const [intro, setIntro] = useState("");

  const [photo, setPhoto] = useState<string | undefined>();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const photoInFlight = useRef(false);
  const previewUrl = useRef<string | null>(null);

  useEffect(() => () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  /** 고르는 즉시 올린다 — 저장 버튼에서 한꺼번에 올리면 실패 원인을 알기 어렵다 */
  const pickPhoto = async (raw: File) => {
    if (photoInFlight.current) return;
    photoInFlight.current = true;
    setPhotoBusy(true);
    try {
      const file = await downscaleImage(raw);
      if (file.size > PHOTO_MAX_BYTES) {
        return alert(`사진이 너무 커요 (${(file.size / 1024 / 1024).toFixed(1)}MB). 5MB 이하로 올려주세요.`);
      }
      if (!hasSupabase()) {
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = URL.createObjectURL(file);
        setPhotoUrl(previewUrl.current);
        setPhoto("local");
        return;
      }
      const r = await uploadProfilePhoto(file);
      if (r.error || !r.path) throw new Error(r.error ?? "사진을 저장하지 못했어요");
      setPhoto(r.path);
      setPhotoUrl((await signedPhotoUrls([r.path]))[r.path] ?? null);
    } catch (error) {
      alert(`사진 업로드 실패: ${error instanceof Error ? error.message : "연결을 확인하고 다시 시도해주세요"}`);
    } finally {
      photoInFlight.current = false;
      setPhotoBusy(false);
    }
  };

  useEffect(() => {
    (async () => {
      let p: MyProfile | null = null;
      if (hasSupabase()) {
        const user = await currentUser();
        if (!user) {
          alert("프로필을 만들려면 로그인이 필요해요");
          router.replace("/login");
          return;
        }
        p = await fetchMyProfileDb();
      } else {
        p = loadMyProfile();
      }
      setOnboarding(!isBasicProfileComplete(p));
      setLoading(false);
      if (!p) return;
      setEditing(true);
      setIsPublic(p.isPublic ?? false);
      setNickname(p.nickname);
      setGender(p.gender);
      setAge(String(p.age));
      setArea(p.area);
      setLevel(p.level);
      setCareerId(p.careerId ?? null);
      setHeight(p.height ? String(p.height) : "");
      setHomeGym(p.homeGym);
      setMbti(p.mbti);
      setIntro(p.intro ?? "");
      if (p.photo) {
        setPhoto(p.photo);
        setPhotoUrl((await signedPhotoUrls([p.photo]))[p.photo] ?? null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 저장·내리기가 같은 값을 쓰도록 한 곳에서 만든다 */
  const buildProfile = (): MyProfile => ({
    nickname: nickname.trim(),
    gender,
    age: Number(age),
    area: area.trim(),
    level,
    careerId: careerId ?? undefined,
    height: Number(height) || undefined,
    homeGym: homeGym.trim(),
    mbti,
    intro: intro.trim() || undefined,
    photo,
    isPublic,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || busy || photoInFlight.current) return;
    const n = Number(age);
    if (!photo?.trim()) return alert("대표 사진을 1장 올려주세요");
    if (!nickname.trim()) return alert("닉네임을 입력해주세요");
    if (!n || n < 19 || n > 60) return alert("나이를 확인해주세요");
    if (isPublic && !careerId) return alert("사람 찾기에 공개하려면 구력을 선택해주세요");
    if (height && (Number(height) < 130 || Number(height) > 220))
      return alert("키를 확인해주세요 (130~220cm)");
    // 키·동네·홈짐·MBTI 는 선택 — 채우고 싶은 사람만

    const profile = buildProfile();

    if (hasSupabase()) {
      setBusy(true);
      try {
        const r = await upsertMyProfileDb(profile, isPublic);
        if (r.error) throw new Error(r.error);
      } catch (error) {
        alert(`저장 실패: ${error instanceof Error ? error.message : "연결을 확인하고 다시 시도해주세요"}`);
        return;
      } finally {
        setBusy(false);
      }
    } else {
      saveMyProfile(profile);
    }
    // 온보딩을 막 끝냈으면 사람 목록보다 모임 찾기로 보내는 게 자연스럽다
    router.push(onboarding ? "/" : isPublic ? "/#people" : "/me");
  };

  return (
    <main className="px-4">
      <header className="flex items-center gap-2 pt-4 pb-4">
        {!onboarding && <BackButton />}
        <h1 className="text-[18px] font-bold tracking-tight">
          {onboarding
            ? "기본 정보 등록"
            : editing
              ? "내 프로필 수정"
              : "기본 정보 등록"}
        </h1>
      </header>

      <form className="flex flex-col gap-6 pb-8" onSubmit={submit}>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3.5">
          <div>
            <p id="discovery-label" className="text-[14px] font-semibold">사람 찾기에 공개 <span className="text-[12px] font-normal text-muted">선택</span></p>
            <p id="discovery-description" className="mt-1 text-[12px] text-muted">켜면 로그인한 회원의 사람 찾기 목록에 표시됩니다.</p>
          </div>
          <button type="button" role="switch" aria-checked={isPublic}
            aria-labelledby="discovery-label" aria-describedby="discovery-description"
            disabled={loading || busy} onClick={() => setIsPublic((value) => !value)}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center disabled:opacity-50">
            <span className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${isPublic ? "bg-accent" : "bg-line"}`}>
              <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${isPublic ? "translate-x-5" : "translate-x-0"}`} />
            </span>
          </button>
        </div>

        <Field label="대표 사진 (필수)">
          <div className="flex items-center gap-4">
            {/* 네이티브에서도 파일 선택창을 그대로 쓴다 — iOS 가
                "사진 보관함/사진 찍기/파일 선택" 시트를 한국어로 띄워준다.
                카메라 플러그인의 자체 선택창을 써봤더니 영어인 데다
                보관함 버튼이 동작하지 않아 되돌렸다. */}
            <label className="relative shrink-0 cursor-pointer">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl}
                  alt="대표 사진"
                  className="h-20 w-20 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-line bg-surface2 text-faint">
                  <CameraIcon size={26} />
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={loading || photoBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) pickPhoto(f);
                }}
              />
            </label>
            <div className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-muted">
              {photoBusy ? (
                <p className="font-semibold text-ink">올리는 중…</p>
              ) : (
                <>
                  <p className="font-semibold text-ink">
                    {photo ? "사진 바꾸기" : "얼굴이 보이는 사진 1장"}
                  </p>
                  <p className="mt-0.5">
                    {isPublic ? "사람 찾기에 공개" : "모임·채팅에서 사용"} · 최대 5MB
                  </p>
                </>
              )}
            </div>
          </div>
        </Field>

        <Field label="닉네임">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="예: 서연"
            className={inputCls}
          />
        </Field>

        {/* 성별은 처음 한 번만 고른다. 성비 매칭이 없어진 뒤로 판정에는
            안 쓰지만, signups 에 신청 시점 성별이 남아 있어 나중에 바꾸면
            기록과 어긋난다 (DB 트리거가 막는다). */}
        <Field label="성별">
          {editing ? (
            <>
              <span className="inline-block rounded-full border border-line bg-surface2 px-3.5 py-2 text-[13px] font-medium text-muted">
                {gender === "f" ? "여성" : "남성"}
              </span>
              <p className="mt-1.5 text-[12px] text-muted">
                성별은 나중에 바꿀 수 없어요.
              </p>
            </>
          ) : (
            <div className="flex gap-1.5">
              <Chip active={gender === "f"} onClick={() => setGender("f")}>
                여성
              </Chip>
              <Chip active={gender === "m"} onClick={() => setGender("m")}>
                남성
              </Chip>
            </div>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="나이">
            <input
              value={age}
              onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="예: 27"
              className={inputCls}
            />
          </Field>
          <Field label="사는 동네 (선택)">
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="예: 연남동"
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="등반 수준 (선택)">
          <div className="flex flex-wrap gap-1.5">
            {LEVELS.map((l) => (
              <Chip
                key={l.id}
                active={level === l.id}
                /* 고른 걸 다시 누르면 해제 — 레벨은 비워둘 수 있다 */
                onClick={() => setLevel(level === l.id ? null : l.id)}
              >
                {l.name}
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            {level
              ? LEVELS[level - 1].description
              : "모임에서 함께 탈 수준 · 직접 선택"}
            <button
              type="button"
              onClick={() => setShowLevelGuide((v) => !v)}
              className="ml-1.5 font-medium text-accent-strong underline underline-offset-2"
            >
              {showLevelGuide ? "참고표 접기" : "참고표 보기"}
            </button>
          </p>
          {/* 전체 참고표 — 표에서 바로 골라도 된다 */}
          {showLevelGuide && (
            <div className="mt-2 divide-y divide-line rounded-lg border border-line">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLevel(l.id)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12.5px] ${
                    level === l.id ? "bg-accent-soft font-semibold" : ""
                  }`}
                >
                  <span className="shrink-0">
                    {l.name}
                  </span>
                  <span className="text-right text-muted">
                    {l.description}
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className="mt-2 text-[12px] text-muted">암벽화 성취는 완등 기록으로 별도 계산</p>
        </Field>

        <Field label={`구력 (클라이밍 시작한 지)${isPublic ? "" : " · 선택"}`}>
          <div className="flex flex-wrap gap-1.5">
            {CAREERS.map((c) => (
              <Chip
                key={c.id}
                active={careerId === c.id}
                onClick={() => setCareerId(careerId === c.id ? null : c.id)}
              >
                {c.label}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="키 (선택)">
          <input
            value={height}
            onChange={(e) => setHeight(e.target.value.replace(/\D/g, "").slice(0, 3))}
            inputMode="numeric"
            placeholder="예: 168"
            className={inputCls}
          />
        </Field>

        <Field label="홈짐 (선택)">
          <input
            value={homeGym}
            onChange={(e) => setHomeGym(e.target.value)}
            placeholder="예: 더클라임 연남"
            className={inputCls}
          />
        </Field>

        <Field label="MBTI (선택)">
          <select
            value={mbti}
            onChange={(e) => setMbti(e.target.value)}
            className={inputCls}
          >
            <option value="">선택 안 함</option>
            {MBTI.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>

        <Field label="한마디 (선택)">
          <input
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            placeholder="예: 주말 오후에 주로 타요. 같이 문제 풀어요!"
            className={inputCls}
          />
        </Field>

        <button
          type="submit"
          disabled={loading || busy || photoBusy}
          className="button-primary rounded-xl py-3.5 text-[15px] font-semibold"
        >
          {loading ? "불러오는 중…" : busy ? "저장 중…" : editing ? "저장" : "시작하기"}
        </button>
      </form>
    </main>
  );
}
