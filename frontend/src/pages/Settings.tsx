import { useEffect, useState } from "react";
import {
  Eye, EyeOff, Check, AlertTriangle, Loader2, Zap, Globe, Key, Cpu, Settings,
  ShieldCheck, Search,
} from "lucide-react";
import { fetchConfig, saveConfig, testConfig, normalizeUrl, validateKey, fetchModels } from "../api/client";

const presets = [
  { name: "DeepSeek",  endpoint: "https://api.deepseek.com/v1",                          model: "deepseek-chat" },
  { name: "通义千问",   endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",    model: "qwen-vl-max" },
  { name: "智谱清言",   endpoint: "https://open.bigmodel.cn/api/paas/v4",                 model: "glm-4v" },
  { name: "Moonshot",  endpoint: "https://api.moonshot.cn/v1",                            model: "moonshot-v1-auto" },
];

export default function SettingsPage() {
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey]     = useState("");
  const [model, setModel]       = useState("");
  const [showKey, setShowKey]   = useState(false);
  const [configured, setConfigured] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);
  const [toast, setToast]       = useState<{ ok: boolean; msg: string } | null>(null);

  // Key validation state
  const [validatingKey, setValidatingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<{ valid: boolean; message: string } | null>(null);

  // Model detection state
  const [modelList, setModelList] = useState<{ id: string; name?: string }[]>([]);
  const [detectingModels, setDetectingModels] = useState(false);
  const [modelDetectMsg, setModelDetectMsg] = useState("");

  useEffect(() => {
    fetchConfig().then((c) => {
      setEndpoint(c.endpoint ?? ""); setApiKey(c.api_key ?? ""); setModel(c.model_name ?? "");
      setConfigured(c.is_configured ?? false);
    }).catch(() => {});
  }, []);

  const flash = (ok: boolean, msg: string) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 3500); };

  const handleSave = async () => {
    if (!endpoint || !apiKey || !model) { flash(false, "请填写完整"); return; }
    setSaving(true);
    try { const r = await saveConfig({ endpoint, api_key: apiKey, model_name: model }); setConfigured(true); flash(true, r.message); }
    catch (e: any) { flash(false, e.message); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    try { const r = await testConfig(); flash(r.success, r.message); }
    catch (e: any) { flash(false, e.message); }
    finally { setTesting(false); }
  };

  const handleNormalizeUrl = async () => {
    if (!endpoint.trim()) return;
    try {
      const r = await normalizeUrl(endpoint);
      setEndpoint(r.url);
    } catch {
      // silently ignore — user can still proceed
    }
  };

  const handleValidateKey = async () => {
    if (!endpoint || !apiKey) { flash(false, "请先填写 API 端点和密钥"); return; }
    setValidatingKey(true);
    setKeyStatus(null);
    try {
      const r = await validateKey(endpoint, apiKey);
      setKeyStatus(r);
    } catch (e: any) {
      setKeyStatus({ valid: false, message: e.message || "验证失败" });
    } finally {
      setValidatingKey(false);
    }
  };

  const handleDetectModels = async () => {
    if (!endpoint || !apiKey) { flash(false, "请先填写 API 端点和密钥"); return; }
    setDetectingModels(true);
    setModelDetectMsg("");
    try {
      const r = await fetchModels(endpoint, apiKey);
      if (r.models && r.models.length > 0) {
        setModelList(r.models);
        setModelDetectMsg(`检测到 ${r.models.length} 个可用模型`);
        // Auto-select the first model if current model is empty
        if (!model) {
          setModel(r.models[0].id);
        }
      } else {
        setModelList([]);
        setModelDetectMsg(r.message || "未检测到可用模型，请手动输入");
      }
    } catch (e: any) {
      setModelList([]);
      setModelDetectMsg(e.message || "检测失败，请手动输入模型名称");
    } finally {
      setDetectingModels(false);
    }
  };

  return (
    <div className="page-container settings-page">
      <div className="page-title">
        <div>
          <h2><Settings size={20} style={{ color: "var(--coral)" }} /> API 配置</h2>
          <p>配置兼容 OpenAI 格式的多模态大模型 API</p>
        </div>
        <span className={configured ? "badge-ok" : "badge-warn"}>{configured ? "✓ 已配置" : "未配置"}</span>
      </div>

      <div className="preset-group">
        <p>快捷预设</p>
        <div className="preset-btns">
          {presets.map((p) => (
            <button key={p.name} className="preset-btn" onClick={() => { setEndpoint(p.endpoint); setModel(p.model); setKeyStatus(null); setModelList([]); setModelDetectMsg(""); }}>{p.name}</button>
          ))}
        </div>
      </div>

      <div className="card">
        {/* ── API 端点 ── */}
        <div className="form-field">
          <label><Globe size={14} style={{ color: "var(--text-3)" }} /> API 端点</label>
          <input
            className="form-input"
            value={endpoint}
            onChange={e => setEndpoint(e.target.value)}
            onBlur={handleNormalizeUrl}
            placeholder="https://api.openai.com/v1"
          />
          <div className="config-tip">
            <p>正确格式示例：<code>https://api.deepseek.com/v1</code></p>
            <p>URL 应以 <code>/v1</code> 结尾，如果缺少会自动补全</p>
          </div>
        </div>

        {/* ── API 密钥 ── */}
        <div className="form-field">
          <label><Key size={14} style={{ color: "var(--text-3)" }} /> API 密钥</label>
          <div style={{ position: "relative", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                className="form-input"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setKeyStatus(null); }}
                placeholder="sk-..."
                style={{ paddingRight: 36 }}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-3)", cursor: "pointer" }}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <button className="btn-secondary" onClick={handleValidateKey} disabled={validatingKey} style={{ whiteSpace: "nowrap", padding: "10px 14px" }}>
              {validatingKey ? <Loader2 size={14} className="anim-spin" /> : <ShieldCheck size={14} />} 验证
            </button>
          </div>
          {keyStatus && (
            <div className={`key-status ${keyStatus.valid ? "valid" : "invalid"}`}>
              {keyStatus.valid ? "✓" : "✗"} {keyStatus.message}
            </div>
          )}
        </div>

        {/* ── 模型选择 ── */}
        <div className="form-field">
          <label><Cpu size={14} style={{ color: "var(--text-3)" }} /> 模型名称</label>
          <div className="model-selector">
            <div style={{ position: "relative", flex: 1 }}>
              {modelList.length > 0 ? (
                <select
                  className="form-select"
                  value={modelList.some(m => m.id === model) ? model : "__custom__"}
                  onChange={e => {
                    if (e.target.value === "__custom__") return;
                    setModel(e.target.value);
                  }}
                >
                  {modelList.map(m => (
                    <option key={m.id} value={m.id}>{m.name || m.id}</option>
                  ))}
                  {!modelList.some(m => m.id === model) && model && (
                    <option value="__custom__">{model}（手动输入）</option>
                  )}
                </select>
              ) : (
                <input
                  className="form-input"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder="gpt-4o"
                />
              )}
            </div>
            <button className="btn-secondary" onClick={handleDetectModels} disabled={detectingModels} style={{ whiteSpace: "nowrap", padding: "10px 14px" }}>
              {detectingModels ? <Loader2 size={14} className="anim-spin" /> : <Search size={14} />} 检测模型
            </button>
          </div>
          {/* Manual input when model list is populated */}
          {modelList.length > 0 && (
            <input
              className="form-input"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="或手动输入模型名称"
              style={{ marginTop: 8 }}
            />
          )}
          {modelDetectMsg && (
            <div className="config-tip" style={{ marginTop: 6 }}>
              <p>{modelDetectMsg}</p>
            </div>
          )}
        </div>

        <div className="btn-row">
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="anim-spin" /> : <Check size={14} />} 保存配置
          </button>
          <button className="btn-secondary" onClick={handleTest} disabled={testing || !configured}>
            {testing ? <Loader2 size={14} className="anim-spin" /> : <Zap size={14} />} 测试连接
          </button>
        </div>
      </div>

      {toast && (
        <div className={`toast ${toast.ok ? "ok" : "err"}`}>
          {toast.ok ? <Check size={14} /> : <AlertTriangle size={14} />} {toast.msg}
        </div>
      )}
    </div>
  );
}
