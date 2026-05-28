"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SectionHeader } from "../../components/atoms";
import { RetailerOrdersPanel } from "../../components/RetailerOrdersPanel";
import { fetchProducts, type BackendProduct } from "../../lib/api";
import { useApp } from "../../lib/context";

function RetailersPageInner() {
  const { t, scheduleRefreshKey, bumpScheduleRefresh } = useApp();
  const searchParams = useSearchParams();
  const initialSkuId = searchParams.get("sku_id") ?? undefined;
  const [products, setProducts] = useState<BackendProduct[]>([]);

  useEffect(() => {
    fetchProducts().then(res => {
      if (res) setProducts(res);
    });
  }, [scheduleRefreshKey]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[960px] mx-auto">
        <SectionHeader
          title={t("retailers.title")}
          sub={t("retailers.subtitle")}
        />
        <RetailerOrdersPanel
          products={products}
          initialSkuId={initialSkuId}
          onCreated={bumpScheduleRefresh}
        />
      </div>
    </div>
  );
}

export default function RetailersPage() {
  return (
    <Suspense fallback={<div className="h-full bg-[#0a0d14]" />}>
      <RetailersPageInner />
    </Suspense>
  );
}
