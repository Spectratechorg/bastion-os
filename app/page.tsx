'use client'

import { useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  BrainCircuit,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  Command,
  Crosshair,
  FileWarning,
  LayoutDashboard,
  MapPin,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Navigation,
  Plus,
  Radar,
  ScanLine,
  Search,
  Settings,
  Shield,
  Siren,
  UserRound,
  Users,
  X,
} from 'lucide-react'

const navItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Guards', icon: Users, count: '24' },
  { label: 'Sites', icon: Building2, count: '08' },
  { label: 'Attendance', icon: ScanLine },
  { label: 'Live map', icon: Radar },
  { label: 'Incidents', icon: Siren, count: '03', alert: true },
  { label: 'Alerts', icon: Bell, count: '07', alert: true },
]

const guards = [
  { name: 'Chinedu Okafor', initials: 'CO', site: 'Lekki Phase 1', time: '08:42 AM', status: 'On site', tone: 'emerald' },
  { name: 'Amina Bello', initials: 'AB', site: 'Victoria Island HQ', time: '08:31 AM', status: 'On site', tone: 'emerald' },
  { name: 'Yusuf Ibrahim', initials: 'YI', site: 'Ikoyi Estate', time: '08:14 AM', status: 'En route', tone: 'amber' },
  { name: 'Tolu Adeyemi', initials: 'TA', site: 'Lagos Business Hub', time: '07:58 AM', status: 'Late check-in', tone: 'red' },
]

const activities = [
  { icon: CheckCircle2, tone: 'emerald', title: 'Check-in verified', body: 'Chinedu Okafor checked in at Lekki Phase 1', time: '2 min ago' },
  { icon: AlertTriangle, tone: 'amber', title: 'Late check-in detected', body: 'Tolu Adeyemi is 28 minutes overdue at Lagos Business Hub', time: '8 min ago' },
  { icon: FileWarning, tone: 'red', title: 'Incident reported', body: 'Unauthorized access attempt at Victoria Island HQ', time: '14 min ago' },
  { icon: Navigation, tone: 'blue', title: 'Guard location updated', body: 'Yusuf Ibrahim is moving toward Ikoyi Estate', time: '21 min ago' },
]

