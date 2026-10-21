'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import type { LucideIcon } from 'lucide-react'
import {
  Activity, Bell, BriefcaseBusiness, ChevronDown, ChevronRight,
  Clock3, FileText, Grid2X2, MapPin, Moon, Phone, Route,
  Search, Settings, Sparkles, Users, Wallet, X,
} from 'lucide-react'

const navigation: { label: string; href: string; icon: LucideIcon; badge?: string; tag?: string }[] = [
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

function GuardDrawer({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const steps = ['Personal', 'Identity', 'Assignment', 'Review']
  const fields = [
    [['First name', 'e.g. Adewale'], ['Last name', 'e.g. Johnson']],
    [['Phone number', '+234 800 000 0000'], ['Email address', 'name@example.com']],
    [['Residential address', 'Street, city, state']],
  ]
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[5px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section aria-label="Add guard" className="flex h-full w-full max-w-[521px] flex-col bg-white shadow-2xl">
        <header className="flex h-[82px] items-center justify-between border-b border-zinc-200 px-6">
          <div><p className="text-[10px] font-semibold tracking-[0.16em] text-zinc-500">NEW GUARD</p><h2 className="mt-1 text-[22px] font-normal">Add guard</h2></div>
          <button onClick={onClose} aria-label="Close drawer" className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"><X className="size-5" /></button>
        </header>
        <nav aria-label="Guard setup steps" className="flex justify-between border-b border-zinc-200 px-6 py-5">
          {steps.map((label, index) => <div key={label} className="flex items-center gap-2 text-xs">
            <span className={`flex size-[22px] items-center justify-center rounded-full border text-[10px] ${step === index ? 'border-[#111113] bg-[#111113] font-semibold text-white' : 'border-zinc-300 text-zinc-500'}`}>{index + 1}</span>
            <span className={step === index ? 'font-semibold text-zinc-900' : 'text-zinc-500'}>{label}</span>
          </div>)}
        </nav>
        <div className="flex-1 overflow-auto p-6">
          <h3 className="text-[17px] font-semibold">Personal information</h3>
          <p className="mt-1 text-xs text-zinc-500">Add the guard&apos;s legal details as shown on their government ID.</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {fields.flat().map(([label, placeholder]) => <label key={label} className={`flex flex-col gap-2 text-[11px] font-semibold ${label === 'Residential address' ? 'sm:col-span-2' : ''}`}>
              {label}<input placeholder={placeholder} className="h-[38px] rounded-lg border border-zinc-200 bg-zinc-100 px-3 text-xs font-normal outline-none placeholder:text-zinc-400 focus:border-zinc-500" />
            </label>)}
          </div>
        </div>
        <footer className="flex h-16 items-center justify-end gap-2 border-t border-zinc-200 px-6">
          <button onClick={onClose} className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-xs font-semibold">Cancel</button>
          <button onClick={() => setStep((current) => Math.min(current + 1, 3))} className="rounded-lg bg-[#111113] px-4 py-2.5 text-xs font-semibold text-white">{step === 3 ? 'Save guard' : 'Continue ›'}</button>
        </footer>
      </section>
    </div>
  )
}

export function WorkspaceShell({ active, children }: { active: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const showGuardDrawer = pathname === '/guards/new'
  const [identity, setIdentity] = useState<{ user: { name: string; email: string; role: string }; organization: { name: string } } | null>(null)
  const [signOutError, setSignOutError] = useState('')

  useEffect(() => {
    fetch('/api/workspace', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? 'Unable to load workspace identity.')
        setIdentity(body)
      })
      .catch(() => setIdentity(null))
  }, [])

  async function signOut() {
    const result = await authClient.signOut()
    if (result.error) {
      setSignOutError(result.error.message ?? 'Unable to sign out.')
      return
    }
    window.location.assign('/sign-in')
  }

  const organizationName = identity?.organization.name ?? 'Organization not loaded'
  const userName = identity?.user.name ?? 'Account not loaded'
  const initials = userName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="workspace-theme min-h-screen bg-[#F4F4F5] text-[#0A0A0B]">
      <aside className="workspace-sidebar fixed inset-y-0 left-0 z-20 hidden w-[239px] flex-col bg-[#0B0B0C] text-white lg:flex">
        <Link href="/overview" className="flex h-[64px] items-center gap-2 px-6">
          <span className="flex size-8 items-center justify-center rounded-lg bg-white text-sm font-bold text-black">B</span><span className="text-[18px] font-bold">Bastion<small className="ml-0.5 align-baseline text-[11px] font-semibold text-zinc-400">os</small></span>
        </Link>
        <div className="mx-3 mb-4 flex h-[52px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-[#EBEBED] text-[9px] font-bold text-zinc-800">{organizationName.slice(0, 2).toUpperCase()}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold">{organizationName}</span><span className="block text-[10px] capitalize text-[#A1A1A6]">{identity?.user.role ?? 'Loading account'}</span></span><ChevronDown className="size-3.5 text-zinc-400" />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2.5">
          {navigation.map(({ label, href, icon: Icon, badge, tag }) => {
            const selected = label.toLowerCase() === active.toLowerCase()
              || (label === 'Finance' && pathname.startsWith('/finance'))
              || (label === 'Settings' && pathname.startsWith('/settings'))
            return <Link key={label} href={href} className={`relative flex h-9 items-center gap-3 rounded-[10px] px-3 text-[12px] transition-colors ${selected ? 'bg-white/[0.08] font-semibold text-white before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-[3px] before:rounded-full before:bg-white' : 'text-[#A1A1A6] hover:bg-white/[0.05] hover:text-white'}`}>
              <Icon className="size-4" /><span className="flex-1">{label}</span>{badge && <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">{badge}</span>}{tag && <span className="rounded border border-white/25 px-1 text-[9px]">{tag}</span>}
            </Link>
          })}
        </nav>
        <div className="border-t border-white/10 px-3 pb-3 pt-2">
          <Link href="/guard-app" className="flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-xs text-[#A1A1A6] hover:bg-white/[0.06] hover:text-white"><Phone className="size-4" />Guard mobile app<ChevronRight className="ml-auto size-4" /></Link>
          <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-[#EBEBED] text-[10px] font-bold text-zinc-800">{initials}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{userName}</span><span className="block truncate text-[10px] text-[#A1A1A6]">{identity?.user.email ?? ''}</span></span><button onClick={() => void signOut()} className="rounded border border-white/15 px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/10">Sign out</button>
          </div>
          {signOutError && <p role="alert" className="px-1 pt-1 text-[10px] text-red-300">{signOutError}</p>}
        </div>
      </aside>
      <div className="lg:pl-[239px]">
        <header className="workspace-topbar sticky top-0 z-10 flex h-[65px] items-center gap-4 border-b border-[#E4E4E7] bg-white px-5 lg:px-7">
          <div className="flex min-w-0 flex-1 items-center gap-3 text-[#9A9AA1]">
            <Search className="size-4 shrink-0" /><input aria-label="Search workspace" placeholder="Search guards, sites, incidents..." className="w-full max-w-[350px] bg-transparent text-[13px] outline-none placeholder:text-[#9A9AA1]" /><kbd className="hidden whitespace-nowrap rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[9px] text-zinc-500 sm:block">Ctrl K</kbd>
          </div>
          <button className="hidden items-center gap-1 text-xs text-zinc-600 sm:flex">All sites<ChevronDown className="size-3.5" /></button><span className="hidden h-8 w-px bg-zinc-200 sm:block" />
          <button aria-label="Toggle dark mode" className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"><Moon className="size-4" /></button>
          <button aria-label="Notifications" className="relative rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"><Bell className="size-4" /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-red-500" /></button>
          <Link href="/napoleon" className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[10px] bg-[#111113] px-3 text-xs font-semibold text-white"><Sparkles className="size-3.5" /><span className="hidden sm:inline">Ask Napoleon</span></Link>
        </header>
        <nav aria-label="Workspace sections" className="flex gap-1 overflow-x-auto bg-[#0B0B0C] px-3 py-2 text-white lg:hidden">
          {navigation.map(({ label, href, icon: Icon }) => <Link key={label} href={href} aria-current={label.toLowerCase() === active.toLowerCase() ? 'page' : undefined} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[11px] ${label.toLowerCase() === active.toLowerCase() ? 'bg-white/10 text-white' : 'text-[#A1A1A6]'}`}><Icon className="size-3.5" />{label}</Link>)}
        </nav>
        <main className="mx-auto max-w-[1600px] px-5 py-7 lg:px-7">{children}</main>
      </div>
      {showGuardDrawer && <GuardDrawer onClose={() => { window.location.href = '/guards' }} />}
    </div>
  )
}

export function PageHeader({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-[28px] font-normal leading-tight tracking-[-0.02em]">{title}</h1><p className="mt-1 text-[13px] text-[#6B6B72]">{subtitle}</p></div><div className="flex items-center gap-2">{children}{action}</div></header>
}

export function PageAction({ children, primary = false, href }: { children: React.ReactNode; primary?: boolean; href?: string }) {
  const classes = `inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-3.5 text-xs font-semibold ${primary ? 'workspace-primary-action bg-[#111113] text-white' : 'border border-[#E4E4E7] bg-white text-zinc-700 hover:bg-zinc-50'}`
  return href ? <Link href={href} className={classes}>{children}</Link> : <button className={classes}>{children}</button>
}

export function StatStrip({ stats }: { stats: [string, string][] }) {
  return <section className="mb-5 grid grid-cols-2 divide-x divide-y divide-[#E4E4E7] overflow-hidden rounded-[18px] border border-[#E4E4E7] bg-white sm:grid-cols-4 sm:divide-y-0">{stats.map(([value, label]) => <div key={label} className="px-4 py-3.5"><p className="text-[19px] font-semibold">{value}</p><p className="mt-0.5 text-[11px] text-[#6B6B72]">{label}</p></div>)}</section>
}
