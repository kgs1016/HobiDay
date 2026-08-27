import type { Metadata } from "next";
import BackButton from "@/components/BackButton";

/* 개인정보처리방침 — 스토어 등록의 필수 URL (hobiday.com/privacy).
   실제 앱이 수집·처리하는 것만 적는다. 부풀리면 심사에서 데이터 안전
   섹션과 어긋나고, 빠뜨리면 법 위반이다. 앱의 수집 항목이 바뀌면
   이 문서도 같이 바꿔야 한다. */

export const metadata: Metadata = { title: "개인정보처리방침 — 하비데이" };

const S = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-8">
    <h2 className="text-[16px] font-bold">{title}</h2>
    <div className="mt-2 flex flex-col gap-2 text-[13.5px] leading-relaxed text-muted">
      {children}
    </div>
  </section>
);

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-5 pb-16">
      {/* 가입 화면에서 열어보는 문서다 — 네이티브 앱은 브라우저 뒤로가기가
          없어서, 이 버튼이 없으면 여기 갇힌다 */}
      <div className="pt-5">
        <BackButton />
      </div>
      <header className="pt-4">
        <p className="text-[13px] font-bold tracking-[2px] text-accent">HOBIDAY</p>
        <h1 className="mt-2 text-[22px] font-bold tracking-tight">개인정보처리방침</h1>
        <p className="mt-1 text-[12.5px] text-muted">시행일: 2026년 8월 20일</p>
      </header>

      <S title="1. 개요">
        <p>
          지아이컴퍼니(이하 &ldquo;회사&rdquo;)는 하비데이(HOBIDAY) 서비스를 제공하며,
          이용자의 개인정보를 개인정보 보호법 등 관련 법령에 따라 보호합니다. 이 방침은
          회사가 어떤 정보를 왜 수집하고, 어떻게 보관·파기하는지를 설명합니다.
        </p>
      </S>

      <S title="2. 수집하는 개인정보와 목적">
        <p>
          <b className="text-ink">회원 가입·계정 관리:</b> 이메일 주소(이메일 가입 시),
          카카오·구글 계정 식별자(소셜 로그인 시), 비밀번호(암호화 저장, 이메일 가입 시).
        </p>
        <p>
          <b className="text-ink">프로필(매칭 서비스 제공):</b> 닉네임, 성별, 나이, 활동
          지역(동네), 프로필 사진, 취미 활동 실력·경력(구력), 주 활동 장소(홈짐), 키(선택), MBTI(선택),
          자기소개(선택). 성별·나이·실력은 성비 매칭과 모임 조건 확인에 사용됩니다.
        </p>
        <p>
          <b className="text-ink">서비스 이용 과정에서 생성:</b> 모임 개설·신청 내역,
          관심·매칭 내역, 채팅 메시지, 업로드한 활동 인증 영상, 크레딧 적립·사용 내역,
          신고·차단 내역, 푸시 알림용 기기 토큰.
        </p>
        <p>
          <b className="text-ink">자동 수집:</b> 접속 기록, 기기·브라우저 정보 등
          서비스 안정 운영에 필요한 로그.
        </p>
      </S>

      <S title="3. 보유 기간과 파기">
        <p>
          개인정보는 <b className="text-ink">회원 탈퇴 시 지체 없이 파기</b>합니다. 탈퇴하면
          프로필·사진·영상·채팅·매칭·크레딧 내역이 삭제됩니다. 다음은 예외입니다.
        </p>
        <p>
          · 가입 혜택의 반복 수령을 막기 위해 이메일을 복원 불가능한 형태(해시)로 변환해{" "}
          <b className="text-ink">30일간</b> 보관 후 자동 삭제합니다. 원문 이메일은 남지
          않습니다.
          <br />
          · 신고 처리 기록은 분쟁 대응과 이용자 보호를 위해 보관하되, 탈퇴한 계정과의
          연결은 끊어 누구의 기록인지 식별할 수 없게 합니다.
          <br />
          · 관련 법령(전자상거래법 등)이 보존을 요구하는 거래 기록은 해당 기간 동안
          보관합니다.
        </p>
      </S>

      <S title="4. 처리 위탁과 국외 이전">
        <p>
          서비스 운영을 위해 아래 업체에 처리를 위탁하며, 일부는 국외에서 처리됩니다.
          이용자는 국외 이전을 거부할 수 있으나, 이 경우 서비스 이용이 불가능합니다.
        </p>
        <p>
          · <b className="text-ink">Supabase</b> (미국 등) — 데이터베이스·인증·파일 저장
          <br />
          · <b className="text-ink">Vercel</b> (미국) — 웹 서비스 제공
          <br />
          · <b className="text-ink">Resend</b> (미국·일본 리전) — 인증 메일 발송
          <br />
          · <b className="text-ink">Google (Firebase)</b> · <b className="text-ink">Apple</b> —
          푸시 알림 전달
          <br />
          · <b className="text-ink">Cloudflare</b> (미국) — 도메인·네트워크
        </p>
        <p>각 업체에는 목적 달성에 필요한 최소한의 정보만 전달됩니다.</p>
      </S>

      <S title="5. 제3자 제공">
        <p>
          회사는 개인정보를 외부에 판매하거나 광고 목적으로 제공하지 않습니다. 서비스
          특성상 <b className="text-ink">이용자가 공개를 선택한 프로필 정보는 다른 로그인
          이용자에게 표시</b>되며(사람 찾기, 확정된 모임의 참가자 목록 등), 수사기관의
          적법한 요청 등 법령에 따른 경우에만 예외적으로 제공합니다.
        </p>
      </S>

      <S title="6. 이용자의 권리">
        <p>
          이용자는 언제든지 앱에서 프로필을 열람·수정할 수 있고, 회원 탈퇴(내 정보 →
          회원 탈퇴)로 개인정보 삭제를 요청할 수 있습니다. 그 밖의 열람·정정·삭제·처리정지
          요구는 아래 문의처로 연락하면 지체 없이 처리합니다.
        </p>
      </S>

      <S title="7. 안전성 확보 조치">
        <p>
          비밀번호는 복호화 불가능한 방식으로 암호화하고, 데이터 접근은 행 단위
          접근제어(RLS)와 최소 권한 원칙으로 통제합니다. 사진·영상은 비공개 저장소에
          두고 서명된 임시 주소로만 표시됩니다.
        </p>
      </S>

      <S title="8. 아동의 개인정보">
        <p>
          하비데이는 만 19세 이상만 이용할 수 있으며, 아동의 개인정보를 수집하지
          않습니다.
        </p>
      </S>

      <S title="9. 개인정보 보호책임자">
        <p>
          책임자: 김경수 (대표)
          <br />
          문의: 1212ntnt@naver.com
        </p>
        <p>
          개인정보 침해 관련 상담은 개인정보침해신고센터(privacy.kisa.or.kr, 국번 없이
          118)에서도 받을 수 있습니다.
        </p>
      </S>

      <S title="10. 고지">
        <p>
          이 방침이 바뀌면 시행 7일 전(중대한 변경은 30일 전) 서비스 내 공지로
          알립니다.
        </p>
      </S>

      <footer className="mt-12 border-t border-line pt-4 text-[12px] text-muted">
        지아이컴퍼니 · 대표 김경수 · 사업자등록번호 242-20-02430 ·
        인천광역시 서해구 청라한내로100번길 10, 4층 411,412호 B054호 · 1212ntnt@naver.com
      </footer>
    </main>
  );
}
