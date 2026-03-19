import "server-only";

/**
 * Role-based access control utilities.
 *
 * Roles hierarchy (highest to lowest):
 * admin > attorney > case_manager > filing_agent / intake_agent / medical_records / mail_clerk > viewer
 */

export type UserRole =
  | "admin"
  | "attorney"
  | "case_manager"
  | "filing_agent"
  | "intake_agent"
  | "mail_clerk"
  | "medical_records"
  | "viewer";

export type Team =
  | "intake"
  | "filing"
  | "medical_records"
  | "mail_sorting"
  | "case_management"
  | "hearings"
  | "administration";

const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 100,
  attorney: 90,
  case_manager: 70,
  filing_agent: 50,
  intake_agent: 50,
  medical_records: 50,
  mail_clerk: 50,
  viewer: 10,
};

/**
 * Check if a role has at least the specified minimum level.
 */
export function hasMinimumRole(
  userRole: UserRole,
  minimumRole: UserRole,
): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minimumRole] ?? 0);
}

/**
 * Check if a user can manage other users (admin only).
 */
export function canManageUsers(role: UserRole): boolean {
  return role === "admin";
}

/**
 * Check if a user can configure workflows, stages, fields (admin or attorney).
 */
export function canConfigureSystem(role: UserRole): boolean {
  return hasMinimumRole(role, "attorney");
}

/**
 * Check if a user can view all teams' data (admin, attorney, case_manager).
 */
export function canViewAllTeams(role: UserRole): boolean {
  return hasMinimumRole(role, "case_manager");
}

/**
 * Check if a user can change case stages.
 */
export function canChangeCaseStage(role: UserRole): boolean {
  return hasMinimumRole(role, "filing_agent");
}

/**
 * Check if a user can delete documents.
 */
export function canDeleteDocuments(role: UserRole): boolean {
  return hasMinimumRole(role, "case_manager");
}

/**
 * Check if a user can access the admin panel.
 */
export function canAccessAdmin(role: UserRole): boolean {
  return hasMinimumRole(role, "attorney");
}

/**
 * Check if a user can view a specific custom field.
 */
export function canViewField(
  userRole: UserRole,
  visibleToRoles: string[] | null,
): boolean {
  // If no role restrictions, everyone can view
  if (!visibleToRoles || visibleToRoles.length === 0) return true;
  // Admins can always view
  if (userRole === "admin") return true;
  return visibleToRoles.includes(userRole);
}

/**
 * Check if a user can edit a specific custom field.
 */
export function canEditField(
  userRole: UserRole,
  editableByRoles: string[] | null,
): boolean {
  if (!editableByRoles || editableByRoles.length === 0) return true;
  if (userRole === "admin") return true;
  return editableByRoles.includes(userRole);
}

/**
 * Check if a user can view reports.
 */
export function canViewReports(role: UserRole): boolean {
  return hasMinimumRole(role, "case_manager");
}

/**
 * Get the default team for a role.
 */
export function getDefaultTeam(role: UserRole): Team | null {
  const roleTeamMap: Partial<Record<UserRole, Team>> = {
    intake_agent: "intake",
    filing_agent: "filing",
    medical_records: "medical_records",
    mail_clerk: "mail_sorting",
    case_manager: "case_management",
  };
  return roleTeamMap[role] ?? null;
}
