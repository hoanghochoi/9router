"use client";

import { useEffect, useState } from "react";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getModelsByProviderId } from "@/shared/constants/models";
import ModelAccountPoolsCard from "../providers/[id]/ModelAccountPoolsCard";

export default function ModelAccountPoolsPage() {
  const [connections, setConnections] = useState([]);
  const [providerId, setProviderId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/providers", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Không thể tải danh sách account.");
      return response.json();
    }).then((data) => {
      const rows = data.connections || [];
      setConnections(rows);
      setProviderId(rows[0]?.provider || "");
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  const providers = [...new Set(connections.map((connection) => connection.provider))];
  return <div className="flex flex-col gap-4">
    <p className="text-sm text-text-muted">Chọn provider, model và các account ưu tiên. Khi pool hết account khả dụng, router tự fallback sang account khác cùng provider.</p>
    {loading ? <p>Đang tải...</p> : error ? <p role="alert">{error}</p> : providers.length === 0 ? <p>Thêm connection trong Providers trước khi cấu hình.</p> : <>
      <label className="flex flex-col gap-2 text-sm">Provider
        <select className="rounded-md border border-border bg-background px-3 py-2" value={providerId} onChange={(event) => setProviderId(event.target.value)}>
          {providers.map((id) => <option key={id} value={id}>{AI_PROVIDERS[id]?.name || id}</option>)}
        </select>
      </label>
      <ModelAccountPoolsCard key={providerId} providerId={providerId} models={getModelsByProviderId(providerId)} connections={connections.filter((connection) => connection.provider === providerId)} />
    </>}
  </div>;
}
