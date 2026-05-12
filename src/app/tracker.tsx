"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type CSSProperties,
} from "react";

// ─── Constants ───────────────────────────────────────────────────────────────

const START_DATE = new Date(2026, 4, 12); // May 12, 2026
const TOTAL_DAYS = 71;
const START_WEIGHT = 102;
const TARGET_WEIGHT = 90;
const HEIGHT = 180;
const AGE = 37;
const PROTEIN_G = 150;
const FAT_G = 55;
const PROTEIN_KCAL = PROTEIN_G * 4; // 600
const FAT_KCAL = FAT_G * 9; // 495
const SUGAR_MAX_G = 25;
const SUGAR_KCAL = SUGAR_MAX_G * 4; // 100
const ACTIVITY_MULTIPLIER = 1.4;
const SPORT_BONUS = 400;
const STORAGE_KEY = "fitnesstracker-data-v2";

// ─── Theme ───────────────────────────────────────────────────────────────────

interface Theme {
  bg: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
  textDim: string;
  inputBg: string;
  inputBorder: string;
  macroBoxBg: string;
  progressBarBg: string;
  checkBg: string;
}

const darkTheme: Theme = {
  bg: "#0f172a",
  card: "#1e293b",
  border: "#334155",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  inputBg: "#0f172a",
  inputBorder: "#475569",
  macroBoxBg: "#0f172a",
  progressBarBg: "#0f172a",
  checkBg: "#0f172a",
};

const lightTheme: Theme = {
  bg: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  textMuted: "#64748b",
  textDim: "#94a3b8",
  inputBg: "#f1f5f9",
  inputBorder: "#cbd5e1",
  macroBoxBg: "#f1f5f9",
  progressBarBg: "#e2e8f0",
  checkBg: "#ffffff",
};

interface DayData {
  done: boolean;
  isSportDay: boolean;
  actualCalories: number | null;
  weighIn: number | null;
  actualSugar: number | null;
}

