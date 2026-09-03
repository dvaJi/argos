import { useEffect, useRef, useState } from "react";
import { clock, effect, frameLoop, init, surface } from "vgpu";

const SHADER = `
struct Params {
  time: f32,
  aspect: f32,
  pointer: vec2f,
  intensity: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p0: vec2f) -> f32 {
  var p = p0;
  var v = 0.0;
  var amp = 0.55;
  for (var i = 0; i < 5; i = i + 1) {
    v += amp * vnoise(p);
    p = p * 2.03 + vec2f(19.7, 7.3);
    amp = amp * 0.5;
  }
  return v;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = (uv - vec2f(0.5)) * vec2f(params.aspect, 1.0);
  let t = params.time * 0.05;

  let q = fbm(p * 1.4 + vec2f(t * 0.7, -t * 0.4));
  let r = fbm(p * 1.9 + q * 1.4 + vec2f(-t * 0.5, t * 0.3));
  let field = fbm(p * 1.2 + r * 1.8 - t * 0.2);

  let pt = (params.pointer - vec2f(0.5)) * vec2f(params.aspect, 1.0);
  let glow = exp(-length(p - pt) * 3.5) * 0.5;

  let ink = vec3f(0.020, 0.020, 0.027);
  let deep = vec3f(0.024, 0.100, 0.120);
  let cyan = vec3f(0.133, 0.827, 0.933);

  var col = ink;
  col = mix(col, deep, smoothstep(0.25, 0.75, field));
  let crest = smoothstep(0.55, 0.95, field) * 0.55;
  col = mix(col, cyan, crest * (0.35 + 0.65 * q));
  col = col + cyan * glow * (0.25 + 0.35 * field);

  let vig = smoothstep(1.25, 0.35, length(p));
  col = col * mix(0.55, 1.0, vig);

  let grain = hash21(uv * vec2f(1920.0, 1080.0) + fract(params.time) * 7.0) - 0.5;
  col = col + grain * 0.012;

  return vec4f(col * params.intensity, 1.0);
}
`;

/**
 * WebGPU background shader powered by vgpu.
 *
 * Domain-warps an fbm aura of brand cyan over deep ink, tracking the pointer
 * with a gentle glow. Degrades to the static CSS mesh gradient if:
 * - WebGPU is unsupported or init() fails
 * - prefers-reduced-motion is active
 * - Canvas is scrolled out of view (IntersectionObserver pauses the loop)
 */
export function ShaderBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 1. Check browser WebGPU support
    if (typeof navigator === "undefined" || !("gpu" in navigator) || !navigator.gpu) {
      return;
    }

    // 2. Check prefers-reduced-motion
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let stopLoop: (() => void) | null = null;
    let unsubscribeResize: (() => void) | null = null;
    let observer: IntersectionObserver | null = null;
    let isVisible = true;

    let targetX = 0.5;
    let targetY = 0.5;
    let currentX = 0.5;
    let currentY = 0.5;

    const onPointerMove = (e: MouseEvent) => {
      targetX = e.clientX / window.innerWidth;
      targetY = e.clientY / window.innerHeight;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    void (async () => {
      try {
        const gpu = await init();
        if (disposed) {
          gpu.dispose();
          return;
        }

        const canvasSurface = surface(gpu, canvas, { dpr: [1, 2] });
        const time = clock(gpu);

        const panoptes = effect(gpu, SHADER, {
          set: {
            params: {
              time: 0,
              aspect: canvasSurface.size[0] / Math.max(1, canvasSurface.size[1]),
              pointer: [0.5, 0.5],
              intensity: 1,
            },
          },
        });

        unsubscribeResize = canvasSurface.onResize(({ width, height }) => {
          panoptes.set({
            params: {
              aspect: width / Math.max(1, height),
            },
          });
        });

        const handle = frameLoop(
          gpu,
          (frame) => {
            if (!isVisible) return;

            currentX += (targetX - currentX) * 0.08;
            currentY += (targetY - currentY) * 0.08;

            panoptes.set({
              params: {
                time: time.time,
                pointer: [currentX, currentY],
              },
            });

            frame.pass(canvasSurface, panoptes);
          },
          { fps: 60 },
        );

        stopLoop = () => {
          handle.stop();
          gpu.dispose();
        };

        if (disposed) {
          stopLoop();
          return;
        }

        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              isVisible = entry.isIntersecting;
            }
          },
          { threshold: 0 },
        );
        observer.observe(canvas);

        setReady(true);
      } catch (err) {
        console.warn("[ShaderBackdrop] WebGPU init failed, using fallback:", err);
      }
    })();

    return () => {
      disposed = true;
      window.removeEventListener("pointermove", onPointerMove);
      if (unsubscribeResize) unsubscribeResize();
      if (observer) observer.disconnect();
      if (stopLoop) stopLoop();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-1000 ${
        ready ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
