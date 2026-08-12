"use client";

import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CircleGauge,
  Database,
  Flag,
  ListChecks,
  MapPinned,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type RetrievalRun } from "@/types/course";
import type { DashboardSnapshot } from "@/db";
import { StatusBadge } from "../status-badge";
import { TablePagination, useLocalTablePagination } from "../table-pagination";

const healthColors: Record<string, string> = {
  Healthy: "#84C341",
  Monitor: "#026BEC",
  "Needs Review": "#FFB81C",
  "At Risk": "#F27421",
  Critical: "#D50032",
};

function buildMetricCards(metrics: DashboardSnapshot["metrics"]) {
  return [
    {
      label: "LMS courses retrieved",
      value: metrics.totalLmsRetrieved,
      detail: "Current LMS source snapshots",
      icon: Database,
      tone: "blue",
    },
    {
      label: "Lexipol Managed",
      value: metrics.lexipolManaged,
      detail: "Confirmed managed portfolio",
      icon: ShieldCheck,
      tone: "teal",
    },
    {
      label: "Unmanaged",
      value: metrics.unmanaged,
      detail: "Outside the managed portfolio",
      icon: AlertTriangle,
      tone: "amber",
    },
    {
      label: "Missing metadata",
      value: metrics.missingContentMetadata,
      detail: "LMS courses without Content Metadata",
      icon: BookOpen,
      tone: "red",
    },
    {
      label: "Not LMS linked",
      value: metrics.notLmsLinked,
      detail: "Valid courses without a current LMS snapshot",
      icon: Database,
      tone: "slate",
    },
    {
      label: "Unresolved conflicts",
      value: metrics.unresolvedConflicts,
      detail: "Source values need a decision",
      icon: Flag,
      tone: "red",
    },
    {
      label: "Mapping required",
      value: metrics.mappingRequired,
      detail: "Unknown source values",
      icon: MapPinned,
      tone: "amber",
    },
    {
      label: "Stale LMS data",
      value: metrics.staleLms,
      detail: "Last successful snapshots remain available",
      icon: RefreshCw,
      tone: "slate",
    },
    {
      label: "Import errors",
      value: metrics.importValidationErrors,
      detail: "Rows blocked during preview",
      icon: ListChecks,
      tone: "purple",
    },
  ];
}

