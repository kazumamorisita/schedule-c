import { useEffect, useMemo, useState } from "react";

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
  source?: "manual" | "stopwatch";
};

const STORAGE_KEY = "schedule-app-data-v1";

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function calcDurationMinutes(s: Schedule): number {
  const start = timeToMinutes(s.startTime);
  const end = timeToMinutes(s.endTime);
  if (end >= start) return end - start;
  return 24 * 60 - start + end;
}

function levelFromMinutes(totalMinutes: number): number {
  return Math.max(1, Math.floor(Math.sqrt(totalMinutes / 30)) + 1);
}

function requiredTotalMinutes(level: number): number {
  return Math.max(0, (level - 1) * (level - 1) * 30);
}

function heroForm(level: number): { name: string; avatar: string; aura: string } {
  if (level >= 35) return { name: "蒼焔の勇者", avatar: "🛡️", aura: "from-cyan-400/25 to-amber-400/20" };
  if (level >= 25) return { name: "王都の騎士", avatar: "⚔️", aura: "from-sky-400/20 to-cyan-400/20" };
  if (level >= 15) return { name: "熟練レンジャー", avatar: "🏹", aura: "from-emerald-400/20 to-cyan-400/20" };
  if (level >= 8) return { name: "見習い冒険者", avatar: "🧭", aura: "from-violet-400/20 to-sky-400/20" };
  return { name: "旅立ちの新人", avatar: "🗡️", aura: "from-slate-500/20 to-cyan-500/20" };
}

function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}

export default function Game() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Schedule[];
        if (Array.isArray(parsed)) setSchedules(parsed);
      } catch {
        setSchedules([]);
      }
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as Schedule[];
        if (Array.isArray(parsed)) setSchedules(parsed);
      } catch {
        setSchedules([]);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const todayIso = new Date().toISOString().slice(0, 10);

  const tracked = useMemo(() => {
    return schedules.filter((s) => s.source === "stopwatch" && s.repeat === "none");
  }, [schedules]);

  const totalMinutes = useMemo(() => tracked.reduce((sum, s) => sum + calcDurationMinutes(s), 0), [tracked]);
  const sessions = tracked.length;
  const todayMinutes = useMemo(
    () => tracked.filter((s) => s.date === todayIso).reduce((sum, s) => sum + calcDurationMinutes(s), 0),
    [tracked, todayIso]
  );

  const level = levelFromMinutes(totalMinutes);
  const currentLevelBase = requiredTotalMinutes(level);
  const nextLevelBase = requiredTotalMinutes(level + 1);
  const currentExp = totalMinutes - currentLevelBase;
  const neededExp = Math.max(1, nextLevelBase - currentLevelBase);
  const progressPercent = Math.min(100, Math.round((currentExp / neededExp) * 100));

  const hero = heroForm(level);
  const hp = 120 + level * 14;
  const atk = 18 + level * 4;
  const def = 10 + level * 3;
  const spd = 8 + Math.floor(level * 1.6);

  const recent = [...tracked].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 4);

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8">
      <section className="mx-auto max-w-4xl space-y-4">
        <header className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <a
              href={`${import.meta.env.BASE_URL}`}
              className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700"
            >
              ← カレンダー
            </a>
            <h1 className="text-sm font-semibold tracking-wide text-amber-300 md:text-base">⚔ 育成クエスト</h1>
            <a
              href={`${import.meta.env.BASE_URL}stopwatch.html`}
              className="rounded-full border border-cyan-600/40 bg-cyan-900/20 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-800/30"
            >
              ⏱ 計測へ
            </a>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            ストップウォッチで記録した行動時間だけが経験値になります。
          </p>
        </header>

        <section className={`rounded-2xl border border-slate-700 bg-gradient-to-br ${hero.aura} p-4 shadow-soft`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-300">CLASS</p>
              <p className="text-lg font-bold text-amber-300">{hero.name}</p>
              <p className="text-xs text-slate-300">Lv.{level}</p>
            </div>
            <div className="text-6xl drop-shadow-[0_0_18px_rgba(34,211,238,.45)]">{hero.avatar}</div>
          </div>
          <div className="mt-3 rounded-xl bg-slate-900/60 p-2">
            <div className="mb-1 flex items-center justify-between text-[11px] text-slate-300">
              <span>EXP {currentExp}/{neededExp}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-amber-300" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="総行動時間" value={formatHM(totalMinutes)} accent="text-cyan-300" />
          <StatCard label="計測セッション" value={`${sessions} 回`} accent="text-emerald-300" />
          <StatCard label="今日の稼ぎ" value={formatHM(todayMinutes)} accent="text-amber-300" />
          <StatCard label="次Lvまで" value={formatHM(neededExp - currentExp)} accent="text-violet-300" />
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="text-sm font-semibold text-cyan-300">ステータス</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <StatusRow label="HP" value={hp} />
              <StatusRow label="ATK" value={atk} />
              <StatusRow label="DEF" value={def} />
              <StatusRow label="SPD" value={spd} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="text-sm font-semibold text-amber-300">最近の冒険ログ</h2>
            <div className="mt-3 space-y-2">
              {recent.length === 0 && <p className="text-xs text-slate-400">まだログがありません。⏱ から行動を記録してみましょう。</p>}
              {recent.map((s) => (
                <div key={s.id} className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2">
                  <p className="text-xs text-slate-400">{s.date} {s.startTime}-{s.endTime}</p>
                  <p className="truncate text-sm font-semibold text-slate-100">{s.title}</p>
                  <p className="text-xs text-cyan-300">+{formatHM(calcDurationMinutes(s))} EXP</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`mt-1 text-base font-bold ${accent}`}>{value}</p>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-base font-bold text-slate-100">{value}</p>
    </div>
  );
}
