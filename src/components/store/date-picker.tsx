"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { addDays, addMonths, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { localParts, periodErrorMessages, validatePeriod, zonedDateTime } from "@/lib/availability/engine";
import { cn } from "@/lib/cn";
import { useBooking, type Period } from "./booking-provider";

/** Calendar dates are handled as plain "YYYY-MM-DD" strings in the business time zone. */
function ymd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}
function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function timeSlots(open: string, close: string, step: number): string[] {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const out: string[] = [];
  for (let m = toMin(open); m <= toMin(close); m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

export function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function DatePicker() {
  const { pickerOpen } = useBooking();
  // The dialog reads the current time, so it only renders on the client once opened.
  return <AnimatePresence>{pickerOpen && <PickerDialog />}</AnimatePresence>;
}

function PickerDialog() {
  const { rules, period, setPeriod, closePicker } = useBooking();
  // Captured once when the dialog opens.
  const [openedAt] = useState(() => Date.now());
  const today = useMemo(() => localParts(new Date(openedAt), rules.timezone).date, [openedAt, rules.timezone]);
  const earliest = useMemo(
    () => localParts(new Date(openedAt + rules.minNoticeHours * 3600_000), rules.timezone).date,
    [openedAt, rules.minNoticeHours, rules.timezone],
  );
  const latest = useMemo(() => ymd(addDays(parseYmd(today), rules.maxAdvanceDays)), [today, rules.maxAdvanceDays]);
  const blackout = useMemo(() => new Set(rules.blackoutDates), [rules.blackoutDates]);
  const slots = useMemo(() => timeSlots(rules.openTime, rules.closeTime, rules.slotMinutes), [rules]);

  const [draft, setDraft] = useState<Period | null>(period);
  const [picking, setPicking] = useState<"start" | "end">("start");
  const [month, setMonth] = useState(() => startOfMonth(parseYmd(period?.startDate ?? earliest)));
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closePicker();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [closePicker]);

  const disabled = (d: string) => d < earliest || d > latest || blackout.has(d);

  function pick(d: string) {
    if (disabled(d)) return;
    if (picking === "start" || !draft || d < draft.startDate) {
      setDraft({
        startDate: d,
        startTime: draft?.startTime ?? rules.defaultPickupTime,
        endDate: d,
        endTime: draft?.endTime ?? rules.defaultReturnTime,
      });
      setPicking("end");
    } else {
      setDraft({ ...draft, endDate: d });
      setPicking("start");
    }
  }

  const errors = useMemo(() => {
    if (!draft || picking === "end") return [];
    return validatePeriod(
      zonedDateTime(draft.startDate, draft.startTime, rules.timezone),
      zonedDateTime(draft.endDate, draft.endTime, rules.timezone),
      new Date(openedAt),
      rules,
    );
  }, [draft, picking, rules, openedAt]);

  const days = draft
    ? Math.max(
        1,
        Math.ceil(
          (zonedDateTime(draft.endDate, draft.endTime, rules.timezone).getTime() -
            zonedDateTime(draft.startDate, draft.startTime, rules.timezone).getTime()) /
            86_400_000,
        ),
      )
    : 0;

  const months = [month, addMonths(month, 1)];
  const rangeEnd = picking === "end" && hover && draft && hover >= draft.startDate ? hover : draft?.endDate;

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/35 backdrop-blur-sm md:items-center md:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={closePicker}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="date-picker-title"
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-lift md:rounded-3xl"
        initial={{ y: 40, opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4 md:px-7">
          <div>
            <h2 id="date-picker-title" className="font-display text-2xl">
              Choose your rental period
            </h2>
            <p className="text-sm text-ink-muted">
              {picking === "start" ? "Tap your pickup (or delivery) date" : "Now tap your return date"}
            </p>
          </div>
          <button type="button" onClick={closePicker} className="rounded-full p-2 hover:bg-sand-50" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 md:px-7">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              className="rounded-full p-2 hover:bg-sand-50 disabled:opacity-30"
              onClick={() => setMonth((m) => addMonths(m, -1))}
              disabled={ymd(month) <= today.slice(0, 8) + "01"}
              aria-label="Previous month"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              className="rounded-full p-2 hover:bg-sand-50"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
          <div className="grid gap-8 md:grid-cols-2">
            {months.map((m, idx) => (
              <MonthGrid
                key={ymd(m)}
                month={m}
                className={idx === 1 ? "hidden md:block" : undefined}
                today={today}
                disabled={disabled}
                start={draft?.startDate}
                end={rangeEnd}
                onPick={pick}
                onHover={setHover}
              />
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <TimeSelect
              label="Pickup time"
              value={draft?.startTime ?? rules.defaultPickupTime}
              slots={slots}
              disabled={!draft}
              onChange={(t) => draft && setDraft({ ...draft, startTime: t })}
            />
            <TimeSelect
              label="Return time"
              value={draft?.endTime ?? rules.defaultReturnTime}
              slots={slots}
              disabled={!draft}
              onChange={(t) => draft && setDraft({ ...draft, endTime: t })}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            Most items are priced for up to 3 days at a single rate. Our hours are flexible — if you need a different
            time, add a note at checkout or call us.
          </p>
          {errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-danger" role="alert">
              {errors.map((e) => (
                <li key={e}>{periodErrorMessages[e]}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-sand-50/60 px-5 py-4 md:px-7">
          <div className="mr-auto flex items-center gap-2 text-sm">
            <CalendarDays className="size-4 text-gold-700" />
            {draft ? (
              <span>
                <strong className="font-semibold">{format(parseYmd(draft.startDate), "EEE, MMM d")}</strong>
                {" → "}
                <strong className="font-semibold">{format(parseYmd(draft.endDate), "EEE, MMM d")}</strong>
                {picking === "start" && (
                  <span className="text-ink-muted">
                    {" "}
                    · {days} {days === 1 ? "day" : "days"}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-ink-muted">No dates selected</span>
            )}
          </div>
          {period && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setPeriod(null);
                closePicker();
              }}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!draft || picking === "end" || errors.length > 0}
            onClick={() => {
              setPeriod(draft);
              closePicker();
            }}
          >
            Show availability
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function MonthGrid({
  month,
  today,
  disabled,
  start,
  end,
  onPick,
  onHover,
  className,
}: {
  month: Date;
  today: string;
  disabled: (d: string) => boolean;
  start?: string;
  end?: string;
  onPick: (d: string) => void;
  onHover: (d: string | null) => void;
  className?: string;
}) {
  const first = startOfWeek(startOfMonth(month));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  return (
    <div className={className}>
      <p className="mb-2 text-center font-medium">{format(month, "MMMM yyyy")}</p>
      <div className="grid grid-cols-7 text-center text-xs text-ink-muted">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7" onMouseLeave={() => onHover(null)}>
        {cells.map((c) => {
          const d = ymd(c);
          const inMonth = isSameMonth(c, month);
          if (!inMonth) return <span key={d} aria-hidden="true" />;
          const isStart = d === start;
          const isEnd = d === end;
          const inRange = start && end && d > start && d < end;
          const off = disabled(d);
          return (
            <button
              key={d}
              type="button"
              disabled={off}
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover(d)}
              aria-pressed={isStart || isEnd}
              aria-label={format(c, "EEEE, MMMM d, yyyy")}
              className={cn(
                "relative my-0.5 flex h-11 items-center justify-center text-sm transition-colors",
                inRange && "bg-sand-100",
                isStart && end && end !== start && "rounded-l-full bg-sand-100",
                isEnd && start !== end && "rounded-r-full bg-sand-100",
                off ? "cursor-not-allowed text-ink/25 line-through decoration-ink/20" : "hover:font-semibold",
              )}
            >
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-full transition-[background-color,transform] duration-200",
                  (isStart || isEnd) && "scale-100 bg-ink font-semibold text-cream",
                  !isStart && !isEnd && !off && "hover:bg-sand-50",
                  d === today && !isStart && !isEnd && "ring-1 ring-gold-300",
                )}
              >
                {c.getDate()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimeSelect({
  label,
  value,
  slots,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  slots: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-2xl border border-line bg-white px-4 text-[0.95rem] outline-none transition-colors focus:border-gold-500 disabled:opacity-50"
      >
        {slots.map((s) => (
          <option key={s} value={s}>
            {timeLabel(s)}
          </option>
        ))}
      </select>
    </label>
  );
}