interface StoreData {
  days: Record<number, DayData>;
  darkMode: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDefaultDay(): DayData {
  return { done: false, isSportDay: false, actualCalories: null, weighIn: null, actualSugar: null };
}

function getDefaultStore(): StoreData {
  return { days: {}, darkMode: true };
}

function getDayData(store: StoreData, dayNum: number): DayData {
  return { ...getDefaultDay(), ...store.days[dayNum] };
}

function dateForDay(dayNum: number): Date {
  const d = new Date(START_DATE);
  d.setDate(d.getDate() + dayNum - 1);
  return d;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getPhase(dayNum: number): { name: string; deficit: number; color: string } {
  if (dayNum <= 14) return { name: "Kickstart", deficit: 1200, color: "#3b82f6" };
  if (dayNum <= 45) return { name: "Steady Cut", deficit: 1150, color: "#f59e0b" };
  return { name: "Final Push", deficit: 1100, color: "#22c55e" };
}

function calcBMR(weight: number): number {
  return 10 * weight + 6.25 * HEIGHT - 5 * AGE - 5;
}

function getCurrentDayNum(): number {
  const now = new Date();
  const start = new Date(START_DATE);
  const diff = Math.floor(
    (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(1, Math.min(TOTAL_DAYS, diff + 1));
}

// ─── Core Calculation Engine ─────────────────────────────────────────────────

interface ComputedDay {
  dayNum: number;
  date: Date;
  phase: { name: string; deficit: number; color: string };
  estimatedWeight: number;
  bmr: number;
  tdee: number;
  baseDeficit: number;
  adjustedDeficit: number;
  targetCalories: number;
  protein: number;
  fat: number;
  carbs: number;
  carbsKcal: number;
  sugarMax: number;
  sugarKcal: number;
  data: DayData;
  delta: number | null;
  cumulativeDelta: number;
  isToday: boolean;
}

function computeAllDays(store: StoreData): ComputedDay[] {
  const todayNum = getCurrentDayNum();
  const results: ComputedDay[] = [];
  let cumulativeDelta = 0;

  // Collect weigh-ins for interpolation
  const weighIns: { day: number; weight: number }[] = [
    { day: 0, weight: START_WEIGHT },
  ];
  for (let d = 1; d <= TOTAL_DAYS; d++) {
    const dd = getDayData(store, d);
    if (dd.weighIn !== null) {
      weighIns.push({ day: d, weight: dd.weighIn });
    }
  }
  weighIns.sort((a, b) => a.day - b.day);

  function estimateWeight(dayNum: number): number {
    // Find the last weigh-in at or before this day
    let lastWI = weighIns[0];
    for (const wi of weighIns) {
      if (wi.day <= dayNum) lastWI = wi;
      else break;
    }
    // Linear interpolation from lastWI to target
    const remainingDays = TOTAL_DAYS - lastWI.day;
    if (remainingDays <= 0) return TARGET_WEIGHT;
    const daysSinceLast = dayNum - lastWI.day;
    const progress = daysSinceLast / remainingDays;
    return lastWI.weight + (TARGET_WEIGHT - lastWI.weight) * progress;
  }

  for (let d = 1; d <= TOTAL_DAYS; d++) {
    const data = getDayData(store, d);
    const phase = getPhase(d);
    const estWeight = data.weighIn ?? estimateWeight(d);
    const bmr = calcBMR(estWeight);
    const tdee = bmr * ACTIVITY_MULTIPLIER + (data.isSportDay ? SPORT_BONUS : 0);

    // Auto-readjustment
    let deficitAdjust = 0;
    if (cumulativeDelta > 2000) {
      deficitAdjust = 150;
    } else if (cumulativeDelta < -3000) {
      deficitAdjust = -100;
    }
    const adjustedDeficit = Math.max(900, Math.min(1400, phase.deficit + deficitAdjust));

    const floor = data.isSportDay ? 1400 : 1200;
    const targetCalories = Math.max(floor, Math.round(tdee - adjustedDeficit));

    const carbsKcal = Math.max(0, targetCalories - PROTEIN_KCAL - FAT_KCAL);
    const carbs = Math.round(carbsKcal / 4);

    const delta =
      data.actualCalories !== null ? data.actualCalories - targetCalories : null;

    if (delta !== null) {
      cumulativeDelta += delta;
    }

    results.push({
      dayNum: d,
      date: dateForDay(d),
      phase,
      estimatedWeight: Math.round(estWeight * 10) / 10,
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      baseDeficit: phase.deficit,
      adjustedDeficit,
      targetCalories,
      protein: PROTEIN_G,
      fat: FAT_G,
      carbs,
      carbsKcal: Math.round(carbsKcal),
      sugarMax: SUGAR_MAX_G,
      sugarKcal: SUGAR_KCAL,
      data,
      delta,
      cumulativeDelta: Math.round(cumulativeDelta),
      isToday: d === todayNum,
    });
  }

  return results;
}

// ─── Confetti ────────────────────────────────────────────────────────────────

function Confetti({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  const pieces = useMemo(() => {
    const colors = ["#f59e0b", "#22c55e", "#3b82f6", "#ef4444", "#a855f7", "#ec4899"];
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      color: colors[i % colors.length],
      size: 6 + Math.random() * 8,
    }));
  }, []);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 9999 }}>
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: -20,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.size > 10 ? "50%" : "2px",
            animation: `confetti-fall ${2 + Math.random()}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Weight Chart ────────────────────────────────────────────────────────────

function WeightChart({ days, theme }: { days: ComputedDay[]; theme: Theme }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const dataPoints = useMemo(() => {
    const pts: { day: number; weight: number }[] = [{ day: 0, weight: START_WEIGHT }];
    for (const d of days) {
      if (d.data.weighIn !== null) {
        pts.push({ day: d.dayNum, weight: d.data.weighIn });
      }
    }
    return pts;
  }, [days]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    const pad = { top: 20, right: 15, bottom: 30, left: 40 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    const minW = TARGET_WEIGHT - 2;
    const maxW = START_WEIGHT + 1;

    function xPos(day: number) {
      return pad.left + (day / TOTAL_DAYS) * chartW;
    }
    function yPos(w: number) {
      return pad.top + ((maxW - w) / (maxW - minW)) * chartH;
    }

    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 0.5;
    for (let w = Math.ceil(minW); w <= maxW; w += 2) {
      ctx.beginPath();
      ctx.moveTo(pad.left, yPos(w));
      ctx.lineTo(W - pad.right, yPos(w));
      ctx.stroke();
      ctx.fillStyle = theme.textMuted;
      ctx.font = "11px JetBrains Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${w}`, pad.left - 5, yPos(w) + 4);
    }

    // X-axis labels
    ctx.fillStyle = theme.textMuted;
    ctx.textAlign = "center";
    for (let d = 0; d <= TOTAL_DAYS; d += 14) {
      ctx.fillText(`D${d}`, xPos(d), H - 8);
    }

    // Target line
    ctx.strokeStyle = "#22c55e44";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(pad.left, yPos(TARGET_WEIGHT));
    ctx.lineTo(W - pad.right, yPos(TARGET_WEIGHT));
    ctx.stroke();
    ctx.setLineDash([]);

    // Ideal line
    ctx.strokeStyle = theme.textDim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xPos(0), yPos(START_WEIGHT));
    ctx.lineTo(xPos(TOTAL_DAYS), yPos(TARGET_WEIGHT));
    ctx.stroke();

    // Actual data points
    if (dataPoints.length > 1) {
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xPos(dataPoints[0].day), yPos(dataPoints[0].weight));
      for (let i = 1; i < dataPoints.length; i++) {
        ctx.lineTo(xPos(dataPoints[i].day), yPos(dataPoints[i].weight));
      }
      ctx.stroke();

      for (const pt of dataPoints) {
        ctx.beginPath();
        ctx.arc(xPos(pt.day), yPos(pt.weight), 4, 0, Math.PI * 2);
        ctx.fillStyle = "#60a5fa";
        ctx.fill();
        ctx.strokeStyle = theme.card;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [dataPoints, theme]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: 200, display: "block", borderRadius: 8 }}
    />
  );
}

// ─── Day Row Component ───────────────────────────────────────────────────────

