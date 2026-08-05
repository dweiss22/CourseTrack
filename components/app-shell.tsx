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
  LogOut,
  Menu,
  Search,
  Settings,
  Sparkles,
  SunMoon,
  Tags,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CourseIndexEntry } from "@/db";
import type { ApplicationRole, AuthContext } from "@/lib/auth";
import type { DeploymentEnvironment } from "@/lib/deployment-environment";
import { isPublicAuthPath } from "@/lib/public-auth-paths";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { RuntimeInitializer } from "./runtime-initializer";
import { StatusBadge } from "./status-badge";

const ALL_ROLES: ApplicationRole[] = ["super_admin", "admin", "accreditation", "content"];

const navigation: Array<{ href: string; label: string; icon: typeof LayoutDashboard; roles: ApplicationRole[] }> = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ALL_ROLES },
  { href: "/courses", label: "Course Library", icon: BookOpen, roles: ALL_ROLES },
  { href: "/accreditation", label: "Accreditation", icon: Award, roles: ["super_admin", "admin", "accreditation"] },
  { href: "/topics-tags", label: "Topics & Tags", icon: Tags, roles: ["super_admin", "admin", "content"] },
  { href: "/versions", label: "Versions", icon: History, roles: ["super_admin", "admin", "content"] },
  { href: "/revamp", label: "Revamp Planning", icon: Sparkles, roles: ["super_admin", "admin", "content"] },
  { href: "/flags", label: "Tasks & Callouts", icon: Flag, roles: ALL_ROLES },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ALL_ROLES },
  { href: "/admin", label: "Administration", icon: Settings, roles: ["super_admin", "admin"] },
  { href: "/admin/users", label: "User Management", icon: Users, roles: ["super_admin", "admin"] },
];

function initialsFor(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const ROLE_LABELS: Record<ApplicationRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  accreditation: "Accreditation",
  content: "Content",
};

function currentSection(pathname: string) {
  return (
    navigation.find(
      (item) =>
        item.href === pathname ||
        (item.href !== "/" && pathname.startsWith(`${item.href}/`)),
    )?.label ?? "CourseTrack"
  );
}

export function AppShell({
  children,
  authContext,
  deploymentEnvironment,
  snapshotRefreshedAt,
}: {
  children: ReactNode;
  authContext: AuthContext | null;
  deploymentEnvironment: DeploymentEnvironment;
  snapshotRefreshedAt: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandCourses, setCommandCourses] = useState<CourseIndexEntry[]>([]);
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

  useEffect(() => {
    const query = commandQuery.trim();
    if (!commandOpen || query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/courses/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : { items: [] })
        .then((result: { items?: CourseIndexEntry[] }) => setCommandCourses(result.items ?? []))
        .catch((error) => { if (error?.name !== "AbortError") setCommandCourses([]); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [commandOpen, commandQuery]);

  const role = authContext?.role;
  const visibleNavigation = useMemo(
    () => navigation.filter((item) => role && item.roles.includes(role)),
    [role],
  );

  const commandResults = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    const pages = visibleNavigation
      .filter((item) => !query || item.label.toLowerCase().includes(query))
      .slice(0, 4)
      .map((item) => ({ href: item.href, label: item.label, type: "Page" }));
    const courses = (query.length >= 2 ? commandCourses : [])
      .slice(0, 6)
      .map((course) => ({
        href: `/courses/${course.id}`,
        label: course.title,
        type: course.courseCode,
      }));
    return [...pages, ...courses];
  }, [commandCourses, commandQuery, visibleNavigation]);

  const toggleTheme = () => {
    const current = document.documentElement.dataset.theme ?? "light";
    const next = current === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("coursetrack-theme", next);
  };

  const handleSignOut = async () => {
    try {
      const supabase = await createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // A missing browser client is still followed by a return to sign-in.
    }
    router.push("/login");
    router.refresh();
  };

  // Unauthenticated, no application membership, or a pre-auth page renders
  // without application navigation.
  const environmentBanner = (
    <EnvironmentBanner
      environment={deploymentEnvironment}
      snapshotRefreshedAt={snapshotRefreshedAt}
    />
  );

  if (!authContext || isPublicAuthPath(pathname)) {
    return (
      <div className="bare-page-frame">
        {environmentBanner}
        <main className="page-content page-content-bare">{children}</main>
      </div>
    );
  }

  return (
    <div className="app-frame">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/favicon.png"
              alt=""
              width="44"
              height="44"
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
          <StatusBadge tone="success">Database workspace</StatusBadge>
          <span>Async course search</span>
        </div>

        <nav className="primary-nav" aria-label="Primary navigation">
          {visibleNavigation.map((item) => {
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
                {item.label === "Tasks & Callouts" && (
                  <span className="nav-count">6</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <RuntimeInitializer />
          <Link href="/profile" className="profile-chip">
            <span className="avatar">{initialsFor(authContext.displayName)}</span>
            <span>
              <strong>{authContext.displayName}</strong>
              <small>{authContext.jobTitle || ROLE_LABELS[authContext.role]}</small>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
          <button className="icon-button sign-out-button" onClick={handleSignOut} aria-label="Sign out">
            <LogOut size={16} aria-hidden="true" />
            <span>Sign out</span>
          </button>
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
        {environmentBanner}
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
              </button>
              {notificationsOpen && (
                <div className="notification-popover">
                  <div className="popover-heading">
                    <strong>Notifications</strong>
                    <span>0 unread</span>
                  </div>
                  <div className="notification-empty">No unread notifications.</div>
                </div>
              )}
            </div>
            <Link href="/profile" className="topbar-avatar" aria-label="Open user profile">
              {initialsFor(authContext.displayName)}
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

function EnvironmentBanner({
  environment,
  snapshotRefreshedAt,
}: {
  environment: DeploymentEnvironment;
  snapshotRefreshedAt: string | null;
}) {
  if (environment === "production") return null;

  const label = environment === "staging"
    ? "STAGING"
    : environment === "preview"
      ? "PREVIEW"
      : "DEVELOPMENT";
  const detail = environment === "staging"
    ? snapshotRefreshedAt
      ? `Sanitized production snapshot — refreshed ${new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeZone: "America/Chicago",
        }).format(new Date(snapshotRefreshedAt))}`
      : "Sanitized production snapshot — refresh not recorded"
    : "Non-production environment";

  return (
    <div className={`environment-banner environment-${environment}`} role="status">
      <strong>{label}</strong>
      <span>{detail}</span>
    </div>
  );
}
