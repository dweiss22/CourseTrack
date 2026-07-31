"use client";

import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Grid2X2,
  List,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { Course, ManagementClassification } from "@/types/course";
import {
  getVerticalLabel,
  managementClassifications,
  verticals,
} from "@/types/course";
import { StatusBadge } from "../status-badge";

export type CourseLibraryRecord = Pick<
  Course,
  | "id"
  | "title"
  | "shortTitle"
  | "courseCode"
  | "lmsCourseId"
  | "description"
  | "primaryVertical"
  | "managementClassification"
  | "reconciliationStatus"
  | "retrievalStatus"
  | "lastRetrievedAt"
  | "conflictCount"
  | "healthStatus"
  | "lifecycleStatus"
  | "primaryTopic"
  | "tags"
  | "owner"
  | "durationMinutes"
  | "dataSource"
> & {
  topicAssignments: Array<{ topic: string }>;
  hasLmsSnapshot: boolean;
  hasContentMetadata: boolean;
  importValidationErrorCount: number;
};

const columnHelper = createColumnHelper<CourseLibraryRecord>();

const columns = [
  columnHelper.accessor("title", {
    header: "Course",
    cell: ({ row }) => (
      <div className="course-title-cell">
        <Link href={`/courses/${row.original.id}`}>{row.original.title}</Link>
        <span>
          {row.original.courseCode} · {row.original.durationMinutes} min
        </span>
      </div>
    ),
  }),
  columnHelper.accessor("primaryVertical", {
    header: "Primary vertical",
    cell: (info) => <span className="vertical-label">{info.getValue()}</span>,
  }),
  columnHelper.accessor("managementClassification", {
    header: "Management",
    cell: (info) => (
      <StatusBadge
        tone={
          info.getValue() === "Lexipol managed"
            ? "success"
            : info.getValue() === "Non-Lexipol excluded"
              ? "neutral"
              : info.getValue() === "Unclassified"
                ? "warning"
                : "info"
        }
      >
        {info.getValue()}
      </StatusBadge>
    ),
  }),
  columnHelper.accessor("reconciliationStatus", {
    header: "Reconciliation",
    cell: (info) => <StatusBadge>{info.getValue()}</StatusBadge>,
  }),
  columnHelper.accessor("retrievalStatus", {
    header: "Source / freshness",
    cell: ({ row }) => (
      <div className="source-status-cell">
        <StatusBadge>{row.original.retrievalStatus}</StatusBadge>
        <small>{row.original.lastRetrievedAt?.slice(0, 10) ?? "No LMS snapshot"}</small>
      </div>
    ),
  }),
  columnHelper.accessor("conflictCount", {
    header: "Conflicts",
    cell: (info) => (
      <span className={info.getValue() > 0 ? "conflict-count" : "text-muted"}>
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("topicAssignments", {
    header: "Topics",
    cell: (info) => (
      <span className="topic-summary">
        {info.getValue().slice(0, 2).map((assignment) => assignment.topic).join(" · ") || "No topics"}
      </span>
    ),
  }),
  columnHelper.accessor("healthStatus", {
    header: "Health",
    cell: (info) => <StatusBadge>{info.getValue()}</StatusBadge>,
  }),
];

type WorkQueue =
  | "All queues"
  | "Missing Content Metadata"
  | "Missing from LMS"
  | "Field conflicts"
  | "Mapping required"
  | "Invalid import records"
  | "Stale LMS data";

function csvSafe(value: unknown): string {
  const stringValue = String(value ?? "");
  const protectedValue = /^[=+\-@]/.test(stringValue)
    ? `'${stringValue}`
    : stringValue;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function CourseLibrary({ courses }: { courses: CourseLibraryRecord[] }) {
  const [search, setSearch] = useState("");
  const [vertical, setVertical] = useState("All verticals");
  const [lifecycle, setLifecycle] = useState("All statuses");
  const [health, setHealth] = useState("All health levels");
  const [classification, setClassification] = useState<
    "Normal portfolio" | "All classifications" | ManagementClassification
  >("Normal portfolio");
  const [workQueue, setWorkQueue] = useState<WorkQueue>("All queues");
  const [view, setView] = useState<"table" | "cards">("table");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return courses.filter((course) => {
      const searchable = [
        course.title,
        course.shortTitle,
        course.courseCode,
        course.lmsCourseId ?? "",
        course.description,
        course.primaryTopic,
        course.topicAssignments.map((assignment) => assignment.topic).join(" "),
        course.tags.join(" "),
        course.owner ?? "",
        course.managementClassification,
        course.reconciliationStatus,
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!query || searchable.includes(query)) &&
        (vertical === "All verticals" ||
          course.primaryVertical === vertical) &&
        (lifecycle === "All statuses" ||
          course.lifecycleStatus === lifecycle) &&
        (health === "All health levels" || course.healthStatus === health)
        &&
        (classification === "All classifications" ||
          (classification === "Normal portfolio"
            ? course.managementClassification !== "Non-Lexipol excluded"
            : course.managementClassification === classification))
        &&
        (workQueue === "All queues" ||
          (workQueue === "Missing Content Metadata" &&
            course.hasLmsSnapshot &&
            !course.hasContentMetadata) ||
          (workQueue === "Missing from LMS" &&
            !course.hasLmsSnapshot &&
            course.hasContentMetadata) ||
          (workQueue === "Field conflicts" && course.conflictCount > 0) ||
          (workQueue === "Mapping required" &&
            course.reconciliationStatus === "Mapping required") ||
          (workQueue === "Invalid import records" &&
            course.importValidationErrorCount > 0) ||
          (workQueue === "Stale LMS data" &&
            ["Stale Data", "Retrieval Failed"].includes(
              course.retrievalStatus,
            )))
      );
    });
  }, [classification, courses, health, lifecycle, search, vertical, workQueue]);

  // TanStack Table intentionally exposes stateful functions that React Compiler
  // does not memoize; the table owns the relevant memoization boundaries.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  });

  const activeFilterCount = [
    search,
    vertical !== "All verticals" ? vertical : "",
    lifecycle !== "All statuses" ? lifecycle : "",
    health !== "All health levels" ? health : "",
    classification !== "Normal portfolio" ? classification : "",
    workQueue !== "All queues" ? workQueue : "",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch("");
    setVertical("All verticals");
    setLifecycle("All statuses");
    setHealth("All health levels");
    setClassification("Normal portfolio");
    setWorkQueue("All queues");
    table.setPageIndex(0);
  };

  const applySavedView = (savedView: WorkQueue) => {
    setWorkQueue(savedView);
    table.setPageIndex(0);
  };

  const exportResults = () => {
    const headers = [
      "Course ID",
      "Course Code",
      "Title",
      "Primary Vertical",
      "Management Classification",
      "Reconciliation Status",
      "Source Freshness",
      "Conflict Count",
      "Topics",
      "Health",
      "Data Source",
    ];
    const rows = filtered.map((course) => [
      course.id,
      course.courseCode,
      course.title,
      course.primaryVertical,
      course.managementClassification,
      course.reconciliationStatus,
      course.retrievalStatus,
      course.conflictCount,
      course.topicAssignments.map((assignment) => assignment.topic).join("; "),
      course.healthStatus,
      course.dataSource,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvSafe).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "coursetrack-course-library.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const toggleFavorite = (courseId: string) => {
    setFavorites((current) =>
      current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : [...current, courseId],
    );
  };

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Primary workspace</span>
          <h1>Course Library</h1>
          <p>
            Search, filter, and review the full course portfolio with clear data
            provenance.
          </p>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" onClick={exportResults}>
            <Download size={16} />
            Export results
          </button>
          <Link href="/admin" className="button button-primary">
            <SlidersHorizontal size={16} />
            Import or retrieve
          </Link>
        </div>
      </section>

      <div className="source-banner">
        <div className="source-banner-icon">S</div>
        <div>
          <strong>Sample data mode</strong>
          <span>
            These records were generated from the supplied LMS, Content Metadata,
            and Topics workbooks. LMS fields are read-only; internal fields can be maintained separately.
          </span>
        </div>
        <StatusBadge tone="sample">Mock LMS</StatusBadge>
      </div>

      <section className="library-toolbar">
        <div className="library-search">
          <Search size={17} aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              table.setPageIndex(0);
            }}
            placeholder="Search title, code, LMS ID, topic, tag, or owner…"
            aria-label="Search course library"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Clear search">
              <X size={15} />
            </button>
          )}
        </div>
        <div className="filter-row">
          <select
            value={classification}
            onChange={(event) => {
              setClassification(
                event.target.value as
                  | "Normal portfolio"
                  | "All classifications"
                  | ManagementClassification,
              );
              table.setPageIndex(0);
            }}
            aria-label="Filter by management classification"
          >
            <option>Normal portfolio</option>
            <option>All classifications</option>
            {managementClassifications.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={vertical}
            onChange={(event) => {
              setVertical(event.target.value);
              table.setPageIndex(0);
            }}
            aria-label="Filter by vertical"
          >
            <option>All verticals</option>
            {verticals.map((item) => (
              <option key={item} value={item}>
                {getVerticalLabel(item)}
              </option>
            ))}
          </select>
          <select
            value={lifecycle}
            onChange={(event) => {
              setLifecycle(event.target.value);
              table.setPageIndex(0);
            }}
            aria-label="Filter by lifecycle status"
          >
            <option>All statuses</option>
            {[
              "Published",
              "Under Maintenance",
              "Internal Review",
              "In Development",
              "Scheduled for Revamp",
              "Retired",
              "Archived",
            ].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={health}
            onChange={(event) => {
              setHealth(event.target.value);
              table.setPageIndex(0);
            }}
            aria-label="Filter by portfolio health"
          >
            <option>All health levels</option>
            {["Healthy", "Monitor", "Needs Review", "At Risk", "Critical"].map(
              (item) => (
                <option key={item}>{item}</option>
              ),
            )}
          </select>
        </div>
        <div className="view-toggle" aria-label="Choose library view">
          <button
            className={view === "table" ? "active" : ""}
            onClick={() => setView("table")}
            aria-label="Table view"
            aria-pressed={view === "table"}
          >
            <List size={17} />
          </button>
          <button
            className={view === "cards" ? "active" : ""}
            onClick={() => setView("cards")}
            aria-label="Card view"
            aria-pressed={view === "cards"}
          >
            <Grid2X2 size={17} />
          </button>
        </div>
      </section>

      <section className="saved-view-row">
        <span>Source work queues</span>
        {[
          "Missing Content Metadata",
          "Missing from LMS",
          "Field conflicts",
          "Mapping required",
          "Invalid import records",
          "Stale LMS data",
        ].map((queue) => (
          <button
            key={queue}
            className={workQueue === queue ? "active" : ""}
            onClick={() => applySavedView(queue as WorkQueue)}
          >
            {queue}
          </button>
        ))}
        {activeFilterCount > 0 && (
          <button className="clear-filter-button" onClick={clearFilters}>
            Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
          </button>
        )}
      </section>

      <section className="panel library-panel">
        <div className="result-summary">
          <div>
            <strong>{filtered.length} courses</strong>
            <span>of {courses.length} total</span>
          </div>
          <button className="button button-ghost">
            <Columns3 size={16} />
            Columns
          </button>
        </div>

        {view === "table" ? (
          <div className="table-scroll">
            <table className="data-table course-table">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    <th aria-label="Favorites" />
                    {headerGroup.headers.map((header) => (
                      <th key={header.id}>
                        <button
                          className={
                            header.column.getCanSort() ? "sortable-header" : ""
                          }
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {header.column.getIsSorted() === "asc"
                            ? " ↑"
                            : header.column.getIsSorted() === "desc"
                              ? " ↓"
                              : ""}
                        </button>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button
                        className={`favorite-button ${
                          favorites.includes(row.original.id) ? "favorite-active" : ""
                        }`}
                        onClick={() => toggleFavorite(row.original.id)}
                        aria-label={`${favorites.includes(row.original.id) ? "Remove" : "Add"} ${row.original.title} ${favorites.includes(row.original.id) ? "from" : "to"} favorites`}
                      >
                        <Star
                          size={16}
                          fill={
                            favorites.includes(row.original.id)
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>
                    </td>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="course-card-grid">
            {table.getRowModel().rows.map(({ original: course }) => (
              <article className="course-card" key={course.id}>
                <div className="course-card-top">
                  <StatusBadge
                    tone={
                      course.managementClassification === "Lexipol managed"
                        ? "success"
                        : course.managementClassification ===
                            "Non-Lexipol excluded"
                          ? "neutral"
                          : "warning"
                    }
                  >
                    {course.managementClassification}
                  </StatusBadge>
                  <button
                    className={`favorite-button ${
                      favorites.includes(course.id) ? "favorite-active" : ""
                    }`}
                    onClick={() => toggleFavorite(course.id)}
                    aria-label="Toggle favorite"
                  >
                    <Star
                      size={17}
                      fill={favorites.includes(course.id) ? "currentColor" : "none"}
                    />
                  </button>
                </div>
                <Link href={`/courses/${course.id}`}>{course.title}</Link>
                <p>{course.description}</p>
                <div className="course-card-meta">
                  <span>{course.courseCode}</span>
                  <span>{course.durationMinutes} min</span>
                  <span>{course.retrievalStatus}</span>
                </div>
                <div className="course-card-badges">
                  <StatusBadge>{course.reconciliationStatus}</StatusBadge>
                  <StatusBadge>{course.healthStatus}</StatusBadge>
                </div>
                <div className="course-card-footer">
                  <span>
                    {getVerticalLabel(course.primaryVertical)} · {course.topicAssignments[0]?.topic ?? "No topic"}
                  </span>
                  <span>
                    {course.conflictCount > 0
                      ? `${course.conflictCount} unresolved conflict${course.conflictCount === 1 ? "" : "s"}`
                      : "Sources reconciled"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="empty-state">
            <Search size={26} />
            <h3>No courses match these filters</h3>
            <p>Try a broader search or clear the current filters.</p>
            <button className="button button-secondary" onClick={clearFilters}>
              Reset filters
            </button>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="pagination-row">
            <span>
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </span>
            <div>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label="Previous page"
              >
                <ChevronLeft size={17} />
              </button>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label="Next page"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
