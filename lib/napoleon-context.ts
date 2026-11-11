import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  alerts,
  attendance,
  clients,
  contracts,
  finances,
  guards,
  incidents,
  inventoryItems,
  organizations,
  patrolCheckpoints,
  patrols,
  payrollRecords,
  sites,
  staff,
} from '@/lib/db/schema'
import { type Actor, can, guardShift, lagosParts, normalizeShift, patrolSlots, type Shift } from '@/lib/server'
import {
  clockHour,
  filterAndSummarizeGuards,
  formatLagosDateTime,
  type GuardQueryInput,
  type GuardRecordForAi,
  naira,
  shiftLabel,
} from '@/lib/napoleon-filters'

export {
  filterAndSummarizeGuards,
  formatLagosDateTime,
  type GuardQueryInput,
  type GuardRecordForAi,
}

/** Builds live operational & HR/payroll context for Napoleon AI, respecting role permissions. */
export async function buildOperationalContext(actor: Actor): Promise<{ context: string; canViewFinance: boolean }> {
  const organizationId = actor.organizationId
  const canViewFinance = await can(actor, 'viewFinance')
  const now = lagosParts()
  const cutoff24h = new Date(Date.now() - 86_400_000)

  try {
    const [
      orgRows,
      allGuards,
      allSites,
      recentAttendance,
      todayPatrolRows,
      recentAlerts,
      recentIncidents,
      allInventory,
      allClients,
      allStaff,
      currentPayroll,
      recentFinances,
      allContracts,
    ] = await Promise.all([
      db
        .select({ name: organizations.name, startHour: organizations.patrolStartHour, endHour: organizations.patrolEndHour })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1),
      db
        .select({
          id: guards.id,
          guardCode: guards.guardCode,
          name: guards.name,
          status: guards.status,
          site: guards.site,
          monthlySalary: guards.monthlySalary,
          shiftStartHour: guards.shiftStartHour,
          shiftEndHour: guards.shiftEndHour,
          lastCheckIn: guards.lastCheckIn,
          createdAt: guards.createdAt,
          loginUserId: guards.loginUserId,
          nfcToken: guards.nfcToken,
        })
        .from(guards)
        .where(eq(guards.organizationId, organizationId))
        .orderBy(guards.guardCode, guards.name)
        .limit(500),
      db
        .select({
          id: sites.id,
          name: sites.name,
          address: sites.address,
          dangerLevel: sites.dangerLevel,
          status: sites.status,
          geofenceRadius: sites.geofenceRadius,
        })
        .from(sites)
        .where(eq(sites.organizationId, organizationId))
        .orderBy(sites.name)
        .limit(200),
      db
        .select({
          guardId: attendance.guardId,
          siteId: attendance.siteId,
          checkedInAt: attendance.checkedInAt,
          checkedOutAt: attendance.checkedOutAt,
          withinGeofence: attendance.withinGeofence,
          reviewStatus: attendance.reviewStatus,
        })
        .from(attendance)
        .where(and(eq(attendance.organizationId, organizationId), gte(attendance.checkedInAt, cutoff24h)))
        .orderBy(desc(attendance.checkedInAt))
        .limit(300),
      db
        .select({
          id: patrols.id,
          guardId: patrols.guardId,
          patrolDate: patrols.patrolDate,
          progress: patrols.progress,
          status: patrols.status,
          withinBounds: patrols.withinBounds,
        })
        .from(patrols)
        .where(and(eq(patrols.organizationId, organizationId), eq(patrols.patrolDate, now.date)))
        .limit(300),
      db
        .select({
          title: alerts.title,
          body: alerts.body,
          type: alerts.type,
          severity: alerts.severity,
          acknowledged: alerts.acknowledged,
          createdAt: alerts.createdAt,
        })
        .from(alerts)
        .where(eq(alerts.organizationId, organizationId))
        .orderBy(desc(alerts.createdAt))
        .limit(15),
      db
        .select({
          title: incidents.title,
          severity: incidents.severity,
          status: incidents.status,
          site: incidents.site,
          reportedAt: incidents.reportedAt,
        })
        .from(incidents)
        .where(eq(incidents.organizationId, organizationId))
        .orderBy(desc(incidents.reportedAt))
        .limit(15),
      db
        .select({
          name: inventoryItems.name,
          category: inventoryItems.category,
          quantity: inventoryItems.quantity,
          minQuantity: inventoryItems.minQuantity,
          location: inventoryItems.location,
        })
        .from(inventoryItems)
        .where(eq(inventoryItems.organizationId, organizationId))
        .orderBy(inventoryItems.name)
        .limit(100),
      db
        .select({
          name: clients.name,
          status: clients.status,
          contractValue: clients.contractValue,
          slaScore: clients.slaScore,
          renewalDate: clients.renewalDate,
        })
        .from(clients)
        .where(eq(clients.organizationId, organizationId))
        .orderBy(clients.name)
        .limit(100),
      canViewFinance
        ? db
            .select({
              name: staff.name,
              title: staff.title,
              monthlySalary: staff.monthlySalary,
              startDate: staff.startDate,
              status: staff.status,
            })
            .from(staff)
            .where(eq(staff.organizationId, organizationId))
            .orderBy(staff.name)
            .limit(100)
        : Promise.resolve([]),
      canViewFinance
        ? db
            .select({
              kind: payrollRecords.kind,
              status: payrollRecords.status,
              baseSalary: payrollRecords.baseSalary,
              absenceDeduction: payrollRecords.absenceDeduction,
              netPay: payrollRecords.netPay,
            })
            .from(payrollRecords)
            .where(and(eq(payrollRecords.organizationId, organizationId), eq(payrollRecords.period, now.month)))
        : Promise.resolve([]),
      canViewFinance
        ? db
            .select({
              kind: finances.kind,
              label: finances.label,
              amount: finances.amount,
              status: finances.status,
              category: finances.category,
              createdAt: finances.createdAt,
            })
            .from(finances)
            .where(eq(finances.organizationId, organizationId))
            .orderBy(desc(finances.createdAt))
            .limit(100)
        : Promise.resolve([]),
      canViewFinance
        ? db
            .select({
              clientName: contracts.clientName,
              title: contracts.title,
              sites: contracts.sites,
              monthlyFee: contracts.monthlyFee,
              paymentStatus: contracts.paymentStatus,
              nextDueDate: contracts.nextDueDate,
              endDate: contracts.endDate,
            })
            .from(contracts)
            .where(eq(contracts.organizationId, organizationId))
            .orderBy(contracts.clientName)
            .limit(100)
        : Promise.resolve([]),
    ])

    const org = orgRows[0]
    const companyShift = normalizeShift(org?.startHour, org?.endHour)
    const guardById = new Map(allGuards.map((g) => [g.id, g]))
    const siteById = new Map(allSites.map((s) => [s.id, s]))

    const activeGuardsPerSite = new Map<string, number>()
    for (const guard of allGuards) {
      if (guard.status === 'active' && guard.site) {
        activeGuardsPerSite.set(guard.site, (activeGuardsPerSite.get(guard.site) ?? 0) + 1)
      }
    }

    const sitesText =
      allSites.length > 0
        ? allSites
            .map(
              (s) =>
                `- ${s.name} | ${s.status} | risk: ${s.dangerLevel} | geofence: ${s.geofenceRadius}m | assigned active guards: ${activeGuardsPerSite.get(s.name) ?? 0}`,
            )
            .join('\n')
        : 'No sites recorded.'

    const activeGuardCount = allGuards.filter((g) => g.status === 'active').length
    const suspendedGuardCount = allGuards.filter((g) => g.status === 'suspended').length
    const unassignedGuardCount = allGuards.filter((g) => !g.site).length

    let salarySummaryText = '[Salary & Finance Permissions]: Restricted for current user (missing viewFinance permission).'
    if (canViewFinance && allGuards.length > 0) {
      const totalSalary = allGuards.reduce((sum, g) => sum + g.monthlySalary, 0)
      const salaries = allGuards.map((g) => g.monthlySalary)
      const tierCounts = new Map<number, number>()
      for (const s of salaries) tierCounts.set(s, (tierCounts.get(s) ?? 0) + 1)
      const tiersText = [...tierCounts.entries()]
        .sort((a, b) => b[0] - a[0])
        .slice(0, 20)
        .map(([amount, count]) => `${naira(amount)}: ${count} guard${count === 1 ? '' : 's'}`)
        .join(', ')
      salarySummaryText = `Total guard monthly base payroll: ${naira(totalSalary)} | Avg: ${naira(totalSalary / allGuards.length)} | Min: ${naira(Math.min(...salaries))} | Max: ${naira(Math.max(...salaries))}\nSalary tiers (${allGuards.length} guards total): ${tiersText}`
    } else if (canViewFinance) {
      salarySummaryText = 'No guards registered yet.'
    }

    const maxInlineGuards = 150
    const inlineGuards = allGuards.slice(0, maxInlineGuards)
    const guardsRosterText =
      inlineGuards.length > 0
        ? inlineGuards
            .map((g, index) => {
              const effShift = shiftLabel(guardShift(g, companyShift))
              const sal = canViewFinance ? ` | salary: ${naira(g.monthlySalary)}` : ''
              return `${index + 1}. [#${g.guardCode ?? '—'}] ${g.name} | ${g.status} | site: ${g.site ?? 'Unassigned'}${sal} | shift: ${effShift} | lastCheckIn: ${formatLagosDateTime(g.lastCheckIn)}`
            })
            .join('\n') +
          (allGuards.length > maxInlineGuards
            ? `\n... (${allGuards.length - maxInlineGuards} more guards omitted; use the query_guards tool for exact counts or searches across all ${allGuards.length} guards)`
            : '')
        : 'No guards registered.'

    let financeSection = '\n[HR Staff, Payroll & Finance]\nRestricted: current user role lacks viewFinance permission.'
    if (canViewFinance) {
      const staffText =
        allStaff.length > 0
          ? allStaff
              .map((s) => `- ${s.name} (${s.title}) | ${s.status} | salary: ${naira(s.monthlySalary)} | started: ${s.startDate}`)
              .join('\n')
          : 'No non-guard staff recorded.'

      const paidPayroll = currentPayroll.filter((p) => p.status === 'paid')
      const pendingPayroll = currentPayroll.filter((p) => p.status !== 'paid')
      const payrollText =
        currentPayroll.length > 0
          ? `${now.month} records: ${currentPayroll.length} (paid: ${paidPayroll.length} = ${naira(paidPayroll.reduce((s, r) => s + r.netPay, 0))}, pending: ${pendingPayroll.length} = ${naira(pendingPayroll.reduce((s, r) => s + r.netPay, 0))}, total net: ${naira(currentPayroll.reduce((s, r) => s + r.netPay, 0))})`
          : `No generated payroll_records for ${now.month} yet (use query_guards or payroll base salaries above; other periods can be inspected via query_payroll tool).`

      const revTotal = recentFinances.filter((f) => ['revenue', 'invoice'].includes(f.kind)).reduce((s, f) => s + f.amount, 0)
      const expTotal = recentFinances.filter((f) => !['revenue', 'invoice'].includes(f.kind)).reduce((s, f) => s + f.amount, 0)
      const pendingFinTotal = recentFinances.filter((f) => !['paid', 'settled', 'received'].includes(f.status)).reduce((s, f) => s + f.amount, 0)
      const contractsText =
        allContracts.length > 0
          ? `${allContracts.length} contracts (total monthly fee: ${naira(allContracts.reduce((s, c) => s + c.monthlyFee, 0))}, pending payment: ${allContracts.filter((c) => c.paymentStatus !== 'paid').length})`
          : 'No contracts recorded.'

      financeSection = `
[Office Staff (${allStaff.length})]
${staffText}

[Payroll (${now.month})]
${payrollText}

[Finances Ledger (${recentFinances.length} entries) & Contracts]
Revenue/Invoices: ${naira(revTotal)} | Expenses/Costs: ${naira(expTotal)} | Unsettled/Pending: ${naira(pendingFinTotal)}
Contracts: ${contractsText}`
    }

    const checkedInGuards = new Set(recentAttendance.map((a) => a.guardId))
    const outsideAttendance = recentAttendance.filter((a) => !a.withinGeofence)
    const outsideDetails = outsideAttendance
      .slice(0, 8)
      .map((a) => `${guardById.get(a.guardId)?.name ?? 'Guard'} at ${siteById.get(a.siteId ?? '')?.name ?? 'Unknown site'} (${formatLagosDateTime(a.checkedInAt)})`)
      .join('; ')

    const unackAlerts = recentAlerts.filter((a) => !a.acknowledged)
    const openIncidents = recentIncidents.filter((i) => i.status !== 'resolved')
    const lowStock = allInventory.filter((i) => i.quantity <= i.minQuantity)

    const context = `LIVE BASTIONOS DATABASE CONTEXT (${now.date}, Africa/Lagos):
Organization: ${org?.name ?? 'Unknown'} | Company Default Shift: ${shiftLabel(companyShift)}

[Sites (${allSites.length} total)]
${sitesText}

[Guards Overview (${allGuards.length} total: ${activeGuardCount} active, ${suspendedGuardCount} suspended, ${unassignedGuardCount} unassigned)]
${salarySummaryText}

[Guards Directory]
${guardsRosterText}
${financeSection}

[Clients (${allClients.length})]
${allClients.length > 0 ? allClients.map((c) => `- ${c.name} | ${c.status} | SLA: ${c.slaScore ?? '—'}%${canViewFinance ? ` | contract value: ${naira(c.contractValue)}` : ''}`).join('\n') : 'No clients recorded.'}

[Attendance (last 24h) & Today Patrols (${now.date})]
Check-ins (last 24h): ${recentAttendance.length} across ${checkedInGuards.size} distinct guards | Outside geofence: ${outsideAttendance.length}${outsideDetails ? ` (${outsideDetails})` : ''}
Today patrol records started: ${todayPatrolRows.length} (completed: ${todayPatrolRows.filter((p) => p.status === 'completed').length}, in progress: ${todayPatrolRows.filter((p) => p.status === 'in_progress').length})

[Alerts (${unackAlerts.length} unacknowledged in latest 15)]
${recentAlerts.length > 0 ? recentAlerts.slice(0, 8).map((a) => `- [${a.severity}/${a.type}${a.acknowledged ? '/ack' : '/NEW'}] ${a.title}: ${a.body}`).join('\n') : 'None.'}

[Incidents (${openIncidents.length} open in latest 15)]
${recentIncidents.length > 0 ? recentIncidents.slice(0, 8).map((i) => `- [${i.severity}/${i.status}] ${i.title} at ${i.site}`).join('\n') : 'None.'}

[Inventory (${allInventory.length} items, ${lowStock.length} low stock)]
${lowStock.length > 0 ? 'Low stock: ' + lowStock.map((i) => `${i.name} (${i.quantity}/${i.minQuantity} min at ${i.location ?? 'main'})`).join(', ') : allInventory.length > 0 ? 'All inventory items above minimum quantity.' : 'No inventory items recorded.'}
`.trim()

    return { context, canViewFinance }
  } catch (err) {
    console.warn('[Napoleon API] Could not load operational context from DB:', err)
    return { context: 'Operational context currently unavailable.', canViewFinance }
  }
}

