export const roles = [
  "Administrator",
  "Course Manager",
  "Instructional Designer",
  "Accreditation Reviewer",
  "Reporting User",
  "Read-Only User",
] as const;

export type Role = (typeof roles)[number];

export type Permission =
  | "courses:view"
  | "courses:edit-internal"
  | "courses:archive"
  | "versions:manage"
  | "accreditation:manage"
  | "flags:manage"
  | "notes:create"
  | "revamp:propose"
  | "revamp:approve"
  | "reports:export"
  | "lms:retrieve"
  | "administration:manage"
  | "audit:view";

const allPermissions: Permission[] = [
  "courses:view",
  "courses:edit-internal",
  "courses:archive",
  "versions:manage",
  "accreditation:manage",
  "flags:manage",
  "notes:create",
  "revamp:propose",
  "revamp:approve",
  "reports:export",
  "lms:retrieve",
  "administration:manage",
  "audit:view",
];

export const rolePermissions: Record<Role, Permission[]> = {
  Administrator: allPermissions,
  "Course Manager": allPermissions.filter(
    (permission) => permission !== "administration:manage",
  ),
  "Instructional Designer": [
    "courses:view",
    "courses:edit-internal",
    "versions:manage",
    "flags:manage",
    "notes:create",
    "revamp:propose",
    "lms:retrieve",
  ],
  "Accreditation Reviewer": [
    "courses:view",
    "accreditation:manage",
    "flags:manage",
    "notes:create",
    "reports:export",
  ],
  "Reporting User": ["courses:view", "reports:export"],
  "Read-Only User": ["courses:view"],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}

export const demoUser = {
  name: "Dana Weiss",
  initials: "DW",
  email: "dweiss@lexipol.com",
  role: "Administrator" as Role,
};
