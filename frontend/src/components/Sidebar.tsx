import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Settings, Users, PenLine, BookX, Target,
  GraduationCap, X,
} from "lucide-react";

const mainNav = [
  { to: "/",         icon: LayoutDashboard, label: "工作台",   end: true },
  { to: "/students", icon: Users,           label: "学生管理" },
  { to: "/grading",  icon: PenLine,         label: "作业批改" },
  { to: "/errors",   icon: BookX,           label: "错题分析" },
  { to: "/practice", icon: Target,          label: "练习生成" },
];

const bottomNav = [
  { to: "/settings", icon: Settings, label: "API 配置" },
];

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--sidebar-bg)", color: "white", position: "relative", overflow: "hidden" }}>
      {/* Decorative circles — same as prototype ::before / ::after */}
      <div style={{ position: "absolute", top: -50, right: -50, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.08)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -30, left: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />

      {/* Brand */}
      <div className="brand">
        <div className="brand-icon">
          <GraduationCap size={26} />
        </div>
        <h1>教育智能体</h1>
        <p>智能作业批改系统</p>
        {onClose && (
          <button onClick={onClose}
            style={{ position: "absolute", top: 20, right: 16, background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: 4, borderRadius: 8 }}>
            <X size={16} />
          </button>
        )}
      </div>

      <div className="brand-divider" />

      {/* Main Navigation */}
      <nav className="sidebar-nav">
        {mainNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onClose}
            className={({ isActive }) => isActive ? "active" : ""}
          >
            <item.icon size={20} style={{ opacity: 0.85 }} />
            {item.label}
          </NavLink>
        ))}

        {/* Divider */}
        <div className="sidebar-nav-divider" />

        {/* Bottom Navigation — API 配置 */}
        {bottomNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className={({ isActive }) => isActive ? "active" : ""}
          >
            <item.icon size={20} style={{ opacity: 0.85 }} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <span>v1.0</span>
        <span><span className="status-dot" />运行正常</span>
      </div>
    </div>
  );
}
