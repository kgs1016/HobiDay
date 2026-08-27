"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import { CameraIcon } from "@/components/icons";
import { CAREERS, LEVELS, type CareerId, type LevelId } from "@/lib/levels";
import { loadMyProfile, saveMyProfile, type MyProfile } from "@/lib/myProfile";
import { isProfileComplete } from "@/lib/profileGate";
import { downscaleImage } from "@/lib/imageResize";
import {
  PHOTO_MAX_BYTES,
  claimProfileBonus,
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
          ? "border-accent bg-accent text-white"
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

  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState<"m" | "f">("f");
  const [age, setAge] = useState("");
  const [area, setArea] = useState("");
  const [level, setLevel] = useState<LevelId>(2);
  const [careerId, setCareerId] = useState<CareerId | null>(null);
  const [height, setHeight] = useState("");
  const [homeGym, setHomeGym] = useState("");
  const [mbti, setMbti] = useState("");
  const [intro, setIntro] = useState("");

  const [photo, setPhoto] = useState<string | undefined>();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  /** 고르는 즉시 올린다 — 저장 버튼에서 한꺼번에 올리면 실패 원인을 알기 어렵다 */
  const pickPhoto = async (raw: File) => {
    // 원본(수 MB)을 그대로 올리면 보는 쪽이 매번 느리다 — 올리기 전에 줄인다
    const file = await downscaleImage(raw);
    if (file.size > PHOTO_MAX_BYTES) {
      return alert(
        `사진이 너무 커요 (${(file.size / 1024 / 1024).toFixed(1)}MB). 5MB 이하로 올려주세요.`
      );
    }
    if (!hasSupabase()) {
      // 목데이터 단계에선 미리보기만
      setPhotoUrl(URL.createObjectURL(file));
      setPhoto("local");
      return;
    }
    setPhotoBusy(true);
    const r = await uploadProfilePhoto(file);
    if (r.error) {
      setPhotoBusy(false);
      return alert(`사진 업로드 실패: ${r.error}`);
    }
    setPhoto(r.path);
    setPhotoUrl((await signedPhotoUrls([r.path!]))[r.path!] ?? null);
    setPhotoBusy(false);
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
      // 미완성이면 온보딩 맥락으로 보여준다 (프로필이 아예 없는 경우 포함)
      if (!isProfileComplete(p)) setOnboarding(true);
      if (!p) return;
      setEditing(true);
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
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(age);
    if (!photo) return alert("대표 사진을 1장 올려주세요");
    if (!nickname.trim()) return alert("닉네임을 입력해주세요");
    if (!n || n < 19 || n > 60) return alert("나이를 확인해주세요");
    if (!careerId) return alert("구력을 선택해주세요");
    if (!height) return alert("키를 입력해주세요");
    if (Number(height) < 130 || Number(height) > 220)
      return alert("키를 확인해주세요 (130~220cm)");
    // 동네·홈짐·MBTI 는 선택 — 채우고 싶은 사람만

    const profile = buildProfile();

    if (hasSupabase()) {
      setBusy(true);
      const r = await upsertMyProfileDb(profile, true);
      if (r.error) {
        setBusy(false);
        return alert(`저장 실패: ${r.error}`);
      }
      // 처음 완성한 경우에만 적립된다 (서버가 중복을 무시)
      const bonus = await claimProfileBonus();
      setBusy(false);
      if (bonus?.earned)
        alert(`프로필 완성! 크레딧 +${bonus.earned}를 받았어요 🎉`);
    } else {
      saveMyProfile(profile);
    }
    // 온보딩을 막 끝냈으면 사람 목록보다 모임 찾기로 보내는 게 자연스럽다
    router.push(onboarding ? "/" : "/#people");
  };

  return (
    <main className="px-4">
      <header className="flex items-center gap-2 pt-4 pb-4">
        {/* 온보딩 중에는 나갈 곳이 없다 — 뒤로 버튼을 두면 빈 프로필로 빠져나간다 */}
        {!onboarding && <BackButton />}
        <h1 className="text-[18px] font-bold tracking-tight">
          {onboarding
            ? "프로필 만들기"
            : editing
              ? "내 프로필 수정"
              : "내 프로필 올리기"}
        </h1>
      </header>

      {onboarding ? (
        <p className="mb-5 rounded-lg bg-accent-soft px-4 py-3 text-[12.5px] leading-relaxed text-muted">
          <b className="font-semibold text-ink">시작 전에 프로필을 완성해주세요.</b>
          <br />
          서로 얼굴과 실력을 알고 만나는 서비스예요. 모두가 같은 조건이에요.
        </p>
      ) : (
        <p className="mb-5 rounded-lg bg-surface2 px-4 py-3 text-[12.5px] leading-relaxed text-muted">
          여기 올린 프로필은 사람 찾기 목록에 공개돼요.
        </p>
      )}

      <form className="flex flex-col gap-6 pb-8" onSubmit={submit}>
        {/* 대표 사진 — 사람 찾기의 첫인상이라 필수 */}
        <Field label="대표 사진">
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
                disabled={photoBusy}
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
                    로그인한 사람에게만 보여요 · 최대 5MB
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

        {/* 성별은 처음 한 번만 고른다 — 성비 매칭·이성 목록·관심의 기준이라
            나중에 바꾸면 이미 확정된 모임과 어긋난다 (DB 에서도 막는다) */}
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

        <Field label="레벨 (편하게 완등하는 수준)">
          <div className="flex gap-1.5">
            {LEVELS.map((l) => (
              <Chip
                key={l.id}
                active={level === l.id}
                onClick={() => setLevel(l.id)}
              >
                L{l.id}
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            L{level} {LEVELS[level - 1].name} — 더클라임 기준{" "}
            {LEVELS[level - 1].colors} ({LEVELS[level - 1].vgrade})
          </p>
        </Field>

        <Field label="구력 (클라이밍 시작한 지)">
          <div className="flex flex-wrap gap-1.5">
            {CAREERS.map((c) => (
              <Chip
                key={c.id}
                active={careerId === c.id}
                onClick={() => setCareerId(c.id)}
              >
                {c.label}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="키">
          <input
            value={height}
            onChange={(e) => setHeight(e.target.value.replace(/\D/g, "").slice(0, 3))}
            inputMode="numeric"
            placeholder="예: 168"
            className={inputCls}
          />
          <p className="mt-1.5 text-[12px] text-muted">
            검색 필터로는 쓰이지 않아요.
          </p>
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
          disabled={busy}
          className="rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-white active:bg-accent-pressed disabled:opacity-50"
        >
          {busy ? "저장 중…" : editing ? "수정 완료" : "프로필 올리기"}
        </button>

      </form>
    </main>
  );
}
