// React hooks that fetch from the backend and fall back to static seed data
// when the backend is unreachable. The fallback ensures the UI continues to
// render even with `NEXT_PUBLIC_BACKEND_URL` unset or the backend down.

"use client";

import { useEffect, useRef, useState } from "react";

import {
  fetchActiveRuns,
  fetchDashboardLoops,
  fetchDashboardNetwork,
  fetchDisruptions,
  fetchEsgCounter,
  fetchEsgPatterns,
  fetchFacilities,
  fetchFacilityUtilization,
  fetchIngredients,
  fetchLotSubstitutions,
  fetchLotUsedIn,
  fetchLots,
  fetchNegotiations,
  fetchOrders,
  fetchRetailers,
  fetchSchedules,
  fetchScorecardSummary,
  fetchSupplierPerformance,
  fetchSuppliers,
  fetchWasteEvents,
  fetchYieldTelemetry,
  fetchDemandForecasts,
  openEventStream,
  type BackendActiveRun,
  type BackendEsgPattern,
  type BackendFacility,
  type BackendFacilityUtilization,
  type BackendIngredient,
  type BackendLoopCard,
  type BackendNetworkSummary,
  type BackendNegotiationDraft,
  type BackendFormulaUsage,
  type BackendOrder,
  type BackendRetailer,
  type BackendSchedule,
  type BackendScorecardSummary,
  type BackendSubstitutionCandidate,
  type BackendSupplierPerformance,
  type BackendWasteEvent,
  type BackendYieldTelemetryPoint,
  type LiveEvent,
} from "./api";
import {
  type DemandForecast,
  type Disruption,
  type Kpis,
  type Lot,
  type Supplier,
} from "./data";

export type BackendStatus = "loading" | "live" | "fallback";

interface Result<T> {
  data: T;
  status: BackendStatus;
}