function DayRow({
  day,
  theme,
  onToggleDone,
  onToggleSport,
  onSetCalories,
  onSetWeighIn,
  onSetSugar,
}: {
  day: ComputedDay;
  theme: Theme;
  onToggleDone: () => void;
  onToggleSport: () => void;
  onSetCalories: (val: number | null) => void;
  onSetWeighIn: (val: number | null) => void;
  onSetSugar: (val: number | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const rowStyle: CSSProperties = {
    background: theme.card,
    border: `1px solid ${theme.border}`,
    borderRadius: 10,
    marginBottom: 8,
    opacity: day.data.done ? 0.5 : 1,
    transition: "opacity 0.3s ease, box-shadow 0.3s ease",
    overflow: "hidden",
    ...(day.isToday ? { boxShadow: "0 0 0 2px #60a5fa", borderColor: "#60a5fa" } : {}),
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    cursor: "pointer",
    userSelect: "none",
  };

  const mono: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

  return (
    <div style={rowStyle}>
      <div style={headerStyle} onClick={() => setExpanded(!expanded)}>
        {/* Checkbox */}
        <div
          onClick={(e) => { e.stopPropagation(); onToggleDone(); }}
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            border: `2px solid ${day.data.done ? "#22c55e" : theme.inputBorder}`,
            background: day.data.done ? "#22c55e" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {day.data.done && (
            <span style={{ color: theme.bg, fontSize: 14, fontWeight: 700 }}>&#10003;</span>
          )}
        </div>

        {/* Day number + date */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ ...mono, fontWeight: 600, fontSize: 14 }}>Day {day.dayNum}</span>
            <span style={{ fontSize: 12, color: theme.textMuted }}>{formatDate(day.date)}</span>
            {day.isToday && (
              <span
                style={{
                  background: "#60a5fa",
                  color: theme.bg,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 4,
                }}
              >
                TODAY
              </span>
            )}
            <span
              style={{
                background: day.phase.color + "22",
                color: day.phase.color,
                fontSize: 10,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              {day.phase.name}
            </span>
          </div>
        </div>

        {/* Target calories */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ ...mono, fontSize: 15, fontWeight: 600 }}>
            {day.targetCalories}
          </div>
          <div style={{ fontSize: 10, color: theme.textMuted }}>kcal</div>
        </div>

        {/* Expand arrow */}
        <span
          style={{
            fontSize: 12,
            color: theme.textDim,
            transition: "transform 0.2s",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            flexShrink: 0,
          }}
        >
          &#9660;
        </span>
      </div>

      {/* Expanded content */}
      <div
        style={{
          maxHeight: expanded ? 400 : 0,
          overflow: "hidden",
          transition: "max-height 0.3s ease",
        }}
      >
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Sport toggle */}
          <div
            onClick={onToggleSport}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 8,
              cursor: "pointer",
              background: day.data.isSportDay ? "#22c55e18" : "#ef444418",
              border: `1px solid ${day.data.isSportDay ? "#22c55e55" : "#ef444455"}`,
              color: day.data.isSportDay ? "#22c55e" : "#ef4444",
              fontWeight: 600,
              fontSize: 13,
              transition: "all 0.2s",
              userSelect: "none",
            }}
          >
            {day.data.isSportDay ? "\uD83C\uDFCB\uFE0F Sport Day (+400 kcal TDEE)" : "\uD83D\uDECB\uFE0F Rest Day"}
          </div>

          {/* Inputs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: theme.textMuted, display: "block", marginBottom: 4 }}>
                Calories eaten
              </label>
              <input
                type="number"
                placeholder="e.g. 1650"
                value={day.data.actualCalories ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onSetCalories(v === "" ? null : Number(v));
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: theme.textMuted, display: "block", marginBottom: 4 }}>
                Sugar eaten (g)
              </label>
              <input
                type="number"
                placeholder="e.g. 18"
                value={day.data.actualSugar ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onSetSugar(v === "" ? null : Number(v));
                }}
                onClick={(e) => e.stopPropagation()}
                style={day.data.actualSugar !== null && day.data.actualSugar > SUGAR_MAX_G ? { borderColor: "#ef4444" } : undefined}
              />
              {day.data.actualSugar !== null && (
                <div style={{
                  fontSize: 10,
                  marginTop: 3,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: day.data.actualSugar > SUGAR_MAX_G ? "#ef4444" : "#22c55e",
                  fontWeight: 600,
                }}>
                  {day.data.actualSugar > SUGAR_MAX_G
                    ? `+${day.data.actualSugar - SUGAR_MAX_G}g over limit`
                    : `${SUGAR_MAX_G - day.data.actualSugar}g under limit`}
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: 11, color: theme.textMuted, display: "block", marginBottom: 4 }}>
                Weight (kg)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 100.5"
                value={day.data.weighIn ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onSetWeighIn(v === "" ? null : Number(v));
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Macros */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: 8,
              textAlign: "center",
            }}
          >
            <MacroBox label="Protein" grams={day.protein} kcal={PROTEIN_KCAL} color="#60a5fa" theme={theme} />
            <MacroBox label="Fat" grams={day.fat} kcal={FAT_KCAL} color="#f59e0b" theme={theme} />
            <MacroBox label="Carbs" grams={day.carbs} kcal={day.carbsKcal} color="#22c55e" theme={theme} />
            <MacroBox label="Sugar max" grams={day.sugarMax} kcal={day.sugarKcal} color="#ef4444" theme={theme} />
          </div>

          {/* Stats row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: 6,
              fontSize: 11,
              color: theme.textMuted,
              ...mono,
            }}
          >
            <div>
              <div style={{ fontSize: 10 }}>Est. Weight</div>
              <div style={{ color: theme.text, fontWeight: 600 }}>{day.estimatedWeight} kg</div>
            </div>
            <div>
              <div style={{ fontSize: 10 }}>BMR</div>
              <div style={{ color: theme.text, fontWeight: 600 }}>{day.bmr}</div>
            </div>
            <div>
              <div style={{ fontSize: 10 }}>TDEE</div>
              <div style={{ color: theme.text, fontWeight: 600 }}>{day.tdee}</div>
            </div>
            <div>
              <div style={{ fontSize: 10 }}>Deficit</div>
              <div style={{ color: theme.text, fontWeight: 600 }}>{day.adjustedDeficit}</div>
            </div>
          </div>

          {/* Delta */}
          {day.delta !== null && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, ...mono }}>
              <span>
                Day delta:{" "}
                <span style={{ color: day.delta > 0 ? "#ef4444" : "#22c55e", fontWeight: 600 }}>
                  {day.delta > 0 ? "+" : ""}
                  {day.delta} kcal
                </span>
              </span>
              <span>
                Cumulative:{" "}
                <span
                  style={{
                    color: day.cumulativeDelta > 0 ? "#ef4444" : "#22c55e",
                    fontWeight: 600,
                  }}
                >
                  {day.cumulativeDelta > 0 ? "+" : ""}
                  {day.cumulativeDelta} kcal
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MacroBox({
  label,
  grams,
  kcal,
  color,
  theme,
}: {
  label: string;
  grams: number;
  kcal: number;
  color: string;
  theme: Theme;
}) {
  return (
    <div
      style={{
        background: theme.macroBoxBg,
        borderRadius: 6,
        padding: "6px 4px",
        borderTop: `3px solid ${color}`,
      }}
    >
      <div style={{ fontSize: 10, color: theme.textMuted }}>{label}</div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {grams}g
      </div>
      <div style={{ fontSize: 10, color: theme.textMuted }}>{kcal} kcal</div>
    </div>
  );
}

