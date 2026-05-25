// React hooks that fetch from the backend and fall back to static seed data
// when the backend is unreachable. The fallback ensures the UI continues to
// render even with `NEXT_PUBLIC_BACKEND_URL` unset or the backend down.

"use client";

import { useEffect, useState } from "react";

import {
  fetchDisruptions,
  fetchEsgCounter,
  fetchLots,
  fetchSuppliers,
  openEventStream,
  type LiveEvent,
} from "./api";
import {
  DISRUPTIONS,
  KPIS,
  LOTS,
  SUPPLIERS,
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
  return useBackend(fetchLots, LOTS);
}

export function useSuppliers(): Result<Supplier[]> {
  return useBackend(fetchSuppliers, SUPPLIERS);
}

export function useDisruptions(): Result<Disruption[]> {
  return useBackend(fetchDisruptions, DISRUPTIONS);
}

export function useEsgCounter(): Result<Partial<Kpis>> {
  return useBackend(
    fetchEsgCounter,
    { wasteAvoided: KPIS.wasteAvoided, co2eSaved: KPIS.co2eSaved },
  );
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
