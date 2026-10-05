"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "@/shared/components";

export default function ModelAccountPoolsCard({ providerId, models = [], connections = [] }) {
  const [settings, setSettings] = useState({});
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedPlans, setSelectedPlans] = useState([]);
  const [blockedModels, setBlockedModels] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const modelOptions = useMemo(() => [...new Map(models.filter((m) => m?.id).map((m) => [m.id, m])).values()], [models]);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()).then((data) => {
      setSettings(data || {});
      setBlockedModels(Object.fromEntries(Object.entries(data?.modelAccountBlocks || {}).map(([id, values]) => [id, Array.isArray(values) ? values.join("\n") : ""])));
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
    const entries = Array.isArray(ids) ? ids : [];
    setSelectedPlans(entries.filter((id) => id.startsWith("plan:")).map((id) => id.slice(5)));
    setSelectedIds(entries.filter((id) => !id.startsWith("plan:")));
  }, [providerId, selectedModel, settings.modelAccountPools]);

  const save = async () => {
    if (!selectedModel) return;
    setSaving(true);
    setMessage("");
    const key = `${providerId}/${selectedModel}`;
    const pools = { ...(settings.modelAccountPools || {}) };
    const entries = [...selectedIds, ...selectedPlans.map((plan) => `plan:${plan}`)];
    if (entries.length) pools[key] = entries;
    else delete pools[key];
    const blocks = Object.fromEntries(Object.entries(blockedModels).map(([id, text]) => [id, String(text).split(/\r?\n/).map((v) => v.trim()).filter(Boolean)]).filter(([, values]) => values.length));
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelAccountPools: pools, modelAccountBlocks: blocks }) });
      if (!res.ok) throw new Error("save failed");
      const next = await res.json();
      setSettings(next);
      setMessage("Đã lưu rule chặn model theo account/plan.");
    } catch { setMessage("Không thể lưu cấu hình."); }
    finally { setSaving(false); }
  };

  const toggle = (id) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const plans = ["free", "plus", "pro", "team", "business", "enterprise", "unknown"];
  const togglePlan = (plan) => setSelectedPlans((prev) => prev.includes(plan) ? prev.filter((x) => x !== plan) : [...prev, plan]);
  const getPlan = (connection) => {
    const value = connection.providerSpecificData?.chatgptPlanType || connection.providerSpecificData?.planType || connection.providerSpecificData?.plan;
    return value ? String(value).toUpperCase() : "UNKNOWN";
  };

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
          {selectedModel && <>
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3"><p className="mb-2 text-xs font-medium">Ưu tiên theo plan (áp dụng cho mọi account cùng plan)</p><div className="flex flex-wrap gap-2">{plans.map((plan) => <label key={plan} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"><input type="checkbox" checked={selectedPlans.includes(plan)} onChange={() => togglePlan(plan)} />{plan.toUpperCase()}</label>)}</div></div>
          <div className="grid gap-2 sm:grid-cols-2">
            {connections.map((connection) => <div key={connection.id} className="rounded-md border border-border px-3 py-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={selectedIds.includes(connection.id)} onChange={() => toggle(connection.id)} /><span className="flex min-w-0 items-center gap-2"><span className="truncate">{connection.displayName || connection.name || connection.email || connection.id}</span><span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{getPlan(connection)}</span></span></label><textarea value={blockedModels[connection.id] || ""} onChange={(e) => setBlockedModels((prev) => ({ ...prev, [connection.id]: e.target.value }))} placeholder="Model bị chặn, mỗi dòng một rule\ngpt-6.0-luna\ngpt-5.*" className="mt-2 min-h-16 w-full rounded border border-border bg-background p-2 text-xs" /></div>)}
          </div></>}
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={save} disabled={!selectedModel || saving}>{saving ? "Đang lưu..." : "Lưu account pool"}</Button>
            {message && <span className="text-xs text-text-muted">{message}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}