// ─── Weekly Summary ──────────────────────────────────────────────────────────

interface WeekStats {
  avgDeficit: number | null;
  avgWeight: number | null;
  totalCalsEaten: number;
  totalCalsTarget: number;
  weightStart: number | null;
  weightEnd: number | null;
  weightDelta: number | null;
  sportDays: number;
  restDays: number;
  sugarCompliant: number;
  sugarTracked: number;
  trackedDays: number;
  totalDays: number;
  dailyCals: { target: number; actual: number | null }[];
}

function calcWeekStats(days: ComputedDay[]): WeekStats {
  const daysWithCals = days.filter((d) => d.data.actualCalories !== null);
  const daysWithWeight = days.filter((d) => d.data.weighIn !== null);
  const daysWithSugar = days.filter((d) => d.data.actualSugar !== null);

  const avgDeficit =
    daysWithCals.length > 0
      ? Math.round(
          daysWithCals.reduce((s, d) => s + (d.targetCalories - (d.data.actualCalories ?? 0)), 0) /
            daysWithCals.length
        )
      : null;

  const avgWeight =
    daysWithWeight.length > 0
      ? Math.round(
          (daysWithWeight.reduce((s, d) => s + (d.data.weighIn ?? 0), 0) / daysWithWeight.length) * 10
        ) / 10
      : null;

  const weightStart = daysWithWeight.length > 0 ? daysWithWeight[0].data.weighIn : null;
  const weightEnd = daysWithWeight.length > 0 ? daysWithWeight[daysWithWeight.length - 1].data.weighIn : null;
  const weightDelta = weightStart !== null && weightEnd !== null && daysWithWeight.length > 1
    ? Math.round((weightEnd - weightStart) * 10) / 10
    : null;

  return {
    avgDeficit,
    avgWeight,
    totalCalsEaten: daysWithCals.reduce((s, d) => s + (d.data.actualCalories ?? 0), 0),
    totalCalsTarget: daysWithCals.reduce((s, d) => s + d.targetCalories, 0),
    weightStart,
    weightEnd,
    weightDelta,
    sportDays: days.filter((d) => d.data.isSportDay).length,
    restDays: days.filter((d) => !d.data.isSportDay).length,
    sugarCompliant: daysWithSugar.filter((d) => (d.data.actualSugar ?? 0) <= SUGAR_MAX_G).length,
    sugarTracked: daysWithSugar.length,
    trackedDays: daysWithCals.length,
    totalDays: days.length,
    dailyCals: days.map((d) => ({ target: d.targetCalories, actual: d.data.actualCalories })),
  };
}

function getWeekGrade(stats: WeekStats): { label: string; color: string; emoji: string } {
  if (stats.trackedDays === 0) return { label: "No data", color: "#64748b", emoji: "\u2014" };
  const calDiff = stats.totalCalsTarget - stats.totalCalsEaten;
  const compliance = stats.trackedDays / stats.totalDays;
  if (compliance >= 0.8 && calDiff >= 0 && (stats.weightDelta === null || stats.weightDelta <= 0)) {
    return { label: "On track", color: "#22c55e", emoji: "\uD83D\uDD25" };
  }
  if (compliance >= 0.5 && calDiff >= -500) {
    return { label: "Decent", color: "#f59e0b", emoji: "\uD83D\uDC4D" };
  }
  return { label: "Behind", color: "#ef4444", emoji: "\u26A0\uFE0F" };
}

