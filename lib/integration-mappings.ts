import type { MappingField } from "@/types/integrations";

export const UPLOADED_MAPPING_REGISTRY: MappingField[] = [
  { source: "Course Id", target: "lmsCourseId", required: true, readOnly: true, transformation: "Trim and normalize identifier" },
  { source: "Course Name", target: "courseName", required: true, readOnly: true, transformation: "Trim whitespace" },
  { source: "Content Type", target: "contentType", required: false, readOnly: true, transformation: "Normalize label" },
  { source: "Duration (min)", target: "durationMinutes", required: false, readOnly: true, transformation: "Parse non-negative minutes" },
  { source: "Published", target: "published", required: false, readOnly: true, transformation: "Normalize Yes/No" },
  { source: "Description", target: "description", required: false, readOnly: true, transformation: "Preserve raw text; normalize whitespace for comparison" },
  { source: "Verticals", target: "verticals", required: false, readOnly: true, transformation: "Split and map approved vertical codes" },
  { source: "Frontend Link", target: "frontendLink", required: false, readOnly: true, transformation: "Validate HTTPS URL" },
];

export const WRIKE_MAPPING_REGISTRY: MappingField[] = [
  { source: "id", target: "wrikeTaskId", required: true, readOnly: true, transformation: null },
  { source: "title", target: "title", required: true, readOnly: true, transformation: "Normalize for indexed token search" },
  { source: "status/customStatusId", target: "status", required: false, readOnly: true, transformation: null },
  { source: "responsibleIds", target: "assigneeNames", required: false, readOnly: true, transformation: "Resolve against synchronized contacts" },
  { source: "dates.due", target: "dueDate", required: false, readOnly: true, transformation: "Parse ISO date" },
  { source: "parentIds/superParentIds", target: "projectTitles", required: false, readOnly: true, transformation: "Resolve against synchronized folders/projects" },
  { source: "customFields", target: "customFields", required: false, readOnly: true, transformation: "Retain key/value pairs" },
  { source: "permalink", target: "permalink", required: false, readOnly: true, transformation: "Verify Wrike HTTPS host before linking" },
];

export const WRIKE_IGNORED_RAW_FIELDS = ["briefDescription", "hasAttachments", "attachmentCount", "subTaskIds", "dependencyIds"];

export const WRIKE_TASK_OPTIONAL_FIELDS = ["responsibleIds", "parentIds", "superParentIds", "customFields"] as const;

// LMS provider documentation is not configured. Keeping this registry empty is
// deliberate: Administration must never invent a future provider contract.
export const LMS_MAPPING_REGISTRY: MappingField[] = [];
