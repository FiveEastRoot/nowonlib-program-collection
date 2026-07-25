import {
  CalendarDays,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  FileClock,
  LayoutDashboard,
  LibraryBig,
  Printer,
  RotateCcw,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Role } from "../domain/types";

interface AppShellProps {
  role: Role;
  onRoleChange: (role: Role) => void;
  onReset: () => void;
  children: ReactNode;
}

export function AppShell({
  role,
  onRoleChange,
  onReset,
  children,
}: AppShellProps) {
  const submitterItems = [
    { label: "10일 수합", icon: CalendarDays, active: true },
    { label: "20일 수합", icon: CalendarDays },
    { label: "제출 내역", icon: ClipboardList },
  ];
  const adminItems = [
    { label: "대시보드", icon: LayoutDashboard },
    { label: "10일 수합", icon: CalendarDays, active: true },
    { label: "20일 수합", icon: CalendarDays },
    { label: "출력 작업", icon: Printer },
    { label: "설정", icon: Settings },
  ];
  const items = role === "submitter" ? submitterItems : adminItems;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <LibraryBig size={25} strokeWidth={2.1} />
          </span>
          <span className="brand__organization">노원구립도서관</span>
          <span className="brand__divider" />
          <span className="brand__product">문화프로그램 통합 수합</span>
        </div>
        <div className="topbar__tools">
          <div className="role-preview" aria-label="개발 미리보기 역할">
            <button
              className={role === "submitter" ? "is-active" : ""}
              onClick={() => onRoleChange("submitter")}
            >
              제출자
            </button>
            <button
              className={role === "admin" ? "is-active" : ""}
              onClick={() => onRoleChange("admin")}
            >
              관리자
            </button>
          </div>
          <button className="icon-button" onClick={onReset} title="데모 초기화">
            <RotateCcw size={18} />
          </button>
          <button className="account-button">
            <span>{role === "submitter" ? "노원중앙도서관" : "수합 관리자"}</span>
            <ChevronDown size={16} />
          </button>
        </div>
      </header>
      <div className="app-shell__body">
        <aside className="sidebar">
          <nav aria-label="주요 메뉴">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  className={`nav-item ${item.active ? "is-active" : ""}`}
                >
                  <Icon size={19} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <button className="nav-item sidebar__help">
            {role === "submitter" ? (
              <CircleHelp size={19} />
            ) : (
              <FileClock size={19} />
            )}
            <span>{role === "submitter" ? "이용 안내" : "작업 기록"}</span>
          </button>
        </aside>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}

