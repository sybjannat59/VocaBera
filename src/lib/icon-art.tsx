/** PNG renderings of the SVG app icon (used where SVG isn't supported, e.g. iOS home screen). */
export function IconArt({ size, maskable = false }: { size: number; maskable?: boolean }) {
  const inset = maskable ? 0 : Math.round(size * 0.03125);
  const radius = maskable ? 0 : Math.round(size * 0.234);
  const scale = maskable ? 0.72 : 1;
  const box = size - inset * 2;
  return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: maskable ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "transparent" }}>
      <div
        style={{
          width: box,
          height: box,
          borderRadius: radius,
          background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <svg width={size * scale} height={size * scale} viewBox="0 0 512 512" style={{ position: "absolute" }}>
          <path d="M142 150l114 212 114-212" fill="none" stroke="#fff" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M212 150h88" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="44" strokeLinecap="round" />
          <circle cx="404" cy="108" r="38" fill="#fcd34d" />
        </svg>
      </div>
    </div>
  );
}
