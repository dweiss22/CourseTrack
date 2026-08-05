"use client";

import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CircleGauge,
  Database,
  Flag,
  GitCompareArrows,
  ListChecks,
  MapPinned,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  getVerticalLabel,
  type RetrievalRun,
  type Vertical,
  verticals,
} from "@/types/course";
import type { DashboardSnapshot } from "@/db";
import { StatusBadge } from "../status-badge";

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
      detail: "Includes excluded source snapshots",
      icon: Database,
      tone: "blue",
    },
    {
      label: "Lexipol managed",
      value: metrics.lexipolManaged,
      detail: "Confirmed managed portfolio",
      icon: ShieldCheck,
      tone: "teal",
    },
    {
      label: "Non-Lexipol tracked",
      value: metrics.nonLexipolTracked,
      detail: "Visible for monitoring",
      icon: CircleGauge,
      tone: "purple",
    },
    {
      label: "Unclassified",
      value: metrics.unclassified,
      detail: "Awaiting portfolio decision",
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
      label: "Missing from LMS",
      value: metrics.missingFromLms,
      detail: "Content Metadata-only records",
      icon: GitCompareArrows,
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
  selectedVertical,
  includeExcluded,
}: {
  snapshot: DashboardSnapshot;
  retrievalRuns: RetrievalRun[];
  firstName: string;
  selectedVertical: Vertical | "All verticals";
  includeExcluded: boolean;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const metricCards = buildMetricCards(snapshot.metrics);
  const updateFilters = (vertical: Vertical | "All verticals", excluded: boolean) => {
    const params = new URLSearchParams();
    if (vertical !== "All verticals") params.set("vertical", vertical);
    if (excluded) params.set("excluded", "1");
    router.replace(params.size ? `/?${params}` : "/");
  };

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
          <select
            className="select-control"
            value={selectedVertical}
            onChange={(event) => updateFilters(event.target.value as Vertical | "All verticals", includeExcluded)}
            aria-label="Filter dashboard by vertical"
          >
            <option>All verticals</option>
            {verticals.map((vertical) => (
              <option key={vertical} value={vertical}>
                {getVerticalLabel(vertical)}
              </option>
            ))}
          </select>
          <label className="include-excluded-control">
            <input
              type="checkbox"
              checked={includeExcluded}
              onChange={(event) => updateFilters(selectedVertical, event.target.checked)}
            />
            Include excluded
          </label>
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
              <p>Current portfolio distribution</p>
            </div>
            <Link href="/courses">
              View library <ArrowRight size={15} />
            </Link>
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
            <CircleGauge size={20} className="panel-icon" />
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
            <CalendarClock size={20} className="panel-icon" />
          </div>
          <div className="action-list">
            {snapshot.reviewQueue.map((course) => (
              <Link href={`/courses/${course.id}`} key={course.id}>
                <div>
                  <strong>{course.title}</strong>
                  <small>
                    {course.primaryVertical} · {course.owner ?? "No owner"}
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
            <AlertTriangle size={20} className="panel-icon panel-icon-danger" />
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
              {retrievalRuns.map((run) => (
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
      </section>
    </div>
  );
}

function Chevron() {
  return <ArrowRight size={15} aria-hidden="true" />;
}
