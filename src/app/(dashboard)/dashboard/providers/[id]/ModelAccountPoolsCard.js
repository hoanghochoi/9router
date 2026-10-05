"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "@/shared/components";

export default function ModelAccountPoolsCard({ providerId, models = [], connections = [] }) {
  const [settings, setSettings] = useState({});
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const modelOptions = useMemo(() => [...new Map(models.filter((m) => m?.id).map((m) => [m.id, m])).values()], [models]);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()).then((data) => {
      setSettings(data || {});
      const pools = data?.modelAccountPools || {};
      const first = Object.keys(pools).find((key) => key.startsWith(`${providerId}/`));
      if (first) {
        const model = first.slice(providerId.length + 1);
        setSelectedModel(model);
        setSelectedIds(Array.isArray(pools[first]) ? pools[first] : []);
      }
    }).catch(() => {});
  }, [providerId]);

  useEffect(() => {
    const key = `${providerId}/${selectedModel}`;
    const ids = settings.modelAccountPools?.[key];
    setSelectedIds(Array.isArray(ids) ? ids : []);
  }, [providerId, selectedModel, settings.modelAccountPools]);

  const save = async () => {
    if (!selectedModel) return;
    setSaving(true);
    setMessage("");
    const key = `${providerId}/${selectedModel}`;
    const pools = { ...(settings.modelAccountPools || {}) };
    if (selectedIds.length) pools[key] = selectedIds;
    else delete pools[key];
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelAccountPools: pools }) });
      if (!res.ok) throw new Error("save failed");
      const next = await res.json();
      setSettings(next);
      setMessage(selectedIds.length ? "Đã lưu account pool." : "Đã xóa pool, router sẽ dùng account mặc định.");
    } catch { setMessage("Không thể lưu cấu hình."); }
    finally { setSaving(false); }
  };

  const toggle = (id) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  return (
    <Card>
      <div className="mb-3">
        <h2 className="text-lg font-semibold">Model Account Pool</h2>
        <p className="mt-1 text-xs text-text-muted">Ưu tiên account đã chọn cho model. Nếu tất cả đều bận hoặc bị khóa, router sẽ fallback sang account khác của provider.</p>
      </div>
      {modelOptions.length === 0 || connections.length === 0 ? (
        <p className="text-sm text-text-muted">Cần có model và connection để cấu hình.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
            <option value="">Chọn model...</option>
            {modelOptions.map((m) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
          </select>
          {selectedModel && <div className="grid gap-2 sm:grid-cols-2">
            {connections.map((connection) => <label key={connection.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <input type="checkbox" checked={selectedIds.includes(connection.id)} onChange={() => toggle(connection.id)} />
              <span className="truncate">{connection.displayName || connection.name || connection.email || connection.id}</span>
            </label>)}
          </div>}
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={save} disabled={!selectedModel || saving}>{saving ? "Đang lưu..." : "Lưu account pool"}</Button>
            {message && <span className="text-xs text-text-muted">{message}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}