function StatusBadge({ status, tone }: { status: string; tone: string }) {
  const styles: Record<string, string> = { emerald: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700', blue: 'bg-blue-50 text-blue-700' }
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[tone]}`}><span className={`size-1.5 rounded-full ${tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : tone === 'red' ? 'bg-red-500' : 'bg-blue-500'}`} />{status}</span>
}

function MapPanel() {
  return (
    <div className="relative h-[348px] overflow-hidden rounded-2xl border border-[#dbe2e7] bg-[#e9f1ee]">
      <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'linear-gradient(32deg, transparent 46%, #c5d5cf 47%, #c5d5cf 48%, transparent 49%), linear-gradient(115deg, transparent 44%, #d0ddd8 45%, #d0ddd8 46%, transparent 47%), linear-gradient(0deg, transparent 91%, #cfddd8 92%, transparent 93%)', backgroundSize: '110px 110px, 150px 130px, 100% 82px' }} />
      <div className="absolute left-[16%] top-[12%] h-44 w-72 rotate-12 rounded-[42%] bg-[#d4e5de] opacity-70" />
      <div className="absolute right-[10%] bottom-[5%] h-36 w-64 -rotate-12 rounded-[50%] bg-[#d1e1da] opacity-70" />
      <div className="absolute left-1/2 top-1/2 h-px w-[78%] -rotate-20 bg-white/80" /><div className="absolute left-[28%] top-[18%] h-[70%] w-px rotate-[20deg] bg-white/80" />
      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-lg border border-[#dbe2e7] bg-white/90 px-3 py-2 text-xs font-semibold text-[#263b39] shadow-sm"><span className="size-2 rounded-full bg-emerald-500" />Live location data <span className="text-[#80908c]">•</span> just now</div>
      {[['left-[29%] top-[38%]', 'CO', 'bg-emerald-600'], ['left-[61%] top-[28%]', 'AB', 'bg-emerald-600'], ['left-[72%] top-[62%]', 'YI', 'bg-amber-500'], ['left-[42%] top-[69%]', 'TA', 'bg-red-500']].map(([pos, initials, color]) => <div key={initials} className={`absolute ${pos} flex size-10 items-center justify-center rounded-full border-4 border-white ${color} text-[10px] font-bold text-white shadow-lg`}>{initials}</div>)}
      <div className="absolute bottom-4 left-4 flex gap-3 rounded-lg border border-[#dbe2e7] bg-white/95 px-3 py-2 text-[11px] text-[#62736f] shadow-sm"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-emerald-500" />On site</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-amber-500" />En route</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-red-500" />Needs attention</span></div>
      <button aria-label="Center map" className="absolute right-4 bottom-4 rounded-lg border border-[#dbe2e7] bg-white p-2.5 text-[#49625d] shadow-sm"><Crosshair className="size-4" /></button>
    </div>
  )
}

export default function Page() {
  const [activeNav, setActiveNav] = useState('Overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showCommand, setShowCommand] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#f6f8f7] text-[#1d302d]">
      {sidebarOpen && <button aria-label="Close navigation" className="fixed inset-0 z-20 bg-black/20 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-[244px] flex-col border-r border-[#e1e8e5] bg-[#fbfcfb] transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[76px] items-center gap-3 border-b border-[#e8eeeb] px-6"><div className="flex size-9 items-center justify-center rounded-xl bg-[#173f37] text-white"><Shield className="size-5" /></div><div><p className="text-[15px] font-bold tracking-tight text-[#173f37]">Bastion<span className="text-[#df7b48]">OS</span></p><p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#84928e]">Security operations</p></div><button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}><X className="size-4" /></button></div>
        <div className="flex flex-1 flex-col px-3 py-6"><p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9aa7a3]">Workspace</p><nav className="flex flex-col gap-1">{navItems.map(({ label, icon: Icon, count, alert }) => <button key={label} onClick={() => { setActiveNav(label); setSidebarOpen(false) }} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition ${activeNav === label ? 'bg-[#e8f0ed] text-[#174e43]' : 'text-[#667772] hover:bg-[#f0f5f3]'}`}><Icon className="size-[17px]" />{label}{count && <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-bold ${alert ? 'bg-[#fff0e9] text-[#cb6939]' : 'bg-[#edf2f0] text-[#80908c]'}`}>{count}</span>}</button>)}</nav><p className="mb-3 mt-9 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9aa7a3]">System</p><nav className="flex flex-col gap-1"><button className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#667772] hover:bg-[#f0f5f3]"><MessageSquare className="size-[17px]" />Napoleon AI<span className="ml-auto size-2 rounded-full bg-[#df7b48]" /></button><button className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#667772] hover:bg-[#f0f5f3]"><Settings className="size-[17px]" />Settings</button></nav></div>
        <div className="border-t border-[#e8eeeb] p-4"><div className="flex items-center gap-3 rounded-xl bg-[#f1f5f3] p-3"><div className="flex size-8 items-center justify-center rounded-full bg-[#d8a78a] text-xs font-bold text-white">AM</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">Adaeze Martins</p><p className="text-[10px] text-[#80908c]">Moderator</p></div><ChevronDown className="size-3.5 text-[#80908c]" /></div></div>
      </aside>
      <main className="lg:pl-[244px]"><header className="sticky top-0 z-10 flex h-[76px] items-center justify-between border-b border-[#e1e8e5] bg-[#f6f8f7]/90 px-5 backdrop-blur-md sm:px-8"><div className="flex items-center gap-3"><button aria-label="Open navigation" className="lg:hidden" onClick={() => setSidebarOpen(true)}><Menu className="size-5" /></button><div><div className="flex items-center gap-2"><p className="text-[15px] font-bold">Good morning, Adaeze</p><span className="hidden rounded-full bg-[#e5f3ee] px-2 py-0.5 text-[10px] font-semibold text-[#327364] sm:inline">● System operational</span></div><p className="mt-0.5 text-xs text-[#82908d]">Here&apos;s what&apos;s happening across your operations today.</p></div></div><div className="flex items-center gap-2"><button onClick={() => setShowCommand(true)} className="hidden items-center gap-2 rounded-lg border border-[#dbe4e0] bg-white px-3 py-2 text-xs text-[#8a9995] shadow-sm sm:flex"><Search className="size-3.5" />Search anything <kbd className="ml-3 rounded border bg-[#f5f7f6] px-1.5 py-0.5 text-[10px]">⌘ K</kbd></button><button aria-label="Notifications" className="relative rounded-lg border border-[#dbe4e0] bg-white p-2.5 text-[#60736e]"><Bell className="size-4" /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#df7b48]" /></button><button onClick={() => setChatOpen(true)} className="flex items-center gap-2 rounded-lg bg-[#173f37] px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#20564a]"><BrainCircuit className="size-4" /> <span className="hidden sm:inline">Ask Napoleon</span></button></div></header>
        <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8"><div className="mb-6 flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#82908d]">Tuesday, September 21, 2026</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1d302d]">Operations overview</h1></div><button className="hidden items-center gap-2 rounded-lg border border-[#dbe4e0] bg-white px-3 py-2 text-xs font-semibold text-[#49625d] shadow-sm sm:flex"><Clock3 className="size-3.5" />Last 24 hours<ChevronDown className="size-3.5" /></button></div>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="rounded-2xl border border-[#dbe5e1] bg-white p-4 shadow-[0_2px_12px_rgba(26,62,52,0.03)]"><div className="flex items-center justify-between"><span className="text-xs font-medium text-[#7d8c88]">Active guards</span><span className="rounded-lg bg-[#e9f5f0] p-2 text-[#27725f]"><Users className="size-4" /></span></div><div className="mt-3 flex items-end gap-2"><strong className="text-2xl tracking-tight">18</strong><span className="mb-1 text-[11px] font-semibold text-[#31906f]">+2 today</span></div><p className="mt-1 text-[11px] text-[#9aa6a2]">of 24 registered guards</p></div><div className="rounded-2xl border border-[#dbe5e1] bg-white p-4 shadow-[0_2px_12px_rgba(26,62,52,0.03)]"><div className="flex items-center justify-between"><span className="text-xs font-medium text-[#7d8c88]">Attendance rate</span><span className="rounded-lg bg-[#edf3fb] p-2 text-[#4b77a7]"><ScanLine className="size-4" /></span></div><div className="mt-3 flex items-end gap-2"><strong className="text-2xl tracking-tight">92.4%</strong><span className="mb-1 text-[11px] font-semibold text-[#31906f]">+4.2%</span></div><p className="mt-1 text-[11px] text-[#9aa6a2]">compared to yesterday</p></div><div className="rounded-2xl border border-[#dbe5e1] bg-white p-4 shadow-[0_2px_12px_rgba(26,62,52,0.03)]"><div className="flex items-center justify-between"><span className="text-xs font-medium text-[#7d8c88]">Open incidents</span><span className="rounded-lg bg-[#fff0e9] p-2 text-[#d87546]"><Siren className="size-4" /></span></div><div className="mt-3 flex items-end gap-2"><strong className="text-2xl tracking-tight">03</strong><span className="mb-1 text-[11px] font-semibold text-[#d87546]">2 high priority</span></div><p className="mt-1 text-[11px] text-[#9aa6a2]">needs your attention</p></div><div className="rounded-2xl border border-[#dbe5e1] bg-white p-4 shadow-[0_2px_12px_rgba(26,62,52,0.03)]"><div className="flex items-center justify-between"><span className="text-xs font-medium text-[#7d8c88]">Sites monitored</span><span className="rounded-lg bg-[#f4f0fb] p-2 text-[#8067ac]"><Building2 className="size-4" /></span></div><div className="mt-3 flex items-end gap-2"><strong className="text-2xl tracking-tight">08</strong><span className="mb-1 text-[11px] font-semibold text-[#31906f]">100% online</span></div><p className="mt-1 text-[11px] text-[#9aa6a2]">across Lagos</p></div></section>
          <section className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]"><div className="rounded-2xl border border-[#dbe5e1] bg-white p-5 shadow-[0_2px_12px_rgba(26,62,52,0.03)]"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-bold">Live guard locations</h2><p className="mt-1 text-xs text-[#82908d]">Latest check-in positions across all sites</p></div><button className="flex items-center gap-1.5 text-xs font-semibold text-[#347566]">View full map <ArrowUpRight className="size-3.5" /></button></div><MapPanel /></div><div className="rounded-2xl border border-[#dbe5e1] bg-white p-5 shadow-[0_2px_12px_rgba(26,62,52,0.03)]"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-bold">Guard status</h2><p className="mt-1 text-xs text-[#82908d]">Live attendance and location</p></div><button aria-label="More options"><MoreHorizontal className="size-4 text-[#82908d]" /></button></div><div className="flex flex-col gap-1">{guards.map((guard) => <div key={guard.name} className="flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-[#f6f9f8]"><div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${guard.tone === 'red' ? 'bg-[#f9d9d2] text-[#ae5544]' : guard.tone === 'amber' ? 'bg-[#f9e6bd] text-[#a56a1b]' : 'bg-[#d7ebe4] text-[#29705e]'}`}>{guard.initials}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{guard.name}</p><p className="mt-0.5 flex items-center gap-1 text-[10px] text-[#879690]"><MapPin className="size-2.5" />{guard.site}</p></div><div className="text-right"><StatusBadge status={guard.status} tone={guard.tone} /><p className="mt-1 text-[10px] text-[#9aa6a2]">{guard.time}</p></div></div>)}</div><button className="mt-3 w-full rounded-lg border border-[#dbe5e1] py-2 text-xs font-semibold text-[#49625d] hover:bg-[#f6f9f8]">View all guards</button></div></section>
          <section className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_1fr]"><div className="rounded-2xl border border-[#dbe5e1] bg-white p-5 shadow-[0_2px_12px_rgba(26,62,52,0.03)]"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-sm font-bold">Recent activity</h2><p className="mt-1 text-xs text-[#82908d]">A real-time view of operations</p></div><span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#31836f]"><span className="size-1.5 animate-pulse rounded-full bg-[#38a486]" />LIVE</span></div><div className="flex flex-col">{activities.map(({ icon: Icon, tone, title, body, time }) => <div key={title} className="flex gap-3 border-b border-[#edf1ef] py-3 last:border-0"><div className={`mt-0.5 rounded-lg p-2 ${tone === 'emerald' ? 'bg-[#e8f5f0] text-[#2d846d]' : tone === 'amber' ? 'bg-[#fff4dc] text-[#b77a20]' : tone === 'red' ? 'bg-[#fff0eb] text-[#cb6846]' : 'bg-[#edf3fb] text-[#5d82ad]'}`}><Icon className="size-3.5" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{title}</p><span className="shrink-0 text-[10px] text-[#9aa6a2]">{time}</span></div><p className="mt-1 truncate text-[11px] text-[#7f8e8a]">{body}</p></div></div>)}</div></div><div className="rounded-2xl bg-[#173f37] p-5 text-white shadow-[0_8px_24px_rgba(23,63,55,0.16)]"><div className="flex items-start justify-between"><div className="flex size-10 items-center justify-center rounded-xl bg-white/10"><BrainCircuit className="size-5 text-[#f2a276]" /></div><span className="rounded-full bg-[#2b6356] px-2.5 py-1 text-[10px] font-semibold text-[#a9d7c9]">Napoleon AI</span></div><h2 className="mt-5 text-lg font-bold">Your operations co-pilot.</h2><p className="mt-2 max-w-xs text-xs leading-5 text-[#b7d2ca]">Ask questions about your guards, attendance, incidents, or let Napoleon flag unusual activity.</p><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => setChatOpen(true)} className="rounded-lg bg-white px-3 py-2 text-[11px] font-bold text-[#173f37]">Analyze today&apos;s activity</button><button onClick={() => setChatOpen(true)} className="rounded-lg border border-white/20 px-3 py-2 text-[11px] font-semibold text-white">Ask a question</button></div><div className="mt-6 flex items-center gap-2 border-t border-white/10 pt-4 text-[10px] text-[#9fc1b7]"><CircleDot className="size-3 text-[#69c9a8]" />Monitoring 8 sites and 24 guards</div></div></section>
        </div></main>
      {showCommand && <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[15vh]" onClick={() => setShowCommand(false)}><div className="w-full max-w-lg rounded-2xl border border-[#dbe5e1] bg-white p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-center gap-3 border-b border-[#edf1ef] px-3 pb-3"><Search className="size-4 text-[#84928e]" /><input autoFocus placeholder="Search guards, sites, incidents..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#9aa6a2]" /><kbd className="rounded bg-[#f2f5f4] px-2 py-1 text-[10px] text-[#84928e]">ESC</kbd></div><div className="p-2 text-xs text-[#84928e]">Try searching for <span className="font-semibold text-[#347566]">late check-ins</span> or <span className="font-semibold text-[#347566]">Victoria Island</span></div></div></div>}
      {chatOpen && <div className="fixed inset-0 z-50 bg-black/20" onClick={() => setChatOpen(false)}><div className="absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between border-b border-[#e1e8e5] bg-[#173f37] px-5 py-4 text-white"><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-xl bg-white/10"><BrainCircuit className="size-5 text-[#f2a276]" /></div><div><p className="text-sm font-bold">Napoleon AI</p><p className="text-[10px] text-[#b7d2ca]">Your operations co-pilot</p></div></div><button onClick={() => setChatOpen(false)}><X className="size-5" /></button></div><div className="flex-1 overflow-auto bg-[#f8faf9] p-5"><div className="max-w-[300px] rounded-2xl rounded-tl-sm bg-white p-4 text-xs leading-5 text-[#50625d] shadow-sm">Good morning, Adaeze. I&apos;m monitoring all 8 sites. I noticed one late check-in and an unusual access attempt at Victoria Island HQ. How can I help?</div><div className="mt-5 flex flex-col gap-2"><button className="rounded-xl border border-[#dbe5e1] bg-white px-3 py-2.5 text-left text-xs font-medium text-[#49625d]">Explain the unusual access attempt</button><button className="rounded-xl border border-[#dbe5e1] bg-white px-3 py-2.5 text-left text-xs font-medium text-[#49625d]">Which guards are late today?</button><button className="rounded-xl border border-[#dbe5e1] bg-white px-3 py-2.5 text-left text-xs font-medium text-[#49625d]">Summarize today&apos;s activity</button></div></div><div className="border-t border-[#e1e8e5] p-4"><div className="flex items-center gap-2 rounded-xl border border-[#dbe5e1] bg-[#f8faf9] p-2"><input placeholder="Ask Napoleon anything..." className="flex-1 bg-transparent px-2 text-xs outline-none" /><button className="rounded-lg bg-[#173f37] p-2 text-white"><ArrowUpRight className="size-3.5" /></button></div><p className="mt-2 text-center text-[10px] text-[#a0ada9]">Napoleon can query live operations data</p></div></div></div>}
    </div>
  )
}
