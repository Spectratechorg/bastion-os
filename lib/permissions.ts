export const ROLE_LABELS: Record<string, string> = { owner: 'Owner', admin: 'Administrator', moderator: 'Moderator', member: 'Member', guard: 'Guard' }
export const ASSIGNABLE_ROLES = ['admin', 'moderator', 'member', 'guard'] as const
export const PERMISSIONS = [
  { key: 'viewFinance', label: 'View finance and payroll' },
  { key: 'runPayroll', label: 'Approve payroll and sensitive guard actions' },
  { key: 'manageGuards', label: 'Manage guards and sites' },
  { key: 'manageIncidents', label: 'Manage incidents and alerts' },
] as const
export type PermissionKey = (typeof PERMISSIONS)[number]['key']
/** Roles whose switches can be changed. Owner always has everything; guards have none and only use the guard app. */
export const EDITABLE_ROLES = ['admin', 'moderator', 'member'] as const

export const DEFAULT_PERMISSIONS: Record<string, Record<PermissionKey, boolean>> = {
  owner: { viewFinance: true, runPayroll: true, manageGuards: true, manageIncidents: true },
  admin: { viewFinance: true, runPayroll: true, manageGuards: true, manageIncidents: true },
  moderator: { viewFinance: true, runPayroll: true, manageGuards: true, manageIncidents: true },
  member: { viewFinance: false, runPayroll: false, manageGuards: true, manageIncidents: true },
  guard: { viewFinance: false, runPayroll: false, manageGuards: false, manageIncidents: false },
}
