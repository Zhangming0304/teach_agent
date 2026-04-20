import { useState, useEffect, useRef, useCallback, type DragEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ImagePlus, X, Loader2, CheckCircle2, XCircle, Brain, Sparkles,
  ChevronDown, ChevronUp, Eye, PenLine, BarChart3, Upload, AlertTriangle,
  FileText, FileType2, Type, ClipboardPaste, Clock, ArrowRight, Trash2,
} from "lucide-react";
import { fetchStudents, uploadHomework, gradeHomeworkUrl, fetchHomeworkList, fetchHomeworkDetail, deleteHomework } from "../api/client";
import type { Student, GradingResult, QuestionResult, HomeworkSubmission } from "../types";

function unwrap(r: any): Student[] { return Array.isArray(r) ? r : r?.students ?? []; }
const stepIcons: Record<string, any> = { upload: Upload, receive: Upload, parse: FileText, recognize: Eye, grading: PenLine, analyze: BarChart3, report: BarChart3, save: CheckCircle2 };
interface TStep { step: string; message: string; status: string; detail?: string }

const ACCEPT_TYPES = "image/*,.pdf,.docx,.doc,.txt";
function isImage(file: File): boolean { return file.type.startsWith("image/"); }
function fileIcon(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return <FileText size={28} style={{ color: "var(--coral)" }} />;
  if (ext === "doc" || ext === "docx") return <FileType2 size={28} style={{ color: "#4285F4" }} />;
  if (ext === "txt") return <Type size={28} style={{ color: "var(--teal)" }} />;
  return <FileText size={28} style={{ color: "var(--text-3)" }} />;
}

/* ══════════════════════════════════════════════════════════════
   Module-level grading session — survives React unmount/remount
   ══════════════════════════════════════════════════════════════ */
interface GradingSession {
  homeworkId: number;
  thinking: TStep[];
  stream: string;
  result: GradingResult | null;
  error: string;
  phase: "grading" | "done";
  studentName: string;
}

let activeSession: GradingSession | null = null;
let activeES: EventSource | null = null;
// Callback the component registers so the SSE handler can push React state updates
let syncToReact: (() => void) | null = null;

function startGradingSession(homeworkId: number, studentName: string, onHistoryReload: () => void) {
  // Clean up any previous session
  clearGradingSession();

  const session: GradingSession = {
    homeworkId,
    thinking: [],
    stream: "",
    result: null,
    error: "",
    phase: "grading",
    studentName,
  };
  activeSession = session;

  const es = new EventSource(gradeHomeworkUrl(homeworkId));
  activeES = es;

  es.onmessage = (ev) => {
    try {
      const d = JSON.parse(ev.data);
      if (d.type === "thinking") {
        const idx = session.thinking.findIndex(s => s.step === d.data.step);
        if (idx >= 0) { session.thinking = [...session.thinking]; session.thinking[idx] = d.data; }
        else { session.thinking = [...session.thinking, d.data]; }
      } else if (d.type === "content") {
        session.stream += d.data;
      } else if (d.type === "result") {
        session.result = d.data;
        session.phase = "done";
      } else if (d.type === "error") {
        session.error = String(d.data);
        session.phase = "done";
      } else if (d.type === "done") {
        es.close();
        activeES = null;
        onHistoryReload();
      }
      // Push update to React if component is mounted
      syncToReact?.();
    } catch {}
  };

  es.onerror = () => {
    es.close();
    activeES = null;
    if (!session.result) {
      session.error = "连接中断";
      session.phase = "done";
      syncToReact?.();
    }
  };
}

function clearGradingSession() {
  if (activeES) { activeES.close(); activeES = null; }
  activeSession = null;
}

/* ══════════════════════════════════════
   React Component
   ══════════════════════════════════════ */
