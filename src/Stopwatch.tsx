import { useEffect, useRef, useState } from "react";

// ── 型定義 ───────────────────────────────────────────────────
type Tag = { id: string; name: string; color: string };
type Schedule = {
  id: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  tagId: string;
  repeat: "none" | "daily" | "weekly" | "monthly";
  reminderMinutes: number;
  location: string;
  url: string;
};

// ── 定数 ─────────────────────────────────────────────────────
const STORAGE_KEY = "schedule-app-data-v1";
const TAG_STORAGE_KEY = "schedule-app-tags-v1";
const DEFAULT_TAGS: Tag[] = [
  { id: "work", name: "仕事", color: "#38bdf8" },
  { id: "private", name: "プライベート", color: "#f472b6" },
  { id: "health", name: "健康", color: "#4ade80" },
  { id: "study", name: "勉強", color: "#f59e0b" },
];

// ── ユーティリティ ────────────────────────────────────────────
function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toHHMM(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function formatDisplay(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  const main = h > 0
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return { main, cs: String(cs).padStart(2, "0") };
}

// ── コンポーネント ────────────────────────────────────────────
type Phase = "idle" | "running" | "paused" | "done";

export default function Stopwatch() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [displayMs, setDisplayMs] = useState(0);
  const [clockStart, setClockStart] = useState<Date | null>(null);
  const [clockEnd, setClockEnd] = useState<Date | null>(null);

  // タグ
  const [tags, setTags] = useState<Tag[]>(DEFAULT_TAGS);
  const [tagId, setTagId] = useState(DEFAULT_TAGS[0].id);

  // フォーム
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState(false);

  // タイマー内部状態
  const accRef = useRef(0);           // 一時停止前までの累積 ms
  const segStartRef = useRef<number | null>(null); // 現セグメント開始timestamp
  const rafRef = useRef<number | null>(null);
  const firstStartRef = useRef<Date | null>(null); // 最初にStartした日時

  // タグをlocalStorageから読込
  useEffect(() => {
    const raw = localStorage.getItem(TAG_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Tag[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setTags(parsed);
        setTagId(parsed[0].id);
      }
    } catch { /* ignore */ }
  }, []);

  // rAFループ
  const tick = () => {
    if (segStartRef.current !== null) {
      setDisplayMs(accRef.current + (Date.now() - segStartRef.current));
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const startTimer = () => {
    const now = new Date();
    if (!firstStartRef.current) {
      firstStartRef.current = now;
      setClockStart(now);
    }
    segStartRef.current = Date.now();
    setPhase("running");
    rafRef.current = requestAnimationFrame(tick);
  };

  const pauseTimer = () => {
    if (segStartRef.current !== null) {
      accRef.current += Date.now() - segStartRef.current;
      segStartRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPhase("paused");
  };

  const stopTimer = () => {
    if (segStartRef.current !== null) {
      accRef.current += Date.now() - segStartRef.current;
      segStartRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setDisplayMs(accRef.current);
    setClockEnd(new Date());
    setPhase("done");
  };

  const reset = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    accRef.current = 0;
    segStartRef.current = null;
    firstStartRef.current = null;
    setDisplayMs(0);
    setClockStart(null);
    setClockEnd(null);
    setPhase("idle");
    setSaved(false);
    setTitle("");
    setDescription("");
  };

  // localStorageに保存してメインウィンドウへ通知
  const saveSchedule = () => {
    if (!clockStart || !clockEnd) return;
    const schedule: Schedule = {
      id: crypto.randomUUID(),
      title: title.trim() || "記録した活動",
      description,
      date: toISO(clockStart),
      startTime: toHHMM(clockStart),
      endTime: toHHMM(clockEnd),
      tagId,
      repeat: "none",
      reminderMinutes: 0,
      location: "",
      url: "",
    };
    const raw = localStorage.getItem(STORAGE_KEY);
    let existing: Schedule[] = [];
    if (raw) { try { existing = JSON.parse(raw); } catch { /* ignore */ } }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, schedule]));
    setSaved(true);
  };

  const { main, cs } = formatDisplay(displayMs);

  // 状態別の表示色
  const timerColor =
    phase === "running" ? "text-cyan-300" :
    phase === "paused"  ? "text-amber-300" :
    phase === "done"    ? "text-emerald-300" :
                          "text-slate-500";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center pt-10 px-6 pb-10">
      {/* ヘッダー */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-2xl">⏱</span>
        <h1 className="text-lg font-bold tracking-wide text-cyan-400">ストップウォッチ</h1>
      </div>
      <p className="mb-8 text-xs text-slate-500 text-center">
        活動を計測してカレンダーに記録します
      </p>

      {/* タイマー表示 */}
      <div className={`relative mb-2 flex items-end gap-1 transition-colors duration-300 ${timerColor}`}>
        {phase === "running" && (
          <span className="absolute -left-5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse" />
        )}
        <span className="font-mono text-7xl font-bold tabular-nums leading-none">{main}</span>
        <span className="font-mono text-2xl text-slate-600 mb-1">.{cs}</span>
      </div>

      {/* 開始・終了時刻 */}
      <div className="mb-8 h-5 text-sm text-slate-500">
        {clockStart && (
          <span>
            {toHHMM(clockStart)}
            {clockEnd && <span className="text-slate-400"> → {toHHMM(clockEnd)}</span>}
          </span>
        )}
      </div>

      {/* ボタン群 */}
      <div className="flex gap-3 mb-8">
        {phase === "idle" && (
          <button
            onClick={startTimer}
            className="rounded-full bg-cyan-500 px-10 py-3 text-base font-bold text-slate-900 shadow-lg transition hover:bg-cyan-400 active:scale-95"
          >
            開始
          </button>
        )}
        {phase === "running" && (
          <>
            <button
              onClick={pauseTimer}
              className="rounded-full bg-amber-400 px-7 py-3 font-bold text-slate-900 shadow-lg transition hover:bg-amber-300 active:scale-95"
            >
              一時停止
            </button>
            <button
              onClick={stopTimer}
              className="rounded-full bg-rose-500 px-7 py-3 font-bold text-white shadow-lg transition hover:bg-rose-400 active:scale-95"
            >
              停止
            </button>
          </>
        )}
        {phase === "paused" && (
          <>
            <button
              onClick={startTimer}
              className="rounded-full bg-cyan-500 px-7 py-3 font-bold text-slate-900 shadow-lg transition hover:bg-cyan-400 active:scale-95"
            >
              再開
            </button>
            <button
              onClick={stopTimer}
              className="rounded-full bg-rose-500 px-7 py-3 font-bold text-white shadow-lg transition hover:bg-rose-400 active:scale-95"
            >
              停止
            </button>
          </>
        )}
        {phase === "done" && (
          <button
            onClick={reset}
            className="rounded-full border border-slate-600 bg-slate-800 px-7 py-3 font-semibold text-slate-300 transition hover:bg-slate-700 active:scale-95"
          >
            リセット
          </button>
        )}
      </div>

      {/* 保存フォーム */}
      {phase === "done" && !saved && (
        <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800/80 p-5 space-y-3 shadow-xl">
          <p className="text-sm font-semibold text-slate-300">📋 予定として保存</p>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル（例：集中作業、散歩）"
            className="w-full rounded-xl border border-slate-600 bg-slate-700/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400 placeholder:text-slate-500"
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="メモ（任意）"
            rows={2}
            className="w-full resize-none rounded-xl border border-slate-600 bg-slate-700/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400 placeholder:text-slate-500"
          />

          <select
            value={tagId}
            onChange={(e) => setTagId(e.target.value)}
            className="w-full rounded-xl border border-slate-600 bg-slate-700/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
          >
            {tags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          {/* 時間確認 */}
          {clockStart && clockEnd && (
            <div className="rounded-xl bg-slate-700/50 px-3 py-2 text-xs text-slate-400">
              <span>{toISO(clockStart)}</span>
              <span className="mx-2">·</span>
              <span>{toHHMM(clockStart)} 〜 {toHHMM(clockEnd)}</span>
              <span className="ml-2 text-slate-500">
                ({Math.floor(displayMs / 60000)}分{Math.floor((displayMs % 60000) / 1000)}秒)
              </span>
            </div>
          )}

          <button
            onClick={saveSchedule}
            className="w-full rounded-xl bg-cyan-500 py-2.5 font-bold text-slate-900 transition hover:bg-cyan-400 active:scale-95"
          >
            カレンダーに保存
          </button>
        </div>
      )}

      {/* 保存完了 */}
      {saved && (
        <div className="w-full max-w-sm rounded-2xl border border-emerald-700/60 bg-emerald-900/30 p-5 text-center space-y-3">
          <p className="text-2xl">✓</p>
          <p className="font-bold text-emerald-300">保存しました！</p>
          <p className="text-xs text-slate-400">
            カレンダー側のウィンドウに自動で反映されます
          </p>
          <button
            onClick={reset}
            className="rounded-full border border-slate-600 bg-slate-800 px-6 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-700 active:scale-95"
          >
            新しく計測する
          </button>
        </div>
      )}
    </div>
  );
}
