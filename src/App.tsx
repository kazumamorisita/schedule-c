import { ChangeEvent, CSSProperties, useEffect, useMemo, useRef, useState } from "react";

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
  reminderMinutes: number;
  location: string;
  url: string;
};

type LegacyEvent = {
  id?: string;
  title?: string;
  description?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  category?: string;
  allDay?: boolean;
  recurrence?: {
    pattern?: string;
    endDate?: string;
  };
};

type LegacyBackup = {
  version?: string;
  exportDate?: string;
  events?: LegacyEvent[];
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
    repeat: "weekly",
    reminderMinutes: 0,
    location: "",
    url: ""
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

function isISODate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toTagId(category: string): string {
  const mapped: Record<string, string> = {
    work: "work",
    personal: "private",
    private: "private",
    health: "health",
    study: "study",
    social: "social",
    other: "other"
  };
  const raw = (category || "other").toLowerCase();
  if (mapped[raw]) return mapped[raw];
  return raw.replace(/[^a-z0-9_-]/g, "-") || "other";
}

function toTagLabel(category: string): string {
  const mapped: Record<string, string> = {
    work: "仕事",
    personal: "プライベート",
    private: "プライベート",
    health: "健康",
    study: "勉強",
    social: "交流",
    other: "その他"
  };
  const raw = (category || "other").toLowerCase();
  return mapped[raw] ?? category;
}

function toTagColor(tagId: string): string {
  const palette: Record<string, string> = {
    work: "#38bdf8",
    private: "#f472b6",
    health: "#4ade80",
    study: "#f59e0b",
    social: "#a78bfa",
    other: "#94a3b8"
  };
  return palette[tagId] ?? "#94a3b8";
}

function toRepeat(pattern?: string): Repeat {
  const normalized = (pattern || "").toLowerCase();
  if (normalized === "daily") return "daily";
  if (normalized === "weekly") return "weekly";
  if (normalized === "monthly") return "monthly";
  return "none";
}

// 日本の祝日を計算して ISO 文字列のSetで返す
function getJapaneseHolidays(year: number): Set<string> {
  const h: string[] = [];
  const fmt = (y: number, m: number, d: number) =>
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // 第n月曜日を返す
  const nthMonday = (y: number, month: number, n: number): number => {
    const d = new Date(y, month - 1, 1);
    const first = d.getDay();
    const offset = first <= 1 ? 1 - first : 8 - first;
    return 1 + offset + (n - 1) * 7;
  };

  // 春分・秋分の日（簡易計算）
  const shunbun = (y: number) => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  const shubun  = (y: number) => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

  h.push(fmt(year, 1, 1));                            // 元日
  h.push(fmt(year, 1, nthMonday(year, 1, 2)));        // 成人の日
  h.push(fmt(year, 2, 11));                           // 建国記念の日
  h.push(fmt(year, 2, 23));                           // 天皇誕生日
  h.push(fmt(year, 3, shunbun(year)));                // 春分の日
  h.push(fmt(year, 4, 29));                           // 昭和の日
  h.push(fmt(year, 5, 3));                            // 憲法記念日
  h.push(fmt(year, 5, 4));                            // みどりの日
  h.push(fmt(year, 5, 5));                            // こどもの日
  h.push(fmt(year, 7, nthMonday(year, 7, 3)));        // 海の日
  h.push(fmt(year, 8, 11));                           // 山の日
  h.push(fmt(year, 9, nthMonday(year, 9, 3)));        // 敬老の日
  h.push(fmt(year, 9, shubun(year)));                 // 秋分の日
  h.push(fmt(year, 10, nthMonday(year, 10, 2)));      // スポーツの日
  h.push(fmt(year, 11, 3));                           // 文化の日
  h.push(fmt(year, 11, 23));                          // 勤労感謝の日

  // 振替休日（祝日が日曜→翌月曜）
  const set = new Set(h);
  for (const iso of [...h]) {
    const d = parseISO(iso);
    if (d.getDay() === 0) set.add(addDays(iso, 1));
  }
  return set;
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
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const dragStartY = useRef<number | null>(null);
  const dragStartedInScrollable = useRef(false);
  const sheetListRef = useRef<HTMLDivElement | null>(null);
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
    return s.title.toLowerCase().includes(normalizedSearch) || s.description.toLowerCase().includes(normalizedSearch) || (s.location ?? "").toLowerCase().includes(normalizedSearch);
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

  const timelineDates = useMemo(
    () => (viewMode === "week" ? getWeekDates(selectedDate) : [selectedDate]),
    [viewMode, selectedDate]
  );

  const timelineExpanded = useMemo(() => {
    if (viewMode === "month") return [];
    const from = timelineDates[0];
    const to = timelineDates[timelineDates.length - 1];
    return expandSchedules(baseSchedules, from, to);
  }, [baseSchedules, viewMode, timelineDates]);

  const timelineByDate = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    const filtered = timelineExpanded
      .filter((s) => activeTags.includes(s.tagId))
      .filter((s) => {
        if (!normalizedSearch) return true;
        return s.title.toLowerCase().includes(normalizedSearch) || s.description.toLowerCase().includes(normalizedSearch) || (s.location ?? "").toLowerCase().includes(normalizedSearch);
      });
    for (const s of filtered) {
      map[s.date].push(s);
    }
    return map;
  }, [timelineExpanded, activeTags, normalizedSearch]);

  const dayItems = viewMode !== "month" ? (timelineByDate[selectedDate] ?? []) : (byDate[selectedDate] ?? []);
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

  // 通知スケジューリング
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const ids: ReturnType<typeof setTimeout>[] = [];
    const now = new Date();
    const horizon = addDays(toISO(now), 7);
    const upcoming = expandSchedules(baseSchedules, toISO(now), horizon).filter(
      (s) => s.reminderMinutes > 0
    );

    for (const s of upcoming) {
      const [h, m] = s.startTime.split(":").map(Number);
      const schedDate = parseISO(s.date);
      schedDate.setHours(h, m, 0, 0);
      const notifyAt = new Date(schedDate.getTime() - s.reminderMinutes * 60000);
      const delay = notifyAt.getTime() - now.getTime();
      if (delay > 0) {
        const tag = tags.find((t) => t.id === s.tagId);
        ids.push(
          setTimeout(async () => {
            const parts = [`${s.startTime} 開始（${s.reminderMinutes}分前）`];
            if (tag) parts.push(`[${tag.name}]`);
            if (s.location) parts.push(`📍 ${s.location}`);
            const body = parts.join("  ");
            const opts: NotificationOptions = {
              body,
              icon: "/schedule-c/icon.svg",
              badge: "/schedule-c/icon.svg",
              tag: s.id,
            };
            try {
              const reg = await navigator.serviceWorker?.ready;
              reg?.showNotification(s.title, opts);
            } catch {
              new Notification(s.title, opts);
            }
          }, delay)
        );
      }
    }

    return () => ids.forEach(clearTimeout);
  }, [baseSchedules, tags]);

  const dates = buildMonthGrid(currentMonth);
  const holidays = useMemo(() => {
    const y = currentMonth.getFullYear();
    const set = new Set([...getJapaneseHolidays(y), ...getJapaneseHolidays(y + 1)]);
    return set;
  }, [currentMonth]);
  const currentMonthLabel = `${currentMonth.getFullYear()}年 ${currentMonth.getMonth() + 1}月`;
  const displayLabel =
    viewMode === "week"
      ? (() => {
          const wd = parseISO(getWeekDates(selectedDate)[0]);
          return `${wd.getFullYear()}年 ${wd.getMonth() + 1}月${wd.getDate()}日の週`;
        })()
      : viewMode === "day"
        ? (() => {
            const dd = parseISO(selectedDate);
            return `${dd.getFullYear()}年 ${dd.getMonth() + 1}月${dd.getDate()}日`;
          })()
        : currentMonthLabel;
  const setViewModeAndSync = (mode: "month" | "week" | "day") => {
    if (mode === "month") {
      const d = parseISO(selectedDate);
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    setViewMode(mode);
  };
  const collapsedSheetY = typeof window !== "undefined" ? Math.max(360, window.innerHeight - 80) : 420;

  const onPointerDown = (y: number) => {
    dragStartY.current = y;
  };

  const canDragSheet = (diff: number) => {
    if (!dragStartedInScrollable.current) return true;
    const list = sheetListRef.current;
    if (!list) return true;

    if (diff > 0) {
      return list.scrollTop <= 0;
    }

    if (diff < 0) {
      return !sheetOpen;
    }

    return true;
  };

  const onPointerMove = (y: number) => {
    if (dragStartY.current === null) return;
    const diff = y - dragStartY.current;
    if (!canDragSheet(diff)) return;
    if (diff > 0) setSheetOffset(Math.min(collapsedSheetY, diff));
    if (diff < 0) setSheetOffset(Math.max(-10, diff));
  };

  const onPointerUp = () => {
    if (sheetOpen) {
      setSheetOpen(sheetOffset <= 80);
    } else {
      setSheetOpen(sheetOffset < -80);
    }
    setSheetOffset(0);
    dragStartY.current = null;
    dragStartedInScrollable.current = false;
  };

  const shouldBlockSheetDrag = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("input, textarea, select, button[data-no-sheet-drag='true']"));
  };

  const beginSheetDrag = (y: number, target: EventTarget | null) => {
    if (shouldBlockSheetDrag(target)) return false;
    dragStartedInScrollable.current = Boolean(target instanceof HTMLElement && target.closest("[data-sheet-scroll='true']"));
    onPointerDown(y);
    return true;
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
      repeat: "none",
      reminderMinutes: 0,
      location: "",
      url: ""
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
        const parsed = JSON.parse(String(fr.result));

        if (Array.isArray(parsed)) {
          persist(parsed as Schedule[]);
          return;
        }

        const legacy = parsed as LegacyBackup;
        if (legacy && Array.isArray(legacy.events)) {
          const nextTags = [...tags];
          const tagIdSet = new Set(nextTags.map((t) => t.id));

          const converted: Schedule[] = legacy.events
            .filter((item) => isISODate(item.date))
            .map((item) => {
              const category = item.category || "other";
              const tagId = toTagId(category);
              if (!tagIdSet.has(tagId)) {
                nextTags.push({
                  id: tagId,
                  name: toTagLabel(category),
                  color: toTagColor(tagId)
                });
                tagIdSet.add(tagId);
              }

              return {
                id: item.id || crypto.randomUUID(),
                title: item.title || "無題の予定",
                description: item.description || "",
                date: item.date!,
                startTime: item.startTime || "09:00",
                endTime: item.endTime || "10:00",
                tagId,
                repeat: toRepeat(item.recurrence?.pattern),
                reminderMinutes: 0,
                location: "",
                url: ""
              };
            });

          persistTags(nextTags);
          persist(converted);
          return;
        }

        alert("未対応のJSON形式です。バックアップ形式を確認してください。");
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
    <main className="app-shell-enter mx-auto flex min-h-screen max-w-6xl flex-col overflow-hidden p-2 text-slate-100 md:p-6">
      <section className="panel-fade-in flex flex-col h-[calc(100vh-120px)] overflow-hidden rounded-3xl border border-slate-700/50 bg-slate-900/75 p-3 pb-4 shadow-soft backdrop-blur md:h-auto md:overflow-visible md:pb-6 md:p-6">
        <div className="shrink-0">
        <header className="mb-4 space-y-2">
          <div className="min-w-0">
            <p className="title-glow mt-1 text-base font-semibold text-cyan-300 md:text-lg">{displayLabel}</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <button
                aria-label="前"
                className="interactive-lift grid h-9 w-9 place-items-center rounded-full bg-slate-700 text-lg"
                onClick={() => {
                  if (viewMode === "day") setSelectedDate(addDays(selectedDate, -1));
                  else if (viewMode === "week") setSelectedDate(addDays(selectedDate, -7));
                  else setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
                }}
              >
                ←
              </button>
              <button
                className="interactive-lift rounded-full bg-slate-700 px-3 py-1.5 text-xs font-semibold"
                onClick={() => {
                  setSelectedDate(isoToday);
                  setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                }}
              >
                今日
              </button>
              <button
                aria-label="次"
                className="interactive-lift grid h-9 w-9 place-items-center rounded-full bg-slate-700 text-lg"
                onClick={() => {
                  if (viewMode === "day") setSelectedDate(addDays(selectedDate, 1));
                  else if (viewMode === "week") setSelectedDate(addDays(selectedDate, 7));
                  else setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
                }}
              >
                →
              </button>
            </div>
            <div className="flex items-center justify-center gap-1">
              {(["month", "week", "day"] as const).map((mode) => (
                <button
                  key={mode}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    viewMode === mode ? "bg-cyan-500 text-slate-900" : "bg-slate-700/80 text-slate-300"
                  }`}
                  onClick={() => setViewModeAndSync(mode)}
                >
                  {mode === "month" ? "月" : mode === "week" ? "週" : "日"}
                </button>
              ))}
            </div>
            <div className="w-full">
              <div className="chart-pop w-full rounded-xl border border-slate-700 bg-slate-800/70 p-2">
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
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-base text-slate-100 outline-none transition focus:border-cyan-400 md:text-sm"
          />
        </div>

        <div className="tag-row-slide-in mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 pr-1 touch-pan-x">
          {tags.map((t) => (
            <button
              key={t.id}
              onClick={() =>
                setActiveTags((prev) => (prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]))
              }
              className={`chip-breathe shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${activeTags.includes(t.id) ? "opacity-100" : "opacity-35"}`}
              style={{ backgroundColor: t.color, color: "#0f172a" }}
            >
              {t.name}
            </button>
          ))}
          <button
            className="interactive-lift inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-500 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100"
            onClick={onExport}
            aria-label="JSONエクスポート"
            title="JSONエクスポート"
          >
            <span aria-hidden>⬇</span>
          </button>
          <button
            className="interactive-lift inline-flex shrink-0 items-center gap-1 rounded-xl border border-cyan-500/70 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200"
            onClick={() => fileRef.current?.click()}
            aria-label="JSONインポート"
            title="JSONインポート"
          >
            <span aria-hidden>⬆</span>
          </button>
          <button
            className="interactive-lift inline-flex shrink-0 items-center gap-1 rounded-xl border border-violet-500/70 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-200"
            onClick={() => setIsTagEditorOpen(true)}
            aria-label="タグ編集"
            title="タグ編集"
          >
            タグ
          </button>
          <input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={onImport} />
        </div>
        </div>

        {viewMode === "month" && (<>
        <div className="grid grid-cols-7 gap-2 text-center text-xs text-slate-300">
          {["日", "月", "火", "水", "木", "金", "土"].map((d, i) => (
            <div key={d} className={`py-1 font-semibold ${
              i === 0 ? "text-rose-400" : i === 6 ? "text-sky-400" : "text-slate-400"
            }`}>
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5 md:gap-2">
          {dates.map((iso, idx) => {
            const inMonth = iso.startsWith(`${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`);
            const daySchedules = byDate[iso] ?? [];
            const isToday = iso === isoToday;
            const dayTagIds = [...new Set(daySchedules.map((item) => item.tagId))];
            const dow = parseISO(iso).getDay();
            const isHoliday = holidays.has(iso);
            const isSunday = dow === 0;
            const isSaturday = dow === 6;
            const dateTextColor = isToday
              ? "text-amber-300"
              : isHoliday || isSunday
                ? "text-rose-400"
                : isSaturday
                  ? "text-sky-400"
                  : "";
            const cellBg = selectedDate === iso
              ? "border-cyan-400 bg-cyan-500/20"
              : isHoliday || isSunday
                ? "border-rose-900/50 bg-rose-950/30"
                : isSaturday
                  ? "border-sky-900/50 bg-sky-950/30"
                  : "border-slate-700 bg-slate-800/60";
            if (!inMonth) return <div key={iso} className="aspect-square" />;
            return (
              <button
                key={iso}
                onClick={() => {
                  setSelectedDate(iso);
                  setSheetOpen(true);
                }}
                className={`relative aspect-square min-h-0 rounded-2xl border p-1.5 text-left transition md:p-2 ${
                  cellBg
                } ${
                  isToday ? "ring-2 ring-amber-300/80 ring-offset-1 ring-offset-slate-900" : ""
                } calendar-cell-enter interactive-lift`}
                style={{ animationDelay: `${(idx % 14) * 18}ms` }}
              >
                <div className={`text-xs font-semibold md:text-sm ${dateTextColor}`}>
                  <span>{Number(iso.slice(-2))}</span>
                  {isToday && <span className="block text-[9px] leading-tight md:text-[10px]">今日</span>}
                  {isHoliday && !isToday && <span className="block text-[8px] leading-tight opacity-80">祝</span>}
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
        </>)}

        {viewMode !== "month" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:h-[500px] md:flex-none">
            <TimelineView
              dates={timelineDates}
              schedulesByDate={timelineByDate}
              tags={tags}
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setSheetOpen(true);
              }}
              onSelectSchedule={(s) => {
                setSelectedDate(s.date);
                setSheetOpen(true);
              }}
            />
          </div>
        )}

      </section>

      {isTagEditorOpen && (
        <section
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm modal-backdrop-enter"
          onClick={() => setIsTagEditorOpen(false)}
        >
          <div
            className="modal-card-enter w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-soft"
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
                    className="rounded-md bg-slate-700 px-2 py-1.5 text-base"
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
        className={`sheet-fade-in fixed bottom-0 left-0 right-0 mx-auto w-full max-w-6xl rounded-t-3xl border border-slate-700 bg-slate-900/95 p-4 shadow-soft transition-transform duration-300 ${
          sheetOpen ? "translate-y-0" : "translate-y-[74%]"
        }`}
        style={{ transform: `translateY(${sheetOpen ? sheetOffset : collapsedSheetY + sheetOffset}px)` }}
        onPointerDown={(e) => {
          beginSheetDrag(e.clientY, e.target);
        }}
        onPointerMove={(e) => onPointerMove(e.clientY)}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={(e) => {
          beginSheetDrag(e.touches[0].clientY, e.target);
        }}
        onTouchMove={(e) => {
          if (dragStartY.current === null) return;
          onPointerMove(e.touches[0].clientY);
        }}
        onTouchEnd={onPointerUp}
        onTouchCancel={onPointerUp}
      >
        <div
          className="mb-3 touch-none select-none"
        >
          <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-slate-600" />
          <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{selectedDate} の予定</h2>
          <button data-no-sheet-drag="true" className="interactive-lift rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950" onClick={onCreateSchedule}>
            予定追加
          </button>
          </div>
          {"Notification" in window && Notification.permission === "denied" && (
            <p className="mt-2 rounded-lg bg-rose-900/50 px-3 py-1.5 text-xs text-rose-300">
              ⚠ 通知がブロックされています。ブラウザの設定から許可してください。
            </p>
          )}
          {"Notification" in window && Notification.permission === "default" && (
            <button
              data-no-sheet-drag="true"
              className="mt-2 w-full rounded-lg border border-violet-500/50 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-200"
              onClick={() => Notification.requestPermission()}
            >
              🔔 通知を有効にする
            </button>
          )}
        </div>
        <div ref={sheetListRef} data-sheet-scroll="true" className="max-h-[48vh] space-y-2 overflow-y-auto overscroll-contain touch-pan-y pr-1">
          {dayItems.map((item, idx) => (
            <article key={item.id} className="schedule-card-enter rounded-2xl border border-slate-700 bg-slate-800 p-3" style={{ animationDelay: `${idx * 45}ms` }}>
              <ScheduleCard
                schedule={item}
                tags={tags}
                onUpdate={(next) => {
                  if (next.reminderMinutes > 0 && "Notification" in window && Notification.permission === "default") {
                    Notification.requestPermission();
                  }
                  persist(baseSchedules.map((s) => (s.id === item.id.split("_")[0] ? { ...next, id: s.id } : s)));
                }}
                onDelete={() => persist(baseSchedules.filter((s) => s.id !== item.id.split("_")[0]))}
              />
            </article>
          ))}
          {dayItems.length === 0 && <p className="text-sm text-slate-400">予定はありません。</p>}
        </div>
        <FreeSlotsPanel schedules={dayItems} />
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
        className="w-full rounded-lg bg-slate-700 px-2 py-1 text-base"
        value={schedule.title}
        onChange={(e) => onUpdate({ ...schedule, title: e.target.value })}
      />
      <textarea
        className="w-full rounded-lg bg-slate-700 px-2 py-1 text-base"
        rows={2}
        value={schedule.description}
        onChange={(e) => onUpdate({ ...schedule, description: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="time"
          className="rounded-lg bg-slate-700 px-2 py-1 text-base"
          value={schedule.startTime}
          onChange={(e) => onUpdate({ ...schedule, startTime: e.target.value })}
        />
        <input
          type="time"
          className="rounded-lg bg-slate-700 px-2 py-1 text-base"
          value={schedule.endTime}
          onChange={(e) => onUpdate({ ...schedule, endTime: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          className="rounded-lg bg-slate-700 px-2 py-1 text-base"
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
          className="rounded-lg bg-slate-700 px-2 py-1 text-base"
          value={schedule.repeat}
          onChange={(e) => onUpdate({ ...schedule, repeat: e.target.value as Repeat })}
        >
          <option value="none">繰り返しなし</option>
          <option value="daily">毎日</option>
          <option value="weekly">毎週</option>
          <option value="monthly">毎月</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 text-xs text-slate-400">リマインダー</label>
        <select
          className="col-span-2 rounded-lg bg-slate-700 px-2 py-1 text-base"
          value={schedule.reminderMinutes ?? 0}
          onChange={(e) => onUpdate({ ...schedule, reminderMinutes: Number(e.target.value) })}
        >
          <option value={0}>なし</option>
          <option value={5}>5分前</option>
          <option value={10}>10分前</option>
          <option value={15}>15分前</option>
          <option value={30}>30分前</option>
          <option value={60}>1時間前</option>
          <option value={120}>2時間前</option>
          <option value={1440}>1日前</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-slate-400">📍 場所</label>
        <input
          className="w-full rounded-lg bg-slate-700 px-2 py-1 text-base"
          placeholder="場所を入力"
          value={schedule.location ?? ""}
          onChange={(e) => onUpdate({ ...schedule, location: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-slate-400">🔗 URL</label>
        <input
          type="url"
          className="w-full rounded-lg bg-slate-700 px-2 py-1 text-base"
          placeholder="https://..."
          value={schedule.url ?? ""}
          onChange={(e) => onUpdate({ ...schedule, url: e.target.value })}
        />
        {schedule.url && (
          <a
            href={schedule.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-xs text-cyan-400 underline"
          >
            {schedule.url}
          </a>
        )}
      </div>
    </div>
  );
}

type FreeSlot = { start: string; end: string; minutes: number };

function FreeSlotsPanel({ schedules }: { schedules: Schedule[] }) {
  const [open, setOpen] = useState(false);
  const slots = calcFreeSlots(schedules);
  const totalFree = slots.reduce((s, sl) => s + sl.minutes, 0);

  return (
    <div className="mt-3 shrink-0">
      <button
        data-no-sheet-drag="true"
        className="flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs font-semibold text-slate-300"
        onClick={() => setOpen((v) => !v)}
      >
        <span>⏱ 空き時間を確認</span>
        <span className="flex items-center gap-2">
          <span className="text-emerald-400">{formatDuration(totalFree)} 空き</span>
          <span className="text-slate-500">{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-1 rounded-xl border border-slate-700 bg-slate-800/40 p-2">
          {slots.length === 0 ? (
            <p className="py-1 text-center text-xs text-slate-500">空き時間がありません（08:00〜22:00）</p>
          ) : (
            slots.map((slot) => (
              <div
                key={slot.start}
                className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-1.5"
              >
                <span className="text-xs font-semibold text-emerald-300">
                  {slot.start} 〜 {slot.end}
                </span>
                <span className="text-xs text-slate-400">{formatDuration(slot.minutes)}</span>
              </div>
            ))
          )}
          <p className="pt-0.5 text-center text-[10px] text-slate-600">08:00〜22:00 を対象に計算</p>
        </div>
      )}
    </div>
  );
}

function calcFreeSlots(
  schedules: Schedule[],
  dayStart = "08:00",
  dayEnd = "22:00"
): FreeSlot[] {
  const startMin = timeToMinutes(dayStart);
  const endMin = timeToMinutes(dayEnd);

  // 各予定の時間帯を分単位に変換してソート
  const busy = schedules
    .map((s) => ({ s: timeToMinutes(s.startTime), e: timeToMinutes(s.endTime) }))
    .filter((b) => b.e > b.s)
    .sort((a, b) => a.s - b.s);

  // ブロックをマージ
  const merged: { s: number; e: number }[] = [];
  for (const b of busy) {
    if (merged.length === 0 || b.s > merged[merged.length - 1].e) {
      merged.push({ ...b });
    } else {
      merged[merged.length - 1].e = Math.max(merged[merged.length - 1].e, b.e);
    }
  }

  // 空き時間を計算
  const slots: FreeSlot[] = [];
  let cursor = startMin;
  for (const b of merged) {
    const slotEnd = Math.min(b.s, endMin);
    if (slotEnd - cursor >= 15) {
      slots.push({ start: minutesToTime(cursor), end: minutesToTime(slotEnd), minutes: slotEnd - cursor });
    }
    cursor = Math.max(cursor, b.e);
    if (cursor >= endMin) break;
  }
  if (endMin - cursor >= 15) {
    slots.push({ start: minutesToTime(cursor), end: minutesToTime(endMin), minutes: endMin - cursor });
  }
  return slots;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
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

const HOUR_HEIGHT = 52;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getWeekDates(isoDate: string): string[] {
  const d = parseISO(isoDate);
  const day = d.getDay();
  return Array.from({ length: 7 }, (_, i) => addDays(isoDate, i - day));
}

function TimelineView({
  dates,
  schedulesByDate,
  tags,
  selectedDate,
  onSelectDate,
  onSelectSchedule,
}: {
  dates: string[];
  schedulesByDate: Record<string, Schedule[]>;
  tags: Tag[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onSelectSchedule: (s: Schedule) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  useEffect(() => {
    if (scrollRef.current) {
      const scrollTo = Math.max(0, (now.getHours() - 1) * HOUR_HEIGHT);
      scrollRef.current.scrollTop = scrollTo;
    }
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Day headers */}
      <div className="flex shrink-0 border-b border-slate-700/70 bg-slate-900/80">
        <div className="w-10 shrink-0" />
        {dates.map((iso) => {
          const d = parseISO(iso);
          const isToday = iso === isoToday;
          const isSel = iso === selectedDate;
          return (
            <button
              key={iso}
              className={`flex-1 py-1.5 text-center transition ${isSel && !isToday ? "bg-cyan-500/10" : ""}`}
              onClick={() => onSelectDate(iso)}
            >
              <div className={`text-[10px] ${isToday ? "text-amber-300" : "text-slate-400"}`}>
                {DAY_LABELS[d.getDay()]}
              </div>
              <div
                className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  isToday
                    ? "bg-amber-400 text-slate-900"
                    : isSel
                      ? "bg-cyan-500/40 text-cyan-200"
                      : "text-slate-200"
                }`}
              >
                {d.getDate()}
              </div>
            </button>
          );
        })}
      </div>
      {/* Timeline body */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* Time labels */}
        <div className="w-10 shrink-0 select-none">
          {HOURS.map((h) => (
            <div
              key={h}
              className="flex items-start justify-end pr-1 text-[9px] text-slate-500"
              style={{ height: HOUR_HEIGHT }}
            >
              <span className="-mt-2">{h > 0 ? `${h}:00` : ""}</span>
            </div>
          ))}
        </div>
        {/* Day columns */}
        <div className="flex min-w-0 flex-1">
          {dates.map((iso) => {
            const daySchedules = schedulesByDate[iso] ?? [];
            const isToday = iso === isoToday;
            return (
              <div
                key={iso}
                className={`relative flex-1 border-l ${isToday ? "border-slate-600" : "border-slate-800"}`}
                style={{ minWidth: dates.length >= 5 ? 44 : undefined, height: HOUR_HEIGHT * 24 }}
              >
                {/* Hour gridlines */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className={`absolute left-0 right-0 border-t ${h % 6 === 0 ? "border-slate-700" : "border-slate-800/60"}`}
                    style={{ top: h * HOUR_HEIGHT }}
                  />
                ))}
                {/* Now line */}
                {isToday && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-rose-400"
                    style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                  >
                    <span className="absolute -left-0.5 -top-1.5 h-3 w-3 rounded-full bg-rose-400" />
                  </div>
                )}
                {/* Schedule blocks */}
                {daySchedules.map((s) => {
                  const startMin = timeToMinutes(s.startTime);
                  const endMin = timeToMinutes(s.endTime);
                  const duration = endMin > startMin ? endMin - startMin : 30;
                  const top = (startMin / 60) * HOUR_HEIGHT;
                  const height = Math.max((duration / 60) * HOUR_HEIGHT, 18);
                  const tag = tags.find((t) => t.id === s.tagId);
                  return (
                    <button
                      key={s.id}
                      data-no-sheet-drag="true"
                      className="absolute left-0.5 right-0.5 z-20 overflow-hidden rounded-md px-1 py-0.5 text-left text-[9px] font-semibold text-slate-900 shadow"
                      style={{ top, height, backgroundColor: tag?.color ?? "#94a3b8" }}
                      onClick={() => onSelectSchedule(s)}
                    >
                      <div className="truncate leading-tight">{s.title}</div>
                      {height >= 30 && (
                        <div className="truncate leading-tight opacity-75">
                          {s.startTime}–{s.endTime}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
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
                  className="donut-segment"
                  style={
                    {
                      "--donut-from": `${circumference}`,
                      "--donut-to": `${-segmentOffset}`,
                      animationDelay: `${80 + visibleTags.findIndex((tag) => tag.id === item.id) * 120}ms`
                    } as CSSProperties
                  }
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
