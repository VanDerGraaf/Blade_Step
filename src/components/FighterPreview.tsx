import { useEffect, useRef } from "react";
import { drawFighter, lookForKind } from "../game/sprites";
import type { FighterKind } from "../game/sprites";

/** Живой пиксельный портрет бойца (покачивается в idle) для лобби выбора. */
export function FighterPreview({ kind, size = 64 }: { kind: FighterKind; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = size;
    const h = Math.round(size * 1.4);
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const look = lookForKind(kind);
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawFighter(
        ctx,
        w / 2,
        h - 12,
        look,
        { facing: 1, pose: "idle", poseT: 0, time: performance.now() / 1000, flash: 0, lunge: 0 },
        size / 30
      );
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [kind, size]);

  return (
    <canvas
      ref={ref}
      style={{ width: size, height: Math.round(size * 1.4), imageRendering: "pixelated" }}
      aria-label={kind}
    />
  );
}
