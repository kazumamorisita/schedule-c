import { useEffect, useMemo, useRef, useState } from "react";

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

type GameSave = {
  coins: number;
  claimedRewardIds: string[];
};

type Announcement = {
  title: string;
  body: string;
};

const STORAGE_KEY = "schedule-app-data-v1";
const GAME_SAVE_KEY = "schedule-app-game-v1";
const DAILY_EXP_CAP = 180; // 1日上限 3時間

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

function startOfWeekMonday(iso: string): string {
  const d = parseISO(iso);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toISO(d);
}

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

function effectiveMinutesPerSession(rawMinutes: number): number {
  // 短時間連打対策: 5分未満は無効、5-9分は半分
  if (rawMinutes < 5) return 0;
  if (rawMinutes < 10) return Math.floor(rawMinutes * 0.5);
  return rawMinutes;
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

function uniqueSortedDates(dates: string[]): string[] {
  return [...new Set(dates)].sort((a, b) => (a < b ? 1 : -1));
}

function calcStreak(todayIso: string, activeDates: string[]): number {
  const set = new Set(activeDates);
  let streak = 0;
  let cursor = todayIso;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export default function Game() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [save, setSave] = useState<GameSave>({ coins: 0, claimedRewardIds: [] });
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  const initializedRef = useRef(false);
  const prevLevelRef = useRef(1);
  const prevClassRef = useRef("旅立ちの新人");

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

    const gameRaw = localStorage.getItem(GAME_SAVE_KEY);
    if (gameRaw) {
      try {
        const parsed = JSON.parse(gameRaw) as GameSave;
        if (parsed && typeof parsed.coins === "number" && Array.isArray(parsed.claimedRewardIds)) {
          setSave(parsed);
        }
      } catch {
        setSave({ coins: 0, claimedRewardIds: [] });
      }
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as Schedule[];
          if (Array.isArray(parsed)) setSchedules(parsed);
        } catch {
          setSchedules([]);
        }
      }
      if (e.key === GAME_SAVE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as GameSave;
          if (parsed && typeof parsed.coins === "number" && Array.isArray(parsed.claimedRewardIds)) {
            setSave(parsed);
          }
        } catch {
          setSave({ coins: 0, claimedRewardIds: [] });
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(save));
  }, [save]);

  // ゲーム画面では全体スクロールを許可（カレンダー画面は従来どおり）
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "auto";
    document.body.style.overscrollBehavior = "auto";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, []);

  const todayIso = toISO(new Date());
  const weekStartIso = startOfWeekMonday(todayIso);

  const tracked = useMemo(() => {
    return schedules
      .filter((s) => s.source === "stopwatch" && s.repeat === "none")
      .map((s) => {
        const rawMinutes = calcDurationMinutes(s);
        const effective = effectiveMinutesPerSession(rawMinutes);
        return { ...s, rawMinutes, effective };
      });
  }, [schedules]);

  const byDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of tracked) {
      map[s.date] = (map[s.date] ?? 0) + s.effective;
    }
    return map;
  }, [tracked]);

  const cappedByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [date, minutes] of Object.entries(byDate)) {
      map[date] = Math.min(DAILY_EXP_CAP, minutes);
    }
    return map;
  }, [byDate]);

  const activeDates = useMemo(() => Object.keys(cappedByDate).filter((d) => cappedByDate[d] >= 20), [cappedByDate]);
  const streak = useMemo(() => calcStreak(todayIso, activeDates), [todayIso, activeDates]);
  const streakBonusRate = Math.min(0.3, streak * 0.05);

  const totalMinutes = useMemo(() => {
    const capped = Object.values(cappedByDate).reduce((sum, v) => sum + v, 0);
    return Math.floor(capped * (1 + streakBonusRate));
  }, [cappedByDate, streakBonusRate]);

  const sessions = tracked.length;
  const todayMinutes = Math.floor((cappedByDate[todayIso] ?? 0) * (1 + streakBonusRate));

  const weekEndIso = addDays(weekStartIso, 6);
  const weekMinutes = useMemo(() => {
    let sum = 0;
    for (const [date, minutes] of Object.entries(cappedByDate)) {
      if (date >= weekStartIso && date <= weekEndIso) sum += minutes;
    }
    return Math.floor(sum * (1 + streakBonusRate));
  }, [cappedByDate, weekStartIso, weekEndIso, streakBonusRate]);

  const weekSessions = useMemo(() => tracked.filter((s) => s.date >= weekStartIso && s.date <= weekEndIso).length, [tracked, weekStartIso, weekEndIso]);
  const weekActiveDays = useMemo(() => activeDates.filter((d) => d >= weekStartIso && d <= weekEndIso).length, [activeDates, weekStartIso, weekEndIso]);

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

  const recent = [...tracked].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);

  const weekKey = `${weekStartIso}`;
  const dailyQuestDefs = [
    { id: `daily-30-${todayIso}`, label: "デイリー: 今日30分以上記録", done: todayMinutes >= 30, reward: 40 },
    { id: `daily-2sessions-${todayIso}`, label: "デイリー: 2セッション達成", done: tracked.filter((s) => s.date === todayIso).length >= 2, reward: 60 },
    { id: `daily-focus-${todayIso}`, label: "デイリー: 1回25分以上", done: tracked.some((s) => s.date === todayIso && s.rawMinutes >= 25), reward: 80 },
  ];

  const weeklyQuestDefs = [
    { id: `weekly-420-${weekKey}`, label: "ウィークリー: 週7時間(420分)", done: weekMinutes >= 420, reward: 220 },
    { id: `weekly-active4-${weekKey}`, label: "ウィークリー: 4日以上活動", done: weekActiveDays >= 4, reward: 160 },
  ];

  const bossMaxHp = 800 + level * 40;
  const bossDamage = Math.min(bossMaxHp, weekMinutes + weekSessions * 15 + streak * 20);
  const bossHp = Math.max(0, bossMaxHp - bossDamage);
  const bossDefeated = bossHp <= 0;
  const bossRewardId = `boss-${weekKey}`;
  const bossReward = 350;

  const claimReward = (id: string, amount: number) => {
    setSave((prev) => {
      if (prev.claimedRewardIds.includes(id)) return prev;
      return {
        coins: prev.coins + amount,
        claimedRewardIds: [...prev.claimedRewardIds, id],
      };
    });
  };

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      prevLevelRef.current = level;
      prevClassRef.current = hero.name;
      return;
    }

    const prevLevel = prevLevelRef.current;
    const prevClass = prevClassRef.current;
    if (level > prevLevel) {
      setAnnouncement({ title: "LEVEL UP!", body: `Lv.${prevLevel} → Lv.${level} に成長しました。` });
    }
    if (hero.name !== prevClass) {
      setAnnouncement({ title: "CLASS EVOLUTION!", body: `${prevClass} から ${hero.name} へ進化しました。` });
    }

    prevLevelRef.current = level;
    prevClassRef.current = hero.name;
  }, [level, hero.name]);

  useEffect(() => {
    if (!announcement) return;
    const timer = setTimeout(() => setAnnouncement(null), 2800);
    return () => clearTimeout(timer);
  }, [announcement]);

  return (
    <main className="h-screen overflow-y-auto overscroll-y-contain bg-slate-950 p-4 pb-20 text-slate-100 md:p-8">
      <section className="mx-auto max-w-5xl space-y-4">
        <header className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <a
              href={`${import.meta.env.BASE_URL}`
              }
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
            ストップウォッチ由来の予定だけで成長。短時間連打は減衰、1日上限は {DAILY_EXP_CAP} 分、連続記録で最大+30%ボーナス。
          </p>
        </header>

        <section className={`rounded-2xl border border-slate-700 bg-gradient-to-br ${hero.aura} p-4 shadow-soft`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-300">CLASS</p>
              <p className="text-lg font-bold text-amber-300">{hero.name}</p>
              <p className="text-xs text-slate-300">Lv.{level} ・ 連続 {streak} 日</p>
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

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard label="総行動時間(有効)" value={formatHM(totalMinutes)} accent="text-cyan-300" />
          <StatCard label="計測セッション" value={`${sessions} 回`} accent="text-emerald-300" />
          <StatCard label="今日の稼ぎ" value={formatHM(todayMinutes)} accent="text-amber-300" />
          <StatCard label="次Lvまで" value={formatHM(neededExp - currentExp)} accent="text-violet-300" />
          <StatCard label="所持コイン" value={`${save.coins} G`} accent="text-yellow-300" />
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="text-sm font-semibold text-fuchsia-300">デイリー/ウィークリークエスト</h2>
            <div className="mt-3 max-h-[34vh] space-y-2 overflow-y-auto pr-1 md:max-h-none">
              {[...dailyQuestDefs, ...weeklyQuestDefs].map((q) => {
                const claimed = save.claimedRewardIds.includes(q.id);
                return (
                  <div key={q.id} className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-200">{q.label}</p>
                      <span className="text-[11px] text-amber-300">+{q.reward}G</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <p className={`text-[11px] ${q.done ? "text-emerald-300" : "text-slate-400"}`}>
                        {q.done ? "達成済み" : "未達成"}
                      </p>
                      <button
                        disabled={!q.done || claimed}
                        onClick={() => claimReward(q.id, q.reward)}
                        className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                          q.done && !claimed
                            ? "bg-cyan-500 text-slate-900"
                            : "bg-slate-700 text-slate-400"
                        }`}
                      >
                        {claimed ? "受取済み" : "報酬受取"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="text-sm font-semibold text-rose-300">ボス戦イベント (週替わり)</h2>
            <p className="mt-1 text-[11px] text-slate-400">今週の魔王「クロノ・ワイバーン」</p>
            <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/70 p-3">
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-300">
                <span>HP {bossHp} / {bossMaxHp}</span>
                <span>{Math.round((bossDamage / bossMaxHp) * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400" style={{ width: `${Math.round((bossDamage / bossMaxHp) * 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-300">
                週間ダメージ: {weekMinutes} + セッション補正 {weekSessions * 15} + 連続補正 {streak * 20}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <p className={`text-xs font-semibold ${bossDefeated ? "text-emerald-300" : "text-slate-400"}`}>
                  {bossDefeated ? "討伐成功！" : "討伐中..."}
                </p>
                <button
                  disabled={!bossDefeated || save.claimedRewardIds.includes(bossRewardId)}
                  onClick={() => claimReward(bossRewardId, bossReward)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                    bossDefeated && !save.claimedRewardIds.includes(bossRewardId)
                      ? "bg-amber-400 text-slate-900"
                      : "bg-slate-700 text-slate-400"
                  }`}
                >
                  {save.claimedRewardIds.includes(bossRewardId) ? "受取済み" : `討伐報酬 +${bossReward}G`}
                </button>
              </div>
            </div>
          </div>
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
                  <p className="text-xs text-cyan-300">有効 +{formatHM(s.effective)} EXP（実時間 {formatHM(s.rawMinutes)}）</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-[11px] text-slate-400">
          <p>連続記録日: {uniqueSortedDates(activeDates).join(" / ") || "なし"}</p>
          <p className="mt-1">現在の連続ボーナス: +{Math.round(streakBonusRate * 100)}%</p>
        </section>
      </section>

      {announcement && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-amber-300/50 bg-slate-900 p-5 text-center shadow-[0_0_40px_rgba(251,191,36,.25)]">
            <p className="text-xl font-extrabold tracking-wide text-amber-300">{announcement.title}</p>
            <p className="mt-2 text-sm text-slate-200">{announcement.body}</p>
            <button
              onClick={() => setAnnouncement(null)}
              className="mt-4 rounded-full bg-amber-400 px-4 py-1.5 text-xs font-bold text-slate-900"
            >
              とじる
            </button>
          </div>
        </div>
      )}
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
