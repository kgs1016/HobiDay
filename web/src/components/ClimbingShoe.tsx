import { SHOE_STAGES, type ShoeColorId } from "@/lib/shoeProgress";

/** 승인된 3D 클라이밍화. 기록으로 정해진 현재 색 한 장만 표시한다. */
export default function ClimbingShoe({ color = "white", className }: { color?: ShoeColorId; className?: string }) {
  const stage = SHOE_STAGES.find(item => item.id === color)!;
  return (
    // 정적 WebP는 웹과 Capacitor 파일 서버가 같은 경로로 읽는다.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/illustrations/climbing-shoe/${color}-v2.webp`}
      alt={`${stage.name} 벨크로 클라이밍화`}
      width={640}
      height={640}
      draggable={false}
      className={`pointer-events-none aspect-square select-none object-contain ${className ?? ""}`}
    />
  );
}
