import type { Metadata } from "next";
import Link from "next/link";
import BackButton from "@/components/BackButton";

/* 고객센터 — 스토어의 Support URL 이 이 주소를 가리킨다 (애플 심사 1.5).
   로그인 없이 브라우저에서 열리는 공개 페이지여야 한다 — 심사관은
   앱 밖에서 URL 만 열어본다. */

export const metadata: Metadata = { title: "고객센터 — 하비데이" };

const S = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-8">
    <h2 className="text-[16px] font-bold">{title}</h2>
    <div className="mt-2 flex flex-col gap-2 text-[13.5px] leading-relaxed text-muted">
      {children}
    </div>
  </section>
);

export default function Support() {
  return (
    <main className="mx-auto max-w-2xl px-5 pb-16">
      {/* 앱 안(마이 > 고객센터)에서도 열린다 — 뒤로가기가 없으면 갇힌다 */}
      <div className="pt-5">
        <BackButton />
      </div>
      <header className="pt-4">
        <p className="text-[13px] font-bold tracking-[2px] text-accent">HOBIDAY</p>
        <h1 className="mt-2 text-[22px] font-bold tracking-tight">고객센터</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          하비데이 이용 중 궁금한 점이나 문제가 있으면 알려주세요.
        </p>
      </header>

      <S title="문의하기">
        <p>
          아래 이메일로 보내주시면{" "}
          <b className="text-ink">영업일 기준 1~2일 안에</b> 답변드립니다.
        </p>
        <p>
          <a
            href="mailto:1212ntnt@naver.com"
            className="font-semibold text-accent-pressed underline underline-offset-2"
          >
            1212ntnt@naver.com
          </a>
        </p>
        <p>
          계정 관련 문의는 가입한 이메일 주소로 보내주시거나, 본문에 가입
          이메일과 닉네임을 함께 적어주시면 확인이 빨라요.
        </p>
      </S>

      <S title="자주 묻는 질문">
        <p>
          <b className="text-ink">Q. 인증번호 메일이 안 와요.</b>
          <br />
          스팸함을 먼저 확인해주세요. 30분이 지나면 인증번호가 만료되니
          가입 화면에서 &ldquo;인증번호 다시 받기&rdquo;를 눌러주세요.
        </p>
        <p>
          <b className="text-ink">Q. 불쾌한 사용자를 만났어요.</b>
          <br />
          프로필 상세나 채팅 화면의 <b className="text-ink">신고</b> 버튼으로
          알려주세요. 신고하면 그 사용자는 즉시 차단되어 서로 보이지 않게
          되고, 접수된 내용은 24시간 안에 확인해 조치합니다. 신고 없이
          차단만 할 수도 있어요. 차단 목록은 마이 &gt; 안전 설정에서 관리합니다.
        </p>
        <p>
          <b className="text-ink">Q. 모임에서 빠지면 신청비(크레딧)는 어떻게 되나요?</b>
          <br />
          확정 전에는 그 자리에서 돌려드리고, 확정 후에는 상황을 확인한 뒤
          처리해요. 자세한 규칙은{" "}
          <Link href="/terms" className="underline underline-offset-2 text-ink">
            이용약관
          </Link>
          에 있습니다.
        </p>
        <p>
          <b className="text-ink">Q. 계정을 삭제하고 싶어요.</b>
          <br />
          앱의 마이 &gt; 회원 탈퇴에서 바로 삭제할 수 있어요. 탈퇴하면
          프로필과 데이터가 함께 삭제됩니다.
        </p>
      </S>

      <S title="약관 · 개인정보">
        <p>
          <Link href="/terms" className="underline underline-offset-2 text-ink">
            이용약관
          </Link>
          {" · "}
          <Link href="/privacy" className="underline underline-offset-2 text-ink">
            개인정보처리방침
          </Link>
        </p>
      </S>

      <footer className="mt-12 border-t border-line pt-4 text-[12px] text-muted">
        지아이컴퍼니 · 대표 김경수 · 사업자등록번호 242-20-02430 ·
        인천광역시 서해구 청라한내로100번길 10, 4층 411,412호 B054호 · 1212ntnt@naver.com
      </footer>
    </main>
  );
}
