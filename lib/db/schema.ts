import { pgTable, text, uuid, timestamp, doublePrecision, integer, boolean } from 'drizzle-orm/pg-core'

const owner = { userId: text('user_id').notNull() }
const orgScoped = { organizationId: uuid('organization_id').notNull() }

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

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
  lastCheckIn: timestamp('last_check_in', { withTimezone: true }),
  lastLatitude: doublePrecision('last_latitude'),
  lastLongitude: doublePrecision('last_longitude'),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const attendance = pgTable('attendance', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...owner,
  ...orgScoped,
  guardId: uuid('guard_id').notNull(),
  siteId: uuid('site_id'),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }).notNull(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const patrols = pgTable('patrols', {
  id: uuid('id').defaultRandom().primaryKey(),
  ...owner,
  ...orgScoped,
  guardId: uuid('guard_id').notNull(),
  siteId: uuid('site_id'),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  method: text('method').notNull(),
  withinBounds: boolean('within_bounds').notNull(),
  routeName: text('route_name'),
  checkpoint: text('checkpoint'),
  progress: integer('progress').notNull().default(0),
  status: text('status').notNull().default('in_progress'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

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

export const schema = { organizations, guards, sites, attendance, incidents, alerts, patrols, finances, activityEvents }
