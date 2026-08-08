import {
  CalendarDays,
  CircleHelp,
  ClipboardList,
  FileClock,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  RefreshCw,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import type { CollectionType, Role } from "../domain/types";

interface AppShellProps {
  role: Role;
  accountName: string;
  busy: boolean;
  roundType: CollectionType;
  adminView: AdminView;
  onLogout: () => void;
  onRefresh: () => void;
  onRoundTypeChange: (type: CollectionType) => void;
  onAdminViewChange: (view: AdminView) => void;
  children: ReactNode;
}

export type AdminView =
  | "dashboard"
  | "collection"
  | "history"
  | "submission-history"
  | "settings"
  | "help";

export function AppShell({
  role,
  accountName,
  busy,
  roundType,
  adminView,
  onLogout,
  onRefresh,
  onRoundTypeChange,
  onAdminViewChange,
  children,
}: AppShellProps) {
  const submitterItems = [
    { label: "통합 수합", icon: CalendarDays, roundType: "monthly" as const },
    {
      label: "제출 내역",
      icon: ClipboardList,
      view: "submission-history" as const,
    },
  ];
  const adminItems = [
    { label: "대시보드", icon: LayoutDashboard, view: "dashboard" as const },
    { label: "통합 수합", icon: CalendarDays, roundType: "monthly" as const },
    { label: "설정", icon: Settings, view: "settings" as const },
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
          <button
            className="icon-button"
            disabled={busy}
            onClick={onRefresh}
            title="운영 데이터 새로고침"
          >
            <RefreshCw size={18} />
          </button>
          <div className="account-button" aria-label={`현재 계정 ${accountName}`}>
            <span>{accountName}</span>
          </div>
          <button
            className="icon-button"
            disabled={busy}
            onClick={onLogout}
            title="로그아웃"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <div className="app-shell__body">
        <aside className="sidebar">
          <nav aria-label="주요 메뉴">
            {items.map((item) => {
              const Icon = item.icon;
              const itemRoundType = "roundType" in item ? item.roundType : null;
              const itemView =
                "view" in item ? (item.view as AdminView) : null;
              const active =
                (itemRoundType === roundType && adminView === "collection") ||
                itemView === adminView;
              return (
                <button
                  key={item.label}
                  aria-current={active ? "page" : undefined}
                  className={`nav-item ${active ? "is-active" : ""}`}
                  disabled={!itemRoundType && !itemView}
                  onClick={() => {
                    if (itemRoundType) {
                      onRoundTypeChange(itemRoundType);
                      onAdminViewChange("collection");
                    } else if (itemView) {
                      onAdminViewChange(itemView);
                    }
                  }}
                  title={
                    itemRoundType || itemView
                      ? active
                        ? "현재 화면입니다."
                        : `${item.label} 화면으로 전환합니다.`
                      : "준비 중인 메뉴입니다."
                  }
                >
                  <Icon size={19} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <button
            aria-current={
              adminView === (role === "admin" ? "history" : "help")
                ? "page"
                : undefined
            }
            className={`nav-item sidebar__help ${
              adminView === (role === "admin" ? "history" : "help")
                ? "is-active"
                : ""
            }`}
            onClick={() =>
              onAdminViewChange(role === "admin" ? "history" : "help")
            }
            title={
              role === "admin"
                ? "생성 파일과 작업 기록을 확인합니다."
                : "수합 작성과 제출 방법을 확인합니다."
            }
          >
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
