import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Target, Loader2, CheckCircle2, Download, RefreshCw, Sparkles, BookOpen, Eye, EyeOff, Star, ChevronDown, ChevronUp, Brain, Clock } from "lucide-react";
import { fetchStudents, generatePractice, fetchPracticeList, getPracticePdfUrl } from "../api/client";
import type { Student, PracticeData, PracticeQuestion, PracticeSheet } from "../types";

function unwrapS(r: any): Student[] { return Array.isArray(r) ? r : r?.students ?? []; }
function unwrapP(r: any): PracticeSheet[] { return Array.isArray(r) ? r : r?.practice_sheets ?? []; }

const levelMap: Record<string, { cls: string; stars: number }> = {
  "基础巩固": { cls: "basic", stars: 1 },
  "能力提升": { cls: "improve", stars: 2 },
  "拓展挑战": { cls: "challenge", stars: 3 },
};

interface TStep { step: string; message: string; status: string }

export default function PracticeGeneratorPage() {
  const [sp] = useSearchParams();
  const [students, setStudents] = useState<Student[]>([]);
  const [sid, setSid] = useState<number | "">(Number(sp.get("student")) || "");
  const [errIds] = useState<number[]>(() => { const e = sp.get("errors"); return e ? e.split(",").map(Number).filter(Boolean) : []; });
  const [phase, setPhase] = useState<"idle" | "gen" | "done">("idle");
  const [thinking, setTh] = useState<TStep[]>([]);
  const [stream, setStream] = useState("");
  const [data, setData] = useState<PracticeData | null>(null);
  const [pid, setPid] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [showTerm, setShowT] = useState(true);
  const [showAns, setShowAns] = useState<Set<number>>(new Set());
  const [history, setHist] = useState<PracticeSheet[]>([]);
  const termRef = useRef<HTMLPreElement>(null);

  useEffect(() => { fetchStudents().then(r => setStudents(unwrapS(r))).catch(() => {}); }, []);

  const loadHistory = useCallback(() => {
    if (sid) fetchPracticeList(Number(sid)).then(r => setHist(unwrapP(r))).catch(() => {});
    else setHist([]);
  }, [sid]);
  useEffect(loadHistory, [loadHistory, phase]);

  const start = async () => {
    if (!sid) return;
    setPhase("gen"); setTh([]); setStream(""); setData(null); setPid(null); setError(""); setShowAns(new Set());
    try {
      const reader = await generatePractice(Number(sid), errIds.length ? errIds : undefined);
      const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.type === "thinking") setTh(p => { const i = p.findIndex(s => s.step === d.data.step); if (i >= 0) { const c = [...p]; c[i] = d.data; return c; } return [...p, d.data]; });
            else if (d.type === "content") { setStream(p => p + d.data); if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight; }
            else if (d.type === "result") { setData(d.data); setPhase("done"); }
            else if (d.type === "error") { setError(String(d.data)); setPhase("done"); }
            else if (d.type === "done" && d.data?.practice_id) setPid(d.data.practice_id);
          } catch {}
        }
      }
      if (phase !== "done") setPhase("done");
    } catch (e: any) { setError(e.message); setPhase("done"); }
  };

  const toggleAns = (id: number) => setShowAns(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const grouped = data?.questions?.reduce<Record<string, PracticeQuestion[]>>((a, q) => { (a[q.level || "基础巩固"] ??= []).push(q); return a; }, {}) ?? {};
  const stu = students.find(s => s.id === sid);

  return (
    <div className="page-container" style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", display: "flex", alignItems: "center", gap: 8 }}>
          <Target size={20} style={{ color: "var(--coral)" }} /> 分层练习生成
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>根据错题智能生成个性化分层练习</p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12, marginBottom: 20 }}>
        <div className="form-group">
          <label>选择学生</label>
          <select className="form-select" style={{ width: 220 }} value={sid} onChange={e => setSid(e.target.value ? Number(e.target.value) : "")}>
            <option value="">请选择</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.name} · {s.grade}{s.class_name}</option>)}
          </select>
        </div>
        {stu && (
          <span style={{ background: "var(--warm-gray)", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "var(--text-3)" }}>
            错题 <strong style={{ color: "var(--coral)" }}>{stu.error_count}</strong> 道
            {errIds.length > 0 && <span style={{ marginLeft: 4, background: "var(--coral-light)", color: "var(--coral)", borderRadius: 4, padding: "0 4px", fontWeight: 600 }}>已选{errIds.length}</span>}
          </span>
        )}
      </div>

      {phase === "idle" && sid && (
        <button className="start-btn" onClick={start}><Sparkles size={18} /> 开始生成分层练习</button>
      )}
      {phase === "idle" && !sid && <p style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "var(--text-3)" }}>请先选择学生</p>}

      {phase !== "idle" && (
        <>
          {/* Thinking + Terminal */}
          <div className="grading-panels">
            <div className="card">
              <div className="card-title"><Brain size={16} style={{ color: "var(--purple)" }} /> 生成思维链</div>
              <div style={{ position: "relative" }}>
                {thinking.length > 1 && <div style={{ position: "absolute", left: 15, top: 12, bottom: 12, width: 2, background: "var(--border)" }} />}
                {thinking.map((t, i) => {
                  const done = t.status === "done";
                  return (
                    <div key={i} className="thinking-step">
                      <div className={`step-dot ${done ? "done" : "active"}`}>{done ? <CheckCircle2 size={14} /> : <Loader2 size={14} className="anim-spin" />}</div>
                      <div className={`step-text ${done ? "done" : "active"}`}>{t.message}</div>
                    </div>
                  );
                })}
                {phase === "gen" && !thinking.length && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", fontSize: 13, color: "var(--text-3)" }}><Loader2 size={14} className="anim-spin" /> 等待智能体回复…</div>
                )}
              </div>
            </div>
            <div className="terminal-panel">
              <div className="terminal-bar">
                <div className="terminal-dots"><span /><span /><span /></div>
                <div className={`terminal-status ${phase === "done" ? "done" : ""}`}>{phase === "gen" ? "生成中" : "已完成"}</div>
                <button onClick={() => setShowT(!showTerm)} style={{ background: "none", border: "none", color: "#6c7086", cursor: "pointer" }}>{showTerm ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>
              </div>
              {showTerm && <pre ref={termRef} className={`terminal-body ${phase === "gen" ? "stream-cursor" : ""}`}>{stream || "等待智能体输出…"}</pre>}
            </div>
          </div>

          {error && <div className="error-msg">{error}</div>}

          {data && (
            <>
              <div className="result-header" style={{ flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>{data.title}</h3>
                  {data.description && <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>{data.description}</p>}
                  {data.target_knowledge_points?.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                      {data.target_knowledge_points.map((k, i) => <span key={i} className="tag tag-indigo">{k}</span>)}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {pid && <a href={getPracticePdfUrl(pid)} target="_blank" rel="noreferrer" className="btn-primary" style={{ textDecoration: "none", fontSize: 12 }}><Download size={13} /> 下载 PDF</a>}
                  <button className="btn-secondary" onClick={() => { setPhase("idle"); setData(null); setStream(""); setTh([]); }}><RefreshCw size={13} /> 重新生成</button>
                </div>
              </div>

              {Object.entries(grouped).map(([lv, qs]) => {
                const cfg = levelMap[lv] ?? levelMap["基础巩固"];
                return (
                  <div key={lv} style={{ marginBottom: 16 }}>
                    <div className={`level-header ${cfg.cls}`}>
                      {Array.from({ length: cfg.stars }).map((_, i) => <Star key={i} size={14} fill="currentColor" />)}
                      <span className="lv-name">{lv}</span>
                      <span className="lv-count">（{qs.length}题）</span>
                    </div>
                    {qs.map(q => (
                      <div key={q.id} className="practice-q">
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <span className="pq-num">{q.id}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="pq-text">{q.question}</p>
                            {q.options && <div className="pq-options">{q.options.map((o, oi) => <div key={oi} className="pq-opt">{o}</div>)}</div>}
                            <div className="pq-kp" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {q.knowledge_point && <span className="tag tag-indigo">{q.knowledge_point}</span>}
                              <button className="ans-toggle" onClick={() => toggleAns(q.id)}>
                                {showAns.has(q.id) ? <><EyeOff size={11} /> 隐藏</> : <><Eye size={11} /> 答案</>}
                              </button>
                            </div>
                            {showAns.has(q.id) && (
                              <div className="ans-box">
                                <div><strong>答案：</strong>{q.answer}</div>
                                {q.solution && <div style={{ marginTop: 4 }}><strong>解析：</strong><span style={{ color: "var(--text-2)" }}>{q.solution}</span></div>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}

              {data.study_suggestions && (
                <div className="study-tip">
                  <h4><BookOpen size={14} /> 学习建议</h4>
                  <p>{data.study_suggestions}</p>
                </div>
              )}

              <div className="ai-gen-label">以上练习题及解析内容由 AI 生成，基于国产大模型，仅供教学参考</div>
            </>
          )}
        </>
      )}

      {/* ── History — always visible when student is selected ── */}
      {sid && history.length > 0 && (
        <div className="history-section">
          <h3><Clock size={14} style={{ color: "var(--coral)" }} /> 历史练习记录</h3>
          {history.map(h => (
            <div key={h.id} className="history-item">
              <div>
                <div className="hi-title">{h.title || "练习题"}</div>
                <div className="hi-date">{new Date(h.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })}</div>
              </div>
              <a href={getPracticePdfUrl(h.id)} target="_blank" rel="noreferrer"><Download size={11} /> PDF</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
