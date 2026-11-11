import { guardShift, type Shift } from './server-rules'

export type GuardRecordForAi = {
  id: string
  guardCode: string | null
  name: string
  status: string
  site: string | null
  monthlySalary: number
  shiftStartHour: number | null
  shiftEndHour: number | null
  lastCheckIn: Date | null
  createdAt: Date
  loginUserId: string | null
  nfcToken: string | null
}

export type GuardQueryInput = {
  minSalary?: number
  minSalaryExclusive?: number
  maxSalary?: number
  maxSalaryExclusive?: number
  status?: 'active' | 'suspended' | 'all'
  site?: string
  unassignedOnly?: boolean
  search?: string
  sortBy?: 'salary_desc' | 'salary_asc' | 'name' | 'guardCode' | 'lastCheckIn_desc'
  limit?: number
}

export const naira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`
export const clockHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`
export const shiftLabel = (shift: Shift) => `${clockHour(shift.startHour)}–${clockHour(shift.endHour)}`

export function formatLagosDateTime(date: Date | null | undefined): string {
  if (!date) return 'never'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

/** Filters guard rows and computes exact aggregate counts & salary stats (respecting viewFinance). */
export function filterAndSummarizeGuards(
  allGuards: GuardRecordForAi[],
  input: GuardQueryInput,
  canViewFinance: boolean,
  companyShift: Shift,
) {
  const asksSalary =
    input.minSalary !== undefined ||
    input.minSalaryExclusive !== undefined ||
    input.maxSalary !== undefined ||
    input.maxSalaryExclusive !== undefined ||
    input.sortBy === 'salary_desc' ||
    input.sortBy === 'salary_asc'

  if (asksSalary && !canViewFinance) {
    return {
      error: 'Permission denied: your role does not have viewFinance access to query salary or compensation figures.',
    }
  }

  const term = input.search?.trim().toLowerCase() ?? ''
  const siteTerm = input.site?.trim().toLowerCase() ?? ''
  const statusFilter = input.status ?? 'all'

  const matched = allGuards.filter((guard) => {
    if (statusFilter !== 'all' && guard.status !== statusFilter) return false
    if (input.unassignedOnly && guard.site) return false
    if (siteTerm && !(guard.site ?? '').toLowerCase().includes(siteTerm)) return false
    if (term) {
      const hay = `${guard.guardCode ?? ''} ${guard.name} ${guard.site ?? ''}`.toLowerCase()
      if (!hay.includes(term)) return false
    }
    if (canViewFinance) {
      if (input.minSalaryExclusive !== undefined && !(guard.monthlySalary > input.minSalaryExclusive)) return false
      if (input.minSalary !== undefined && !(guard.monthlySalary >= input.minSalary)) return false
      if (input.maxSalaryExclusive !== undefined && !(guard.monthlySalary < input.maxSalaryExclusive)) return false
      if (input.maxSalary !== undefined && !(guard.monthlySalary <= input.maxSalary)) return false
    }
    return true
  })

  const sortBy = input.sortBy ?? 'guardCode'
  const sorted = [...matched].sort((a, b) => {
    switch (sortBy) {
      case 'salary_desc':
        return b.monthlySalary - a.monthlySalary || a.name.localeCompare(b.name)
      case 'salary_asc':
        return a.monthlySalary - b.monthlySalary || a.name.localeCompare(b.name)
      case 'lastCheckIn_desc':
        return (b.lastCheckIn?.getTime() ?? 0) - (a.lastCheckIn?.getTime() ?? 0)
      case 'name':
        return a.name.localeCompare(b.name)
      case 'guardCode':
      default:
        return (a.guardCode ?? '999').localeCompare(b.guardCode ?? '999') || a.name.localeCompare(b.name)
    }
  })

  const limit = Math.min(Math.max(Number(input.limit ?? 60), 1), 150)
  const items = sorted.slice(0, limit).map((guard) => {
    const effectiveShift = guardShift(guard, companyShift)
    const hasCustomShift = guard.shiftStartHour !== null && guard.shiftEndHour !== null
    return {
      guardCode: guard.guardCode,
      name: guard.name,
      status: guard.status,
      site: guard.site ?? 'Unassigned',
      shift: `${shiftLabel(effectiveShift)}${hasCustomShift ? ' (custom)' : ' (company default)'}`,
      lastCheckIn: formatLagosDateTime(guard.lastCheckIn),
      hasNfcTag: Boolean(guard.nfcToken),
      hasGuardLogin: Boolean(guard.loginUserId),
      ...(canViewFinance ? { monthlySalary: guard.monthlySalary, monthlySalaryFormatted: naira(guard.monthlySalary) } : {}),
    }
  })

  const activeMatchedCount = matched.filter((g) => g.status === 'active').length
  const suspendedMatchedCount = matched.filter((g) => g.status === 'suspended').length

  let salaryStats: {
    totalMonthlySalary: number
    totalMonthlySalaryFormatted: string
    averageSalary: number
    minSalary: number
    maxSalary: number
  } | null = null

  if (canViewFinance && matched.length > 0) {
    const total = matched.reduce((sum, g) => sum + g.monthlySalary, 0)
    const salaries = matched.map((g) => g.monthlySalary)
    salaryStats = {
      totalMonthlySalary: total,
      totalMonthlySalaryFormatted: naira(total),
      averageSalary: Math.round(total / matched.length),
      minSalary: Math.min(...salaries),
      maxSalary: Math.max(...salaries),
    }
  }

  return {
    totalGuardsInOrganization: allGuards.length,
    matchedCount: matched.length,
    activeMatchedCount,
    suspendedMatchedCount,
    returnedCount: items.length,
    truncated: matched.length > items.length,
    ...(canViewFinance ? { salaryStats } : { salaryAccess: 'Restricted (missing viewFinance permission)' }),
    guards: items,
  }
}

export type SiteRecordForAi = {
  id: string
  name: string
  address: string
  status: string
  clientId: string | null
}

export type ClientRecordForAi = {
  id: string
  name: string
  status: string
  contractValue: number
  slaScore: number | null
  renewalDate: Date | null
}

export type ContractRecordForAi = {
  id: string
  clientName: string
  title: string
  sites: string | null
  monthlyFee: number
  startDate: string
  endDate: string
  nextDueDate: string
  paymentStatus: string
}

export type ClientFilterInput = {
  location?: string
  status?: string
  search?: string
}

/** Normalizes Nigerian state/city filter phrases (e.g., "Lagos State" -> "lagos"). */
export function normalizeLocationQuery(rawLocation: string): string {
  const cleaned = rawLocation.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!cleaned) return ''
  if (cleaned === 'federal capital territory') return 'fct'
  return cleaned.replace(/\s+state$/i, '').trim()
}

