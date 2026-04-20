import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus, Pencil, Trash2, BookOpen, Award, BookX, X, Loader2, UserPlus } from "lucide-react";
import { fetchStudents, createStudent, updateStudent, deleteStudent } from "../api/client";
import type { Student } from "../types";

function unwrap(r: any): Student[] { return Array.isArray(r) ? r : r?.students ?? []; }

export default function StudentsPage() {
  const nav = useNavigate();
  const [list, setList] = useState<Student[]>([]);
  const [loading, setLoad] = useState(true);
  const [modal, setModal] = useState<Student | "new" | null>(null);
  const [del, setDel] = useState<Student | null>(null);
  const [toast, setToast] = useState("");

  const load = () => { setLoad(true); fetchStudents().then(r => setList(unwrap(r))).catch(() => {}).finally(() => setLoad(false)); };
  useEffect(load, []);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };
  const handleDel = async () => { if (!del) return; try { await deleteStudent(del.id); flash("已删除"); setDel(null); load(); } catch { flash("删除失败"); } };

  return (
    <div className="page-container" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="page-title">
        <div>
          <h2><Users size={20} style={{ color: "var(--coral)" }} /> 学生管理</h2>
          <p>共 {list.length} 名学生</p>
        </div>
        <button className="btn-primary" onClick={() => setModal("new")}><Plus size={15} /> 添加学生</button>
      </div>

      {loading ? (
        <div className="students-grid">
          {[0, 1, 2].map(i => <div key={i} className="anim-shimmer" style={{ height: 160, borderRadius: "var(--radius)" }} />)}
        </div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <UserPlus size={36} style={{ marginBottom: 12 }} />
          <p>暂无学生，点击「添加学生」开始</p>
        </div>
      ) : (
        <div className="students-grid">
          {list.map(s => (
            <div key={s.id} className="student-card" onClick={() => nav(`/errors?student=${s.id}`)}>
              <div className="student-top">
                <div className="student-avatar" style={{ background: s.avatar_color || "var(--coral)" }}>{s.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="student-name">{s.name}</div>
                  <div className="student-tags">
                    {s.grade && <span>{s.grade}</span>}
                    {s.class_name && <span>{s.class_name}</span>}
                    <span className="subject">{s.subject || "数学"}</span>
                  </div>
                </div>
                <div className="student-actions" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setModal(s)}><Pencil size={13} /></button>
                  <button className="del" onClick={() => setDel(s)}><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="student-stats">
                <div><BookOpen size={12} style={{ color: "var(--text-3)" }} /><div className="ss-val">{s.homework_count}</div><div className="ss-lbl">作业</div></div>
                <div><Award size={12} style={{ color: "var(--text-3)" }} /><div className="ss-val" style={{ color: s.avg_score >= 80 ? "var(--teal)" : s.avg_score >= 60 ? "var(--amber)" : s.avg_score > 0 ? "var(--coral)" : undefined }}>{s.avg_score}</div><div className="ss-lbl">均分</div></div>
                <div><BookX size={12} style={{ color: "var(--text-3)" }} /><div className="ss-val">{s.error_count}</div><div className="ss-lbl">错题</div></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <FormModal student={modal === "new" ? null : modal} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); flash(modal === "new" ? "添加成功" : "已更新"); }} />}

      {del && (
        <div className="overlay" onClick={() => setDel(null)}>
          <div className="modal" style={{ width: 320, textAlign: "center" }} onClick={e => e.stopPropagation()}>
            <Trash2 size={24} style={{ color: "var(--coral)", margin: "0 auto 8px" }} />
            <p style={{ fontSize: 14, color: "var(--text-2)" }}>确定删除 <strong>{del.name}</strong>？</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setDel(null)}>取消</button>
              <button className="btn-primary" onClick={handleDel}>删除</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast ok">{toast}</div>}
    </div>
  );
}

function FormModal({ student, onClose, onDone }: { student: Student | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(student?.name ?? "");
  const [grade, setGrade] = useState(student?.grade ?? "");
  const [cls, setCls] = useState(student?.class_name ?? "");
  const [subject, setSubject] = useState(student?.subject ?? "数学");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return; setBusy(true);
    try {
      if (student) await updateStudent(student.id, { name, grade, class_name: cls, subject });
      else await createStudent({ name, grade, class_name: cls, subject });
      onDone();
    } catch {} finally { setBusy(false); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 370 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          <span>{student ? "编辑学生" : "添加学生"}</span>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="form-field"><label>姓名 *</label><input className="form-input" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-field"><label>年级</label><input className="form-input" value={grade} onChange={e => setGrade(e.target.value)} placeholder="八年级" /></div>
          <div className="form-field"><label>班级</label><input className="form-input" value={cls} onChange={e => setCls(e.target.value)} placeholder="3班" /></div>
        </div>
        <div className="form-field"><label>学科</label><select className="form-select" value={subject} onChange={e => setSubject(e.target.value)}>
          {["数学", "语文", "英语", "物理", "化学", "生物"].map(s => <option key={s}>{s}</option>)}
        </select></div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={submit} disabled={busy || !name.trim()}>
            {busy && <Loader2 size={13} className="anim-spin" />} {student ? "保存" : "添加"}
          </button>
        </div>
      </div>
    </div>
  );
}
