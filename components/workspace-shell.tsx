'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity, Bell, BriefcaseBusiness, Clock3, FileText, Grid2X2, LogOut, MapPin, MoreHorizontal, Phone, Route,
  Search, Settings, Sparkles, Users, Wallet, X,
} from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Logo, Wordmark } from '@/components/brand'
import { Avatar } from '@/components/ui-bits'
import { FINANCE_ENABLED } from '@/lib/features'

const allNavigation = [
  { label: 'Overview', href: '/overview', icon: Grid2X2 },
  { label: 'Guards', href: '/guards', icon: Users },
  { label: 'Sites', href: '/sites', icon: MapPin },
  { label: 'Attendance', href: '/attendance', icon: Clock3 },
  { label: 'Patrols', href: '/patrols', icon: Route },
  { label: 'Incidents', href: '/incidents', icon: FileText },
  { label: 'Alerts', href: '/alerts', icon: Bell },
  { label: 'Clients', href: '/clients', icon: BriefcaseBusiness },
  { label: 'Finance', href: '/finance', icon: Wallet },
  { label: 'Reports', href: '/reports', icon: Activity },
  { label: 'Napoleon AI', href: '/napoleon', icon: Sparkles, tag: 'AI' },
  { label: 'Settings', href: '/settings/roles', icon: Settings },
]
const bottomNav = ['Overview', 'Guards', 'Patrols', 'Incidents', ...(FINANCE_ENABLED ? ['Finance'] : [])]
const navGroups: { label: string; items: string[] }[] = [
  { label: 'Operations', items: ['Overview', 'Guards', 'Sites', 'Attendance', 'Patrols', 'Incidents', 'Alerts'] },
  { label: 'Business', items: ['Clients', ...(FINANCE_ENABLED ? ['Finance'] : []), 'Reports'] },
  { label: 'Workspace', items: ['Napoleon AI', 'Settings'] },
]

