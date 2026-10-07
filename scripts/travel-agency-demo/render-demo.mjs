#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const transcriptPath = join(scriptDir, "demo-transcript.json");
const transcript = JSON.parse(readFileSync(transcriptPath, "utf8"));
const requested = process.argv.find((arg) => arg.startsWith("--session="))?.split("=")[1];
const outputRoot = process.env.MERMAIL_DEMO_OUTPUT_DIR || "/tmp/mermail-travel-agency-demo";
const sessions = requested
  ? transcript.sessions.filter((session) => session.id === requested)
  : transcript.sessions;

if (sessions.length === 0) {
  throw new Error(`Unknown demo session: ${requested}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${command} failed with status ${result.status}`);
  }
  return result.stdout.trim();
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapText(text, width = 88) {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const colors = {
  shell: "#B8C2CC",
  user: "#F7D774",
  assistant: "#D8E1E8",
  success: "#72E29A",
  warning: "#F5A65B",
  brand: "#94AEFF",
  muted: "#83909A",
  thinking: "#6FD6D0"
};

function visualRows(history, cursor) {
  const rows = [];
  for (const entry of history) {
    const wrapped = wrapText(entry.text, entry.kind === "user" ? 84 : 90);
    wrapped.forEach((line, index) => {
      const prefix = index === 0 ? entry.prefix || "" : "  ";
      rows.push({ kind: entry.kind, text: `${prefix}${line}` });
    });
  }
  if (cursor) {
    const last = rows.at(-1);
    if (last) last.text += "█";
  }
  return rows.slice(-21);
}

function terminalSvg(history, subtitle, cursor, width, height) {
  const rows = visualRows(history, cursor);
  const rowMarkup = rows.map((row, index) => {
    const y = 372 + index * 27;
    return `<text x="54" y="${y}" font-family="Menlo, Monaco, 'Courier New', monospace" font-size="20" fill="${colors[row.kind] || colors.assistant}">${escapeXml(row.text || " ")}</text>`;
  }).join("\n");
  const subtitleMarkup = subtitle
    ? `<g><rect x="330" y="918" width="620" height="48" rx="24" fill="#111A1F" fill-opacity="0.96" stroke="#35434B"/><text x="640" y="949" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="19" fill="#F4F7F8">${escapeXml(subtitle)}</text></g>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="1280">
    <rect width="${width}" height="1280" fill="#070B0D"/>
    <g>
      <rect x="20" y="286" width="1240" height="688" rx="15" fill="#0B1115" stroke="#27343B" stroke-width="2"/>
      <rect x="20" y="286" width="1240" height="58" rx="15" fill="#151D22"/>
      <rect x="20" y="325" width="1240" height="19" fill="#151D22"/>
      <circle cx="52" cy="315" r="7" fill="#FF625F"/>
      <circle cx="76" cy="315" r="7" fill="#F4BF4F"/>
      <circle cx="100" cy="315" r="7" fill="#54C66F"/>
      ${rowMarkup}
      ${subtitleMarkup}
    </g>
  </svg>`;
}

function pushFrames(frames, seconds, snapshot) {
  const count = Math.max(1, Math.round(seconds * transcript.render.fps));
  for (let index = 0; index < count; index += 1) frames.push(snapshot);
}

function buildTimeline(session) {
  const frames = [];
  const history = [];
  let subtitle = "";
  const snapshot = (cursor = false) => terminalSvg(
    history,
    subtitle,
    cursor,
    transcript.render.width,
    transcript.render.height
  );

  for (const event of session.events) {
    if (event.type === "shell" || event.type === "user") {
      const kind = event.type;
      const prefix = event.type === "shell" ? "$ " : "› ";
      const entry = { kind, prefix, text: "" };
      history.push(entry);
      const typingSeconds = Math.max(1.3, event.text.length / (event.type === "shell" ? 20 : 15));
      const typingFrames = Math.max(1, Math.round(typingSeconds * transcript.render.fps));
      for (let frame = 1; frame <= typingFrames; frame += 1) {
        const chars = Math.ceil((frame / typingFrames) * event.text.length);
        entry.text = event.text.slice(0, chars);
        frames.push(snapshot(true));
      }
      pushFrames(frames, event.after || 1, snapshot(false));
      continue;
    }

    if (event.type === "thinking") {
      const states = ["·", "··", "···"];
      const total = Math.round(event.seconds * transcript.render.fps);
      const entry = { kind: "thinking", prefix: "• ", text: event.text };
      history.push(entry);
      for (let frame = 0; frame < total; frame += 1) {
        entry.text = `${event.text}${states[Math.floor(frame / transcript.render.fps) % states.length]}`;
        frames.push(snapshot(false));
      }
      history.pop();
      continue;
    }

    if (event.type === "output") {
      for (const line of event.lines) {
        history.push({ kind: event.kind || "assistant", prefix: "", text: line });
        pushFrames(frames, event.lineDelay || 0.65, snapshot(false));
      }
      pushFrames(frames, event.after || 1, snapshot(false));
      continue;
    }

    if (event.type === "subtitle") {
      subtitle = event.text;
      pushFrames(frames, event.seconds || 3, snapshot(false));
      subtitle = "";
      pushFrames(frames, 0.5, snapshot(false));
    }
  }

  const targetFrames = Math.round(session.targetSeconds * transcript.render.fps);
  if (frames.length < targetFrames) {
    pushFrames(frames, (targetFrames - frames.length) / transcript.render.fps, snapshot(false));
  }
  return frames;
}

function renderSession(session) {
  const sessionRoot = join(outputRoot, session.id);
  const svgDir = join(sessionRoot, "svg");
  const frameDir = join(sessionRoot, "frames");
  rmSync(sessionRoot, { recursive: true, force: true });
  mkdirSync(svgDir, { recursive: true });
  mkdirSync(frameDir, { recursive: true });

  const frames = buildTimeline(session);
  frames.forEach((svg, index) => {
    writeFileSync(join(svgDir, `${String(index + 1).padStart(6, "0")}.svg`), svg);
  });

  const paths = frames.map((_, index) => join(svgDir, `${String(index + 1).padStart(6, "0")}.svg`));
  for (let offset = 0; offset < paths.length; offset += 120) {
    run("qlmanage", ["-t", "-s", "1280", "-o", frameDir, ...paths.slice(offset, offset + 120)]);
  }

  paths.forEach((path, index) => {
    const generated = join(frameDir, `${path.split("/").at(-1)}.png`);
    const expected = join(frameDir, `${String(index + 1).padStart(6, "0")}.png`);
    if (!existsSync(generated)) throw new Error(`Missing rendered frame: ${generated}`);
    renameSync(generated, expected);
  });

  mkdirSync(outputRoot, { recursive: true });
  const output = join(outputRoot, session.filename);
  run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-framerate", String(transcript.render.fps),
    "-i", join(frameDir, "%06d.png"),
    "-vf", "crop=1280:720:0:280,fps=30,format=yuv420p",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "24",
    "-movflags", "+faststart",
    "-an",
    output
  ]);
  const probe = run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate",
    "-of", "json",
    output
  ]);
  process.stdout.write(`${output}\n${probe}\n`);
}

mkdirSync(outputRoot, { recursive: true });
for (const session of sessions) renderSession(session);
