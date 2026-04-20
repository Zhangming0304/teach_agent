import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Users, PenLine, BookX, Target, ArrowRight,
  TrendingUp, Clock, Sparkles, Zap,
} from "lucide-react";
import { fetchStats } from "../api/client";
import type { DashboardStats } from "../types";

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const greet = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "夜深了"; if (h < 12) return "上午好";
    if (h < 14) return "中午好"; if (h < 18) return "下午好";
    return "晚上好";
  }, []);

  const dateStr = useMemo(() =>
    new Date().toLocaleDateString("zh-CN", {
      year: "numeric", month: "long", day: "numeric", weekday: "long",
    }), []);

  const s = stats;
  const score = s?.avg_score ?? 0;

  // Score ring calculations
  const r = 54, circ = 2 * Math.PI * r;
  const offset = circ - (circ * Math.min(score, 100)) / 100;
  const ringColor = score >= 80 ? "var(--teal)" : score >= 60 ? "var(--amber)" : score > 0 ? "var(--coral)" : "var(--border)";

  const statCards = [
    { k: "total_students", label: "学生总数", icon: Users,   cls: "coral" },
    { k: "total_homeworks", label: "批改次数", icon: PenLine, cls: "teal" },
    { k: "total_errors",    label: "错题总数", icon: BookX,   cls: "amber" },
    { k: "total_practices", label: "练习生成", icon: Target,  cls: "purple" },
  ] as const;

  const quickActions = [
    { to: "/grading",  icon: PenLine, label: "批改作业", desc: "上传图片，AI 智能批改", bg: "var(--coral-light)", color: "var(--coral)" },
    { to: "/students", icon: Users,   label: "学生管理", desc: "添加与管理学生信息", bg: "var(--teal-light)",  color: "var(--teal)" },
    { to: "/errors",   icon: BookX,   label: "错题分析", desc: "查看薄弱知识点分布", bg: "var(--amber-light)", color: "var(--amber)" },
    { to: "/practice", icon: Target,  label: "练习生成", desc: "生成分层个性化练习", bg: "var(--purple-light)", color: "var(--purple)" },
  ];

  const avatarColors = ["var(--coral)","var(--teal)","var(--purple)","var(--amber)","#F38BA8"];

  return (
    <div className="page-container">
      {/* Greeting */}
      <div className="greeting">
        <h2>{greet}，老师 <span className="wave">👋</span></h2>
        <p>{dateStr}</p>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid">
        {statCards.map((c) => (
          <div key={c.k} className="stat-card">
            <div className={`stat-icon ${c.cls}`}><c.icon size={20} /></div>
            <div className="stat-value">
              {loading ? <span className="anim-shimmer" style={{ display: "inline-block", width: 56, height: 28, borderRadius: 6 }} /> : (s as any)?.[c.k] ?? 0}
            </div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Content Grid: Left (Score + Activity) / Right (Quick Actions) */}
      <div className="content-grid">
        <div>
          {/* Score Card */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title"><TrendingUp size={16} style={{ color: "var(--coral)" }} /> 学业概览</div>
            <div className="score-section">
              <div className="score-ring-wrap">
                <svg viewBox="0 0 130 130">
                  <circle className="track" cx="65" cy="65" r={r} />
                  <circle className="value" cx="65" cy="65" r={r}
                    style={{ stroke: ringColor, strokeDasharray: circ, strokeDashoffset: loading ? circ : offset }} />
                </svg>
                <div className="score-center">
                  <div className="score-num">{loading ? 0 : score}</div>
                  <div className="score-label">平均分</div>
                </div>
              </div>
              <div className="score-info">
                <h4>{score >= 80 ? "整体表现优秀" : score >= 60 ? "成绩良好" : score > 0 ? "还需加油" : "开始使用"}</h4>
                <p>
                  {score >= 80
                    ? "整体表现优秀，继续保持！可以适当增加挑战题难度，帮助学生突破更高目标。"
                    : score >= 60
                    ? "成绩良好，建议重点关注薄弱知识点进行巩固练习。"
                    : score > 0
                    ? "还需加油！建议从基础题入手，逐步提升信心与成绩。"
                    : "尚未有批改记录。上传作业图片，开始AI智能批改之旅吧！"}
                </p>
                <div className="score-badges">
                  <div className="score-badge"><strong>{s?.total_homeworks ?? 0}</strong><span>已批改</span></div>
                  <div className="score-badge"><strong style={{ color: "var(--teal)" }}>{s?.total_students ?? 0}</strong><span>学生数</span></div>
                  <div className="score-badge"><strong style={{ color: "var(--amber)" }}>{s?.total_errors ?? 0}</strong><span>待巩固</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card">
            <div className="card-title"><Clock size={16} style={{ color: "var(--coral)" }} /> 最近批改动态</div>
            {!s?.recent_activities?.length ? (
              <div className="activity-empty">
                <Sparkles size={28} style={{ color: "var(--text-3)", marginBottom: 8 }} />
                <p style={{ fontSize: 13, color: "var(--text-3)" }}>
                  暂无批改记录，去<Link to="/grading">批改作业</Link>开始使用
                </p>
              </div>
            ) : (
              s.recent_activities.slice(0, 10).map((a: any, i: number) => (
                <div key={i} className="activity-item">
                  <div className="activity-avatar" style={{ background: avatarColors[i % 5] }}>{(a.student_name ?? "?")[0]}</div>
                  <div className="activity-name">{a.student_name}</div>
                  <div className="activity-score" style={{ color: a.score >= 80 ? "var(--teal)" : a.score >= 60 ? "var(--amber)" : "var(--coral)" }}>{a.score}分</div>
                  <div className="activity-date">{new Date(a.created_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <div className="quick-actions-title"><Zap size={15} style={{ color: "var(--amber)" }} /> 快捷操作</div>
          <div className="quick-actions">
            {quickActions.map((a) => (
              <Link key={a.to} to={a.to} className="quick-btn">
                <div className="quick-icon" style={{ background: a.bg, color: a.color }}><a.icon size={22} /></div>
                <div><h4>{a.label}</h4><p>{a.desc}</p></div>
                <div className="quick-arrow"><ArrowRight size={16} /></div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