export function siteMatchesLocation(site: Pick<SiteRecordForAi, 'name' | 'address'>, normalizedLocation: string): boolean {
  if (!normalizedLocation) return true
  const haystack = `${site.name} ${site.address}`.toLowerCase()
  if (haystack.includes(normalizedLocation)) return true
  const tokens = normalizedLocation
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && t !== 'state')
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token))
}

/** Filters clients and contracts by location/search/status, strictly excluding non-matching clients and sites. */
export function filterClientsAndContracts(
  allClients: ClientRecordForAi[],
  allSites: SiteRecordForAi[],
  allContracts: ContractRecordForAi[],
  input: ClientFilterInput,
  canViewFinance: boolean,
) {
  const normalizedLocation = typeof input.location === 'string' ? normalizeLocationQuery(input.location) : ''
  const statusFilter = typeof input.status === 'string' ? input.status.trim().toLowerCase() : ''
  const searchTerm = typeof input.search === 'string' ? input.search.trim().toLowerCase() : ''

  const sitesByClientId = new Map<string, SiteRecordForAi[]>()
  for (const site of allSites) {
    if (!site.clientId) continue
    const list = sitesByClientId.get(site.clientId) ?? []
    list.push(site)
    sitesByClientId.set(site.clientId, list)
  }

  const matchedClients = allClients
    .map((client) => {
      const clientSites = sitesByClientId.get(client.id) ?? []
      const locationSites = normalizedLocation
        ? clientSites.filter((site) => siteMatchesLocation(site, normalizedLocation))
        : clientSites
      return { client, locationSites }
    })
    .filter(({ client, locationSites }) => {
      if (normalizedLocation && locationSites.length === 0) return false
      if (statusFilter && statusFilter !== 'all' && client.status.toLowerCase() !== statusFilter) return false
      if (searchTerm) {
        const hay = `${client.name} ${locationSites.map((s) => `${s.name} ${s.address}`).join(' ')}`.toLowerCase()
        if (!hay.includes(searchTerm)) return false
      }
      return true
    })

  const matchedClientNames = new Set(matchedClients.map(({ client }) => client.name.toLowerCase()))

  const matchedContracts = canViewFinance
    ? allContracts.filter((contract) => {
        if (normalizedLocation && !matchedClientNames.has(contract.clientName.toLowerCase())) return false
        if (statusFilter && statusFilter !== 'all' && contract.paymentStatus.toLowerCase() !== statusFilter) return false
        if (searchTerm && !`${contract.clientName} ${contract.title} ${contract.sites ?? ''}`.toLowerCase().includes(searchTerm)) {
          return false
        }
        return true
      })
    : []

  const totalContractValue = matchedClients.reduce((sum, { client }) => sum + client.contractValue, 0)

  return {
    locationFilter: normalizedLocation || null,
    matchedClientCount: matchedClients.length,
    ...(canViewFinance
      ? {
          totalContractValue,
          totalContractValueFormatted: naira(totalContractValue),
        }
      : { contractValueAccess: 'Restricted (missing viewFinance permission)' }),
    clients: matchedClients.map(({ client, locationSites }) => ({
      name: client.name,
      status: client.status,
      sites: locationSites.map((s) => s.name),
      siteDetails: locationSites.map((s) => ({ name: s.name, address: s.address, status: s.status })),
      slaScore: client.slaScore,
      renewalDate: client.renewalDate?.toISOString().slice(0, 10) ?? null,
      ...(canViewFinance
        ? {
            contractValue: client.contractValue,
            contractValueFormatted: naira(client.contractValue),
          }
        : {}),
    })),
    ...(canViewFinance
      ? {
          contractsSummary: {
            matchedCount: matchedContracts.length,
            totalMonthlyFee: matchedContracts.reduce((s, c) => s + c.monthlyFee, 0),
            contracts: matchedContracts.slice(0, 40),
          },
        }
      : {}),
  }
}

