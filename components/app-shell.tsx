"use client";

import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  ChevronRight,
  Command,
  Flag,
  History,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  Sparkles,
  SunMoon,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { demoUser } from "@/lib/permissions";
import { sampleCourses } from "@/lib/sample-data";
import { RuntimeInitializer } from "./runtime-initializer";
import { StatusBadge } from "./status-badge";

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/courses", label: "Course Library", icon: BookOpen },
  { href: "/accreditation", label: "Accreditation", icon: Award },
  { href: "/versions", label: "Versions", icon: History },
  { href: "/revamp", label: "Revamp Planning", icon: Sparkles },
  { href: "/flags", label: "Flags & Follow-Up", icon: Flag },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin", label: "Administration", icon: Settings },
];

function currentSection(pathname: string) {
  return (
    navigation.find(
      (item) =>
        item.href === pathname ||
        (item.href !== "/" && pathname.startsWith(`${item.href}/`)),
    )?.label ?? "CourseTrack"
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem("coursetrack-theme")
        : null;
    const preferred =
      stored === "dark" ||
      (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)
        ? "dark"
        : "light";
    document.documentElement.dataset.theme = preferred;
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (commandOpen) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [commandOpen]);

  const commandResults = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    const pages = navigation
      .filter((item) => !query || item.label.toLowerCase().includes(query))
      .slice(0, 4)
      .map((item) => ({ href: item.href, label: item.label, type: "Page" }));
    const courses = sampleCourses
      .filter(
        (course) =>
          !query ||
          `${course.title} ${course.courseCode}`
            .toLowerCase()
            .includes(query),
      )
      .slice(0, 6)
      .map((course) => ({
        href: `/courses/${course.id}`,
        label: course.title,
        type: course.courseCode,
      }));
    return [...pages, ...courses];
  }, [commandQuery]);

  const toggleTheme = () => {
    const current = document.documentElement.dataset.theme ?? "light";
    const next = current === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("coursetrack-theme", next);
  };

  return (
    <div className="app-frame">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <Image
              src="/favicon.png"
              alt=""
              width={44}
              height={44}
              priority
            />
          </span>
          <div>
            <Link href="/" className="brand-name" onClick={() => setMobileOpen(false)}>
              CourseTrack
            </Link>
            <p>Search. Explore. Manage.</p>
          </div>
          <button
            className="icon-button sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <div className="workspace-chip">
          <StatusBadge tone="sample">Sample workspace</StatusBadge>
          <span>64 courses</span>
        </div>

        <nav className="primary-nav" aria-label="Primary navigation">
          {navigation.map((item) => {
            const active =
              item.href === pathname ||
              (item.href !== "/" && pathname.startsWith(`${item.href}/`));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "nav-link nav-link-active" : "nav-link"}
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
                {item.label === "Flags & Follow-Up" && (
                  <span className="nav-count">6</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <RuntimeInitializer />
          <Link href="/profile" className="profile-chip">
            <span className="avatar">{demoUser.initials}</span>
            <span>
              <strong>{demoUser.name}</strong>
              <small>{demoUser.role}</small>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </aside>

      {mobileOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="main-column">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <button className="global-search" onClick={() => setCommandOpen(true)}>
            <Search size={17} aria-hidden="true" />
            <span>Search courses, topics, IDs, or people…</span>
            <kbd>
              <Command size={11} aria-hidden="true" />K
            </kbd>
          </button>
          <div className="topbar-actions">
            <button
              className="icon-button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
            >
              <SunMoon size={18} />
            </button>
            <div className="popover-anchor">
              <button
                className="icon-button notification-button"
                onClick={() => setNotificationsOpen((value) => !value)}
                aria-label="Open notifications"
                aria-expanded={notificationsOpen}
              >
                <Bell size={18} />
                <span className="notification-dot" />
              </button>
              {notificationsOpen && (
                <div className="notification-popover">
                  <div className="popover-heading">
                    <strong>Notifications</strong>
                    <span>3 unread</span>
                  </div>
                  <Link href="/accreditation">
                    <span className="notification-icon warning">30d</span>
                    <span>
                      <strong>Accreditation deadline</strong>
                      <small>3 approvals expire within 30 days</small>
                    </span>
                  </Link>
                  <Link href="/flags">
                    <span className="notification-icon danger">!</span>
                    <span>
                      <strong>Critical flag assigned</strong>
                      <small>Use of Force Decision-Making</small>
                    </span>
                  </Link>
                  <Link href="/admin">
                    <span className="notification-icon info">LMS</span>
                    <span>
                      <strong>Retrieval warning</strong>
                      <small>2 sample mappings need review</small>
                    </span>
                  </Link>
                </div>
              )}
            </div>
            <Link href="/profile" className="topbar-avatar" aria-label="Open user profile">
              {demoUser.initials}
            </Link>
          </div>
        </header>

        <div className="breadcrumb-row" aria-label="Breadcrumb">
          <Link href="/">CourseTrack</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span>{currentSection(pathname)}</span>
        </div>

        <main className="page-content">{children}</main>
      </div>

      {commandOpen && (
        <div
          className="command-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="CourseTrack command palette"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCommandOpen(false);
          }}
        >
          <div className="command-palette">
            <div className="command-input-row">
              <Search size={19} aria-hidden="true" />
              <input
                ref={searchRef}
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                placeholder="Search CourseTrack…"
                aria-label="Search CourseTrack"
              />
              <kbd>Esc</kbd>
            </div>
            <div className="command-results">
              <p>Quick results</p>
              {commandResults.map((result) => (
                <Link
                  key={`${result.type}-${result.href}`}
                  href={result.href}
                  onClick={() => {
                    setCommandOpen(false);
                    setCommandQuery("");
                  }}
                >
                  <span>
                    {result.type === "Page" ? (
                      <LayoutDashboard size={17} />
                    ) : (
                      <BookOpen size={17} />
                    )}
                    <strong>{result.label}</strong>
                  </span>
                  <small>{result.type}</small>
                </Link>
              ))}
              {commandResults.length === 0 && (
                <div className="command-empty">No matching pages or courses.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
