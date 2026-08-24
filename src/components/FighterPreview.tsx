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
    const sparks: { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string }[] = [];
    let acc = 0;
    let lastT = performance.now();
    const draw = () => {
      const now = performance.now();
      const dt = Math.min(50, now - lastT);
      lastT = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawFighter(
        ctx,
        w / 2,
        h - 12,
        look,
        { facing: 1, pose: "idle", poseT: 0, time: now / 1000, flash: 0, lunge: 0 },
        size / 30
      );
      // блёстки золотого скина
      if (look.shine) {
        acc += dt;
        if (acc > 120) {
          acc = 0;
          sparks.push({
            x: w / 2 + (Math.random() - 0.5) * w * 0.5,
            y: h - 16 - Math.random() * h * 0.55,
            vx: (Math.random() - 0.5) * 6,
            vy: -8 - Math.random() * 10,
            life: 0,
            max: 600 + Math.random() * 400,
            c: Math.random() < 0.5 ? "#ffd98a" : "#fff3c4",
          });
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i];
          s.life += dt;
          if (s.life >= s.max) {
            sparks.splice(i, 1);
            continue;
          }
          s.x += (s.vx * dt) / 1000;
          s.y += (s.vy * dt) / 1000;
          ctx.globalAlpha = 1 - s.life / s.max;
          ctx.fillStyle = s.c;
          ctx.fillRect(s.x, s.y, 2, 2);
          ctx.globalAlpha = 1;
        }
      }
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