export function Dashboard({
  snapshot,
  retrievalRuns,
  firstName,
  userId,
}: {
  snapshot: DashboardSnapshot;
  retrievalRuns: RetrievalRun[];
  firstName: string;
  userId: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const metricCards = buildMetricCards(snapshot.metrics);
  const retrievalPagination = useLocalTablePagination(retrievalRuns, `coursetrack:${userId}:table:dashboard-retrievals`);

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Portfolio overview</span>
          <h1>Welcome, {firstName}</h1>
          <p>
            Monitor course health, accreditation risk, and the work that needs
            attention across the portfolio.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="button button-secondary"
            disabled
            title="LMS refresh is unavailable until the read-only connector is configured"
            aria-label="LMS refresh unavailable until the read-only connector is configured"
          >
            <RefreshCw size={16} />
            Retrieve LMS data
          </button>
        </div>
      </section>

      {snapshot.degradedMode && (
        <div className="inline-alert" role="status">
          <Database size={17} />
          <span><strong>Course data upgrade pending.</strong> Dashboard summaries remain available while the new comparison tools are being activated.</span>
        </div>
      )}

      <section className="metric-grid" aria-label="Portfolio summary">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className="metric-card" key={metric.label}>
              <div className={`metric-icon metric-${metric.tone}`}>
                <Icon size={19} aria-hidden="true" />
              </div>
              <div>
                <p>{metric.label}</p>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </div>
            </article>
          );
        })}
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <h2>Courses by vertical</h2>
              <p>{snapshot.coursesInView} unique managed courses · {snapshot.verticalMemberships} memberships</p>
            </div>
            <div className="heading-actions">
              <Link href="/courses?classification=Unmanaged" className="status-badge status-warning">Unmanaged {snapshot.metrics.unmanaged}</Link>
              <Link href="/courses?classification=Lexipol+Managed&vertical=No+vertical" className="status-badge status-neutral">Unclassified {snapshot.metrics.verticalUnclassified}</Link>
              <Link href="/courses">View library <ArrowRight size={15} /></Link>
            </div>
          </div>
          <div className="chart-frame chart-wide" aria-label="Bar chart of courses by vertical">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={snapshot.verticalData} margin={{ top: 12, right: 6, left: -24, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                <XAxis dataKey="name" tick={{ fontSize: 13, fill: "var(--text-muted)" }} angle={-18} textAnchor="end" height={56} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 13, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "var(--surface-muted)" }}
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 14,
                  }}
                />
                <Bar dataKey="courses" fill="#014AA8" radius={[5, 5, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Portfolio health</h2>
              <p>{snapshot.coursesInView} courses in view</p>
            </div>
            <div className="heading-actions"><Link href="/courses?classification=Unmanaged" className="status-badge status-warning">Unmanaged {snapshot.metrics.unmanaged}</Link><CircleGauge size={20} className="panel-icon" /></div>
          </div>
          <div className="donut-layout">
            <div className="chart-frame chart-donut" aria-label="Donut chart of portfolio health">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={snapshot.healthData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3}>
                    {snapshot.healthData.map((entry) => (
                      <Cell key={entry.name} fill={healthColors[entry.name]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      fontSize: 14,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center">
                <strong>{snapshot.coursesInView}</strong>
                <span>courses</span>
              </div>
            </div>
            <div className="chart-legend">
              {snapshot.healthData.map((entry) => (
                <div key={entry.name}>
                  <span style={{ background: healthColors[entry.name] }} />
                  <small>{entry.name}</small>
                  <strong>{entry.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Review queue</h2>
              <p>Nearest and overdue review dates</p>
            </div>
            <div className="heading-actions"><Link href="/courses?classification=Unmanaged" className="status-badge status-warning">Unmanaged {snapshot.metrics.unmanaged}</Link><CalendarClock size={20} className="panel-icon" /></div>
          </div>
          <div className="action-list">
            {snapshot.reviewQueue.map((course) => (
              <Link href={`/courses/${course.id}`} key={course.id}>
                <div>
                  <strong>{course.title}</strong>
                  <small>
                    {course.verticals.join(", ") || "No vertical"} · {course.owner ?? "No owner"}
                  </small>
                </div>
                <span>
                  {course.nextReviewDate && course.nextReviewDate < today ? (
                    <StatusBadge tone="danger">Overdue</StatusBadge>
                  ) : (
                    <time>{course.nextReviewDate}</time>
                  )}
                  <Chevron />
                </span>
              </Link>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Courses needing attention</h2>
              <p>Risk, flags, and missing metadata</p>
            </div>
            <div className="heading-actions"><Link href="/courses?classification=Unmanaged" className="status-badge status-warning">Unmanaged {snapshot.metrics.unmanaged}</Link><AlertTriangle size={20} className="panel-icon panel-icon-danger" /></div>
          </div>
          <div className="action-list">
            {snapshot.riskQueue.map((course) => (
              <Link href={`/courses/${course.id}`} key={course.id}>
                <div>
                  <strong>{course.title}</strong>
                  <small>
                    {course.flagCount} flags · {course.metadataCompletenessScore}% complete
                  </small>
                </div>
                <span>
                  <StatusBadge>{course.healthStatus}</StatusBadge>
                  <Chevron />
                </span>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recent LMS retrievals</h2>
            <p>Immutable history from the configured read-only LMS connector</p>
          </div>
          <Link href="/admin">
            View retrieval history <ArrowRight size={15} />
          </Link>
        </div>
        <div className="table-scroll">
          <table className="data-table compact-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Received</th>
                <th>Failed</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {retrievalRuns.length === 0 && <tr><td colSpan={6}>No LMS retrievals have been recorded.</td></tr>}
              {retrievalPagination.pageItems.map((run) => (
                <tr key={run.id}>
                  <td className="mono-cell">{run.id}</td>
                  <td>{run.provider}</td>
                  <td>
                    <StatusBadge>{run.status}</StatusBadge>
                  </td>
                  <td>{run.recordsReceived}</td>
                  <td>{run.recordsFailed}</td>
                  <td>{run.completedAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination page={retrievalPagination.page} pageSize={retrievalPagination.pageSize} total={retrievalRuns.length} onPageChange={retrievalPagination.setPage} onPageSizeChange={retrievalPagination.setPageSize} noun="runs" />
      </section>
    </div>
  );
}

function Chevron() {
  return <ArrowRight size={15} aria-hidden="true" />;
}
