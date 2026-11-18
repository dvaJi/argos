#!/usr/bin/env bun
/**
 * Turns the raw screen recording from `bun run e2e:demo` into a single
 * polished clip: trims each scene listed in cutlist.json, speeds up long
 * generations, normalizes size/fps, joins them, and adds fades.
 *
 * Usage: bun scripts/render-demo-video.mjs [cutlist.json] [--out dir] [--no-gif]
 * Outputs: <out>/argos-command-code.mp4 (+ .gif for the README)
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const cutlistPath = resolve(
  args.find((a) => a.endsWith(".json")) ?? resolve(ROOT, "apps/desktop/test-results/demo/cutlist.json"),
);
const outDir = resolve(flag("--out") ?? dirname(cutlistPath));
const makeGif = !args.includes("--no-gif");

if (!existsSync(cutlistPath)) {
  console.error(`No cut list at ${cutlistPath}. Run "bun run e2e:demo" first.`);
  process.exit(1);
}

const { size, segments } = await Bun.file(cutlistPath).json();
const even = (n) => Math.round(n / 2) * 2;
const W = even(size?.width ?? 1440);
const H = even(size?.height ?? 900);
const FPS = 30;

const usable = segments.filter((s) => s.file && existsSync(s.file) && s.end > s.start);
if (usable.length === 0) {
  console.error("Cut list has no usable segments (missing video files?).");
  process.exit(1);
}

const inputs = [];
const filters = [];
let total = 0;
usable.forEach((seg, i) => {
  const length = seg.end - seg.start;
  const speed = seg.maxSeconds && length > seg.maxSeconds ? length / seg.maxSeconds : 1;
  total += length / speed;
  inputs.push("-ss", seg.start.toFixed(3), "-t", length.toFixed(3), "-i", seg.file);
  filters.push(
    `[${i}:v]setpts=(PTS-STARTPTS)/${speed.toFixed(4)},fps=${FPS},` +
      `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v${i}]`,
  );
  console.log(`${seg.scene.padEnd(9)} ${length.toFixed(1)}s${speed > 1 ? ` → ${(length / speed).toFixed(1)}s (${speed.toFixed(1)}x)` : ""}`);
});

const fadeOut = Math.max(0, total - 0.6).toFixed(2);
filters.push(
  `${usable.map((_, i) => `[v${i}]`).join("")}concat=n=${usable.length}:v=1:a=0,` +
    `fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOut}:d=0.6[out]`,
);

const mp4 = resolve(outDir, "argos-command-code.mp4");
const ffmpeg = (argv) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...argv], { stdio: "inherit" });

ffmpeg([
  ...inputs,
  "-filter_complex",
  filters.join(";"),
  "-map",
  "[out]",
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "18",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  mp4,
]);
console.log(`\n✔ ${mp4} (${total.toFixed(1)}s)`);

if (makeGif) {
  const gif = resolve(outDir, "argos-command-code.gif");
  ffmpeg([
    "-i",
    mp4,
    "-vf",
    "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5",
    gif,
  ]);
  console.log(`✔ ${gif}`);
}