function useBackend<T>(
  fetcher: () => Promise<T | null>,
  fallback: T,
): Result<T> {
  const [data, setData] = useState<T>(fallback);
  const [status, setStatus] = useState<BackendStatus>("loading");

  useEffect(() => {
    let alive = true;
    fetcher().then((res) => {
      if (!alive) return;
      if (res !== null) {
        setData(res);
        setStatus("live");
      } else {
        setStatus("fallback");
      }
    });
    return () => {
      alive = false;
    };
    // fetcher is expected to be stable per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, status };
}

export function useLots(): Result<Lot[]> {
  return useBackend(fetchLots, []);
}

export function useSuppliers(): Result<Supplier[]> {
  return useBackend(fetchSuppliers, []);
}

export function useDisruptions(): Result<Disruption[]> {
  return useBackend(fetchDisruptions, []);
}

const NEWS_FEED_POLL_MS = 45_000;
const NEWS_FEED_MAX_ITEMS = 24;

/** Poll disruption_signals for news rows; surface only IDs not seen at first poll. */
export function useNewsDisruptionFeed(): Result<Disruption[]> {
  const [feed, setFeed] = useState<Disruption[]>([]);
  const [status, setStatus] = useState<BackendStatus>("loading");
  const seenRef = useRef<Set<string>>(new Set());
  const baselineRef = useRef(false);

  useEffect(() => {
    let alive = true;

    const poll = async () => {
      const rows = await fetchDisruptions({
        kinds: "news",
        includeUnscoped: true,
        sinceDays: 14,
        limit: 100,
      });
      if (!alive) return;
      if (!rows) {
        if (!baselineRef.current) setStatus("fallback");
        return;
      }

      setStatus("live");

      if (!baselineRef.current) {
        rows.forEach(r => seenRef.current.add(r.id));
        baselineRef.current = true;
        return;
      }

      const fresh = rows.filter(r => !seenRef.current.has(r.id));
      if (fresh.length === 0) return;

      fresh.forEach(r => seenRef.current.add(r.id));
      setFeed(prev => [...fresh, ...prev].slice(0, NEWS_FEED_MAX_ITEMS));
    };

    poll();
    const id = window.setInterval(poll, NEWS_FEED_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return { data: feed, status };
}

export function useEsgCounter(): Result<Partial<Kpis>> {
  return useBackend(fetchEsgCounter, {});
}

export function useSchedules(refreshKey = 0): Result<BackendSchedule[]> {
  const [data, setData] = useState<BackendSchedule[]>([]);
  const [status, setStatus] = useState<BackendStatus>("loading");

  useEffect(() => {
    let alive = true;
    fetchSchedules().then((res) => {
      if (!alive) return;
      if (res !== null) {
        setData(res);
        setStatus("live");
      } else {
        setStatus("fallback");
      }
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return { data, status };
}

export function useEsgPatterns(): Result<BackendEsgPattern[]> {
  return useBackend(fetchEsgPatterns, []);
}

/** Fetch substitution candidates for a specific lot. Re-fetches when lotId changes. */
export function useLotSubstitutions(lotId: string | null): {
  data: BackendSubstitutionCandidate[];
  status: BackendStatus;
} {
  const [data, setData] = useState<BackendSubstitutionCandidate[]>([]);
  const [status, setStatus] = useState<BackendStatus>("loading");

  useEffect(() => {
    if (!lotId) return;
    setStatus("loading");
    setData([]);
    let alive = true;
    fetchLotSubstitutions(lotId).then((res) => {
      if (!alive) return;
      if (res !== null) {
        setData(res);
        setStatus("live");
      } else {
        setStatus("fallback");
      }
    });
    return () => { alive = false; };
  }, [lotId]);

  return { data, status };
}

/** Fetch products/recipes that use this lot's ingredient. Re-fetches when lotId changes. */
export function useLotUsedIn(lotId: string | null): {
  data: BackendFormulaUsage[];
  status: BackendStatus;
} {
  const [data, setData] = useState<BackendFormulaUsage[]>([]);
  const [status, setStatus] = useState<BackendStatus>("loading");

  useEffect(() => {
    if (!lotId) return;
    setStatus("loading");
    setData([]);
    let alive = true;
    fetchLotUsedIn(lotId).then((res) => {
      if (!alive) return;
      if (res !== null) {
        setData(res);
        setStatus("live");
      } else {
        setStatus("fallback");
      }
    });
    return () => { alive = false; };
  }, [lotId]);

  return { data, status };
}

/** Fetch supplier orders filtered by frontend supplier id (e.g. "s-northstar_mills"). */
export function useSupplierOrders(supplierId: string | null): {
  data: BackendOrder[];
  status: BackendStatus;
  refetch: () => void;
} {
  const [data, setData] = useState<BackendOrder[]>([]);
  const [status, setStatus] = useState<BackendStatus>("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!supplierId) return;
    setStatus("loading");
    setData([]);
    let alive = true;
    fetchOrders(supplierId).then((res) => {
      if (!alive) return;
      if (res !== null) {
        setData(res);
        setStatus("live");
      } else {
        setStatus("fallback");
      }
    });
    return () => { alive = false; };
  }, [supplierId, tick]);

  return { data, status, refetch: () => setTick((t) => t + 1) };
}

/** All supplier orders from the backend (for FlowSight inbound arcs). */
export function useAllSupplierOrders(): Result<BackendOrder[]> {
  return useBackend(() => fetchOrders(), []);
}

export function useWasteEvents(facilityId?: string): Result<BackendWasteEvent[]> {
  return useBackend(() => fetchWasteEvents(facilityId), []);
}

export function useYieldTelemetry(lineId?: string): Result<BackendYieldTelemetryPoint[]> {
  return useBackend(() => fetchYieldTelemetry(lineId), []);
}

export function useDemandForecasts(skuId?: string, days = 14): Result<DemandForecast[]> {
  return useBackend(() => fetchDemandForecasts(skuId, days), []);
}

export function useFacilities(): Result<BackendFacility[]> {
  return useBackend(fetchFacilities, []);
}

export function useFacilityUtilization(
  facilityId: string | null,
): { data: BackendFacilityUtilization | null; status: BackendStatus } {
  const [data, setData] = useState<BackendFacilityUtilization | null>(null);
  const [status, setStatus] = useState<BackendStatus>("loading");
  useEffect(() => {
    if (!facilityId) return;
    setStatus("loading");
    setData(null);
    let alive = true;
    fetchFacilityUtilization(facilityId).then((res) => {
      if (!alive) return;
      if (res) {
        setData(res);
        setStatus("live");
      } else {
        setStatus("fallback");
      }
    });
    return () => { alive = false; };
  }, [facilityId]);
  return { data, status };
}

export function useActiveRuns(
  facilityId: string | null,
): { data: BackendActiveRun[]; status: BackendStatus } {
  const [data, setData] = useState<BackendActiveRun[]>([]);
  const [status, setStatus] = useState<BackendStatus>("loading");
  useEffect(() => {
    if (!facilityId) return;
    setStatus("loading");
    setData([]);
    let alive = true;
    fetchActiveRuns(facilityId).then((res) => {
      if (!alive) return;
      if (res) {
        setData(res);
        setStatus("live");
      } else {
        setStatus("fallback");
      }
    });
    return () => { alive = false; };
  }, [facilityId]);
  return { data, status };
}

export function useRetailers(): Result<BackendRetailer[]> {
  return useBackend(fetchRetailers, []);
}

export function useDashboardLoops(): Result<BackendLoopCard[]> {
  return useBackend(fetchDashboardLoops, []);
}

export function useDashboardNetwork(): Result<BackendNetworkSummary | null> {
  return useBackend(fetchDashboardNetwork, null);
}

export function useScorecardSummary(): Result<BackendScorecardSummary | null> & { refetch: () => void } {
  const [data, setData] = useState<BackendScorecardSummary | null>(null);
  const [status, setStatus] = useState<BackendStatus>("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchScorecardSummary().then((res) => {
      if (!alive) return;
      if (res !== null) { setData(res); setStatus("live"); }
      else { setStatus("fallback"); }
    });
    return () => { alive = false; };
  }, [tick]);

  return { data, status, refetch: () => setTick((t) => t + 1) };
}

export function useSupplierPerformance(
  supplierId: string | null,
): { data: BackendSupplierPerformance | null; status: BackendStatus } {
  const [data, setData] = useState<BackendSupplierPerformance | null>(null);
  const [status, setStatus] = useState<BackendStatus>("loading");
  useEffect(() => {
    if (!supplierId) return;
    setStatus("loading");
    setData(null);
    let alive = true;
    fetchSupplierPerformance(supplierId).then((res) => {
      if (!alive) return;
      if (res) {
        setData(res);
        setStatus("live");
      } else {
        setStatus("fallback");
      }
    });
    return () => { alive = false; };
  }, [supplierId]);
  return { data, status };
}

export function useIngredients(): Result<BackendIngredient[]> {
  return useBackend(fetchIngredients, []);
}

/** Fetch negotiation drafts, optionally filtered by frontend supplier id. */
export function useNegotiationsBySupplier(supplierId: string | null): {
  data: BackendNegotiationDraft[];
  status: BackendStatus;
  refetch: () => void;
} {
  const [data, setData] = useState<BackendNegotiationDraft[]>([]);
  const [status, setStatus] = useState<BackendStatus>("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!supplierId) return;
    setStatus("loading");
    setData([]);
    let alive = true;
    fetchNegotiations(supplierId, "pending").then((res) => {
      if (!alive) return;
      if (res !== null) {
        setData(res);
        setStatus("live");
      } else {
        setStatus("fallback");
      }
    });
    return () => { alive = false; };
  }, [supplierId, tick]);

  const refetch = () => setTick((t) => t + 1);
  return { data, status, refetch };
}

/** Subscribe to the FlowSight live event stream. Callback fires per event. */
export function useEventStream(onEvent: (e: LiveEvent) => void): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>("loading");
  useEffect(() => {
    let healthy = false;
    const close = openEventStream(
      (e) => {
        if (!healthy) {
          healthy = true;
          setStatus("live");
        }
        onEvent(e);
      },
      () => {
        if (!healthy) setStatus("fallback");
      },
    );
    return close;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return status;
}
