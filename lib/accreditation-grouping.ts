import type { AccreditationRecord } from "@/types/course";

export interface AccreditationGroup {
  key: string;
  organization: string;
  jurisdiction: string;
  current: AccreditationRecord | null;
  expired: AccreditationRecord[];
}

export function groupAccreditationRecords(records: AccreditationRecord[]): AccreditationGroup[] {
  const groups = new Map<string, AccreditationGroup>();

  for (const record of records) {
    const key = `${record.organization}::${record.jurisdiction}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, organization: record.organization, jurisdiction: record.jurisdiction, current: null, expired: [] };
      groups.set(key, group);
    }
    if (record.status === "Expired") {
      group.expired.push(record);
    } else if (!group.current) {
      group.current = record;
    } else {
      // Defensive: more than one non-expired record in the same group — keep the
      // earliest expiring one as "current" and treat the rest as expired history.
      const incomingExpiration = record.expirationDate ?? "9999-12-31";
      const currentExpiration = group.current.expirationDate ?? "9999-12-31";
      if (incomingExpiration < currentExpiration) {
        group.expired.push(group.current);
        group.current = record;
      } else {
        group.expired.push(record);
      }
    }
  }

  for (const group of groups.values()) {
    group.expired.sort((a, b) => (b.expirationDate ?? "").localeCompare(a.expirationDate ?? ""));
  }

  return Array.from(groups.values()).sort(
    (a, b) => a.organization.localeCompare(b.organization) || a.jurisdiction.localeCompare(b.jurisdiction),
  );
}

export function accreditationDisplayLabel(record: AccreditationRecord, isCurrent: boolean): string {
  if (isCurrent && record.status === "Approved") {
    return "Active";
  }
  return record.status;
}