export default function GradingPage() {
  const [sp, setSp] = useSearchParams();
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setSid] = useState<number | "">("");
  const [subject, setSubject] = useState("数学");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<(string | null)[]>([]);
  const [uploadTab, setUploadTab] = useState<"file" | "text">("file");
  const [contentText, setContentText] = useState("");
  const [uploading, setUpl] = useState(false);

  // These mirror the session state (or show history results)
  const [phase, setPhase] = useState<"upload" | "grading" | "done">("upload");
  const [thinking, setThinking] = useState<TStep[]>([]);
  const [stream, setStream] = useState("");
  const [result, setResult] = useState<GradingResult | null>(null);
  const [error, setError] = useState("");
  const [showTerm, setShowTerm] = useState(true);
  const [viewingStudentName, setViewingStudentName] = useState("");

  const [drag, setDrag] = useState(false);
  const termRef = useRef<HTMLPreElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<HomeworkSubmission[]>([]);

  useEffect(() => { fetchStudents().then(r => setStudents(unwrap(r))).catch(() => {}); }, []);

  const loadHistory = useCallback(() => {
    fetchHomeworkList().then(list => setHistory(Array.isArray(list) ? list : [])).catch(() => {});
  }, []);
  useEffect(loadHistory, [loadHistory]);

  // ── Helper: push activeSession data into React state ──
  const syncSessionToState = useCallback(() => {
    if (!activeSession) return;
    setPhase(activeSession.phase);
    setThinking([...activeSession.thinking]);
    setStream(activeSession.stream);
    setResult(activeSession.result);
    setError(activeSession.error);
    setViewingStudentName(activeSession.studentName);
  }, []);

  // ── Register/unregister the sync callback for module-level SSE handler ──
  useEffect(() => {
    // When SSE receives data, it calls syncToReact → directly updates React state
    syncToReact = syncSessionToState;
    return () => { syncToReact = null; };
  }, [syncSessionToState]);

  // ── Auto-scroll terminal ──
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [stream]);

  // ── On mount: restore from active session or URL param ──
  useEffect(() => {
    if (activeSession) {
      // There's a live/completed session — restore all state from it
      syncSessionToState();
      return;
    }
    // No active session — check URL for a completed homework to view
    const hwId = sp.get("homework");
    if (hwId) {
      const id = Number(hwId);
      if (id) loadHomeworkResult(id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadHomeworkResult = async (hwId: number) => {
    try {
      const hw = await fetchHomeworkDetail(hwId);
      if (!hw) return;
      const sName = hw.student_name ?? "";
      setViewingStudentName(sName);

      if (hw.status === "completed" && hw.grading_result) {
        // Already completed — show saved result
        const gr = typeof hw.grading_result === "string" ? JSON.parse(hw.grading_result) : hw.grading_result;
        setResult(gr);
        setPhase("done");
        setStream(""); setThinking([]); setError("");
      } else {
        // Not completed — reconnect SSE to run/resume grading
        startGradingSession(hwId, sName, loadHistory);
        setPhase("grading");
        setResult(null); setError(""); setStream(""); setThinking([]);
      }
    } catch { /* stay on upload */ }
  };

  // ── Clipboard paste ──
  const [pasteHint, setPasteHint] = useState(false);
  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (phase !== "upload" || uploadTab !== "file") return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles: File[] = [];
    for (const item of items) {
      if (item.kind === "file") { const f = item.getAsFile(); if (f) pastedFiles.push(f); }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      addFilesFromList(pastedFiles);
      setPasteHint(true); setTimeout(() => setPasteHint(false), 1500);
    }
  }, [phase, uploadTab]);
  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const addFilesFromList = (fl: File[] | FileList) => {
    const arr = Array.from(fl);
    setFiles(p => [...p, ...arr]);
    arr.forEach(f => {
      if (isImage(f)) {
        const r = new FileReader();
        r.onload = e => setPreviews(p => [...p, e.target?.result as string]);
        r.readAsDataURL(f);
      } else { setPreviews(p => [...p, null]); }
    });
  };
  const rmFile = (i: number) => { setFiles(p => p.filter((_, j) => j !== i)); setPreviews(p => p.filter((_, j) => j !== i)); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); addFilesFromList(e.dataTransfer.files); };

  const canStart = () => {
    if (!studentId) return false;
    if (uploadTab === "file") return files.length > 0;
    if (uploadTab === "text") return contentText.trim().length > 0;
    return false;
  };

  const start = async () => {
    if (!canStart()) return;
    setUpl(true); setError(""); setResult(null); setThinking([]); setStream("");
    try {
      const fd = new FormData();
      fd.append("student_id", String(studentId));
      fd.append("subject", subject);
      if (uploadTab === "text") { fd.append("content_text", contentText); }
      else { files.forEach(f => fd.append("files", f)); }

      const up = await uploadHomework(fd);
      if (!up.success) throw new Error(up.message);

      setSp({ homework: String(up.homework_id) });
      const sName = students.find(s => s.id === studentId)?.name ?? "";

      // Start module-level session (survives unmount)
      startGradingSession(up.homework_id, sName, loadHistory);

      setPhase("grading");
      setViewingStudentName(sName);
      setUpl(false);
    } catch (e: any) { setError(e.message); setPhase("done"); setUpl(false); }
  };

  const reset = () => {
    clearGradingSession();
    setPhase("upload"); setThinking([]); setStream(""); setResult(null); setError("");
    setFiles([]); setPreviews([]); setContentText(""); setViewingStudentName("");
    setSp({});
    loadHistory();
  };

  const viewHomework = (hw: HomeworkSubmission) => {
    clearGradingSession();
    setSp({ homework: String(hw.id) });
    loadHomeworkResult(hw.id);
  };

  const handleDeleteHomework = async (e: React.MouseEvent, hwId: number) => {
    e.stopPropagation();
    const isActive = activeSession?.homeworkId === hwId;
    const msg = isActive
      ? "确定中断当前批改并删除？关联的错题记录也会一起删除。"
      : "确定删除这条批改记录？关联的错题记录也会一起删除。";
    if (!confirm(msg)) return;
    try {
      // If deleting the currently active session, stop SSE first
      if (isActive) {
        clearGradingSession();
        setPhase("upload"); setThinking([]); setStream(""); setResult(null); setError("");
        setViewingStudentName("");
        setSp({});
      }
      await deleteHomework(hwId);
      loadHistory();
    } catch { /* ignore */ }
  };

  const score = result?.score ?? 0;
  const displayStudentName = viewingStudentName || students.find(s => s.id === studentId)?.name || "";

  return (
    <div className="page-container" style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div className="grading-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2><PenLine size={22} style={{ color: "var(--coral)" }} /> 作业批改</h2>
          <p>上传作业，AI 智能批改并自动记录错题</p>
        </div>
        {phase !== "upload" && <button className="btn-secondary" onClick={reset}>新建批改</button>}
      </div>

      {/* ── UPLOAD PHASE ── */}
      {phase === "upload" && (
        <>
          <div className="grading-selects">
            <div className="form-group">
              <label>选择学生</label>
              <select className="form-select" value={studentId} onChange={e => setSid(e.target.value ? Number(e.target.value) : "")}>
                <option value="">请选择</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name} · {s.grade}{s.class_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>学科</label>
              <select className="form-select" value={subject} onChange={e => setSubject(e.target.value)}>
                {["数学", "语文", "英语", "物理", "化学"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="upload-tabs">
            <button className={`upload-tab ${uploadTab === "file" ? "active" : ""}`} onClick={() => setUploadTab("file")}><Upload size={14} /> 文件上传</button>
            <button className={`upload-tab ${uploadTab === "text" ? "active" : ""}`} onClick={() => setUploadTab("text")}><Type size={14} /> 文字输入</button>
          </div>

          {uploadTab === "file" && (
            <>
              <div className={`upload-zone ${drag ? "dragging" : ""}`}
                onDrop={onDrop} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onClick={() => fileRef.current?.click()}>
                <div className="uz-icon"><ImagePlus size={28} /></div>
                <h3>拖拽文件到此处，或点击选择</h3>
                <p>支持图片、PDF、Word、TXT 等多种格式</p>
                <p className="paste-hint">
                  <ClipboardPaste size={12} /> 也可以直接 Ctrl+V / Cmd+V 粘贴图片
                  {pasteHint && <span className="paste-toast">已粘贴！</span>}
                </p>
                <input ref={fileRef} type="file" accept={ACCEPT_TYPES} multiple hidden onChange={e => e.target.files && addFilesFromList(e.target.files)} />
              </div>
              {previews.length > 0 && (
                <div className="preview-grid">
                  {previews.map((src, i) => (
                    <div key={i} className={`preview-item ${!src ? "file-preview-item" : ""}`}>
                      {src ? <img src={src} alt="" /> : (
                        <div className="file-preview-content">{fileIcon(files[i])}<span className="file-preview-name">{files[i]?.name}</span></div>
                      )}
                      <button className="rm-btn" onClick={e => { e.stopPropagation(); rmFile(i); }}><X size={12} /></button>
                      <span className="idx">{i + 1}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {uploadTab === "text" && (
            <div className="text-input-zone">
              <textarea value={contentText} onChange={e => setContentText(e.target.value)} placeholder="请输入或粘贴学生作业内容..." />
            </div>
          )}

          <button className="start-btn" onClick={start} disabled={!canStart() || uploading}>
            {uploading ? <Loader2 size={18} className="anim-spin" /> : <Sparkles size={18} />}
            {uploading ? "上传中…" : "开始批改"}
          </button>

          {/* ── History ── */}
          {history.length > 0 && (
            <div className="history-section">
              <h3><Clock size={14} style={{ color: "var(--coral)" }} /> 批改记录</h3>
              {history.slice(0, 20).map(hw => (
                <div key={hw.id} className="history-item" onClick={() => viewHomework(hw)} style={{ cursor: "pointer" }}>
                  <div style={{ flex: 1 }}>
                    <div className="hi-title">
                      <span style={{ fontWeight: 600 }}>{hw.student_name}</span>
                      <span style={{ color: "var(--text-3)", marginLeft: 8 }}>{hw.subject}</span>
                    </div>
                    <div className="hi-date">{new Date(hw.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {hw.status === "completed" ? (
                      <span style={{ fontWeight: 700, fontSize: 14, fontFamily: "'Nunito', sans-serif", color: hw.score >= 80 ? "var(--teal)" : hw.score >= 60 ? "var(--amber)" : "var(--coral)" }}>{hw.score}分</span>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--text-3)" }}>批改中…</span>
                    )}
                    <button
                      className="hw-del-btn"
                      onClick={(e) => handleDeleteHomework(e, hw.id)}
                      title="删除记录"
                    >
                      <Trash2 size={13} />
                    </button>
                    <ArrowRight size={14} style={{ color: "var(--text-3)" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── GRADING / DONE PHASE ── */}
      {phase !== "upload" && (
        <>
          {displayStudentName && (
            <div style={{ marginBottom: 16, fontSize: 13, color: "var(--text-3)" }}>
              正在查看 <strong style={{ color: "var(--text-1)" }}>{displayStudentName}</strong> 的批改结果
            </div>
          )}

          {/* Thinking + Terminal — show during live grading OR when session has data */}
          {(thinking.length > 0 || stream || phase === "grading") && (
            <div className="grading-panels">
              <div className="card">
                <div className="card-title"><Brain size={16} style={{ color: "var(--purple)" }} /> 智能体思维链</div>
                <div style={{ position: "relative" }}>
                  {thinking.length > 1 && <div style={{ position: "absolute", left: 15, top: 12, bottom: 12, width: 2, background: "var(--border)" }} />}
                  {thinking.map((t, i) => {
                    const Icon = stepIcons[t.step] || Eye;
                    const done = t.status === "done";
                    return (
                      <div key={i} className="thinking-step">
                        <div className={`step-dot ${done ? "done" : "active"}`}>
                          {done ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                        </div>
                        <div className="step-text-wrap">
                          <div className={`step-text ${done ? "done" : "active"}`}>{t.message}</div>
                          {t.detail && <div className="step-detail">{t.detail}</div>}
                        </div>
                      </div>
                    );
                  })}
                  {phase === "grading" && !thinking.length && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", fontSize: 13, color: "var(--text-3)" }}>
                      <Loader2 size={14} className="anim-spin" /> 等待智能体回复…
                    </div>
                  )}
                </div>
              </div>

              <div className="terminal-panel">
                <div className="terminal-bar">
                  <div className="terminal-dots"><span /><span /><span /></div>
                  <div className={`terminal-status ${phase === "done" ? "done" : ""}`}>{phase === "grading" ? "处理中" : "已完成"}</div>
                  <button onClick={() => setShowTerm(!showTerm)} style={{ background: "none", border: "none", color: "#6c7086", cursor: "pointer" }}>
                    {showTerm ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>
                {showTerm && (
                  <pre ref={termRef} className={`terminal-body ${phase === "grading" ? "stream-cursor" : ""}`}>
                    {stream || "等待智能体输出…"}
                  </pre>
                )}
              </div>
            </div>
          )}

          {error && <div className="error-msg">{error}</div>}

          {result && (
            <>
              <div className="result-header">
                <div style={{ textAlign: "center" }}>
                  <div className={`result-score-big ${score >= 80 ? "high" : score >= 60 ? "mid" : "low"}`}>{score}</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)" }}>总分</div>
                </div>
                <div className="result-divider" />
                <div className="result-stats">
                  <div>题目 <strong>{result.total_questions}</strong></div>
                  <div style={{ marginTop: 4 }}>正确 <strong style={{ color: "var(--teal)" }}>{result.correct_count}</strong></div>
                </div>
                {result.overall_comment && <div className="result-comment">{result.overall_comment}</div>}
              </div>

              {result.questions?.map(q => <QCard key={q.question_num} q={q} />)}

              {result.weak_points?.length > 0 && (
                <div className="weak-points">
                  <h4><AlertTriangle size={14} /> 薄弱知识点</h4>
                  <div className="weak-tags">{result.weak_points.map((w, i) => <span key={i}>{w}</span>)}</div>
                </div>
              )}

              <div className="ai-gen-label">以上批改分析内容由 AI 生成，基于国产大模型，仅供教学参考</div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function QCard({ q }: { q: QuestionResult }) {
  const [open, setOpen] = useState(!q.is_correct);
  const diff = Number(q.difficulty) || 3;
  return (
    <div className={`question-card ${q.is_correct ? "correct" : "wrong"}`}>
      <div className="question-header" onClick={() => setOpen(!open)}>
        {q.is_correct ? <CheckCircle2 size={17} className="status-icon correct" /> : <XCircle size={17} className="status-icon wrong" />}
        <span className="qtext"><strong>第{q.question_num}题</strong>{q.question_text}</span>
        <div className="diff-dots">{Array.from({ length: 5 }).map((_, i) => <span key={i} className={i < diff ? "filled" : "empty"} />)}</div>
        <ChevronDown size={13} style={{ color: "var(--text-3)", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none", flexShrink: 0 }} />
      </div>
      {open && (
        <div className="question-detail">
          <div className="answer-grid">
            <div className="answer-box wrong-ans"><div className="answer-label">学生答案：</div><span>{q.student_answer}</span></div>
            <div className="answer-box correct-ans"><div className="answer-label">正确答案：</div><span>{q.correct_answer}</span></div>
          </div>
          {q.error_type && <div><span className="tag tag-orange">{q.error_type}</span><span className="tag tag-indigo">{q.knowledge_point}</span></div>}
          {q.analysis && <div className="analysis-box">{q.analysis}</div>}
        </div>
      )}
    </div>
  );
}
