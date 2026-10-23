import { pgTable, text, uuid, timestamp, doublePrecision, integer, boolean, uniqueIndex, jsonb, type AnyPgColumn } from 'drizzle-orm/pg-core'

export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const authSessions = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  activeOrganizationId: text('active_organization_id'),
})

export const accounts = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const verifications = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const organizations = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  metadata: text('metadata'),
  guardAppCode: text('guard_app_code').unique(),
  patrolStartHour: integer('patrol_start_hour').notNull().default(8),
  patrolEndHour: integer('patrol_end_hour').notNull().default(18),
})

export const members = pgTable('member', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('member_organization_user_unique').on(table.organizationId, table.userId)])

export const invitations = pgTable('invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role'),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  inviterId: text('inviter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
})

const owner = { userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }) }
const orgScoped = { organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }) }

export const guards = pgTable('guards', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...owner,
  ...orgScoped,
  name: text('name').notNull(),
  nin: text('nin').notNull(),
  phone: text('phone').notNull(),
  initials: text('initials').notNull(),
  status: text('status').notNull(),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  site: text('site'),
  nfcToken: text('nfc_token').unique(),
  photoUrl: text('photo_url'),
  monthlySalary: integer('monthly_salary').notNull().default(0),
  lastCheckIn: timestamp('last_check_in', { withTimezone: true }),
  lastLatitude: doublePrecision('last_latitude'),
  lastLongitude: doublePrecision('last_longitude'),
  /** Better Auth user whose login is linked to this guard (guard app sign-in). */
  loginUserId: text('login_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const sites = pgTable('sites', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...owner,
  ...orgScoped,
  name: text('name').notNull(),
  address: text('address').notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  geofenceRadius: integer('geofence_radius').notNull(),
  status: text('status').notNull(),
  dangerLevel: text('danger_level').notNull().default('low'),
  /** The client company this site belongs to; one client can own many sites. */
  clientId: uuid('client_id').references((): AnyPgColumn => clients.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [uniqueIndex('sites_organization_name_unique').on(table.organizationId, table.name)])

export const attendance = pgTable('attendance', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...owner,
  ...orgScoped,
  guardId: uuid('guard_id').notNull(),
  siteId: uuid('site_id'),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }).notNull(),
  checkedOutAt: timestamp('checked_out_at', { withTimezone: true }),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  method: text('method').notNull(),
  withinGeofence: boolean('within_geofence').notNull(),
  reviewStatus: text('review_status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const incidents = pgTable('incidents', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...owner,
  ...orgScoped,
  title: text('title').notNull(),
  description: text('description').notNull(),
  severity: text('severity').notNull(),
  status: text('status').notNull(),
  site: text('site').notNull(),
  assigneeId: uuid('assignee_id'),
  comments: text('comments').array().notNull().default([]),
  timeline: text('timeline').array().notNull().default([]),
  reportedAt: timestamp('reported_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const alerts = pgTable('alerts', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...owner,
  ...orgScoped,
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  severity: text('severity').notNull(),
  acknowledged: boolean('acknowledged').notNull(),
  dedupeKey: text('dedupe_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [uniqueIndex('alerts_dedupe_idx').on(table.organizationId, table.dedupeKey)])

export const patrols = pgTable('patrols', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...owner,
  ...orgScoped,
  guardId: uuid('guard_id').notNull(),
  siteId: uuid('site_id'),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull(),
  patrolDate: text('patrol_date'),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  method: text('method').notNull(),
  withinBounds: boolean('within_bounds').notNull(),
  routeName: text('route_name'),
  checkpoint: text('checkpoint'),
  progress: integer('progress').notNull().default(0),
  status: text('status').notNull().default('in_progress'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [uniqueIndex('patrols_organization_guard_date_unique').on(table.organizationId, table.guardId, table.patrolDate)])

export const patrolCheckpoints = pgTable('patrol_checkpoints', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...owner,
  ...orgScoped,
  patrolId: uuid('patrol_id').notNull().references(() => patrols.id, { onDelete: 'cascade' }),
  slot: text('slot').notNull(),
  signedAt: timestamp('signed_at', { withTimezone: true }).notNull(),
}, (table) => [uniqueIndex('patrol_checkpoints_patrol_slot_unique').on(table.patrolId, table.slot)])

export const payrollRecords = pgTable('payroll_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...owner,
  ...orgScoped,
  /** A guard id, or a staff id when kind is 'staff'. */
  guardId: uuid('guard_id').notNull(),
  kind: text('kind').notNull().default('guard'),
  period: text('period').notNull(),
  status: text('status').notNull().default('pending'),
  baseSalary: integer('base_salary').notNull(),
  daysInPeriod: integer('days_in_period').notNull(),
  daysPresent: integer('days_present').notNull(),
  daysAbsent: integer('days_absent').notNull(),
  absenceDeduction: integer('absence_deduction').notNull(),
  pension: integer('pension').notNull(),
  netPay: integer('net_pay').notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paidBy: text('paid_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('payroll_records_guard_period_unique').on(table.guardId, table.period)])

export const finances = pgTable('finances', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...owner,
  ...orgScoped,
  kind: text('kind').notNull(),
  label: text('label').notNull(),
  amount: doublePrecision('amount').notNull(),
  status: text('status').notNull(),
  dueDate: timestamp('due_date', { withTimezone: true }),
  notes: text('notes'),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'set null' }),
  category: text('category'),
  receiptUrl: text('receipt_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const clients = pgTable('clients', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...owner,
  ...orgScoped,
  name: text('name').notNull(),
  contactName: text('contact_name'),
  email: text('email'),
  phone: text('phone'),
  status: text('status').notNull().default('active'),
  monthlyValue: doublePrecision('monthly_value').notNull().default(0),
  slaScore: doublePrecision('sla_score'),
  renewalDate: timestamp('renewal_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const activityEvents = pgTable('activity_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...owner,
  ...orgScoped,
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  tone: text('tone').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const rolePermissions = pgTable('role_permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...orgScoped,
  role: text('role').notNull(),
  permission: text('permission').notNull(),
  allowed: boolean('allowed').notNull(),
}, (table) => [uniqueIndex('role_permissions_unique').on(table.organizationId, table.role, table.permission)])

export const orgSettings = pgTable('org_settings', {
  organizationId: text('organization_id').primaryKey().references(() => organizations.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull().default({}),
})

export const staff = pgTable('staff', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...owner,
  ...orgScoped,
  name: text('name').notNull(),
  title: text('title').notNull(),
  phone: text('phone'),
  monthlySalary: integer('monthly_salary').notNull(),
  startDate: text('start_date').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const contracts = pgTable('contracts', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...owner,
  ...orgScoped,
  clientName: text('client_name').notNull(),
  title: text('title').notNull(),
  sites: text('sites'),
  monthlyFee: integer('monthly_fee').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  nextDueDate: text('next_due_date').notNull(),
  paymentStatus: text('payment_status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...owner,
  ...orgScoped,
  name: text('name').notNull(),
  category: text('category').notNull(),
  quantity: integer('quantity').notNull(),
  minQuantity: integer('min_quantity').notNull().default(0),
  location: text('location'),
  unitCost: integer('unit_cost').notNull().default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const schema = {
  users,
  authSessions,
  accounts,
  verifications,
  organizations,
  members,
  invitations,
  guards,
  sites,
  attendance,
  incidents,
  alerts,
  patrols,
  patrolCheckpoints,
  payrollRecords,
  finances,
  clients,
  activityEvents,
  rolePermissions,
  orgSettings,
  staff,
  contracts,
  inventoryItems,
}
