import assert from "node:assert/strict";
import test from "node:test";
import {
  assessAccreditationHistory,
  riskStateForRecord,
} from "../lib/accreditation-grouping.ts";

const asOfDate = "2026-08-04";
const base = {
  organization: "State POST",
  jurisdiction: "Texas",
  status: "Approved",
  approvalNumber: "A-100",
  creditHours: 4,
  effectiveDate: "2026-01-01",
  expirationDate: "2027-01-01",
  source: "uploaded",
  riskReasons: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
};
const record = (id, overrides = {}) => ({ ...base, id, ...overrides });
const assess = (records) => assessAccreditationHistory(records, { courseKey: "course-1", asOfDate, expirationWindowDays: 90 })[0];

test("a current replacement suppresses an older expired record", () => {
  const group = assess([
    record("old", { effectiveDate: "2025-01-01", expirationDate: "2026-01-01" }),
    record("new", { effectiveDate: "2026-02-01", expirationDate: "2027-02-01", updatedAt: "2026-02-01T00:00:00.000Z" }),
  ]);
  assert.equal(group.current.record.id, "new");
  assert.equal(group.riskState, "active");
  assert.equal(group.history.find((item) => item.record.id === "old").historyRole, "superseded");
});

test("a future replacement does not suppress the currently applicable expired record", () => {
  const group = assess([
    record("current", { expirationDate: "2026-07-01" }),
    record("future", { effectiveDate: "2026-09-01", expirationDate: "2027-09-01", updatedAt: "2026-07-01T00:00:00.000Z" }),
  ]);
  assert.equal(group.current.record.id, "current");
  assert.equal(group.riskState, "expired");
  assert.equal(group.summary.historyRole, "future");
});

test("renewal and conditional stored states remain deterministic", () => {
  assert.equal(riskStateForRecord(record("due", { status: "Renewal Due" }), asOfDate, 90), "renewal_due");
  assert.equal(riskStateForRecord(record("submitted", { status: "Renewal Submitted" }), asOfDate, 90), "renewal_submitted");
  assert.equal(riskStateForRecord(record("conditional", { status: "Approved with Conditions" }), asOfDate, 90), "conditional");
});

test("missing dates and not-required records have distinct states", () => {
  assert.equal(riskStateForRecord(record("undated", { expirationDate: null }), asOfDate, 90), "undated");
  assert.equal(riskStateForRecord(record("not-required", { status: "Not Required", effectiveDate: null, expirationDate: null }), asOfDate, 90), "not_required");
});

test("equivalent records retain the newest audit row as canonical", () => {
  const group = assess([
    record("older", { updatedAt: "2026-03-01T00:00:00.000Z" }),
    record("newer", { updatedAt: "2026-04-01T00:00:00.000Z" }),
  ]);
  assert.equal(group.current.record.id, "newer");
  assert.equal(group.history.find((item) => item.record.id === "older").historyRole, "duplicate");
});

test("an archived duplicate cannot displace an active record", () => {
  const group = assess([
    record("active", { updatedAt: "2026-04-01T00:00:00.000Z" }),
    record("archived", {
      updatedAt: "2026-05-01T00:00:00.000Z",
      archivedAt: "2026-05-01T00:00:00.000Z",
    }),
  ]);
  assert.equal(group.current.record.id, "active");
  assert.equal(group.summary.record.id, "active");
  assert.equal(group.history.find((item) => item.record.id === "archived").historyRole, "superseded");
});

test("organization and jurisdiction whitespace and case normalize into one group", () => {
  const groups = assessAccreditationHistory([
    record("one", { organization: " State   POST ", jurisdiction: " TEXAS " }),
    record("two", { organization: "state post", jurisdiction: "texas", approvalNumber: "A-200" }),
  ], { courseKey: "course-1", asOfDate });
  assert.equal(groups.length, 1);
});

test("overlapping periods select the newest effective currently-applicable record", () => {
  const group = assess([
    record("first", { effectiveDate: "2026-01-01", expirationDate: "2027-01-01" }),
    record("second", { effectiveDate: "2026-06-01", expirationDate: "2027-06-01", approvalNumber: "A-200" }),
  ]);
  assert.equal(group.current.record.id, "second");
});

test("dates override inconsistent stored approval status", () => {
  assert.equal(riskStateForRecord(record("inconsistent", { status: "Approved", expirationDate: "2026-01-01" }), asOfDate, 90), "expired");
});

test("tie-breaking by id is stable when dates and audit timestamps match", () => {
  const group = assess([record("b"), record("a", { approvalNumber: "A-200" })]);
  assert.equal(group.summary.record.id, "a");
});
