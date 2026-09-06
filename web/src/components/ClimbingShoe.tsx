/** 색상 후보. 실력 단계와의 대응은 아직 정하지 않는다. */
export const SHOE_COLORS = [
  { id: "white", name: "흰색", base: "#E9E8E2", light: "#FFFEFA", dark: "#B6B8AF", tint: "#F4F3EF", ink: "#51584E" },
  { id: "yellow", name: "노랑", base: "#F0C83E", light: "#FFE88A", dark: "#B58A20", tint: "#FAF5DF", ink: "#775E15" },
  { id: "orange", name: "주황", base: "#EF8953", light: "#FFC395", dark: "#BC5836", tint: "#FCF0E8", ink: "#AC542E" },
  { id: "green", name: "초록", base: "#63A889", light: "#B2D9B1", dark: "#337B65", tint: "#ECF4EF", ink: "#36765B" },
  { id: "blue", name: "파랑", base: "#6C9EDB", light: "#B8D5F7", dark: "#3B68A0", tint: "#EDF3FA", ink: "#456D9F" },
  { id: "purple", name: "보라", base: "#A28BCC", light: "#DBC9F2", dark: "#73569F", tint: "#F3EFF8", ink: "#775D9A" },
  { id: "black", name: "검정", base: "#4B5260", light: "#8D95A1", dark: "#272E38", tint: "#ECEEF1", ink: "#444D5A" },
] as const;

export type ShoeColorId = (typeof SHOE_COLORS)[number]["id"];

/** 승인된 3D 암벽화. 모든 색을 미리 읽어 색상 전환 중 빈 화면을 피한다. */
export default function ClimbingShoe({ color = "blue", className }: { color?: ShoeColorId; className?: string }) {
  return (
    <div className={`relative aspect-square ${className ?? ""}`}>
      {SHOE_COLORS.map((item) => (
        // 정적 WebP는 웹과 Capacitor 파일 서버가 같은 경로로 읽는다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={item.id}
          src={`/illustrations/climbing-shoe/${item.id}-v2.webp`}
          alt={color === item.id ? `${item.name} 벨크로 암벽화` : ""}
          aria-hidden={color !== item.id}
          width={640}
          height={640}
          draggable={false}
          decoding="async"
          loading="eager"
          fetchPriority={item.id === "blue" ? "high" : "low"}
          className={`pointer-events-none absolute inset-0 h-full w-full select-none object-contain transition-opacity duration-200 motion-reduce:transition-none ${color === item.id ? "opacity-100" : "opacity-0"}`}
        />
      ))}
    </div>
  );
}
