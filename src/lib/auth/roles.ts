export type Role = "owner" | "staff" | "readonly";

const rank: Record<Role, number> = { readonly: 0, staff: 1, owner: 2 };

/** What each role may do. Owners can do everything. */
export const permissions = {
  view: "readonly",
  editCatalog: "staff",
  editOrders: "staff",
  viewPayments: "staff",
  viewReports: "owner",
  editSettings: "owner",
  manageStaff: "owner",
} as const satisfies Record<string, Role>;

export type Permission = keyof typeof permissions;

export function can(role: Role, permission: Permission): boolean {
  return rank[role] >= rank[permissions[permission]];
}
