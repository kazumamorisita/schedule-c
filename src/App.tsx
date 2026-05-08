import { ChangeEvent, useMemo, useRef, useState } from "react";

type Repeat = "none" | "daily" | "weekly" | "monthly";

type Tag = {
  id: string;
  name: string;
  color: string;
};

type Schedule = {
  id: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  tagId: string;
  repeat: Repeat;
};

const TAGS: Tag[] = [
  { id: "work", name: "仕事", color: "#38bdf8" },
  { id: "private", name: "プライベート", color: "#f472b6" },
  { id: "health", name: "健康", color: "#4ade80" },
  { id: "study", name: "勉強", color: "#f59e0b" }
];

const STORAGE_KEY = "schedule-app-data-v1";
const TAG_STORAGE_KEY = "schedule-app-tags-v1";

const today = new Date();
const isoToday = toISO(today);

const defaultData: Schedule[] = [
  {
    id: crypto.randomUUID(),
    title: "定例ミーティング",
    description: "チームの進捗確認",
    date: isoToday,
    startTime: "10:00",
    endTime: "10:30",
    tagId: "work",
    repeat: "weekly"
  }
];

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

function addMonths(iso: string, months: number): string {
  const d = parseISO(iso);
  d.setMonth(d.getMonth() + months);
  return toISO(d);
}

function expandSchedules(source: Schedule[], from: string, to: string): Schedule[] {
  const expanded: Schedule[] = [];

  for (const s of source) {
    if (s.repeat === "none") {
      if (s.date >= from && s.date <= to) expanded.push(s);
      continue;
    }

    let cursor = s.date;
    while (cursor < from) {
      cursor =
        s.repeat === "daily"
          ? addDays(cursor, 1)
          : s.repeat === "weekly"
            ? addDays(cursor, 7)
            : addMonths(cursor, 1);
    }

    while (cursor <= to) {
      expanded.push({
        ...s,
        id: `${s.id}_${cursor}`,
        date: cursor
      });
      cursor =
        s.repeat === "daily"
          ? addDays(cursor, 1)
          : s.repeat === "weekly"
            ? addDays(cursor, 7)
            : addMonths(cursor, 1);
    }
  }
  return expanded;
}

