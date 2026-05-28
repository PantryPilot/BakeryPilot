"use client";
import { useState, useMemo, useRef, useLayoutEffect, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../lib/context";
import { Icon } from "../../components/Icon";
import { Pill, SectionHeader, ActionCard, type ActionCardData } from "../../components/atoms";
import { FACILITIES, SKUS, ProductionRun } from "../../lib/data";
import {
  adaptActionCard,
  confirmActionCard,
  createSchedule,
  deleteSchedule,
  updateSchedule,
  fetchActionCard,
  fetchFacilities,
  fetchPendingScheduleChangeCard,
  fetchProductionLines,
  fetchProducts,
  fetchScheduleDiff,
  formatScheduleWindow,
  rejectActionCard,
  type UpdateScheduleInput,
  type BackendFacility,
  type BackendProduct,
  type BackendProductionLine,
} from "../../lib/api";
import { useSchedules } from "../../lib/hooks";
import type { BackendSchedule, BackendScheduleDiff, BackendScheduleDiffRun } from "../../lib/api";

const FACILITY_MAP: Record<string, string> = {
  "plant-toronto": "p1", "plant-mississauga": "p2", "plant-hamilton": "p3", "plant-montreal": "p4",
  plant_1: "p1", plant_2: "p2", plant_3: "p3", plant_4: "p4",
};

const PLANT_TO_FACILITY: Record<string, string> = {
  p1: "plant-toronto",
  p2: "plant-mississauga",
  p3: "plant-hamilton",
  p4: "plant-montreal",
};

const LANE_H = 44;
const TIMELINE_HOURS = 24;
const TIMELINE_MIN_ZOOM_HOURS = 2;
const TIMELINE_ZOOM_STEPS = [24, 12, 8, 6, 4, 2] as const;

function clampViewportStart(startHour: number, zoomHours: number): number {
  return Math.max(0, Math.min(TIMELINE_HOURS - zoomHours, startHour));
}

function buildViewportHours(startHour: number, zoomHours: number): number[] {
  return Array.from({ length: zoomHours }, (_, i) => startHour + i);
}

function formatViewportRange(startHour: number, zoomHours: number): string {
  const fmt = (h: number) => `${String(Math.floor(h) % 24).padStart(2, "0")}:00`;
  const endHour = startHour + zoomHours;
  if (endHour >= TIMELINE_HOURS) return `${fmt(startHour)} – 24:00`;
  return `${fmt(startHour)} – ${fmt(endHour)}`;
}

function hourLeftPct(hour: number, timelineStart: number, slotCount: number): number {
  return ((hour - timelineStart) / slotCount) * 100;
}

function hourWidthPct(start: number, end: number, slotCount: number): number {
  return ((end - start) / slotCount) * 100;
}

type ScheduledRun = ProductionRun & {
  dateKey: string;
  startAt: string;
  endAt: string;
  facilityId: string;
  lineId: string;
};

type GanttLaneModel = { key: string; plant: string; line: number; runs: ScheduledRun[] };

const DRAG_SNAP_HOURS = 0.25;
const DRAG_THRESHOLD_PX = 4;

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

function quickDatesAround(anchorDate: string): string[] {
  return [shiftDateKey(anchorDate, -1), anchorDate, shiftDateKey(anchorDate, 1)];
}

function laneRowBg(index: number): string {
  return index % 2 === 0 ? "bg-[var(--bp-surface-soft)]" : "bg-[var(--bp-surface-muted)]/35";
}

function runTileStyle(risk: ProductionRun["risk"]): string {
  if (risk === "red") {
    return "border-l-red-400 bg-red-950/55 border-red-500/45 hover:bg-red-950/70";
  }
  if (risk === "amber") {
    return "border-l-amber-400 bg-amber-950/45 border-amber-500/40 hover:bg-amber-950/60";
  }
  return "border-l-blue-400/90 bg-[var(--bp-surface-muted)] border-[var(--bp-border)] hover:bg-[var(--bp-surface)] hover:border-[var(--bp-border)]";
}

const GANTT_HEADER_H = 32;
const GANTT_HEADER =
  "sticky top-0 z-30 shrink-0 bg-[var(--bp-surface-muted)]/55 border-b border-[var(--bp-border-soft)] text-[11px] font-medium leading-none text-[var(--bp-text-secondary)]";
const GANTT_ROW_LABEL = "text-[11px] font-medium leading-snug text-[var(--bp-text-secondary)] truncate";
const GANTT_HOUR_LABEL = "text-[11px] font-mono leading-none text-[var(--bp-text-muted)] tabular-nums";
const GANTT_RUN_TILE =
  "absolute top-1.5 bottom-1.5 rounded-lg border border-l-[3px] bg-[var(--bp-surface)] shadow-md ring-1 ring-black/10 flex items-center gap-2 px-2.5 cursor-grab active:cursor-grabbing touch-none transition-colors duration-150 hover:z-20 hover:shadow-lg hover:ring-black/15";

function formatDateLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  return d.toLocaleDateString("en-CA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function backendSchedulesToRuns(schedules: BackendSchedule[]): ScheduledRun[] {
  const runs: ScheduledRun[] = [];
  for (const s of schedules) {
    if (s.status === "complete") continue;
    const plantId = FACILITY_MAP[s.facility_id] ?? s.facility_id;
    const lineNum = parseInt(s.line_id.replace(/\D/g, "")) || 1;
    for (const r of s.runs) {
      const start = new Date(r.start_at);
      const end = new Date(r.end_at);
      runs.push({
        id: r.run_id,
        plant: plantId,
        line: lineNum,
        sku: r.sku_id,
        qty: r.quantity,
        start: start.getUTCHours() + start.getUTCMinutes() / 60,
        end: end.getUTCHours() + end.getUTCMinutes() / 60,
        allergen: "none",
        risk: "ok",
        lots: r.lot_assignments,
        dateKey: toDateKey(start),
        startAt: r.start_at,
        endAt: r.end_at,
        facilityId: s.facility_id,
        lineId: s.line_id,
      });
    }
  }
  return runs;
}

function lineNumberFromId(lineId: string): number {
  return parseInt(lineId.replace(/\D/g, ""), 10) || 1;
}

function utcIsoFromDateAndTime(dateKey: string, time: string): string {
  const [hh, mm] = time.split(":").map(v => parseInt(v, 10));
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCHours(hh || 0, mm || 0, 0, 0);
  return d.toISOString();
}

function RunHoverCard({
  run,
  anchorEl,
}: {
  run: ProductionRun;
  anchorEl: HTMLElement | null;
}) {
  const sku = SKUS.find(s => s.id === run.sku);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!anchorEl) return;
    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      setPos({
        left: Math.min(Math.max(8, rect.left), window.innerWidth - 264),
        top: rect.top - 8,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorEl]);

  if (!anchorEl || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed z-[9999] w-64 -translate-y-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3 shadow-2xl text-[12px] pointer-events-none ring-1 ring-white/[0.04]"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="font-mono text-[10px] text-[var(--bp-text-subtle)] mb-1">{run.id}</div>
      <div className="text-[13px] font-medium text-[var(--bp-text-primary)] mb-1.5">{sku?.name || run.sku}</div>
      <div className="text-[var(--bp-text-muted)]">Lots consumed</div>
      {run.lots.length > 0
        ? run.lots.map(l => <div key={l} className="font-mono text-[11px] text-[var(--bp-text-secondary)]">· {l}</div>)
        : <div className="font-mono text-[11px] text-[var(--bp-text-subtle)]">· none assigned</div>}
      <div className="mt-1.5 pt-1.5 border-t border-[var(--bp-border-soft)] flex justify-between">
        <span className="text-[var(--bp-text-muted)]">yield est</span>
        <span className="text-[var(--bp-text-secondary)] font-mono tabular-nums">96.4%</span>
      </div>
    </div>,
    document.body,
  );
}

