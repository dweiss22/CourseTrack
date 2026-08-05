import type {
  AccreditationHistoryGroup,
  AccreditationRecord,
  AccreditationRiskState,
  AssessedAccreditationRecord,
} from "@/types/course";

const DAY_MS = 86_400_000;

export interface AccreditationAssessmentOptions {
  courseKey?: string;
  asOfDate?: string;
  expirationWindowDays?: number;
}

/** Compatibility shape used by older callers while the richer assessment is adopted. */
export interface AccreditationGroup extends AccreditationHistoryGroup {
  expired: AccreditationRecord[];
}

export function normalizeAccreditationKey(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return new Date(parsed.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function recordTimestamp(record: AccreditationRecord): string {
  return record.updatedAt ?? record.createdAt ?? "";
}

function compareNullableDateDesc(left: string | null, right: string | null): number {
  if (left && right) return right.localeCompare(left);
  if (left) return -1;
  if (right) return 1;
  return 0;
}

export function compareAccreditationNewestFirst(
  left: AccreditationRecord,
  right: AccreditationRecord,
): number {
  return (
    compareNullableDateDesc(left.effectiveDate, right.effectiveDate) ||
    compareNullableDateDesc(left.expirationDate, right.expirationDate) ||
    recordTimestamp(right).localeCompare(recordTimestamp(left)) ||
    left.id.localeCompare(right.id)
  );
}

function duplicateKey(record: AccreditationRecord): string {
  return [
    normalizeAccreditationKey(record.approvalNumber),
    record.effectiveDate ?? "",
    record.expirationDate ?? "",
    normalizeAccreditationKey(record.status),
  ].join("::");
}

export function riskStateForRecord(
  record: AccreditationRecord,
  asOfDate: string,
  expirationWindowDays: number,
): AccreditationRiskState {
  if (record.effectiveDate && record.effectiveDate > asOfDate) return "future";
  if (record.status === "Not Required") return "not_required";
  if (record.status === "Expired" || (record.expirationDate && record.expirationDate < asOfDate)) {
    return "expired";
  }
  if (record.status === "Approved with Conditions") return "conditional";
  if (record.status === "Renewal Due") return "renewal_due";
  if (record.status === "Renewal Submitted") return "renewal_submitted";
  if (
    record.status === "Expiring Soon" ||
    (record.expirationDate && record.expirationDate <= addDays(asOfDate, expirationWindowDays))
  ) {
    return "expiring_soon";
  }
  if (!record.expirationDate) return "undated";
  return "active";
}

export function isAccreditationRiskState(state: AccreditationRiskState): boolean {
  return state === "expired" || state === "expiring_soon";
}

export function assessAccreditationHistory(
  records: AccreditationRecord[],
  options: AccreditationAssessmentOptions = {},
): AccreditationGroup[] {
  const courseKey = normalizeAccreditationKey(options.courseKey ?? "course");
  const asOfDate = options.asOfDate ?? todayUtc();
  const expirationWindowDays = options.expirationWindowDays ?? 90;
  const grouped = new Map<string, AccreditationRecord[]>();

  for (const record of records.filter((item) => !item.archivedAt)) {
    const organizationKey = normalizeAccreditationKey(record.organization);
    const jurisdictionKey = normalizeAccreditationKey(record.jurisdiction);
    const key = `${courseKey}::${organizationKey}::${jurisdictionKey}`;
    const list = grouped.get(key) ?? [];
    list.push(record);
    grouped.set(key, list);
  }

  const result: AccreditationGroup[] = [];
  for (const [key, unsorted] of grouped) {
    const sorted = [...unsorted].sort(compareAccreditationNewestFirst);
    const seenDuplicates = new Set<string>();
    const duplicateIds = new Set<string>();
    for (const record of sorted) {
      const fingerprint = duplicateKey(record);
      if (seenDuplicates.has(fingerprint)) duplicateIds.add(record.id);
      else seenDuplicates.add(fingerprint);
    }

    const canonical = sorted.filter((record) => !duplicateIds.has(record.id));
    const currentRecord = canonical.find(
      (record) => !record.effectiveDate || record.effectiveDate <= asOfDate,
    ) ?? null;
    const assessed = sorted.map<AssessedAccreditationRecord>((record) => {
      const riskState = riskStateForRecord(record, asOfDate, expirationWindowDays);
      const historyRole = duplicateIds.has(record.id)
        ? "duplicate"
        : record.id === currentRecord?.id
          ? "current"
          : riskState === "future"
            ? "future"
            : "superseded";
      return { record, historyRole, riskState, isAtRisk: isAccreditationRiskState(riskState) };
    });
    const current = assessed.find((item) => item.historyRole === "current") ?? null;
    const summary = assessed[0];
    if (!summary) continue;
    const riskState = current?.riskState ?? "future";
    result.push({
      key,
      courseKey,
      organization: summary.record.organization,
      jurisdiction: summary.record.jurisdiction || "Not provided",
      summary,
      current,
      history: assessed.slice(1),
      expired: assessed
        .filter((item) => item.riskState === "expired" && item.historyRole !== "current")
        .map((item) => item.record),
      riskState,
      isAtRisk: isAccreditationRiskState(riskState),
    });
  }

  return result.sort(
    (left, right) =>
      normalizeAccreditationKey(left.organization).localeCompare(
        normalizeAccreditationKey(right.organization),
      ) ||
      normalizeAccreditationKey(left.jurisdiction).localeCompare(
        normalizeAccreditationKey(right.jurisdiction),
      ),
  );
}

export function groupAccreditationRecords(
  records: AccreditationRecord[],
  options: AccreditationAssessmentOptions = {},
): AccreditationGroup[] {
  return assessAccreditationHistory(records, options);
}

export function accreditationDisplayLabel(
  record: AccreditationRecord,
  isCurrent: boolean,
): string {
  if (!isCurrent) return record.status === "Expired" ? "Superseded · Expired" : "Superseded";
  if (record.status === "Approved") return "Active";
  return record.status;
}

export const accreditationRiskLabels: Record<AccreditationRiskState, string> = {
  active: "Active",
  expiring_soon: "Expiring soon",
  renewal_due: "Renewal due",
  renewal_submitted: "Renewal submitted",
  conditional: "Approved with conditions",
  expired: "Expired",
  undated: "Missing expiration",
  future: "Future effective",
  not_required: "Not required",
};