function getWeekInsight(stats: WeekStats, prevStats: WeekStats | null): string {
  if (stats.trackedDays === 0) return "Start logging to see insights.";

  const parts: string[] = [];

  // Calorie insight
  const calDiff = stats.totalCalsEaten - stats.totalCalsTarget;
  if (calDiff > 500) {
    const perDay = Math.round(calDiff / 7);
    parts.push(`${Math.round(calDiff)} kcal over target this week. Aim for ~${perDay} less per day next week.`);
  } else if (calDiff < -500) {
    parts.push(`${Math.round(Math.abs(calDiff))} kcal under target \u2014 strong discipline!`);
  } else if (stats.trackedDays >= 5) {
    parts.push("Calories right on target.");
  }

  // Weight insight
  if (stats.weightDelta !== null) {
    if (stats.weightDelta < -0.3) {
      parts.push(`Lost ${Math.abs(stats.weightDelta)} kg this week \u2014 great progress.`);
    } else if (stats.weightDelta > 0.3) {
      parts.push(`Weight up ${stats.weightDelta} kg. Could be water retention \u2014 stay consistent.`);
    }
  }

  // Comparison insight
  if (prevStats && prevStats.avgDeficit !== null && stats.avgDeficit !== null) {
    const diff = stats.avgDeficit - prevStats.avgDeficit;
    if (diff > 100) {
      parts.push(`Avg deficit improved by ${Math.round(diff)} vs last week.`);
    } else if (diff < -100) {
      parts.push(`Avg deficit dropped by ${Math.round(Math.abs(diff))} vs last week.`);
    }
  }

  // Tracking consistency
  if (stats.trackedDays < stats.totalDays * 0.5) {
    parts.push(`Only ${stats.trackedDays}/${stats.totalDays} days tracked \u2014 consistency is key.`);
  }

  // Sport encouragement
  if (stats.sportDays >= 3) {
    parts.push(`${stats.sportDays} sport days \u2014 keep it up!`);
  } else if (stats.sportDays === 0 && stats.trackedDays > 0) {
    parts.push("No sport days logged. Even one session helps.");
  }

  return parts.length > 0 ? parts.join(" ") : "Keep going!";
}