function initials(name?: string | null) {
  return (name ?? 'B').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export function WorkspaceShell({ active, children }: { active: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const session = authClient.useSession()
  const organization = authClient.useActiveOrganization()
  const [more, setMore] = useState(false)
  const [unread, setUnread] = useState(0)
  const [role, setRole] = useState<string | null>(null)
  const [perms, setPerms] = useState<Record<string, boolean>>({})
  const [searchMessage, setSearchMessage] = useState('')
  const [syncIssue, setSyncIssue] = useState(false)
  const search = useRef<HTMLInputElement>(null)
  const user = session.data?.user

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search.current?.focus() } }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { setMore(false) }, [pathname])
  useEffect(() => {
    if (session.isPending) return
    if (!session.data?.user) router.replace('/sign-in')
    else if (!(session.data.session as { activeOrganizationId?: string | null }).activeOrganizationId) router.replace('/onboarding')
  }, [session.isPending, session.data, router])
  useEffect(() => {
    if (session.isPending || !session.data?.user) return
    fetch('/api/me', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((me: { role: string; permissions: Record<string, boolean> } | null) => { if (me) { setRole(me.role); setPerms(me.permissions); if (me.role === 'guard') router.replace('/guard-app') } }).catch(() => undefined)
  }, [session.isPending, session.data, router])
  const refreshAlerts = useCallback(async () => {
    try {
      const response = await fetch('/api/operations?section=alerts', { cache: 'no-store' })
      if (!response.ok) throw new Error('alert refresh failed')
      const rows = await response.json() as { acknowledged: boolean }[]
      setUnread(rows.filter((row) => !row.acknowledged).length)
      setSyncIssue(false)
    } catch {
      // The bell silently drifted before; surface it without interrupting the page.
      setSyncIssue(true)
    }
  }, [])
  useEffect(() => {
    if (role === 'guard') return
    void refreshAlerts(); const timer = window.setInterval(() => { if (!document.hidden) void refreshAlerts() }, 60000); return () => window.clearInterval(timer)
  }, [pathname, refreshAlerts, role])
  useEffect(() => {
    // While the count is failing, retry sooner than the minute poll so a restart heals itself.
    if (!syncIssue) return
    const timer = window.setTimeout(() => void refreshAlerts(), 6_000)
    return () => window.clearTimeout(timer)
  }, [syncIssue, refreshAlerts])

  const navigation = allNavigation.filter((item) => {
    if (item.label === 'Finance' && (!FINANCE_ENABLED || (role !== null && perms.viewFinance === false))) return false
    return true
  })
  const isActive = (label: string) =>
    label.toLowerCase() === active.toLowerCase() ||
    (label === 'Napoleon AI' && (pathname === '/napoleon' || active === 'napoleon')) ||
    (label === 'Finance' && pathname.startsWith('/finance')) ||
    (label === 'Settings' && pathname.startsWith('/settings'))
  async function runSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = (search.current?.value ?? '').trim(); if (!query) return
    const normalized = query.toLowerCase()
    const page = navigation.find((item) => item.label.toLowerCase().startsWith(normalized))
    if (page) { setSearchMessage(''); router.push(page.href); return }
    setSearchMessage('Searching workspace…')
    const sources = ['guards', 'sites', 'attendance', 'patrols', 'incidents', 'alerts']
    try {
      const results = await Promise.all(sources.map(async (section) => ({ section, rows: await fetch(`/api/operations?section=${section}`, { cache: 'no-store' }).then((response) => response.ok ? response.json() : []) as Record<string, unknown>[] })))
      const hit = results.find(({ rows }) => rows.some((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(normalized))))
      if (hit) { setSearchMessage(''); router.push(`/${hit.section}?q=${encodeURIComponent(query)}`) } else setSearchMessage(`No workspace record matched “${query}”.`)
    } catch { setSearchMessage('Search is temporarily unavailable.') }
  }
  async function signOut() { await authClient.signOut(); router.push('/sign-in'); router.refresh() }

  if (role === 'guard') return <div className="flex min-h-screen items-center justify-center bg-[#F5F5F6] text-[12px] text-[#6B6B72]">Opening the guard app…</div>

  return (
    <div className="workspace-theme min-h-screen bg-[#F5F5F6] text-[#18181B]">
      <aside className="workspace-sidebar fixed inset-y-0 left-0 z-20 hidden w-[244px] flex-col bg-[#2A2B2E] text-white lg:flex">
        <Link href="/overview" className="flex h-[62px] items-center px-5"><Wordmark /></Link>
        <nav className="flex-1 overflow-y-auto px-2.5 pb-4">
          {navGroups.map((group) => {
            const items = navigation.filter((item) => group.items.includes(item.label))
            if (items.length === 0) return null
            return (
              <div key={group.label} className="mb-4">
                <p className="mb-1.5 px-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A9AA1]">{group.label}</p>
                <div className="space-y-0.5">
                  {items.map(({ label, href, icon: Icon, tag }) => (
                    <Link key={label} href={href} prefetch className={`group flex h-[34px] items-center gap-2.5 rounded-[7px] px-2.5 text-[11.5px] transition-colors ${isActive(label) ? 'bg-white/[0.08] font-semibold text-white' : 'text-[#B4B4BB] hover:bg-white/[0.05] hover:text-white'}`}>
                      <span aria-hidden className={`size-1.5 rounded-[2px] ${isActive(label) ? 'bg-white' : 'bg-transparent'}`} />
                      <Icon className={`size-[15px] ${isActive(label) ? 'text-white' : 'text-[#A1A1AA] group-hover:text-white'}`} strokeWidth={1.75} /><span className="flex-1">{label}</span>
                      {label === 'Alerts' && unread > 0 && <span className="rounded-[4px] bg-[#B3402A] px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-white">{unread}</span>}
                      {tag && <span className="rounded-[3px] border border-white/20 px-1 text-[8.5px] uppercase tracking-wide text-[#B4B4BB]">{tag}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>
        <div className="border-t border-white/[0.08] px-3 pb-3 pt-2.5">
          <Link href="/guard-app" className="flex h-9 w-full items-center gap-2.5 rounded-[7px] px-2 text-[11.5px] text-[#B4B4BB] transition-colors hover:bg-white/[0.05] hover:text-white"><Phone className="size-[15px]" strokeWidth={1.75} />Guard mobile app</Link>
          <div className="mt-2.5 flex items-center gap-2 border-t border-white/[0.08] pt-3">
            <Link href="/profile" aria-label="Your profile" title="Your profile"><Avatar name={user?.name ?? 'User'} src={user?.image} size={32} /></Link>
            <Link href="/profile" className="min-w-0 flex-1"><span className="block truncate text-[11.5px] font-semibold">{user?.name ?? 'Signed in'}</span><span className="block truncate text-[9.5px] text-[#A1A1AA]">{user?.email}</span></Link>
            <button onClick={() => void signOut()} aria-label="Sign out" title="Sign out" className="rounded-[7px] p-2 text-[#A1A1AA] transition-colors hover:bg-white/[0.07] hover:text-white"><LogOut className="size-4" /></button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[244px]">
        <header className="workspace-topbar sticky top-0 z-10 flex h-[58px] items-center gap-3 border-b border-[#E4E4E7] bg-white/95 px-4 backdrop-blur-sm lg:h-[62px] lg:px-7">
          <Link href="/overview" className="lg:hidden"><Logo size={32} /></Link>
          <form onSubmit={runSearch} className="flex min-w-0 flex-1 items-center gap-2 text-[#9A9AA1]">
            <Search className="size-[15px] shrink-0" strokeWidth={1.75} />
            <input ref={search} aria-label="Search workspace" placeholder="Search guards, or jump to a page..." className="w-full max-w-[360px] bg-transparent text-[12px] text-[#18181B] outline-none placeholder:text-[#9A9AA1]" />
            <kbd className="hidden whitespace-nowrap rounded-[4px] border border-[#E4E4E7] bg-[#F5F5F6] px-1.5 py-0.5 font-mono text-[9px] text-[#6B6B72] sm:block">Ctrl K</kbd>
            {searchMessage && <span role="status" className="hidden max-w-[260px] truncate text-[10px] text-[#6B6B72] md:block">{searchMessage}</span>}
          </form>
          {syncIssue && <button onClick={() => void refreshAlerts()} title="The alert count could not refresh. Click to retry." className="hidden h-7 items-center gap-1.5 rounded-[6px] border border-[#F3E3BF] bg-[#FEF3E2] px-2 text-[9.5px] font-semibold tracking-[0.01em] text-[#8A5A12] sm:inline-flex"><span aria-hidden className="size-1.5 rounded-[2px] bg-[#B07A18]" />Sync issue</button>}
          <Link href="/alerts" aria-label={`${unread} unacknowledged alerts`} className="relative flex size-9 items-center justify-center rounded-[7px] text-[#6B6B72] transition-colors hover:bg-[#F0F2EC]"><Bell className="size-[16px]" strokeWidth={1.75} />{unread > 0 && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#B3402A]" />}</Link>
          <Link href="/napoleon" className="flex h-9 items-center gap-2 whitespace-nowrap rounded-[7px] bg-[#2A2B2E] px-3 text-[11px] font-semibold text-white transition-colors hover:bg-[#3F4045]"><Sparkles className="size-3.5" strokeWidth={1.75} /><span className="hidden sm:inline">Ask Napoleon</span></Link>
        </header>
        <main className="mx-auto max-w-[1560px] px-4 py-5 pb-28 sm:px-5 lg:px-7 lg:py-6 lg:pb-10">{children}</main>
      </div>

      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-white/[0.08] bg-[#2A2B2E] pb-[env(safe-area-inset-bottom)] text-white lg:hidden">
        {navigation.filter((item) => bottomNav.includes(item.label)).map(({ label, href, icon: Icon }) => (
          <Link key={label} href={href} className={`flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] ${isActive(label) ? 'font-semibold text-white' : 'text-[#B4B4BB]'}`}><Icon className="size-[18px]" />{label}</Link>
        ))}
        <button onClick={() => setMore(true)} className="flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] text-[#B4B4BB]"><MoreHorizontal className="size-[18px]" />More</button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) setMore(false) }}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-[16px] bg-[#2A2B2E] p-4 pb-8 text-white">
            <div className="mb-3 flex items-center justify-between"><Wordmark size={28} /><button onClick={() => setMore(false)} aria-label="Close menu" className="flex size-11 items-center justify-center rounded-lg hover:bg-white/10"><X className="size-5" /></button></div>
            <div className="grid grid-cols-3 gap-2">
              {navigation.map(({ label, href, icon: Icon }) => <Link key={label} href={href} className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-[10px] bg-white/[0.05] text-[11px] text-[#DDE6DF]"><Icon className="size-5" />{label}</Link>)}
              <Link href="/guard-app" className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-[10px] bg-white/[0.05] text-[11px] text-[#DDE6DF]"><Phone className="size-5" />Guard app</Link>
              <Link href="/profile" className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-[10px] bg-white/[0.05] text-[11px] text-[#DDE6DF]"><Avatar name={user?.name ?? 'User'} src={user?.image} size={24} />My profile</Link>
              <button onClick={() => void signOut()} className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-[10px] bg-white/[0.05] text-[11px] text-[#DDE6DF]"><LogOut className="size-5" />Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function PageHeader({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return <header className="mb-5 flex flex-wrap items-end justify-between gap-3"><div className="min-w-0"><h1 className="text-[25px] font-semibold leading-[1.15] tracking-[-0.03em] text-[#18181B] sm:text-[29px]">{title}</h1>{subtitle && <p className="mt-1 max-w-[68ch] text-[12.5px] leading-relaxed text-[#6B6B72]">{subtitle}</p>}</div><div className="flex flex-wrap items-center gap-2">{children}{action}</div></header>
}

export function PageAction({ children, primary = false, href, onClick }: { children: React.ReactNode; primary?: boolean; href?: string; onClick?: () => void }) {
  const classes = `inline-flex h-10 items-center justify-center gap-2 rounded-[8px] px-3.5 text-[11.5px] font-semibold transition-colors sm:h-9 ${primary ? 'workspace-primary-action bg-[#2A2B2E] text-white hover:bg-[#3F4045]' : 'border border-[#E4E4E7] bg-white text-[#3F3F46] hover:border-[#D4D4D8] hover:bg-[#F5F5F6]'}`
  return href ? <Link href={href} className={classes}>{children}</Link> : <button onClick={onClick} className={classes}>{children}</button>
}

export function StatStrip({ stats }: { stats: [string, string][] }) {
  return <section className="mb-5 flex flex-wrap items-baseline gap-x-8 gap-y-2.5 border-b border-[#E4E4E7] pb-4">
    {stats.map(([value, label]) => (
      <div key={label} className="flex items-baseline gap-2">
        <span className="ws-num text-[17px] font-semibold leading-none text-[#18181B]">{value}</span>
        <span className="text-[11px] leading-none text-[#6B6B72]">{label}</span>
      </div>
    ))}
  </section>
}