type RunMenuState = { run: ScheduledRun; x: number; y: number } | null;

type MovePreview = {
  runId: string;
  sourceLaneKey: string;
  targetLaneKey: string;
  start: number;
  end: number;
};

function snapHour(hour: number): number {
  return Math.round(hour / DRAG_SNAP_HOURS) * DRAG_SNAP_HOURS;
}

function lineIdForLane(
  lane: Pick<GanttLaneModel, "plant" | "line">,
  productionLines: BackendProductionLine[],
): string | null {
  const facilityId = PLANT_TO_FACILITY[lane.plant];
  const match = productionLines.find(
    ln =>
      lineNumberFromId(ln.line_id) === lane.line &&
      ((FACILITY_MAP[ln.facility_id] ?? ln.facility_id) === lane.plant ||
        ln.facility_id === facilityId),
  );
  return match?.line_id ?? null;
}

function facilityIdForLane(lane: Pick<GanttLaneModel, "plant">): string {
  return PLANT_TO_FACILITY[lane.plant] ?? lane.plant;
}

function applyMovePreview(lanes: GanttLaneModel[], preview: MovePreview | null): GanttLaneModel[] {
  if (!preview) return lanes;
  const run = lanes.flatMap(l => l.runs).find(r => r.id === preview.runId);
  if (!run) return lanes;
  const movedRun: ScheduledRun = { ...run, start: preview.start, end: preview.end };
  return lanes.map(ln => {
    if (ln.key === preview.sourceLaneKey && ln.key !== preview.targetLaneKey) {
      return { ...ln, runs: ln.runs.filter(r => r.id !== preview.runId) };
    }
    if (ln.key === preview.targetLaneKey) {
      const others = ln.runs.filter(r => r.id !== preview.runId);
      return { ...ln, runs: [...others, movedRun].sort((a, b) => a.start - b.start) };
    }
    return ln;
  });
}