function App() {
  const [tags, setTags] = useState<Tag[]>(() => {
    const raw = localStorage.getItem(TAG_STORAGE_KEY);
    if (!raw) return TAGS;
    try {
      const parsed = JSON.parse(raw) as Tag[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : TAGS;
    } catch {
      return TAGS;
    }
  });

  const [baseSchedules, setBaseSchedules] = useState<Schedule[]>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData;
    try {
      return JSON.parse(raw) as Schedule[];
    } catch {
      return defaultData;
    }
  });

  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(isoToday);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>(tags.map((t) => t.id));
  const [sheetOpen, setSheetOpen] = useState(true);
  const [sheetOffset, setSheetOffset] = useState(0);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const monthStart = toISO(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1));
  const monthEnd = toISO(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0));

  const expanded = useMemo(
    () => expandSchedules(baseSchedules, addDays(monthStart, -10), addDays(monthEnd, 10)),
    [baseSchedules, monthStart, monthEnd]
  );

  const visibleSchedules = expanded.filter((s) => activeTags.includes(s.tagId));
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredSchedules = visibleSchedules.filter((s) => {
    if (!normalizedSearch) return true;
    return s.title.toLowerCase().includes(normalizedSearch) || s.description.toLowerCase().includes(normalizedSearch);
  });
  const monthVisibleSchedules = filteredSchedules.filter((s) => s.date >= monthStart && s.date <= monthEnd);

  const byDate = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    for (const s of filteredSchedules) {
      map[s.date] ??= [];
      map[s.date].push(s);
    }
    return map;
  }, [filteredSchedules]);

  const dayItems = byDate[selectedDate] ?? [];
  const tagDistribution = useMemo(() => {
    const counts = tags.map((tag) => ({
      ...tag,
      count: monthVisibleSchedules.filter((s) => s.tagId === tag.id).length
    }));
    const total = counts.reduce((sum, item) => sum + item.count, 0);
    return { counts, total };
  }, [monthVisibleSchedules, tags]);

  const persist = (next: Schedule[]) => {
    setBaseSchedules(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const dates = buildMonthGrid(currentMonth);
  const currentMonthLabel = `${currentMonth.getFullYear()}年 ${currentMonth.getMonth() + 1}月`;
  const collapsedSheetY = typeof window !== "undefined" ? Math.max(360, window.innerHeight - 80) : 420;

  const onPointerDown = (y: number) => {
    dragStartY.current = y;
  };

  const onPointerMove = (y: number) => {
    if (dragStartY.current === null) return;
    const diff = y - dragStartY.current;
    if (diff > 0) setSheetOffset(Math.min(collapsedSheetY, diff));
    if (diff < 0) setSheetOffset(Math.max(-10, diff));
  };

  const onPointerUp = () => {
    if (sheetOffset > 120) setSheetOpen(false);
    if (sheetOffset < 40) setSheetOpen(true);
    setSheetOffset(0);
    dragStartY.current = null;
  };

  const onCreateSchedule = () => {
    const next: Schedule = {
      id: crypto.randomUUID(),
      title: "新しい予定",
      description: "",
      date: selectedDate,
      startTime: "09:00",
      endTime: "10:00",
      tagId: tags[0]?.id ?? "work",
      repeat: "none"
    };
    persist([...baseSchedules, next]);
    setSheetOpen(true);
  };

  const onExport = () => {
    const blob = new Blob([JSON.stringify(baseSchedules, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "schedules.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const parsed = JSON.parse(String(fr.result)) as Schedule[];
        if (Array.isArray(parsed)) persist(parsed);
      } catch {
        alert("JSONの読み込みに失敗しました。");
      }
    };
    fr.readAsText(file);
  };

  const persistTags = (next: Tag[]) => {
    if (next.length === 0) return;
    setTags(next);
    localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(next));
    setActiveTags((prev) => {
      const valid = prev.filter((id) => next.some((t) => t.id === id));
      return valid.length > 0 ? valid : next.map((t) => t.id);
    });
  };

  const onAddTag = () => {
    const next: Tag = {
      id: crypto.randomUUID(),
      name: `タグ${tags.length + 1}`,
      color: "#a78bfa"
    };
    persistTags([...tags, next]);
  };

  const onDeleteTag = (tagId: string) => {
    if (tags.length <= 1) return;
    const fallback = tags.find((t) => t.id !== tagId);
    if (!fallback) return;
    const nextTags = tags.filter((t) => t.id !== tagId);
    const nextSchedules = baseSchedules.map((s) => (s.tagId === tagId ? { ...s, tagId: fallback.id } : s));
    persist(nextSchedules);
    persistTags(nextTags);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col overflow-hidden p-2 text-slate-100 md:p-6">
      <section className="h-[calc(100vh-120px)] overflow-y-auto rounded-3xl border border-slate-700/50 bg-slate-900/75 p-3 pb-4 shadow-soft backdrop-blur md:h-auto md:overflow-visible md:pb-6 md:p-6">
        <header className="mb-4 space-y-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Smart Schedule</h1>
            <p className="text-sm text-slate-300">常時カレンダー表示 + スワイプ可能な詳細ビュー</p>
            <p className="mt-1 text-base font-semibold text-cyan-300 md:text-lg">{currentMonthLabel}</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <button
                aria-label="前月"
                className="grid h-9 w-9 place-items-center rounded-full bg-slate-700 text-lg"
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
              >
                ←
              </button>
              <button
                className="rounded-full bg-slate-700 px-3 py-1.5 text-xs font-semibold"
                onClick={() => setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
              >
                今日
              </button>
              <button
                aria-label="次月"
                className="grid h-9 w-9 place-items-center rounded-full bg-slate-700 text-lg"
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
              >
                →
              </button>
            </div>
            <div className="w-full">
              <div className="w-full rounded-xl border border-slate-700 bg-slate-800/70 p-2">
                <TagDonutChart tags={tagDistribution.counts} total={tagDistribution.total} />
              </div>
            </div>
          </div>
        </header>
        <div className="mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="予定をキーワード検索"
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
          />
        </div>

        <div className="grid grid-cols-7 gap-2 text-center text-xs text-slate-300">
          {["日", "月", "火", "水", "木", "金", "土"].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5 md:gap-2">
          {dates.map((iso) => {
            const inMonth = iso.startsWith(`${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`);
            const daySchedules = byDate[iso] ?? [];
            const isToday = iso === isoToday;
            const dayTagIds = [...new Set(daySchedules.map((item) => item.tagId))];
            return (
              <button
                key={iso}
                onClick={() => {
                  setSelectedDate(iso);
                  setSheetOpen(true);
                }}
                className={`relative aspect-square min-h-0 rounded-2xl border p-1.5 text-left transition md:p-2 ${
                  selectedDate === iso ? "border-cyan-400 bg-cyan-500/20" : "border-slate-700 bg-slate-800/60"
                } ${
                  isToday ? "ring-2 ring-amber-300/80 ring-offset-1 ring-offset-slate-900" : ""
                } ${inMonth ? "" : "opacity-35"}`}
              >
                <div className={`text-xs font-semibold md:text-sm ${isToday ? "text-amber-300" : ""}`}>
                  <span>{Number(iso.slice(-2))}</span>
                  {isToday && <span className="block text-[9px] leading-tight md:text-[10px]">今日</span>}
                </div>
                <div className="mt-1 flex items-center gap-1">
                  {dayTagIds.slice(0, 3).map((tagId) => {
                    const tag = tags.find((t) => t.id === tagId);
                    return (
                      <span
                        key={`${iso}_${tagId}`}
                        className="inline-block h-1.5 w-1.5 rounded-full md:h-2 md:w-2"
                        style={{ backgroundColor: tag?.color ?? "#94a3b8" }}
                      />
                    );
                  })}
                </div>
                {daySchedules.length > 0 && (
                  <span className="absolute right-1.5 top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold md:right-2 md:top-2 md:h-6 md:min-w-6 md:text-xs">
                    {daySchedules.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {tags.map((t) => (
            <button
              key={t.id}
              onClick={() =>
                setActiveTags((prev) => (prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]))
              }
              className={`rounded-full px-3 py-1 text-xs font-semibold ${activeTags.includes(t.id) ? "opacity-100" : "opacity-35"}`}
              style={{ backgroundColor: t.color, color: "#0f172a" }}
            >
              {t.name}
            </button>
          ))}
          <button
            className="inline-flex items-center gap-1 rounded-xl border border-slate-500 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100"
            onClick={onExport}
            aria-label="JSONエクスポート"
            title="JSONエクスポート"
          >
            <span aria-hidden>⬇</span>
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-xl border border-cyan-500/70 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200"
            onClick={() => fileRef.current?.click()}
            aria-label="JSONインポート"
            title="JSONインポート"
          >
            <span aria-hidden>⬆</span>
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-xl border border-violet-500/70 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-200"
            onClick={() => setIsTagEditorOpen(true)}
            aria-label="タグ編集"
            title="タグ編集"
          >
            タグ
          </button>
          <input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={onImport} />
        </div>

      </section>

      {isTagEditorOpen && (
        <section
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setIsTagEditorOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-100">タグ編集</p>
              <button
                className="rounded-lg border border-slate-500 px-2 py-1 text-xs font-semibold text-slate-200"
                onClick={() => setIsTagEditorOpen(false)}
              >
                閉じる
              </button>
            </div>
            <div className="mb-2 flex items-center justify-end">
              <button className="rounded-lg bg-violet-500/80 px-2 py-1 text-xs font-semibold" onClick={onAddTag}>
                タグ追加
              </button>
            </div>
            <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
              {tags.map((tag) => (
                <div key={tag.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-2">
                  <input
                    type="color"
                    value={tag.color}
                    className="h-7 w-7 rounded border border-slate-600 bg-transparent p-0"
                    onChange={(e) => persistTags(tags.map((t) => (t.id === tag.id ? { ...t, color: e.target.value } : t)))}
                  />
                  <input
                    value={tag.name}
                    className="rounded-md bg-slate-700 px-2 py-1.5 text-xs"
                    onChange={(e) => persistTags(tags.map((t) => (t.id === tag.id ? { ...t, name: e.target.value } : t)))}
                  />
                  <button
                    className="rounded-md bg-rose-500/80 px-2 py-1 text-xs font-semibold"
                    onClick={() => onDeleteTag(tag.id)}
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section
        className={`fixed bottom-0 left-0 right-0 mx-auto w-full max-w-6xl rounded-t-3xl border border-slate-700 bg-slate-900/95 p-4 shadow-soft transition-transform duration-300 ${
          sheetOpen ? "translate-y-0" : "translate-y-[74%]"
        }`}
        style={{ transform: `translateY(${sheetOpen ? sheetOffset : collapsedSheetY + sheetOffset}px)` }}
        onPointerDown={(e) => onPointerDown(e.clientY)}
        onPointerMove={(e) => onPointerMove(e.clientY)}
        onPointerUp={onPointerUp}
        onTouchStart={(e) => onPointerDown(e.touches[0].clientY)}
        onTouchMove={(e) => onPointerMove(e.touches[0].clientY)}
        onTouchEnd={onPointerUp}
      >
        <div
          className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-slate-600"
          onPointerDown={(e) => onPointerDown(e.clientY)}
          onTouchStart={(e) => onPointerDown(e.touches[0].clientY)}
          onTouchMove={(e) => onPointerMove(e.touches[0].clientY)}
          onTouchEnd={onPointerUp}
        />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{selectedDate} の予定</h2>
          <button className="rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950" onClick={onCreateSchedule}>
            予定追加
          </button>
        </div>
        <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
          {dayItems.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-700 bg-slate-800 p-3">
              <ScheduleCard
                schedule={item}
                tags={tags}
                onUpdate={(next) =>
                  persist(baseSchedules.map((s) => (s.id === item.id.split("_")[0] ? { ...next, id: s.id } : s)))
                }
                onDelete={() => persist(baseSchedules.filter((s) => s.id !== item.id.split("_")[0]))}
              />
            </article>
          ))}
          {dayItems.length === 0 && <p className="text-sm text-slate-400">予定はありません。</p>}
        </div>
      </section>
    </main>
  );
}

function ScheduleCard({
  schedule,
  tags,
  onUpdate,
  onDelete
}: {
  schedule: Schedule;
  tags: Tag[];
  onUpdate: (next: Schedule) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <button
          className="rounded-lg bg-rose-500/90 px-2.5 py-1 text-xs font-semibold text-white"
          onClick={onDelete}
        >
          削除
        </button>
      </div>
      <input
        className="w-full rounded-lg bg-slate-700 px-2 py-1 text-sm"
        value={schedule.title}
        onChange={(e) => onUpdate({ ...schedule, title: e.target.value })}
      />
      <textarea
        className="w-full rounded-lg bg-slate-700 px-2 py-1 text-sm"
        rows={2}
        value={schedule.description}
        onChange={(e) => onUpdate({ ...schedule, description: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="time"
          className="rounded-lg bg-slate-700 px-2 py-1 text-sm"
          value={schedule.startTime}
          onChange={(e) => onUpdate({ ...schedule, startTime: e.target.value })}
        />
        <input
          type="time"
          className="rounded-lg bg-slate-700 px-2 py-1 text-sm"
          value={schedule.endTime}
          onChange={(e) => onUpdate({ ...schedule, endTime: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          className="rounded-lg bg-slate-700 px-2 py-1 text-sm"
          value={schedule.tagId}
          onChange={(e) => onUpdate({ ...schedule, tagId: e.target.value })}
        >
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg bg-slate-700 px-2 py-1 text-sm"
          value={schedule.repeat}
          onChange={(e) => onUpdate({ ...schedule, repeat: e.target.value as Repeat })}
        >
          <option value="none">繰り返しなし</option>
          <option value="daily">毎日</option>
          <option value="weekly">毎週</option>
          <option value="monthly">毎月</option>
        </select>
      </div>
    </div>
  );
}

function buildMonthGrid(date: Date): string[] {
  const y = date.getFullYear();
  const m = date.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);

  const startOffset = first.getDay();
  const totalDays = last.getDate();
  const cells: string[] = [];

  for (let i = 0; i < startOffset; i++) {
    cells.push(toISO(new Date(y, m, i - startOffset + 1)));
  }
  for (let day = 1; day <= totalDays; day++) {
    cells.push(toISO(new Date(y, m, day)));
  }
  while (cells.length % 7 !== 0) {
    cells.push(toISO(new Date(y, m, totalDays + (cells.length % 7))));
  }
  return cells;
}

function TagDonutChart({ tags, total }: { tags: Array<Tag & { count: number }>; total: number }) {
  const size = 68;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const visibleTags = tags.filter((item) => item.count > 0);

  return (
    <div className="flex w-full items-center gap-3">
      <div className="flex items-center gap-2">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#334155" strokeWidth={stroke} />
          {total > 0 &&
            visibleTags.map((item) => {
              const segment = (item.count / total) * circumference;
              const dashArray = `${segment} ${circumference - segment}`;
              const segmentOffset = offset;
              offset += segment;
              return (
                <circle
                  key={item.id}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={stroke}
                  strokeDasharray={dashArray}
                  strokeDashoffset={-segmentOffset}
                  strokeLinecap="butt"
                />
              );
            })}
        </svg>
        <div className="text-[10px] leading-tight text-slate-300">
          <p className="font-semibold text-slate-100">タグ比率</p>
          <p>{total}件</p>
        </div>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-200">
        {(total === 0 ? tags : visibleTags).map((item) => {
          const ratio = total > 0 ? Math.round((item.count / total) * 100) : 0;
          return (
            <div key={item.id} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate">{item.name}</span>
              <span className="text-slate-400">{ratio}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default App;
