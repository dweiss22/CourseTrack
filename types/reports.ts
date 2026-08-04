export type ReportDataset = "courses" | "health" | "accreditation" | "reviews" | "versions" | "work" | "revamp" | "discrepancies";
export type ReportOperator = "eq" | "neq" | "contains" | "in" | "gte" | "lte" | "not_empty";

export interface ReportColumn { key: string; label: string; dataType: "text" | "number" | "date" | "boolean"; }
export interface ReportFilter { field: string; operator: ReportOperator; value?: string | number | boolean | string[]; }
export interface ReportSort { field: string; direction: "asc" | "desc"; }
export interface ReportGroup { field: string; }
export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  dataset: ReportDataset;
  columns: string[];
  filters: ReportFilter[];
  sort: ReportSort[];
  group: ReportGroup | null;
  immutable: true;
}
export interface ReportDefinition {
  id: string;
  name: string;
  ownerId: string | null;
  ownerName: string | null;
  sourceTemplateId: string | null;
  dataset: ReportDataset;
  columns: string[];
  filters: ReportFilter[];
  sort: ReportSort[];
  group: ReportGroup | null;
  immutable: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
}
export interface ReportResult {
  definition: ReportDefinition;
  columns: ReportColumn[];
  rows: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  groups: Array<{ value: string; count: number }>;
}
