import { ChevronRightIcon } from "@/components/icons";
import { SHOE_STAGES, type ShoeColorId } from "@/lib/shoeProgress";

/** 내 정보와 상대 프로필에서 같은 성취 기준표를 사용한다. */
export default function ShoeCriteria({ current }: { current?: ShoeColorId }) {
  return (
      <details className="group mt-2">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
          단계 기준표
          <ChevronRightIcon size={15} className="text-faint transition-transform group-open:rotate-90" />
        </summary>
        <p className="mb-3 text-[12px] leading-relaxed text-muted">암장 문제의 색·직접 선택한 등반 수준과 별도인 성취 단계</p>
        <table className="w-full table-fixed text-left text-[12px]">
          <caption className="sr-only">암벽화 성취 단계별 V등급과 필요 완등 개수</caption>
          <thead className="text-muted"><tr>
            <th scope="col" className="w-[34%] py-2 font-normal">암벽화</th>
            <th scope="col" className="w-[40%] py-2 font-normal">문제 난이도</th>
            <th scope="col" className="py-2 text-right font-normal">완등</th>
          </tr></thead>
          <tbody>{SHOE_STAGES.map(stage => <tr key={stage.id} aria-current={current === stage.id ? "step" : undefined}
            className={`border-t border-line ${current === stage.id ? "bg-surface2" : ""}`}>
            <th scope="row" className="py-3 font-medium">
              <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: stage.base }} />{stage.name}</span>
              {current === stage.id && <span className="ml-1 text-[10px] text-muted">현재</span>}
            </th>
            <td className="py-3">{stage.minV === null ? "시작 단계" : `V${stage.minV} 이상`}</td>
            <td className="py-3 text-right">{stage.required === 0 ? "—" : `${stage.required}개`}</td>
          </tr>)}</tbody>
        </table>
        <ul className="mt-3 space-y-1 pb-2 text-[11.5px] leading-relaxed text-muted">
          <li>같은 문제는 한 번 · 높은 난이도는 하위 조건에도 포함</li>
          <li>기간 제한 없이 누적 · 충족한 가장 높은 단계 적용</li>
          <li>V등급 모름은 누적 완등에만 포함</li>
          <li>직접 입력한 완등 기준 · 수정·삭제 시 다시 계산</li>
        </ul>
      </details>
  );
}
