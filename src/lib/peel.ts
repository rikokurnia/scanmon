type Point = { x: number; y: number };
/** Clip the rectangle on either side of the perpendicular bisector of corner and drag. */
export function peelGeometry(w: number, h: number, x: number, y: number) {
  const dx = w - x,
    dy = -y,
    len = Math.hypot(dx, dy) || 1,
    nx = dx / len,
    ny = dy / len;
  const mx = (w + x) / 2,
    my = y / 2;
  const rect: Point[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const distance = (p: Point) => (p.x - mx) * nx + (p.y - my) * ny;
  function clip(sign: number) {
    const out: Point[] = [];
    for (let i = 0; i < 4; i++) {
      const a = rect[i],
        b = rect[(i + 1) % 4],
        da = distance(a) * sign,
        db = distance(b) * sign;
      if (da <= 0) out.push(a);
      if (da <= 0 !== db <= 0) {
        const t = da / (da - db);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    return `polygon(${out.length ? out.map((p) => `${p.x}px ${p.y}px`).join(",") : "0px 0px,0px 0px,0px 0px"})`;
  }
  const d = 2 * (nx * mx + ny * my);
  return {
    top: clip(1),
    back: clip(-1),
    matrix: `matrix(${1 - 2 * nx * nx},${-2 * nx * ny},${-2 * nx * ny},${1 - 2 * ny * ny},${d * nx},${d * ny})`,
  };
}