export const NAPOLEON_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_guards',
      description:
        'Query all security guards in the organization with exact counts, status breakdown, shift assignment, site assignment, and salary statistics/filtering (requires viewFinance permission for salary fields). Always call this tool when counting guards matching specific criteria like salary thresholds (e.g. above 60,000 naira), site assignment, or status.',
      parameters: {
        type: 'object',
        properties: {
          minSalaryExclusive: { type: 'number', description: 'Strict lower bound: monthlySalary > value (use for "above X" or "more than X")' },
          minSalary: { type: 'number', description: 'Inclusive lower bound: monthlySalary >= value (use for "at least X")' },
          maxSalaryExclusive: { type: 'number', description: 'Strict upper bound: monthlySalary < value (use for "below X" or "less than X")' },
          maxSalary: { type: 'number', description: 'Inclusive upper bound: monthlySalary <= value' },
          status: { type: 'string', enum: ['active', 'suspended', 'all'], description: 'Filter by guard status' },
          site: { type: 'string', description: 'Filter by assigned site name (substring match)' },
          unassignedOnly: { type: 'boolean', description: 'True to return only guards without an assigned site' },
          search: { type: 'string', description: 'Filter by guard name, 3-digit guard ID code (e.g. 052), or site' },
          sortBy: { type: 'string', enum: ['salary_desc', 'salary_asc', 'name', 'guardCode', 'lastCheckIn_desc'] },
          limit: { type: 'integer', description: 'Max number of individual guard items to return (default 60, max 150); aggregate counts and totals always cover ALL matching guards.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_payroll',
      description: 'Query processed payroll records and office staff compensation for any month (YYYY-MM). Requires viewFinance permission.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'Month formatted YYYY-MM, e.g. 2026-11. Defaults to current month.' },
          status: { type: 'string', enum: ['paid', 'pending', 'all'] },
          kind: { type: 'string', enum: ['guard', 'staff', 'all'] },
          search: { type: 'string', description: 'Filter by guard or staff name' },
          minNetPay: { type: 'number', description: 'Minimum net pay in Naira' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_finances_and_contracts',
      description: 'Query financial ledger entries (revenue, expenses, invoices), client accounts, SLA scores, and security contracts. Monetary amounts require viewFinance permission.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', description: 'Filter finances by kind (e.g. revenue, invoice, expense, salary)' },
          status: { type: 'string', description: 'Filter by payment/settlement status (e.g. pending, paid)' },
          search: { type: 'string', description: 'Search label, client name, category, or contract title' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_attendance_and_patrols',
      description: 'Query guard attendance check-ins and hourly patrol checkpoint completion for a specific Lagos date (YYYY-MM-DD, defaults to today).',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date YYYY-MM-DD in Africa/Lagos time. Defaults to today.' },
          site: { type: 'string', description: 'Filter by site name' },
          guardSearch: { type: 'string', description: 'Filter by guard name or 3-digit guard code' },
          outsideGeofenceOnly: { type: 'boolean', description: 'True to return only geofence breaches / off-site check-ins' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_alerts_incidents_inventory',
      description: 'Query security alerts, incident reports, and equipment inventory levels (including low stock items).',
      parameters: {
        type: 'object',
        properties: {
          domain: { type: 'string', enum: ['alerts', 'incidents', 'inventory', 'all'] },
          onlyOpenOrLowStock: { type: 'boolean', description: 'True for unacknowledged alerts, unresolved incidents, or low-stock inventory items' },
          search: { type: 'string', description: 'Substring search across titles, sites, categories, or notes' },
        },
      },
    },
  },
] as const

type ToolArgs = Record<string, unknown>

/** Executes one read-only Napoleon database tool scoped strictly to the actor's organization and permissions. */
export async function executeNapoleonTool(
  toolName: string,
  rawArgs: ToolArgs,
  actor: Actor,
  canViewFinance: boolean,
): Promise<unknown> {
  const organizationId = actor.organizationId

  switch (toolName) {
    case 'query_guards': {
      const [org] = await db
        .select({ startHour: organizations.patrolStartHour, endHour: organizations.patrolEndHour })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1)
      const companyShift = normalizeShift(org?.startHour, org?.endHour)
      const allGuards = await db
        .select({
          id: guards.id,
          guardCode: guards.guardCode,
          name: guards.name,
          status: guards.status,
          site: guards.site,
          monthlySalary: guards.monthlySalary,
          shiftStartHour: guards.shiftStartHour,
          shiftEndHour: guards.shiftEndHour,
          lastCheckIn: guards.lastCheckIn,
          createdAt: guards.createdAt,
          loginUserId: guards.loginUserId,
          nfcToken: guards.nfcToken,
        })
        .from(guards)
        .where(eq(guards.organizationId, organizationId))
      return filterAndSummarizeGuards(allGuards, rawArgs as GuardQueryInput, canViewFinance, companyShift)
    }

    case 'query_payroll': {
      if (!canViewFinance) {
        return { error: 'Permission denied: your role does not have viewFinance access to view payroll data.' }
      }
      const period = typeof rawArgs.period === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(rawArgs.period)
        ? rawArgs.period
        : lagosParts().month
      const statusFilter = typeof rawArgs.status === 'string' ? rawArgs.status : 'all'
      const kindFilter = typeof rawArgs.kind === 'string' ? rawArgs.kind : 'all'
      const search = typeof rawArgs.search === 'string' ? rawArgs.search.trim().toLowerCase() : ''
      const minNetPay = typeof rawArgs.minNetPay === 'number' ? rawArgs.minNetPay : undefined

      const [records, allGuards, allStaff, availablePeriodsRows] = await Promise.all([
        db.select().from(payrollRecords).where(and(eq(payrollRecords.organizationId, organizationId), eq(payrollRecords.period, period))),
        db.select({ id: guards.id, guardCode: guards.guardCode, name: guards.name, site: guards.site }).from(guards).where(eq(guards.organizationId, organizationId)),
        db.select({ id: staff.id, name: staff.name, title: staff.title }).from(staff).where(eq(staff.organizationId, organizationId)),
        db.selectDistinct({ period: payrollRecords.period }).from(payrollRecords).where(eq(payrollRecords.organizationId, organizationId)),
      ])

      const guardMap = new Map(allGuards.map((g) => [g.id, g]))
      const staffMap = new Map(allStaff.map((s) => [s.id, s]))

      const enriched = records
        .map((r) => {
          const g = guardMap.get(r.guardId)
          const st = staffMap.get(r.guardId)
          return {
            name: g?.name ?? st?.name ?? 'Unknown',
            guardCode: g?.guardCode ?? null,
            roleOrSite: g?.site ?? st?.title ?? '—',
            kind: r.kind,
            period: r.period,
            status: r.status,
            baseSalary: r.baseSalary,
            daysPresent: r.daysPresent,
            daysAbsent: r.daysAbsent,
            absenceDeduction: r.absenceDeduction,
            netPay: r.netPay,
          }
        })
        .filter((row) => {
          if (statusFilter !== 'all' && row.status !== statusFilter) return false
          if (kindFilter !== 'all' && row.kind !== kindFilter) return false
          if (minNetPay !== undefined && row.netPay < minNetPay) return false
          if (search && !`${row.guardCode ?? ''} ${row.name} ${row.roleOrSite}`.toLowerCase().includes(search)) return false
          return true
        })

      return {
        period,
        availablePeriods: availablePeriodsRows.map((p) => p.period).sort().reverse(),
        matchedCount: enriched.length,
        paidCount: enriched.filter((r) => r.status === 'paid').length,
        pendingCount: enriched.filter((r) => r.status !== 'paid').length,
        totalBaseSalary: enriched.reduce((s, r) => s + r.baseSalary, 0),
        totalAbsenceDeduction: enriched.reduce((s, r) => s + r.absenceDeduction, 0),
        totalNetPay: enriched.reduce((s, r) => s + r.netPay, 0),
        records: enriched.slice(0, 60),
        note: records.length === 0 ? `No payroll_records have been generated for ${period} yet; open Payroll in BastionOS to generate them or check guard base monthly salaries with query_guards.` : undefined,
      }
    }

    case 'query_finances_and_contracts': {
      const kindFilter = typeof rawArgs.kind === 'string' ? rawArgs.kind.trim().toLowerCase() : ''
      const statusFilter = typeof rawArgs.status === 'string' ? rawArgs.status.trim().toLowerCase() : ''
      const search = typeof rawArgs.search === 'string' ? rawArgs.search.trim().toLowerCase() : ''

      const [clientRows, financeRows, contractRows] = await Promise.all([
        db.select().from(clients).where(eq(clients.organizationId, organizationId)),
        canViewFinance ? db.select().from(finances).where(eq(finances.organizationId, organizationId)).orderBy(desc(finances.createdAt)) : Promise.resolve([]),
        canViewFinance ? db.select().from(contracts).where(eq(contracts.organizationId, organizationId)) : Promise.resolve([]),
      ])

      const matchedFinances = financeRows.filter((f) => {
        if (kindFilter && f.kind.toLowerCase() !== kindFilter) return false
        if (statusFilter && f.status.toLowerCase() !== statusFilter) return false
        if (search && !`${f.label} ${f.category ?? ''} ${f.notes ?? ''}`.toLowerCase().includes(search)) return false
        return true
      })

      const matchedContracts = contractRows.filter((c) => {
        if (statusFilter && c.paymentStatus.toLowerCase() !== statusFilter) return false
        if (search && !`${c.clientName} ${c.title} ${c.sites ?? ''}`.toLowerCase().includes(search)) return false
        return true
      })

      return {
        canViewFinance,
        clients: clientRows
          .filter((c) => !search || c.name.toLowerCase().includes(search))
          .map((c) => ({
            name: c.name,
            status: c.status,
            slaScore: c.slaScore,
            renewalDate: c.renewalDate?.toISOString().slice(0, 10) ?? null,
            ...(canViewFinance ? { contractValue: c.contractValue } : {}),
          })),
        ...(canViewFinance
          ? {
              financesSummary: {
                matchedCount: matchedFinances.length,
                totalAmount: matchedFinances.reduce((s, f) => s + f.amount, 0),
                entries: matchedFinances.slice(0, 40).map((f) => ({
                  kind: f.kind,
                  label: f.label,
                  amount: f.amount,
                  status: f.status,
                  category: f.category,
                  date: f.createdAt.toISOString().slice(0, 10),
                })),
              },
              contractsSummary: {
                matchedCount: matchedContracts.length,
                totalMonthlyFee: matchedContracts.reduce((s, c) => s + c.monthlyFee, 0),
                contracts: matchedContracts.slice(0, 40),
              },
            }
          : { financeAccess: 'Restricted (missing viewFinance permission)' }),
      }
    }

    case 'query_attendance_and_patrols': {
      const today = lagosParts().date
      const date = typeof rawArgs.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawArgs.date) ? rawArgs.date : today
      const siteTerm = typeof rawArgs.site === 'string' ? rawArgs.site.trim().toLowerCase() : ''
      const guardSearch = typeof rawArgs.guardSearch === 'string' ? rawArgs.guardSearch.trim().toLowerCase() : ''
      const outsideOnly = rawArgs.outsideGeofenceOnly === true

      const start = new Date(`${date}T00:00:00+01:00`)
      const end = new Date(start.getTime() + 86_400_000)

      const [orgRows, allGuards, allSites, attRows, patrolRows, checkpointRows] = await Promise.all([
        db.select({ startHour: organizations.patrolStartHour, endHour: organizations.patrolEndHour }).from(organizations).where(eq(organizations.id, organizationId)).limit(1),
        db.select({ id: guards.id, guardCode: guards.guardCode, name: guards.name, site: guards.site, shiftStartHour: guards.shiftStartHour, shiftEndHour: guards.shiftEndHour }).from(guards).where(eq(guards.organizationId, organizationId)),
        db.select({ id: sites.id, name: sites.name }).from(sites).where(eq(sites.organizationId, organizationId)),
        db.select().from(attendance).where(and(eq(attendance.organizationId, organizationId), gte(attendance.checkedInAt, start), lt(attendance.checkedInAt, end))).orderBy(desc(attendance.checkedInAt)),
        db.select().from(patrols).where(and(eq(patrols.organizationId, organizationId), eq(patrols.patrolDate, date))),
        db.select({ patrolId: patrolCheckpoints.patrolId, slot: patrolCheckpoints.slot, signedAt: patrolCheckpoints.signedAt }).from(patrolCheckpoints).where(eq(patrolCheckpoints.organizationId, organizationId)).limit(5000),
      ])

      const companyShift = normalizeShift(orgRows[0]?.startHour, orgRows[0]?.endHour)
      const guardById = new Map(allGuards.map((g) => [g.id, g]))
      const siteById = new Map(allSites.map((s) => [s.id, s]))
      const cpByPatrol = new Map<string, string[]>()
      for (const cp of checkpointRows) {
        const list = cpByPatrol.get(cp.patrolId) ?? []
        list.push(cp.slot)
        cpByPatrol.set(cp.patrolId, list)
      }

      const filteredAtt = attRows
        .map((a) => {
          const g = guardById.get(a.guardId)
          const siteName = siteById.get(a.siteId ?? '')?.name ?? g?.site ?? 'Unknown'
          return {
            guardCode: g?.guardCode ?? null,
            guardName: g?.name ?? 'Unknown guard',
            site: siteName,
            checkedInAt: formatLagosDateTime(a.checkedInAt),
            checkedOutAt: a.checkedOutAt ? formatLagosDateTime(a.checkedOutAt) : null,
            withinGeofence: a.withinGeofence,
            method: a.method,
            reviewStatus: a.reviewStatus,
          }
        })
        .filter((r) => {
          if (outsideOnly && r.withinGeofence) return false
          if (siteTerm && !r.site.toLowerCase().includes(siteTerm)) return false
          if (guardSearch && !`${r.guardCode ?? ''} ${r.guardName}`.toLowerCase().includes(guardSearch)) return false
          return true
        })

      const filteredPatrols = patrolRows
        .map((p) => {
          const g = guardById.get(p.guardId)
          const siteName = siteById.get(p.siteId ?? '')?.name ?? g?.site ?? 'Unknown'
          const slots = patrolSlots(g ? guardShift(g, companyShift) : companyShift)
          const signedSlots = cpByPatrol.get(p.id) ?? []
          return {
            guardCode: g?.guardCode ?? null,
            guardName: g?.name ?? 'Unknown guard',
            site: siteName,
            status: p.status,
            signedCount: signedSlots.length,
            expectedSlots: slots.length,
            withinBounds: p.withinBounds,
            signedSlots: signedSlots.sort(),
          }
        })
        .filter((r) => {
          if (outsideOnly && r.withinBounds) return false
          if (siteTerm && !r.site.toLowerCase().includes(siteTerm)) return false
          if (guardSearch && !`${r.guardCode ?? ''} ${r.guardName}`.toLowerCase().includes(guardSearch)) return false
          return true
        })

      return {
        date,
        attendanceCount: filteredAtt.length,
        outsideGeofenceCount: filteredAtt.filter((a) => !a.withinGeofence).length,
        attendance: filteredAtt.slice(0, 60),
        patrolCount: filteredPatrols.length,
        completedPatrols: filteredPatrols.filter((p) => p.status === 'completed').length,
        patrols: filteredPatrols.slice(0, 60),
      }
    }

    case 'query_alerts_incidents_inventory': {
      const domain = typeof rawArgs.domain === 'string' ? rawArgs.domain : 'all'
      const onlyOpen = rawArgs.onlyOpenOrLowStock === true
      const search = typeof rawArgs.search === 'string' ? rawArgs.search.trim().toLowerCase() : ''

      const [alertRows, incidentRows, invRows] = await Promise.all([
        domain === 'all' || domain === 'alerts'
          ? db.select().from(alerts).where(eq(alerts.organizationId, organizationId)).orderBy(desc(alerts.createdAt)).limit(60)
          : Promise.resolve([]),
        domain === 'all' || domain === 'incidents'
          ? db.select().from(incidents).where(eq(incidents.organizationId, organizationId)).orderBy(desc(incidents.reportedAt)).limit(60)
          : Promise.resolve([]),
        domain === 'all' || domain === 'inventory'
          ? db.select().from(inventoryItems).where(eq(inventoryItems.organizationId, organizationId)).orderBy(inventoryItems.name).limit(100)
          : Promise.resolve([]),
      ])

      return {
        alerts: alertRows
          .filter((a) => (!onlyOpen || !a.acknowledged) && (!search || `${a.title} ${a.body} ${a.type}`.toLowerCase().includes(search)))
          .slice(0, 30)
          .map((a) => ({ type: a.type, severity: a.severity, title: a.title, body: a.body, acknowledged: a.acknowledged, at: formatLagosDateTime(a.createdAt) })),
        incidents: incidentRows
          .filter((i) => (!onlyOpen || i.status !== 'resolved') && (!search || `${i.title} ${i.site} ${i.description}`.toLowerCase().includes(search)))
          .slice(0, 30)
          .map((i) => ({ severity: i.severity, status: i.status, title: i.title, site: i.site, at: formatLagosDateTime(i.reportedAt) })),
        inventory: invRows
          .filter((item) => (!onlyOpen || item.quantity <= item.minQuantity) && (!search || `${item.name} ${item.category} ${item.location ?? ''}`.toLowerCase().includes(search)))
          .slice(0, 50)
          .map((item) => ({
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            minQuantity: item.minQuantity,
            lowStock: item.quantity <= item.minQuantity,
            location: item.location,
            ...(canViewFinance ? { unitCost: item.unitCost } : {}),
          })),
      }
    }

    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}
