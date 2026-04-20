import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu, GraduationCap } from "lucide-react";
import Sidebar from "./Sidebar";

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="sidebar">
        <Sidebar />
      </aside>

      {/* ── Mobile drawer ── */}
      <div className={`mobile-overlay ${open ? "open" : ""}`}>
        <div className="backdrop" onClick={() => setOpen(false)} />
        <div className="drawer">
          <Sidebar onClose={() => setOpen(false)} />
        </div>
      </div>

      {/* ── Main column ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Mobile top bar */}
        <div className="mobile-header">
          <button onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>
          <GraduationCap size={20} style={{ color: "var(--coral)" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>教育智能体</span>
        </div>

        {/* Page content */}
        <div className="main-content">
          <Outlet />
        </div>
      </div>
    </>
  );
}