function MiniCalChart({ dailyCals, theme }: { dailyCals: WeekStats["dailyCals"]; theme: Theme }) {
  const maxCal = Math.max(...dailyCals.map((d) => Math.max(d.target, d.actual ?? 0)), 1);

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 50 }}>
      {dailyCals.map((d, i) => {
        const targetH = (d.target / maxCal) * 44;
        const actualH = d.actual !== null ? (d.actual / maxCal) * 44 : 0;
        const over = d.actual !== null && d.actual > d.target;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ position: "relative", width: "100%", height: 44 }}>
              {/* Target bar (background) */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: targetH,
                  background: theme.border,
                  borderRadius: 2,
                  opacity: 0.5,
                }}
              />
              {/* Actual bar (foreground) */}
              {d.actual !== null && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: "15%",
                    right: "15%",
                    height: actualH,
                    background: over ? "#ef4444" : "#22c55e",
                    borderRadius: 2,
                  }}
                />
              )}
            </div>
            <div style={{ fontSize: 9, color: theme.textDim }}>
              {["M", "T", "W", "T", "F", "S", "S"][i] ?? ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeeklySummary({
  days,
  weekNum,
  theme,
  prevWeekDays,
}: {
  days: ComputedDay[];
  weekNum: number;
  theme: Theme;
  prevWeekDays: ComputedDay[] | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const stats = useMemo(() => calcWeekStats(days), [days]);
  const prevStats = useMemo(() => (prevWeekDays ? calcWeekStats(prevWeekDays) : null), [prevWeekDays]);
  const grade = useMemo(() => getWeekGrade(stats), [stats]);
  const insight = useMemo(() => getWeekInsight(stats, prevStats), [stats, prevStats]);

  const hasData = stats.trackedDays > 0 || days.some((d) => d.data.weighIn !== null);
  const mono: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${theme.card} 0%, ${theme.bg} 100%)`,
        border: `1px solid ${theme.inputBorder}`,
        borderRadius: 10,
        marginBottom: 8,
        overflow: "hidden",
        transition: "box-shadow 0.2s",
      }}
    >
      {/* Header — always visible */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "10px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 12,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700, color: "#a855f7", fontSize: 13 }}>W{weekNum}</span>
          <span style={{ color: grade.color, fontWeight: 600, fontSize: 11 }}>
            {grade.emoji} {grade.label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, ...mono }}>
          {stats.avgDeficit !== null && (
            <span style={{ fontSize: 11 }}>
              <span style={{ color: theme.textMuted }}>def </span>
              <span style={{ color: "#22c55e", fontWeight: 600 }}>{stats.avgDeficit}</span>
            </span>
          )}
          {stats.avgWeight !== null && (
            <span style={{ fontSize: 11 }}>
              <span style={{ color: theme.textMuted }}>avg </span>
              <span style={{ color: "#60a5fa", fontWeight: 600 }}>{stats.avgWeight}kg</span>
            </span>
          )}
          <span style={{ fontSize: 11 }}>
            <span style={{ color: theme.text, fontWeight: 600 }}>
              {stats.trackedDays}/{stats.totalDays}
            </span>
          </span>
          <span
            style={{
              fontSize: 11,
              color: theme.textDim,
              transition: "transform 0.2s",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              display: "inline-block",
            }}
          >
            &#9660;
          </span>
        </div>
      </div>

      {/* Expanded content */}
      <div
        style={{
          maxHeight: expanded ? 500 : 0,
          overflow: "hidden",
          transition: "max-height 0.3s ease",
        }}
      >
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Insight banner */}
          <div
            style={{
              background: theme.macroBoxBg,
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              lineHeight: 1.5,
              color: theme.text,
              borderLeft: `3px solid ${grade.color}`,
            }}
          >
            {insight}
          </div>

          {/* Stats grid */}
          {hasData && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {/* Calories */}
              <div style={{ background: theme.macroBoxBg, borderRadius: 8, padding: "8px 10px", borderTop: "3px solid #a855f7" }}>
                <div style={{ fontSize: 10, color: theme.textMuted }}>Calories</div>
                {stats.trackedDays > 0 ? (
                  <>
                    <div style={{ ...mono, fontSize: 13, fontWeight: 600 }}>
                      {Math.round(stats.totalCalsEaten).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: theme.textMuted }}>
                      / {Math.round(stats.totalCalsTarget).toLocaleString()} target
                    </div>
                    <div style={{
                      ...mono,
                      fontSize: 11,
                      fontWeight: 600,
                      marginTop: 2,
                      color: stats.totalCalsEaten <= stats.totalCalsTarget ? "#22c55e" : "#ef4444",
                    }}>
                      {stats.totalCalsEaten <= stats.totalCalsTarget ? "" : "+"}
                      {Math.round(stats.totalCalsEaten - stats.totalCalsTarget)} kcal
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: theme.textDim }}>No data</div>
                )}
              </div>

              {/* Weight */}
              <div style={{ background: theme.macroBoxBg, borderRadius: 8, padding: "8px 10px", borderTop: "3px solid #60a5fa" }}>
                <div style={{ fontSize: 10, color: theme.textMuted }}>Weight</div>
                {stats.weightDelta !== null ? (
                  <>
                    <div style={{
                      ...mono,
                      fontSize: 13,
                      fontWeight: 600,
                      color: stats.weightDelta <= 0 ? "#22c55e" : "#ef4444",
                    }}>
                      {stats.weightDelta > 0 ? "+" : ""}{stats.weightDelta} kg
                    </div>
                    <div style={{ fontSize: 10, color: theme.textMuted }}>
                      {stats.weightStart} &rarr; {stats.weightEnd} kg
                    </div>
                  </>
                ) : stats.avgWeight !== null ? (
                  <>
                    <div style={{ ...mono, fontSize: 13, fontWeight: 600 }}>{stats.avgWeight} kg</div>
                    <div style={{ fontSize: 10, color: theme.textDim }}>single weigh-in</div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: theme.textDim }}>No weigh-ins</div>
                )}
              </div>

              {/* Activity */}
              <div style={{ background: theme.macroBoxBg, borderRadius: 8, padding: "8px 10px", borderTop: "3px solid #f59e0b" }}>
                <div style={{ fontSize: 10, color: theme.textMuted }}>Activity</div>
                <div style={{ ...mono, fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: "#22c55e" }}>{stats.sportDays}</span>
                  <span style={{ color: theme.textDim, fontSize: 11 }}> sport</span>
                </div>
                <div style={{ ...mono, fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: "#ef4444" }}>{stats.restDays}</span>
                  <span style={{ color: theme.textDim, fontSize: 11 }}> rest</span>
                </div>
                {stats.sugarTracked > 0 && (
                  <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>
                    Sugar OK: {stats.sugarCompliant}/{stats.sugarTracked}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mini bar chart */}
          {stats.trackedDays > 0 && (
            <div style={{ background: theme.macroBoxBg, borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 6 }}>
                Daily calories (green = under target, red = over)
              </div>
              <MiniCalChart dailyCals={stats.dailyCals} theme={theme} />
            </div>
          )}

          {/* Comparison with previous week */}
          {prevStats && prevStats.trackedDays > 0 && stats.trackedDays > 0 && (
            <div style={{ display: "flex", gap: 8, fontSize: 11, ...mono, flexWrap: "wrap" }}>
              <span style={{ color: theme.textMuted }}>vs last week:</span>
              {prevStats.avgDeficit !== null && stats.avgDeficit !== null && (
                <span>
                  deficit{" "}
                  <span style={{
                    color: stats.avgDeficit >= prevStats.avgDeficit ? "#22c55e" : "#ef4444",
                    fontWeight: 600,
                  }}>
                    {stats.avgDeficit >= prevStats.avgDeficit ? "+" : ""}
                    {stats.avgDeficit - prevStats.avgDeficit}
                  </span>
                </span>
              )}
              {prevStats.avgWeight !== null && stats.avgWeight !== null && (
                <span>
                  weight{" "}
                  <span style={{
                    color: stats.avgWeight <= prevStats.avgWeight ? "#22c55e" : "#ef4444",
                    fontWeight: 600,
                  }}>
                    {stats.avgWeight <= prevStats.avgWeight ? "" : "+"}
                    {Math.round((stats.avgWeight - prevStats.avgWeight) * 10) / 10} kg
                  </span>
                </span>
              )}
              <span>
                tracking{" "}
                <span style={{
                  color: stats.trackedDays >= prevStats.trackedDays ? "#22c55e" : "#ef4444",
                  fontWeight: 600,
                }}>
                  {stats.trackedDays >= prevStats.trackedDays ? "+" : ""}
                  {stats.trackedDays - prevStats.trackedDays} days
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Tracker ────────────────────────────────────────────────────────────

type Filter = "all" | "todo" | "done";

export default function CutTracker() {
  const [store, setStore] = useState<StoreData>(getDefaultStore);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [showConfetti, setShowConfetti] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const prevWeighInsRef = useRef<string>("");

  const theme = store.darkMode ? darkTheme : lightTheme;

  const toggleTheme = useCallback(() => {
    setStore((prev) => ({ ...prev, darkMode: !prev.darkMode }));
  }, []);

  // Apply theme to CSS custom properties
  useEffect(() => {
    const s = document.documentElement.style;
    s.setProperty("--bg", theme.bg);
    s.setProperty("--text", theme.text);
    s.setProperty("--input-bg", theme.inputBg);
    s.setProperty("--input-border", theme.inputBorder);
  }, [theme]);

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setStore(parsed);
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store, loaded]);

  const updateDay = useCallback(
    (dayNum: number, update: Partial<DayData>) => {
      setStore((prev) => {
        const existing = prev.days[dayNum] ?? getDefaultDay();
        return {
          ...prev,
          days: { ...prev.days, [dayNum]: { ...existing, ...update } },
        };
      });
    },
    []
  );

  const computedDays = useMemo(() => computeAllDays(store), [store]);

  // Confetti: trigger when a new weigh-in shows ahead of schedule
  useEffect(() => {
    const weighInKey = JSON.stringify(
      computedDays.filter((d) => d.data.weighIn !== null).map((d) => ({ d: d.dayNum, w: d.data.weighIn }))
    );
    if (prevWeighInsRef.current && weighInKey !== prevWeighInsRef.current) {
      const lastWI = [...computedDays].reverse().find((d) => d.data.weighIn !== null);
      if (lastWI && lastWI.data.weighIn !== null) {
        if (lastWI.data.weighIn < lastWI.estimatedWeight) {
          setShowConfetti(true);
        }
      }
    }
    prevWeighInsRef.current = weighInKey;
  }, [computedDays]);

  // Dashboard stats
  const stats = useMemo(() => {
    const weighIns = computedDays.filter((d) => d.data.weighIn !== null);
    const latestWeight =
      weighIns.length > 0 ? weighIns[weighIns.length - 1].data.weighIn! : START_WEIGHT;
    const kgLost = Math.round((START_WEIGHT - latestWeight) * 10) / 10;
    const kgRemaining = Math.round((latestWeight - TARGET_WEIGHT) * 10) / 10;
    const daysCompleted = computedDays.filter((d) => d.data.done).length;
    const progressPct = Math.max(0, Math.min(100, (kgLost / (START_WEIGHT - TARGET_WEIGHT)) * 100));
    return { latestWeight, kgLost, kgRemaining, daysCompleted, progressPct };
  }, [computedDays]);

  // Filtered days
  const filteredDays = useMemo(() => {
    if (filter === "done") return computedDays.filter((d) => d.data.done);
    if (filter === "todo") return computedDays.filter((d) => !d.data.done);
    return computedDays;
  }, [computedDays, filter]);

  // Weekly groups for summary
  const weekGroups = useMemo(() => {
    const groups: ComputedDay[][] = [];
    for (let i = 0; i < TOTAL_DAYS; i += 7) {
      groups.push(computedDays.slice(i, i + 7));
    }
    return groups;
  }, [computedDays]);

  // Export
  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fitnesstracker-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [store]);

  // Import
  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (data && typeof data === "object" && "days" in data) {
            setStore(data);
          }
        } catch {
          alert("Invalid JSON file");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  // Reset
  const handleReset = useCallback(() => {
    if (window.confirm("Are you sure you want to reset ALL data? This cannot be undone.")) {
      setStore(getDefaultStore());
    }
  }, []);

  // Scroll to today
  const scrollToToday = useCallback(() => {
    const el = document.getElementById("day-today");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  if (!loaded) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", color: "#64748b" }}>
        Loading...
      </div>
    );
  }

  const containerStyle: CSSProperties = {
    maxWidth: 600,
    margin: "0 auto",
    padding: "16px 12px 80px",
  };

  const mono: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

  const cardStyle = (borderColor: string): CSSProperties => ({
    background: theme.card,
    border: `1px solid ${theme.border}`,
    borderLeft: `4px solid ${borderColor}`,
    borderRadius: 10,
    padding: "12px 14px",
  });

  const btnStyle = (active: boolean, color: string): CSSProperties => ({
    padding: "6px 14px",
    borderRadius: 8,
    border: `1px solid ${active ? color : theme.border}`,
    background: active ? color + "22" : "transparent",
    color: active ? color : theme.textMuted,
    fontSize: 13,
    fontWeight: 600,
    transition: "all 0.2s",
  });

  return (
    <div style={containerStyle}>
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 20, position: "relative" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" }}>
          Fitnesstracker
        </h1>
        <p style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>
          102 kg &rarr; 90 kg &middot; 71 days &middot; May 12 &ndash; Jul 22, 2026
        </p>
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            background: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 16,
            cursor: "pointer",
            lineHeight: 1,
          }}
          title={store.darkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {store.darkMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}
        </button>
      </div>

      {/* Stat Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div style={cardStyle("#60a5fa")}>
          <div style={{ fontSize: 11, color: theme.textMuted }}>Current Weight</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700 }}>
            {stats.latestWeight} <span style={{ fontSize: 13, color: theme.textDim }}>kg</span>
          </div>
        </div>
        <div style={cardStyle("#22c55e")}>
          <div style={{ fontSize: 11, color: theme.textMuted }}>Lost / Remaining</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700 }}>
            <span style={{ color: "#22c55e" }}>{stats.kgLost}</span>
            <span style={{ fontSize: 13, color: theme.textDim }}> / </span>
            {stats.kgRemaining}
            <span style={{ fontSize: 13, color: theme.textDim }}> kg</span>
          </div>
        </div>
        <div style={cardStyle("#a855f7")}>
          <div style={{ fontSize: 11, color: theme.textMuted }}>Days Completed</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700 }}>
            {stats.daysCompleted}
            <span style={{ fontSize: 13, color: theme.textDim }}> / {TOTAL_DAYS}</span>
          </div>
        </div>
        <div style={cardStyle("#f59e0b")}>
          <div style={{ fontSize: 11, color: theme.textMuted }}>Progress</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700 }}>
            {Math.round(stats.progressPct)}
            <span style={{ fontSize: 13, color: theme.textDim }}>%</span>
          </div>
          <div
            style={{
              marginTop: 6,
              height: 6,
              background: theme.progressBarBg,
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${stats.progressPct}%`,
                height: "100%",
                background: "linear-gradient(90deg, #f59e0b, #22c55e)",
                borderRadius: 3,
                transition: "width 0.5s ease",
              }}
            />
          </div>
        </div>
      </div>

      {/* Weight Chart Toggle */}
      <button
        onClick={() => setShowChart(!showChart)}
        style={{
          ...btnStyle(showChart, "#60a5fa"),
          width: "100%",
          marginBottom: 10,
          padding: "8px 14px",
        }}
      >
        {showChart ? "Hide" : "Show"} Weight Chart
      </button>

      {showChart && (
        <div style={{ ...cardStyle("#60a5fa"), marginBottom: 12, padding: 8 }}>
          <WeightChart days={computedDays} theme={theme} />
        </div>
      )}

      {/* Action Buttons */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <button onClick={scrollToToday} style={btnStyle(false, "#60a5fa")}>
          Go to Today
        </button>
        <button onClick={handleExport} style={btnStyle(false, "#22c55e")}>
          Export JSON
        </button>
        <button onClick={handleImport} style={btnStyle(false, "#a855f7")}>
          Import JSON
        </button>
        <button onClick={handleReset} style={btnStyle(false, "#ef4444")}>
          Reset
        </button>
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {(["all", "todo", "done"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={btnStyle(filter === f, "#60a5fa")}
          >
            {f === "all" ? "All" : f === "todo" ? "To Do" : "Done"}
            {f === "all" && ` (${computedDays.length})`}
            {f === "todo" && ` (${computedDays.filter((d) => !d.data.done).length})`}
            {f === "done" && ` (${computedDays.filter((d) => d.data.done).length})`}
          </button>
        ))}
      </div>

      {/* Day rows with weekly summaries */}
      {filter === "all"
        ? weekGroups.map((week, wi) => (
            <div key={wi}>
              <WeeklySummary days={week} weekNum={wi + 1} theme={theme} prevWeekDays={wi > 0 ? weekGroups[wi - 1] : null} />
              {week.map((day) => (
                <div key={day.dayNum} id={day.isToday ? "day-today" : undefined}>
                  <DayRow
                    day={day}
                    theme={theme}
                    onToggleDone={() => updateDay(day.dayNum, { done: !day.data.done })}
                    onToggleSport={() => updateDay(day.dayNum, { isSportDay: !day.data.isSportDay })}
                    onSetCalories={(v) => updateDay(day.dayNum, { actualCalories: v })}
                    onSetWeighIn={(v) => updateDay(day.dayNum, { weighIn: v })}
                    onSetSugar={(v) => updateDay(day.dayNum, { actualSugar: v })}
                  />
                </div>
              ))}
            </div>
          ))
        : filteredDays.map((day) => (
            <div key={day.dayNum} id={day.isToday ? "day-today" : undefined}>
              <DayRow
                day={day}
                theme={theme}
                onToggleDone={() => updateDay(day.dayNum, { done: !day.data.done })}
                onToggleSport={() => updateDay(day.dayNum, { isSportDay: !day.data.isSportDay })}
                onSetCalories={(v) => updateDay(day.dayNum, { actualCalories: v })}
                onSetWeighIn={(v) => updateDay(day.dayNum, { weighIn: v })}
                onSetSugar={(v) => updateDay(day.dayNum, { actualSugar: v })}
              />
            </div>
          ))}
    </div>
  );
}