function RunContextMenu({
  menu,
  onClose,
  onDelete,
  deletingId,
}: {
  menu: RunMenuState;
  onClose: () => void;
  onDelete: (run: ScheduledRun) => void;
  deletingId: string | null;
}) {
  useEffect(() => {
    if (!menu) return;
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  const sku = SKUS.find(s => s.id === menu.run.sku);
  const busy = deletingId === menu.run.id;
  return createPortal(
    <div
      className="fixed z-[10000] min-w-[148px] rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] py-1 shadow-xl ring-1 ring-white/[0.04]"
      style={{ left: menu.x, top: menu.y }}
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.preventDefault()}
    >
      <button
        type="button"
        disabled={busy}
        className="w-full px-3 py-1.5 text-left text-[12px] text-red-400 hover:bg-red-500/10 disabled:opacity-50"
        onClick={() => onDelete(menu.run)}
      >
        {busy ? "Deleting…" : `Delete ${sku?.name ?? menu.run.sku}`}
      </button>
    </div>,
    document.body,
  );
}

function GanttLane({
  lane,
  hours,
  nowHour,
  isFirst,
  showNowLine,
  rowIndex,
  onRunContextMenu,
  onRunDragStart,
  draggingRunId,
  savingRunId,
}: {
  lane: GanttLaneModel;
  hours: number[];
  nowHour: number;
  isFirst: boolean;
  showNowLine: boolean;
  rowIndex: number;
  onRunContextMenu: (e: React.MouseEvent, run: ScheduledRun) => void;
  onRunDragStart: (e: React.PointerEvent, run: ScheduledRun, laneKey: string) => void;
  draggingRunId: string | null;
  savingRunId: string | null;
}) {
  const sku = (id: string) => SKUS.find(s => s.id === id);
  const [hoveredRun, setHoveredRun] = useState<{ run: ScheduledRun; el: HTMLElement } | null>(null);
  const showNow = showNowLine && nowHour >= hours[0] && nowHour < hours[0] + hours.length;
  const nowLabel = `${String(Math.floor(nowHour)).padStart(2, "0")}:${String(Math.round((nowHour % 1) * 60)).padStart(2, "0")}`;
  return (
    <div
      className={`relative w-full border-b border-[var(--bp-border-soft)] ${laneRowBg(rowIndex)}`}
      style={{ height: LANE_H }}
      data-lane-key={lane.key}
    >
      {Array.from({ length: hours.length + 1 }, (_, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 w-px opacity-70"
          style={{ left: `${(i / hours.length) * 100}%`, backgroundColor: "var(--bp-border-soft)" }}
        />
      ))}
      {showNow && (
        <div
          className="absolute top-0 bottom-0 w-px bg-blue-400 z-10 shadow-[0_0_8px_rgba(96,165,250,0.55)]"
          style={{ left: `${hourLeftPct(nowHour, hours[0], hours.length)}%` }}
        >
          {isFirst && (
            <div className="absolute -top-2.5 -translate-x-1/2 rounded-full bg-blue-500/35 px-1.5 py-0.5 text-[9px] font-mono text-blue-100 whitespace-nowrap ring-1 ring-blue-400/50">
              now · {nowLabel}
            </div>
          )}
        </div>
      )}
      {lane.runs.map(r => {
        const viewportEnd = hours[0] + hours.length;
        if (r.end <= hours[0] || r.start >= viewportEnd) return null;
        const displayStart = Math.max(r.start, hours[0]);
        const displayEnd = Math.min(r.end, viewportEnd);
        const leftPct = hourLeftPct(displayStart, hours[0], hours.length);
        const widthPct = hourWidthPct(displayStart, displayEnd, hours.length);
        const allergenTone = r.allergen === "nuts" ? "red" : r.allergen === "milk" ? "amber" : "slate";
        const isDragging = draggingRunId === r.id;
        const isSaving = savingRunId === r.id;
        return (
          <div
            key={r.id}
            className={`${GANTT_RUN_TILE} ${runTileStyle(r.risk)} ${isDragging ? "z-30 opacity-90 ring-2 ring-blue-400/60" : ""} ${isSaving ? "opacity-50 pointer-events-none" : ""}`}
            style={{ left: `calc(${leftPct}% + 3px)`, width: `calc(${widthPct}% - 6px)` }}
            onMouseEnter={e => {
              if (draggingRunId) return;
              setHoveredRun({ run: r, el: e.currentTarget });
            }}
            onMouseLeave={() => setHoveredRun(null)}
            onContextMenu={e => onRunContextMenu(e, r)}
            onPointerDown={e => onRunDragStart(e, r, lane.key)}
          >
            <span className="text-[12px] font-medium text-[var(--bp-text-primary)] truncate">{sku(r.sku)?.name || r.sku}</span>
            <span className="text-[11px] font-mono text-[var(--bp-text-muted)] tabular-nums shrink-0">
              {(r.qty / 1000).toFixed(1)}k
            </span>
            {r.allergen !== "none" && <Pill tone={allergenTone === "red" ? "red" : allergenTone === "amber" ? "amber" : "ghost"} className="shrink-0">{r.allergen}</Pill>}
          </div>
        );
      })}
      {hoveredRun && !draggingRunId && <RunHoverCard run={hoveredRun.run} anchorEl={hoveredRun.el} />}
      {lane.runs.length > 1 && lane.runs.slice(0, -1).map((r, i) => {
        const next = lane.runs[i + 1];
        const xPct = hourLeftPct(next.start, hours[0], hours.length);
        if (r.allergen !== next.allergen && r.allergen !== "none" && next.allergen !== "none") {
          return (
            <div key={i} className="absolute top-0 bottom-0 border-l-2 border-dashed border-amber-500/60" style={{ left: `calc(${xPct}% - 1px)` }}>
              <div className="absolute -top-2 left-1 text-[9px] font-mono text-amber-300 whitespace-nowrap bg-[#0a0d14] px-1">{r.allergen}→{next.allergen} · 90m</div>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function GanttTimeline({
  lanes,
  viewportStart,
  viewportHours,
  nowHour,
  showNowLine,
  productionLines,
  onRunContextMenu,
  onRunMove,
}: {
  lanes: GanttLaneModel[];
  viewportStart: number;
  viewportHours: number;
  nowHour: number;
  showNowLine: boolean;
  productionLines: BackendProductionLine[];
  onRunContextMenu: (e: React.MouseEvent, run: ScheduledRun) => void;
  onRunMove: (run: ScheduledRun, update: UpdateScheduleInput) => Promise<boolean>;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const hours = useMemo(
    () => buildViewportHours(viewportStart, viewportHours),
    [viewportStart, viewportHours],
  );
  const gridCols = `repeat(${hours.length}, minmax(0, 1fr))`;
  const [drag, setDrag] = useState<{
    run: ScheduledRun;
    sourceLaneKey: string;
    startClientX: number;
    startClientY: number;
    originStart: number;
    durationHours: number;
  } | null>(null);
  const [preview, setPreview] = useState<MovePreview | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const displayLanes = useMemo(() => applyMovePreview(lanes, preview), [lanes, preview]);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      const deltaHours = ((e.clientX - drag.startClientX) / rect.width) * hours.length;
      const start = snapHour(drag.originStart + deltaHours);
      const end = start + drag.durationHours;
      const laneIdx = Math.max(
        0,
        Math.min(
          lanes.length - 1,
          Math.floor((e.clientY - rect.top - GANTT_HEADER_H) / LANE_H),
        ),
      );
      const targetLaneKey = lanes[laneIdx]?.key ?? drag.sourceLaneKey;
      setPreview({
        runId: drag.run.id,
        sourceLaneKey: drag.sourceLaneKey,
        targetLaneKey,
        start,
        end,
      });
    };

    const onUp = async (e: PointerEvent) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      const moved =
        rect != null &&
        (Math.abs(e.clientX - drag.startClientX) > DRAG_THRESHOLD_PX ||
          Math.abs(e.clientY - drag.startClientY) > DRAG_THRESHOLD_PX);

      if (!rect || !moved) {
        setDrag(null);
        setPreview(null);
        return;
      }

      const deltaHours = ((e.clientX - drag.startClientX) / rect.width) * hours.length;
      const start = snapHour(drag.originStart + deltaHours);
      const laneIdx = Math.max(
        0,
        Math.min(
          lanes.length - 1,
          Math.floor((e.clientY - rect.top - GANTT_HEADER_H) / LANE_H),
        ),
      );
      const targetLane = lanes[laneIdx] ?? lanes.find(l => l.key === drag.sourceLaneKey)!;
      const deltaMs = (start - drag.originStart) * 3600 * 1000;
      const newStartAt = new Date(new Date(drag.run.startAt).getTime() + deltaMs).toISOString();
      const newEndAt = new Date(new Date(drag.run.endAt).getTime() + deltaMs).toISOString();

      const update: UpdateScheduleInput = {
        start_at: newStartAt,
        end_at: newEndAt,
      };
      if (targetLane.key !== drag.sourceLaneKey) {
        const lineId = lineIdForLane(targetLane, productionLines);
        if (lineId) {
          update.line_id = lineId;
          update.facility_id = facilityIdForLane(targetLane);
        }
      }

      const run = drag.run;
      setSavingId(run.id);
      setDrag(null);
      setPreview(null);
      await onRunMove(run, update);
      setSavingId(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, hours.length, lanes, onRunMove, productionLines, viewportStart, viewportHours]);

  const beginDrag = useCallback(
    (e: React.PointerEvent, run: ScheduledRun, laneKey: string) => {
      if (e.button !== 0 || savingId) return;
      e.preventDefault();
      setDrag({
        run,
        sourceLaneKey: laneKey,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originStart: run.start,
        durationHours: run.end - run.start,
      });
      setPreview({
        runId: run.id,
        sourceLaneKey: laneKey,
        targetLaneKey: laneKey,
        start: run.start,
        end: run.end,
      });
    },
    [savingId],
  );

  return (
    <div ref={timelineRef} className="min-w-0 flex-1 w-full bg-[var(--bp-surface-soft)]">
      <div
        className={`grid w-full ${GANTT_HEADER}`}
        style={{ gridTemplateColumns: gridCols, height: GANTT_HEADER_H }}
      >
        {hours.map(h => (
          <div
            key={h}
            className={`min-w-0 border-r border-[var(--bp-border-soft)] flex items-center justify-center text-center ${GANTT_HOUR_LABEL}`}
          >
            {String(h).padStart(2, "0")}:00
          </div>
        ))}
      </div>
      {displayLanes.map((ln, i) => (
        <GanttLane
          key={ln.key}
          lane={ln}
          hours={hours}
          nowHour={nowHour}
          isFirst={i === 0}
          showNowLine={showNowLine}
          rowIndex={i}
          onRunContextMenu={onRunContextMenu}
          onRunDragStart={beginDrag}
          draggingRunId={drag?.run.id ?? null}
          savingRunId={savingId}
        />
      ))}
    </div>
  );
}

function DiffMini({ runs }: { runs: { lane: string; start: number; end: number; sku: string; state: string; window?: string; note?: string; risk?: boolean }[] }) {
  return (
    <div className="space-y-2">
      {runs.map((r, i) => {
        const left = (r.start / TIMELINE_HOURS) * 100;
        const w = ((r.end - r.start) / TIMELINE_HOURS) * 100;
        const bg = r.state === "new" ? "border-dashed border-emerald-400 bg-emerald-500/10" : r.state === "moved" ? "border-blue-400 bg-blue-500/10" : "border-slate-700 bg-slate-800/40";
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-10 text-[10px] font-mono text-slate-500 shrink-0">{r.lane}</span>
              <div className="relative flex-1 h-6 rounded bg-slate-800/30">
                <div className={`absolute top-0 bottom-0 border-l-2 ${bg} rounded text-[10px] flex items-center px-1.5 gap-1`} style={{ left: `${left}%`, width: `${w}%` }}>
                  <span className="text-slate-200 truncate">{r.sku}</span>
                  {r.note && <span className="text-[9px] font-mono text-blue-300 ml-auto shrink-0">{r.note}</span>}
                </div>
              </div>
            </div>
            {r.window && (
              <div className="pl-12 text-[10px] font-mono text-slate-400 leading-snug">{r.window}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function skuLabel(skuId: string, productNames?: Map<string, string>): string {
  return productNames?.get(skuId) ?? SKUS.find(s => s.id === skuId)?.name ?? skuId.replace(/^sku-/, "").replace(/-/g, " ");
}

function diffRunToMini(run: BackendScheduleDiffRun, state: string, lane = "Line") {
  const start = new Date(run.start_at);
  const end = new Date(run.end_at);
  return {
    lane,
    start: start.getUTCHours() + start.getUTCMinutes() / 60,
    end: end.getUTCHours() + end.getUTCMinutes() / 60,
    sku: skuLabel(run.sku_id),
    state,
    window: formatScheduleWindow(run.start_at, run.end_at),
  };
}

function ScheduleProposalPanel({
  cardId,
  onApplied,
  onDismiss,
}: {
  cardId: string | null;
  onApplied: () => void;
  onDismiss: () => void;
}) {
  const [card, setCard] = useState<ActionCardData | null>(null);
  const [rawCardPayload, setRawCardPayload] = useState<Record<string, unknown> | null>(null);
  const [diff, setDiff] = useState<BackendScheduleDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [diffRes, cardRes] = await Promise.all([
        fetchScheduleDiff("current"),
        cardId ? fetchActionCard(cardId) : fetchPendingScheduleChangeCard(),
      ]);
      if (!diffRes) {
        setError("No schedule diff available. Ask copilot to optimize first.");
        setDiff(null);
      } else {
        setDiff(diffRes);
      }
      setCard(cardRes ? adaptActionCard(cardRes) : null);
      setRawCardPayload(cardRes?.payload ?? null);
    } catch {
      setError("Could not load agent proposal.");
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleConfirm = async (c: ActionCardData) => {
    if (!c.cardId) throw new Error("missing card id");
    const result = await confirmActionCard(c.cardId);
    if (!result) throw new Error("confirm failed");
    setCard(adaptActionCard(result));
    setRawCardPayload(result.payload ?? null);
    onApplied();
  };

  const handleReject = async (c: ActionCardData) => {
    if (!c.cardId) throw new Error("missing card id");
    const result = await rejectActionCard(c.cardId);
    if (!result) throw new Error("reject failed");
    setCard(adaptActionCard(result));
    onDismiss();
  };

  if (loading) {
    return (
      <div className="mt-5 rounded-lg border border-blue-500/30 bg-blue-500/[0.04] px-4 py-6 text-[13px] text-slate-400">
        Loading agent proposal…
      </div>
    );
  }

  if (error || !diff) {
    return (
      <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-4 text-[13px] text-slate-400">
        {error ?? "No proposal available."}{" "}
        Use <span className="text-slate-200">Ask copilot to optimise</span> to generate a plan and action card.
      </div>
    );
  }

  const beforeRuns = diff.before.map(r => diffRunToMini(r, "current"));
  const afterRuns = diff.after.map(r => diffRunToMini(r, "moved"));
  const changeSummary =
    String(rawCardPayload?.change_summary ?? "") ||
    diff.changes[0]?.narration ||
    card?.flags?.[0]?.text ||
    "SchedulerAgent proposal";
  const title = card?.title ?? changeSummary;

  return (
    <div className="mt-5 rounded-lg border border-blue-500/40 bg-blue-500/[0.04]">
      <div className="px-4 py-3 border-b border-blue-500/20 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-md bg-blue-500/15 text-blue-300 flex items-center justify-center shrink-0"><Icon name="diff" size={14}/></div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-blue-300 font-semibold">Agent proposal · SchedulerAgent</div>
            <div className="text-[14px] text-slate-100 font-medium">{title}</div>
          </div>
        </div>
        <Pill tone="blue" className="font-mono shrink-0">{card?.state === "confirmed" ? "applied" : card?.state ?? "pending"}</Pill>
      </div>
      <div className="px-4 py-3 border-b border-blue-500/20 bg-slate-900/20">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">What is changing</div>
        <p className="text-[13px] text-slate-200 leading-relaxed">{changeSummary}</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
          <div className="rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2">
            <div className="text-slate-500 mb-1">Before</div>
            <div className="text-slate-200">
              {String(
                rawCardPayload?.before_window
                ?? (diff.before[0]
                  ? formatScheduleWindow(diff.before[0].start_at, diff.before[0].end_at)
                  : "—"),
              )}
            </div>
            <div className="text-slate-400 mt-1">
              {String(
                rawCardPayload?.before_sku_name
                ?? (diff.before[0] ? skuLabel(diff.before[0].sku_id) : "—"),
              )}
            </div>
          </div>
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2">
            <div className="text-emerald-400/80 mb-1">After</div>
            <div className="text-slate-200">
              {String(
                rawCardPayload?.after_window
                ?? (diff.after[0]
                  ? formatScheduleWindow(diff.after[0].start_at, diff.after[0].end_at)
                  : "—"),
              )}
            </div>
            <div className="text-slate-400 mt-1">
              {String(
                rawCardPayload?.after_sku_name
                ?? (diff.after[0] ? skuLabel(diff.after[0].sku_id) : "—"),
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-800">
        <div className="bg-slate-900/30 p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Before · current</div>
          <DiffMini runs={beforeRuns}/>
        </div>
        <div className="bg-slate-900/30 p-4">
          <div className="text-[10px] uppercase tracking-wider text-emerald-300 mb-2">After · proposed</div>
          <DiffMini runs={afterRuns}/>
        </div>
      </div>
      {diff.changes.length > 0 && (
        <div className="p-4 border-t border-blue-500/20 space-y-2">
          {diff.changes.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-[12px]">
              <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-400"/>
              <span className="text-slate-200">{c.narration}</span>
            </div>
          ))}
        </div>
      )}
      {card ? (
        <div className="px-4 pb-4 border-t border-blue-500/20 pt-3">
          <div className="text-[11px] text-slate-400 mb-2">Review and confirm to apply this schedule change to the database.</div>
          <ActionCard card={card} onConfirm={handleConfirm} onReject={handleReject} />
        </div>
      ) : (
        <div className="px-4 pb-4 text-[12px] text-slate-500 border-t border-blue-500/20 pt-3">
          Waiting for action card from copilot…
        </div>
      )}
    </div>
  );
}

function AddScheduleModal({
  activeDate,
  defaultFacilityId,
  facilities,
  lines,
  products,
  onClose,
  onSuccess,
}: {
  activeDate: string;
  defaultFacilityId: string;
  facilities: BackendFacility[];
  lines: BackendProductionLine[];
  products: BackendProduct[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [facilityId, setFacilityId] = useState(defaultFacilityId || facilities[0]?.facility_id || "");
  const [lineId, setLineId] = useState("");
  const [skuId, setSkuId] = useState(products[0]?.sku_id || "");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [quantity, setQuantity] = useState("1000");
  const [status, setStatus] = useState<"approved" | "suggested">("approved");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const linesForFacility = useMemo(
    () => lines.filter(l => l.facility_id === facilityId),
    [lines, facilityId],
  );

  useEffect(() => {
    if (linesForFacility.length === 0) {
      setLineId("");
      return;
    }
    if (!linesForFacility.some(l => l.line_id === lineId)) {
      setLineId(linesForFacility[0].line_id);
    }
  }, [linesForFacility, lineId]);

  useEffect(() => {
    if (defaultFacilityId) setFacilityId(defaultFacilityId);
  }, [defaultFacilityId]);

  const handleSubmit = async () => {
    setError(null);
    if (!facilityId || !lineId || !skuId) {
      setError("Choose facility, line, and product.");
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity must be a positive number.");
      return;
    }
    const start_at = utcIsoFromDateAndTime(activeDate, startTime);
    const end_at = utcIsoFromDateAndTime(activeDate, endTime);
    if (new Date(end_at) <= new Date(start_at)) {
      setError("End time must be after start time.");
      return;
    }
    setSaving(true);
    const created = await createSchedule({
      facility_id: facilityId,
      line_id: lineId,
      sku_id: skuId,
      start_at,
      end_at,
      quantity_units: qty,
      status,
    });
    setSaving(false);
    if (!created) {
      setError("Could not save schedule run. Check backend is up and master data is seeded.");
      return;
    }
    onSuccess();
    onClose();
  };

  const inputCls =
    "w-full bg-slate-900 border border-slate-800 rounded-md px-2.5 py-2 text-[13px] text-slate-100 focus:outline-none focus:border-blue-500/60";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#0c111c] shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div>
            <div className="text-[14px] font-semibold text-slate-100">Add schedule run</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{formatDateLabel(activeDate)} · UTC times</div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">Facility</span>
            <select value={facilityId} onChange={e => setFacilityId(e.target.value)} className={`mt-1 ${inputCls}`}>
              {facilities.map(f => (
                <option key={f.facility_id} value={f.facility_id}>{f.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">Line</span>
            <select value={lineId} onChange={e => setLineId(e.target.value)} className={`mt-1 ${inputCls}`} disabled={linesForFacility.length === 0}>
              {linesForFacility.length === 0 ? (
                <option value="">No lines — run make schema.seed</option>
              ) : (
                linesForFacility.map(l => (
                  <option key={l.line_id} value={l.line_id}>{l.name}</option>
                ))
              )}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">Product (SKU)</span>
            <select value={skuId} onChange={e => setSkuId(e.target.value)} className={`mt-1 ${inputCls}`}>
              {products.map(p => (
                <option key={p.sku_id} value={p.sku_id}>{p.name}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">Start (UTC)</span>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={`mt-1 ${inputCls}`} />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">End (UTC)</span>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={`mt-1 ${inputCls}`} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">Quantity (units)</span>
              <input type="number" min={1} value={quantity} onChange={e => setQuantity(e.target.value)} className={`mt-1 ${inputCls}`} />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">Status</span>
              <select value={status} onChange={e => setStatus(e.target.value as "approved" | "suggested")} className={`mt-1 ${inputCls}`}>
                <option value="approved">Approved</option>
                <option value="suggested">Suggested</option>
              </select>
            </label>
          </div>
          {error && <p className="text-[12px] text-red-400">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-800">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-md border border-slate-700 text-slate-300 text-[13px] hover:border-slate-500">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || linesForFacility.length === 0 || !skuId}
            className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-[13px]"
          >
            {saving ? "Saving…" : "Add run"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WhatIfPanel({ onClose }: { onClose: () => void }) {
  const SimRun = ({ label, y, waste, cost, delta, active, risk }: { label: string; y: string; waste: string; cost: string; delta?: string; active?: boolean; risk?: boolean }) => (
    <div className={`rounded-md border p-2 flex items-center gap-2 ${active ? "border-purple-500/40 bg-purple-500/[0.06]" : risk ? "border-red-500/30 bg-red-500/[0.04]" : "border-slate-800 bg-slate-900/40"}`}>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-slate-100 truncate">{label}</div>
        <div className="text-[10px] font-mono text-slate-500 mt-0.5">y{y} · w{waste} · {cost}</div>
      </div>
      {delta && <span className={`text-[10px] font-mono ${risk ? "text-red-300" : "text-amber-300"}`}>{delta}</span>}
    </div>
  );
  return (
    <div className="fixed top-14 right-0 bottom-12 z-30 w-full sm:w-[420px] bg-[#0c111c] border-l border-slate-800 shadow-2xl flex flex-col">
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Icon name="spark" size={14} className="text-purple-400"/>
          <div className="text-[14px] font-semibold text-slate-100">What-if simulator</div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Icon name="x" size={16}/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {[
          { title: "Change retailer PO quantity", content: (
            <><select className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-[12px] text-slate-200"><option>Costco · SKU-BBM-12</option><option>Walmart · SKU-CCC-24</option></select><input defaultValue="16,800" className="w-full mt-2 bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-[12px] font-mono text-slate-100"/></>
          )},
          { title: "Remove a supplier lot", content: (
            <input placeholder="LOT-ID or ingredient" className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-[12px] font-mono text-slate-100"/>
          )},
          { title: "Block production line", content: (
            <div className="flex gap-2"><select className="flex-1 bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-[12px] text-slate-200"><option>P1-L2 · Plant 1 Line 2</option></select><input defaultValue="2h" className="w-16 bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-[12px] font-mono text-slate-100 text-right"/></div>
          )},
        ].map((b, i) => (
          <div key={i} className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">{b.title}</div>
            {b.content}
          </div>
        ))}
        <button className="w-full py-2.5 rounded-md bg-purple-600 hover:bg-purple-500 text-white font-semibold text-[13px] flex items-center justify-center gap-2">
          <Icon name="zap" size={14} className="text-white"/> Run simulation
        </button>
        <div className="pt-3 border-t border-slate-800">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Stack (compare runs)</div>
          <div className="space-y-1.5">
            <SimRun label="Baseline" y="96.2%" waste="$0" cost="$1.42M" active/>
            <SimRun label="+35% Costco" y="95.1%" waste="$420" cost="$1.46M" delta="+$36k"/>
            <SimRun label="+35% Costco · P1-L2 block 4h" y="93.4%" waste="$2,140" cost="$1.49M" delta="+$72k" risk/>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SchedulePage() {
  const {
    openChatContext,
    pendingScheduleCardId,
    setPendingScheduleCardId,
    showScheduleProposal,
    setShowScheduleProposal,
    scheduleRefreshKey,
    bumpScheduleRefresh,
  } = useApp();
  const [plant, setPlant] = useState("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [timelineZoomHours, setTimelineZoomHours] = useState<number>(TIMELINE_HOURS);
  const [timelineStartHour, setTimelineStartHour] = useState(0);
  const [runMenu, setRunMenu] = useState<RunMenuState>(null);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [facilities, setFacilities] = useState<BackendFacility[]>([]);
  const [productionLines, setProductionLines] = useState<BackendProductionLine[]>([]);
  const [products, setProducts] = useState<BackendProduct[]>([]);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const { data: backendSchedules, status: scheduleStatus } = useSchedules(scheduleRefreshKey);

  useEffect(() => {
    Promise.all([fetchFacilities(), fetchProductionLines(), fetchProducts()]).then(([f, l, p]) => {
      if (f) setFacilities(f);
      if (l) setProductionLines(l);
      if (p) setProducts(p);
    });
  }, [scheduleRefreshKey]);

  useEffect(() => {
    if (showScheduleProposal || pendingScheduleCardId) {
      setShowDiff(true);
    }
  }, [showScheduleProposal, pendingScheduleCardId]);

  const todayKey = useMemo(() => toDateKey(new Date()), []);

  const nowHour = useMemo(() => {
    const n = new Date();
    return n.getUTCHours() + n.getUTCMinutes() / 60;
  }, []);

  const allRuns = useMemo<ScheduledRun[]>(() => {
    if (scheduleStatus === "loading") return [];
    if (scheduleStatus === "fallback") return [];
    return backendSchedulesToRuns(backendSchedules);
  }, [backendSchedules, scheduleStatus]);

  const activeDate = selectedDate ?? todayKey;

  const quickDates = useMemo(
    () => quickDatesAround(activeDate),
    [activeDate],
  );

  const scheduledDates = useMemo(
    () => Array.from(new Set(allRuns.map(r => r.dateKey))).sort(),
    [allRuns],
  );

  const runCountByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of allRuns) counts[r.dateKey] = (counts[r.dateKey] ?? 0) + 1;
    return counts;
  }, [allRuns]);

  const isEmptyDate = (runCountByDate[activeDate] ?? 0) === 0;

  const runs = useMemo(() => {
    const forDate = allRuns.filter(r => r.dateKey === activeDate);
    return plant === "all" ? forDate : forDate.filter(r => r.plant === plant);
  }, [allRuns, activeDate, plant]);

  const lanes = useMemo(() => {
    const visiblePlants = new Set(
      plant === "all"
        ? [...new Set(productionLines.map(l => FACILITY_MAP[l.facility_id] ?? l.facility_id)), ...runs.map(r => r.plant)]
        : [plant],
    );
    const byKey: Record<string, GanttLaneModel> = {};

    productionLines.forEach(ln => {
      const plantId = FACILITY_MAP[ln.facility_id] ?? ln.facility_id;
      if (!visiblePlants.has(plantId)) return;
      const lineNum = lineNumberFromId(ln.line_id);
      const key = `${plantId}-L${lineNum}`;
      byKey[key] = { key, plant: plantId, line: lineNum, runs: [] };
    });

    runs.forEach(r => {
      const key = `${r.plant}-L${r.line}`;
      if (!byKey[key]) byKey[key] = { key, plant: r.plant, line: r.line, runs: [] };
      byKey[key].runs.push(r);
    });

    return Object.values(byKey).sort((a, b) => (a.plant + a.line).localeCompare(b.plant + b.line));
  }, [runs, plant, productionLines]);

  const defaultFacilityForAdd =
    plant !== "all" ? (PLANT_TO_FACILITY[plant] ?? facilities[0]?.facility_id ?? "") : facilities[0]?.facility_id ?? "";

  const handleRunContextMenu = useCallback((e: React.MouseEvent, run: ScheduledRun) => {
    e.preventDefault();
    e.stopPropagation();
    setRunMenu({ run, x: e.clientX, y: e.clientY });
  }, []);

  const handleDeleteRun = useCallback(async (run: ScheduledRun) => {
    const skuName = SKUS.find(s => s.id === run.sku)?.name ?? run.sku;
    if (!window.confirm(`Delete schedule run for ${skuName}?`)) return;
    setDeletingRunId(run.id);
    const ok = await deleteSchedule(run.id);
    setDeletingRunId(null);
    setRunMenu(null);
    if (ok) bumpScheduleRefresh();
    else window.alert("Could not delete schedule run.");
  }, [bumpScheduleRefresh]);

  const handleRunMove = useCallback(async (run: ScheduledRun, update: UpdateScheduleInput) => {
    const result = await updateSchedule(run.id, update);
    if (result) {
      bumpScheduleRefresh();
      return true;
    }
    window.alert("Could not update schedule run.");
    return false;
  }, [bumpScheduleRefresh]);

  const timelineZoomIndex = TIMELINE_ZOOM_STEPS.indexOf(
    timelineZoomHours as (typeof TIMELINE_ZOOM_STEPS)[number],
  );
  const canZoomIn = timelineZoomIndex >= 0 && timelineZoomIndex < TIMELINE_ZOOM_STEPS.length - 1;
  const canZoomOut = timelineZoomIndex > 0;
  const canPanTimeline = timelineZoomHours < TIMELINE_HOURS;
  const timelinePanStep = Math.max(1, Math.floor(timelineZoomHours / 4));

  const zoomTimeline = useCallback((direction: "in" | "out") => {
    const idx = TIMELINE_ZOOM_STEPS.indexOf(
      timelineZoomHours as (typeof TIMELINE_ZOOM_STEPS)[number],
    );
    const safeIdx = idx >= 0 ? idx : 0;
    const nextIdx = direction === "in" ? safeIdx + 1 : safeIdx - 1;
    if (nextIdx < 0 || nextIdx >= TIMELINE_ZOOM_STEPS.length) return;
    const nextZoom = TIMELINE_ZOOM_STEPS[nextIdx];
    const center = timelineStartHour + timelineZoomHours / 2;
    setTimelineZoomHours(nextZoom);
    setTimelineStartHour(clampViewportStart(center - nextZoom / 2, nextZoom));
  }, [timelineStartHour, timelineZoomHours]);

  const panTimeline = useCallback((deltaHours: number) => {
    setTimelineStartHour(prev => clampViewportStart(prev + deltaHours, timelineZoomHours));
  }, [timelineZoomHours]);

  const resetTimelineZoom = useCallback(() => {
    setTimelineZoomHours(TIMELINE_HOURS);
    setTimelineStartHour(0);
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1600px] mx-auto">
        <SectionHeader
          title="Schedule"
          sub="Production runs across all plants · drag runs to reschedule · changeovers minimized by OR-Tools"
          right={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-semibold flex items-center gap-2"
              >
                <Icon name="calendar" size={13} className="text-white" /> Add run
              </button>
              <button onClick={() => openChatContext("Schedule · optimise")} className="px-3 py-1.5 rounded-md border border-slate-700 hover:border-blue-500 text-[12px] text-slate-200 flex items-center gap-2">
                <Icon name="chat" size={13}/> Ask copilot to optimise
              </button>
              <button onClick={() => setWhatIfOpen(o => !o)} className={`px-3 py-1.5 rounded-md text-[12px] flex items-center gap-2 ${whatIfOpen ? "bg-purple-500/15 text-purple-200 border border-purple-500/40" : "border border-slate-700 hover:border-blue-500 text-slate-200"}`}>
                <Icon name="spark" size={13}/> Run what-if
              </button>
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-1 p-0.5 rounded-md border border-slate-800 bg-slate-900/40 overflow-x-auto">
            {[{ id: "all", label: "All" }, ...FACILITIES.filter(f => f.id !== "all").map(f => ({ id: f.id, label: f.name }))].map(t => (
              <button key={t.id} onClick={() => setPlant(t.id)} className={`px-2.5 py-1 rounded-md text-[12px] whitespace-nowrap ${plant === t.id ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>{t.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 p-0.5 rounded-md border border-slate-800 bg-slate-900/40 overflow-x-auto">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => setSelectedDate(shiftDateKey(activeDate, -1))}
              className="px-2 py-1 rounded-md text-[14px] leading-none text-slate-400 hover:text-slate-200"
            >
              ‹
            </button>
            {quickDates.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDate(d)}
                className={`px-2.5 py-1 rounded-md text-[12px] whitespace-nowrap flex items-center gap-1.5 ${
                  activeDate === d ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>{formatDateLabel(d)}</span>
                {d === todayKey && <span className="text-[9px] uppercase tracking-wide text-blue-300">today</span>}
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">{runCountByDate[d] ?? 0}</span>
              </button>
            ))}
            <button
              type="button"
              aria-label="Next day"
              onClick={() => setSelectedDate(shiftDateKey(activeDate, 1))}
              className="px-2 py-1 rounded-md text-[14px] leading-none text-slate-400 hover:text-slate-200"
            >
              ›
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSelectedDate(todayKey)}
            className={`px-2.5 py-1 rounded-md border text-[12px] whitespace-nowrap ${
              activeDate === todayKey
                ? "border-blue-500/40 bg-blue-500/15 text-blue-200"
                : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600 hover:text-slate-100"
            }`}
          >
            Today
          </button>
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${
              isEmptyDate ? "border-blue-500/40 bg-blue-500/[0.06]" : "border-slate-800 bg-slate-900/40"
            }`}
          >
            <button
              type="button"
              aria-label="Open calendar"
              onClick={() => dateInputRef.current?.showPicker?.()}
              className="text-slate-400 hover:text-slate-200"
            >
              <Icon name="calendar" size={13}/>
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={activeDate}
              onChange={e => e.target.value && setSelectedDate(e.target.value)}
              className="bg-transparent text-[12px] font-mono text-slate-200 focus:outline-none [color-scheme:dark] w-[7.5rem] cursor-pointer"
              aria-label="Pick schedule date"
            />
          </div>
          <div className="text-[11px] font-mono text-slate-500 hidden md:block">
            {runs.length} run{runs.length === 1 ? "" : "s"} on {formatDateLabel(activeDate)}
            {isEmptyDate ? " · no runs" : ""}
            {plant !== "all" ? ` · ${FACILITIES.find(f => f.id === plant)?.name ?? plant}` : ""}
          </div>
          <div className="flex-1"/>
          <div className="flex items-center gap-1 p-0.5 rounded-md border border-slate-800 bg-slate-900/40">
            <button
              type="button"
              aria-label="Zoom out timeline"
              disabled={!canZoomOut}
              onClick={() => zoomTimeline("out")}
              className="px-2 py-1 rounded-md text-[14px] leading-none text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400"
            >
              −
            </button>
            <span
              className="px-1.5 text-[11px] font-mono text-slate-400 tabular-nums min-w-[6.5rem] text-center"
              title={`Showing ${timelineZoomHours} hour window`}
            >
              {formatViewportRange(timelineStartHour, timelineZoomHours)}
            </span>
            <button
              type="button"
              aria-label="Zoom in timeline"
              disabled={!canZoomIn}
              onClick={() => zoomTimeline("in")}
              className="px-2 py-1 rounded-md text-[14px] leading-none text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400"
            >
              +
            </button>
            {canPanTimeline && (
              <>
                <span className="w-px h-4 bg-slate-700" aria-hidden />
                <button
                  type="button"
                  aria-label="Pan timeline earlier"
                  disabled={timelineStartHour <= 0}
                  onClick={() => panTimeline(-timelinePanStep)}
                  className="px-2 py-1 rounded-md text-[14px] leading-none text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Pan timeline later"
                  disabled={timelineStartHour + timelineZoomHours >= TIMELINE_HOURS}
                  onClick={() => panTimeline(timelinePanStep)}
                  className="px-2 py-1 rounded-md text-[14px] leading-none text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400"
                >
                  ›
                </button>
              </>
            )}
            {timelineZoomHours < TIMELINE_HOURS && (
              <button
                type="button"
                onClick={resetTimelineZoom}
                className="ml-0.5 px-2 py-1 rounded-md text-[11px] text-slate-400 hover:text-slate-200 whitespace-nowrap"
              >
                Full day
              </button>
            )}
          </div>
          <button onClick={() => setShowDiff(d => !d)} className={`px-2.5 py-1 rounded-md text-[12px] flex items-center gap-1.5 whitespace-nowrap ${showDiff ? "bg-blue-500/15 text-blue-200 border border-blue-500/40" : "border border-slate-700 text-slate-300 hover:border-blue-500"}`}>
            <Icon name="diff" size={12}/> {showDiff ? "Hide" : "Show"} agent proposal
          </button>
        </div>

        {scheduleStatus === "loading" && (
          <div className="mb-3 px-3 py-2 rounded-md border border-slate-800 bg-slate-900/40 text-[12px] text-slate-400">
            Loading schedules from API…
          </div>
        )}

        {scheduleStatus === "fallback" && (
          <div className="mb-3 px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] text-[12px] text-amber-200/90">
            Could not reach the schedule API. Add runs once the backend is available, or seed data with{" "}
            <span className="font-mono text-amber-100">make schema.seed</span>.
          </div>
        )}

        {scheduleStatus === "live" && allRuns.length === 0 && (
          <div className="mb-3 px-3 py-2 rounded-md border border-blue-500/30 bg-blue-500/[0.06] text-[12px] text-slate-300">
            No schedule runs in the database yet. Use <span className="text-slate-100 font-medium">Add run</span> to
            plan production manually, or ask copilot to optimize.
          </div>
        )}

        {runs.length === 0 && allRuns.length > 0 && (
          <div className="mb-3 px-3 py-2 rounded-md border border-slate-800 bg-slate-900/40 text-[12px] text-slate-400">
            No production runs scheduled for {formatDateLabel(activeDate)}.
            {scheduledDates.length > 0 && (
              <> Days with runs: {scheduledDates.map(d => formatDateLabel(d)).join(", ")}.</>
            )}
          </div>
        )}

        {lanes.length === 0 && scheduleStatus === "live" && (
          <div className="mb-3 px-3 py-2 rounded-md border border-slate-800 bg-slate-900/40 text-[12px] text-slate-400">
            No production lines found. Run <span className="font-mono text-slate-300">make schema.seed</span> to load facilities and lines.
          </div>
        )}

        {lanes.length > 0 && (
        <div className="rounded-xl border border-[var(--bp-border-soft)] bg-[var(--bp-surface-soft)] shadow-sm overflow-hidden ring-1 ring-white/[0.03]">
          <div className="flex min-w-0">
            <div className="w-44 shrink-0 border-r border-[var(--bp-border-soft)] bg-[var(--bp-surface-soft)]">
              <div
                className={`flex items-center justify-center text-center px-3 uppercase tracking-wide ${GANTT_HEADER}`}
                style={{ height: GANTT_HEADER_H }}
              >
                Line
              </div>
              {lanes.map((ln, i) => (
                <div
                  key={ln.key}
                  className={`flex items-center px-3 border-b border-[var(--bp-border-soft)] ${laneRowBg(i)}`}
                  style={{ height: LANE_H }}
                >
                  <span className={GANTT_ROW_LABEL}>
                    {FACILITIES.find(f => f.id === ln.plant)?.name || ln.plant}{" "}
                    <span className="font-mono text-[var(--bp-text-muted)]">L{ln.line}</span>
                  </span>
                </div>
              ))}
            </div>
            <GanttTimeline
              lanes={lanes}
              viewportStart={timelineStartHour}
              viewportHours={timelineZoomHours}
              nowHour={nowHour}
              showNowLine={activeDate === todayKey}
              productionLines={productionLines}
              onRunContextMenu={handleRunContextMenu}
              onRunMove={handleRunMove}
            />
          </div>
        </div>
        )}

        {showDiff && (
          <ScheduleProposalPanel
            cardId={pendingScheduleCardId}
            onApplied={() => {
              bumpScheduleRefresh();
              setPendingScheduleCardId(null);
              setShowScheduleProposal(false);
            }}
            onDismiss={() => {
              setPendingScheduleCardId(null);
              setShowScheduleProposal(false);
            }}
          />
        )}
        {whatIfOpen && <WhatIfPanel onClose={() => setWhatIfOpen(false)}/>}
        {addOpen && (
          <AddScheduleModal
            activeDate={activeDate}
            defaultFacilityId={defaultFacilityForAdd}
            facilities={facilities}
            lines={productionLines}
            products={products}
            onClose={() => setAddOpen(false)}
            onSuccess={() => bumpScheduleRefresh()}
          />
        )}
        <RunContextMenu
          menu={runMenu}
          onClose={() => setRunMenu(null)}
          onDelete={handleDeleteRun}
          deletingId={deletingRunId}
        />
      </div>
    </div>
  );
}
