"use client";

import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  CalendarClock,
  CircleGauge,
  Flag,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
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
  dashboardMetrics,
  sampleCourses,
  sampleRetrievalRuns,
} from "@/lib/sample-data";
import { verticals } from "@/types/course";
import { StatusBadge } from "../status-badge";

const healthColors: Record<string, string> = {
  Healthy: "#139b78",
  Monitor: "#3f7fe5",
  "Needs Review": "#d19a22",
  "At Risk": "#df6b3c",
  Critical: "#d14755",
};

const metricCards = [
  {
    label: "Total courses",
    value: dashboardMetrics.total,
    detail: "Across 8 verticals",
    icon: BookOpen,
    tone: "blue",
  },
  {
    label: "Due for review",
    value: dashboardMetrics.dueForReview,
    detail: `${dashboardMetrics.overdue} already overdue`,
    icon: CalendarClock,
    tone: "amber",
  },
  {
    label: "Accreditation risk",
    value: dashboardMetrics.accreditationRisk,
    detail: "Expiring, expired, or conditional",
    icon: Award,
    tone: "purple",
  },
  {
    label: "Unresolved flags",
    value: dashboardMetrics.unresolvedFlags,
    detail: "6 high or critical priorities",
    icon: Flag,
    tone: "red",
  },
  {
    label: "Revamp pipeline",
    value: dashboardMetrics.proposedRevamps,
    detail: "Across all proposal stages",
    icon: Sparkles,
    tone: "teal",
  },
  {
    label: "Stale LMS data",
    value: dashboardMetrics.staleLms,
    detail: "Local snapshots remain available",
    icon: RefreshCw,
    tone: "slate",
  },
];

export function Dashboard() {
  const [verticalFilter, setVerticalFilter] = useState("All verticals");
  const [retrievalState, setRetrievalState] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");
  const [retrievalMessage, setRetrievalMessage] = useState("");

  const filteredCourses = useMemo(
    () =>
      verticalFilter === "All verticals"
        ? sampleCourses
        : sampleCourses.filter(
            (course) => course.primaryVertical === verticalFilter,
          ),
    [verticalFilter],
  );

  const verticalData = verticals.map((vertical) => ({
    name: vertical
      .replace(" and Telecommunications", "")
      .replace("Emergency Medical Services", "EMS"),
    courses: sampleCourses.filter(
      (course) => course.primaryVertical === vertical,
    ).length,
  }));

  const healthData = Object.keys(healthColors).map((status) => ({
    name: status,
    value: filteredCourses.filter((course) => course.healthStatus === status)
      .length,
  }));

  const reviewQueue = filteredCourses
    .filter((course) => course.nextReviewDate)
    .sort((a, b) =>
      (a.nextReviewDate ?? "").localeCompare(b.nextReviewDate ?? ""),
    )
    .slice(0, 5);

  const riskQueue = filteredCourses
    .filter((course) =>
      ["Critical", "At Risk"].includes(course.healthStatus),
    )
    .slice(0, 5);

  const runRetrieval = async () => {
    setRetrievalState("running");
    setRetrievalMessage("");
    try {
      const response = await fetch("/api/lms/retrieve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "healthy" }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message);
      setRetrievalState("success");
      setRetrievalMessage(
        result.message ?? "Mock LMS data retrieved successfully.",
      );
    } catch (error) {
      setRetrievalState("error");
      setRetrievalMessage(
        error instanceof Error
          ? error.message
          : "The mock retrieval could not be completed.",
      );
    }
  };

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Portfolio overview</span>
          <h1>Good afternoon, Dana</h1>
          <p>
            Monitor course health, accreditation risk, and the work that needs
            attention across the portfolio.
          </p>
        </div>
        <div className="heading-actions">
          <select
            className="select-control"
            value={verticalFilter}
            onChange={(event) => setVerticalFilter(event.target.value)}
            aria-label="Filter dashboard by vertical"
          >
            <option>All verticals</option>
            {verticals.map((vertical) => (
              <option key={vertical}>{vertical}</option>
            ))}
          </select>
          <button
            className="button button-secondary"
            onClick={runRetrieval}
            disabled={retrievalState === "running"}
          >
            <RefreshCw
              size={16}
              className={retrievalState === "running" ? "spin" : ""}
            />
            {retrievalState === "running"
              ? "Retrieving…"
              : "Retrieve LMS data"}
          </button>
        </div>
      </section>

      {retrievalMessage && (
        <div
          className={`inline-alert ${
            retrievalState === "error" ? "alert-danger" : "alert-success"
          }`}
          role="status"
        >
          {retrievalState === "error" ? (
            <AlertTriangle size={17} />
          ) : (
            <RefreshCw size={17} />
          )}
          <span>
            <strong>
              {retrievalState === "error"
                ? "Retrieval failed"
                : "Read-only retrieval complete"}
            </strong>
            {retrievalMessage}
          </span>
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
              <p>Current sample portfolio distribution</p>
            </div>
            <Link href="/courses">
              View library <ArrowRight size={15} />
            </Link>
          </div>
          <div className="chart-frame chart-wide" aria-label="Bar chart of courses by vertical">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={verticalData} margin={{ top: 12, right: 6, left: -24, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} angle={-18} textAnchor="end" height={56} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "var(--surface-muted)" }}
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="courses" fill="#2f6fb3" radius={[5, 5, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Portfolio health</h2>
              <p>{filteredCourses.length} courses in view</p>
            </div>
            <CircleGauge size={20} className="panel-icon" />
          </div>
          <div className="donut-layout">
            <div className="chart-frame chart-donut" aria-label="Donut chart of portfolio health">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={healthData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3}>
                    {healthData.map((entry) => (
                      <Cell key={entry.name} fill={healthColors[entry.name]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center">
                <strong>{filteredCourses.length}</strong>
                <span>courses</span>
              </div>
            </div>
            <div className="chart-legend">
              {healthData.map((entry) => (
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
            {reviewQueue.map((course) => (
              <Link href={`/courses/${course.id}`} key={course.id}>
                <div>
                  <strong>{course.title}</strong>
                  <small>
                    {course.primaryVertical} · {course.owner ?? "No owner"}
                  </small>
                </div>
                <span>
                  {course.nextReviewDate && course.nextReviewDate < "2026-07-30" ? (
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
            {riskQueue.map((course) => (
              <Link href={`/courses/${course.id}`} key={course.id}>
                <div>
                  <strong>{course.title}</strong>
                  <small>
                    {course.flags.length} flags · {course.metadataCompletenessScore}% complete
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
            <p>One-way retrieval history from the active Mock LMS provider</p>
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
              {sampleRetrievalRuns.map((run) => (
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
