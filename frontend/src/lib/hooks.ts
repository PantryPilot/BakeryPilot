// React hooks that fetch from the backend and fall back to static seed data
// when the backend is unreachable. The fallback ensures the UI continues to
// render even with `NEXT_PUBLIC_BACKEND_URL` unset or the backend down.

"use client";

import { useEffect, useState } from "react";

import {
  fetchDisruptions,
  fetchEsgCounter,
  fetchEsgPatterns,
  fetchLotSubstitutions,
  fetchLots,
  fetchOrders,
  fetchSchedules,
  fetchSuppliers,
  fetchWasteEvents,
  fetchYieldTelemetry,
  fetchDemandForecasts,
  openEventStream,
  type BackendEsgPattern,
  type BackendOrder,
  type BackendSchedule,
  type BackendSubstitutionCandidate,
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

export function useEsgCounter(): Result<Partial<Kpis>> {
  return useBackend(fetchEsgCounter, {});
}

export function useSchedules(): Result<BackendSchedule[]> {
  return useBackend(fetchSchedules, []);
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

/** Fetch supplier orders filtered by frontend supplier id (e.g. "s-northstar_mills"). */
export function useSupplierOrders(supplierId: string | null): {
  data: BackendOrder[];
  status: BackendStatus;
} {
  const [data, setData] = useState<BackendOrder[]>([]);
  const [status, setStatus] = useState<BackendStatus>("loading");

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
  }, [supplierId]);

  return { data, status };
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
