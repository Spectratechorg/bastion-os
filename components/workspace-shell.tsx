'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity, Bell, BriefcaseBusiness, Clock3, FileText, Grid2X2, LogOut, MapPin, MoreHorizontal, Phone, Route,
  Search, Settings, Sparkles, Users, Wallet, X,
} from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Logo, Wordmark } from '@/components/brand'
import { Avatar } from '@/components/ui-bits'

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
const bottomNav = ['Overview', 'Guards', 'Patrols', 'Incidents', 'Finance']

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
  useEffect(() => {
    if (role === 'guard') return
    let live = true
    const load = () => fetch('/api/operations?section=alerts', { cache: 'no-store' }).then((r) => r.ok ? r.json() : []).then((rows: { acknowledged: boolean }[]) => { if (live) setUnread(rows.filter((row) => !row.acknowledged).length) }).catch(() => undefined)
    void load(); const timer = window.setInterval(load, 20000); return () => { live = false; window.clearInterval(timer) }
  }, [pathname])

  const navigation = allNavigation.filter((item) => !(item.label === 'Finance' && role !== null && perms.viewFinance === false))
  const isActive = (label: string) => label.toLowerCase() === active.toLowerCase() || (label === 'Finance' && pathname.startsWith('/finance')) || (label === 'Settings' && pathname.startsWith('/settings'))
  function runSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = (search.current?.value ?? '').trim(); if (!query) return
    const page = navigation.find((item) => item.label.toLowerCase().startsWith(query.toLowerCase()))
    router.push(page ? page.href : `/guards?q=${encodeURIComponent(query)}`)
  }
  async function signOut() { await authClient.signOut(); router.push('/sign-in'); router.refresh() }

  if (role === 'guard') return <div className="flex min-h-screen items-center justify-center bg-[#F5F5F6] text-xs text-zinc-500">Opening the guard app…</div>

  return (
    <div className="workspace-theme min-h-screen bg-[#F5F5F6] text-[#18181B]">
      <aside className="workspace-sidebar fixed inset-y-0 left-0 z-20 hidden w-[239px] flex-col bg-[#2A2B2E] text-white lg:flex">
        <Link href="/overview" className="flex h-[64px] items-center px-5"><Wordmark /></Link>
        <div className="mx-3 mb-4 flex h-[52px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-[#E4E4E7] text-[9px] font-bold text-zinc-800">{initials(organization.data?.name)}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold">{organization.data?.name ?? 'Your company'}</span><span className="block text-[10px] text-[#A1A1AA]">{process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? 'Fortewings Security'}</span></span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2.5">
          {navigation.map(({ label, href, icon: Icon, tag }) => (
            <Link key={label} href={href} className={`relative flex h-9 items-center gap-3 rounded-[10px] px-3 text-[12px] transition-colors ${isActive(label) ? 'bg-white/[0.1] font-semibold text-white before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-[3px] before:rounded-full before:bg-white' : 'text-[#B4B4BB] hover:bg-white/[0.06] hover:text-white'}`}>
              <Icon className="size-4" /><span className="flex-1">{label}</span>
              {label === 'Alerts' && unread > 0 && <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">{unread}</span>}
              {tag && <span className="rounded border border-white/25 px-1 text-[9px]">{tag}</span>}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 px-3 pb-3 pt-2">
          <Link href="/guard-app" className="flex h-10 w-full items-center gap-3 rounded-lg px-2 text-xs text-[#B4B4BB] hover:bg-white/[0.06] hover:text-white"><Phone className="size-4" />Guard mobile app</Link>
          <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-3">
            <Link href="/profile" aria-label="Your profile" title="Your profile"><Avatar name={user?.name ?? 'User'} src={user?.image} size={32} /></Link>
            <Link href="/profile" className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{user?.name ?? 'Signed in'}</span><span className="block truncate text-[10px] text-[#A1A1AA]">{user?.email}</span></Link>
            <button onClick={() => void signOut()} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"><LogOut className="size-4" /></button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[239px]">
        <header className="workspace-topbar sticky top-0 z-10 flex h-[60px] items-center gap-3 border-b border-[#E4E4E7] bg-white px-4 lg:h-[65px] lg:px-7">
          <Link href="/overview" className="lg:hidden"><Logo size={32} /></Link>
          <form onSubmit={runSearch} className="flex min-w-0 flex-1 items-center gap-3 text-[#9A9AA1]">
            <Search className="size-4 shrink-0" />
            <input ref={search} aria-label="Search workspace" placeholder="Search guards, or jump to a page..." className="w-full max-w-[350px] bg-transparent text-[13px] text-[#18181B] outline-none placeholder:text-[#9A9AA1]" />
            <kbd className="hidden whitespace-nowrap rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[9px] text-zinc-500 sm:block">Ctrl K</kbd>
          </form>
          <Link href="/alerts" aria-label={`${unread} unacknowledged alerts`} className="relative flex size-10 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100"><Bell className="size-4" />{unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500" />}</Link>
          <Link href="/napoleon" className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[10px] bg-[#2A2B2E] px-3 text-xs font-semibold text-white"><Sparkles className="size-3.5" /><span className="hidden sm:inline">Ask Napoleon</span></Link>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-5 pb-28 sm:px-5 lg:px-7 lg:py-7 lg:pb-10">{children}</main>
      </div>

      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-white/10 bg-[#2A2B2E] pb-[env(safe-area-inset-bottom)] text-white lg:hidden">
        {navigation.filter((item) => bottomNav.includes(item.label)).map(({ label, href, icon: Icon }) => (
          <Link key={label} href={href} className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px] ${isActive(label) ? 'font-semibold text-white' : 'text-[#B4B4BB]'}`}><Icon className="size-[18px]" />{label}</Link>
        ))}
        <button onClick={() => setMore(true)} className="flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px] text-[#B4B4BB]"><MoreHorizontal className="size-[18px]" />More</button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) setMore(false) }}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-[#2A2B2E] p-4 pb-8 text-white">
            <div className="mb-3 flex items-center justify-between"><Wordmark size={28} /><button onClick={() => setMore(false)} aria-label="Close menu" className="flex size-11 items-center justify-center rounded-lg hover:bg-white/10"><X className="size-5" /></button></div>
            <div className="grid grid-cols-3 gap-2">
              {navigation.map(({ label, href, icon: Icon }) => <Link key={label} href={href} className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] text-[11px]"><Icon className="size-5" />{label}</Link>)}
              <Link href="/guard-app" className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] text-[11px]"><Phone className="size-5" />Guard app</Link>
              <Link href="/profile" className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] text-[11px]"><Avatar name={user?.name ?? 'User'} src={user?.image} size={24} />My profile</Link>
              <button onClick={() => void signOut()} className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] text-[11px]"><LogOut className="size-5" />Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function PageHeader({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return <header className="mb-5 flex flex-wrap items-end justify-between gap-3"><div className="min-w-0"><h1 className="text-[24px] font-normal leading-tight tracking-[-0.02em] sm:text-[28px]">{title}</h1>{subtitle && <p className="mt-1 text-[13px] text-[#6B6B72]">{subtitle}</p>}</div><div className="flex flex-wrap items-center gap-2">{children}{action}</div></header>
}

export function PageAction({ children, primary = false, href, onClick }: { children: React.ReactNode; primary?: boolean; href?: string; onClick?: () => void }) {
  const classes = `inline-flex h-11 items-center justify-center gap-2 rounded-[10px] px-3.5 text-xs font-semibold sm:h-10 ${primary ? 'workspace-primary-action bg-[#2A2B2E] text-white hover:bg-[#3F4045]' : 'border border-[#E4E4E7] bg-white text-zinc-700 hover:bg-zinc-50'}`
  return href ? <Link href={href} className={classes}>{children}</Link> : <button onClick={onClick} className={classes}>{children}</button>
}

export function StatStrip({ stats }: { stats: [string, string][] }) {
  return <section className="mb-5 grid grid-cols-2 divide-x divide-y divide-[#E4E4E7] overflow-hidden rounded-[18px] border border-[#E4E4E7] bg-white sm:grid-cols-4 sm:divide-y-0">{stats.map(([value, label]) => <div key={label} className="px-4 py-3.5"><p className="font-mono text-[19px] font-semibold">{value}</p><p className="mt-0.5 text-[11px] text-[#6B6B72]">{label}</p></div>)}</section>
}
