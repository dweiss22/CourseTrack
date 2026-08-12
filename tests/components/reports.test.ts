import { describe, expect, it } from "vitest";
import { executeReport, migrateLegacyReportDefinition, prebuiltDefinition, reportCsv, REPORT_TEMPLATES, validateReportDefinition } from "@/lib/report-engine";

describe("allowlisted report engine", () => {
  it("exposes exactly the eight immutable prebuilt reports", () => {
    expect(REPORT_TEMPLATES).toHaveLength(8);
    expect(new Set(REPORT_TEMPLATES.map((template) => template.id)).size).toBe(8);
    expect(REPORT_TEMPLATES.every((template) => template.immutable)).toBe(true);
  });
  it("rejects fields outside the dataset registry", () => {
    expect(() => validateReportDefinition({ name: "Unsafe", dataset: "courses", columns: ["password"], filters: [], sort: [], group: null })).toThrow(/not allowed/);
  });
  it("migrates every legacy vertical field reference before validation", () => {
    const migrated = migrateLegacyReportDefinition({
      dataset: "courses",
      columns: ["courseCode", "primaryVertical", "verticals"],
      filters: [{ field: "primaryVertical", operator: "contains", value: "Law" }],
      sort: [{ field: "primaryVertical", direction: "asc" }],
      group: { field: "primaryVertical" },
    });

    expect(migrated.columns).toEqual(["courseCode", "verticals"]);
    expect(migrated.filters[0]?.field).toBe("verticals");
    expect(migrated.sort[0]?.field).toBe("verticals");
    expect(migrated.group?.field).toBe("verticals");
    expect(() => validateReportDefinition({ name: "Legacy report", ...migrated })).not.toThrow();
  });
  it("escapes CSV and protects spreadsheet formulas", () => {
    const definition = prebuiltDefinition(REPORT_TEMPLATES[0]!);
    const result = { ...executeReport(definition, [], 1, 50), columns: [{ key: "title", label: "Title", dataType: "text" as const }], rows: [{ title: '=HYPERLINK("bad")' }, { title: 'Course, "Quoted"' }], total: 2 };
    const csv = reportCsv(result);
    expect(csv.startsWith("\ufeff")).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('Course, ""Quoted""');
  });
});
