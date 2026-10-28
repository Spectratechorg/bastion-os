'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowUpRight, Clock3, MapPin, ShieldCheck, Sparkles, Users, Wallet } from 'lucide-react'

const guards = [
  ['Amara Okafor', 'Northbridge HQ', 'On patrol', '2 min ago'],
  ['Daniel Mensah', 'Harbour Point', 'On site', '8 min ago'],
  ['Lina Patel', 'Riverside Estate', 'On patrol', '14 min ago'],
]

export function DemoModePage() {
  const [notice, setNotice] = useState('')
  return (
    <main className="min-h-screen bg-[#F5F5F6] text-[#18181B]">
      <header className="flex min-h-[68px] items-center justify-between border-b border-[#E4E4E7] bg-white px-5 sm:px-8">
        <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-xl bg-[#2A2B2E] text-white"><ShieldCheck className="size-5" /></div><div><p className="text-sm font-semibold tracking-tight">Bastion OS</p><p className="text-[10px] text-zinc-500">Operations workspace</p></div></div>
        <div className="flex items-center gap-3"><span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-semibold text-amber-700">DEMO MODE</span><Link href="/sign-in" className="text-xs font-semibold text-zinc-600 hover:text-zinc-950">Exit demo</Link></div>
      </header>
      <div className="mx-auto max-w-[1400px] px-5 py-7 sm:px-8 lg:px-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Monday, 28 October 2026</p><h1 className="text-3xl font-normal tracking-tight sm:text-4xl">Good morning, Fortewings</h1><p className="mt-2 text-sm text-zinc-500">A live look at your security operation.</p></div><Link href="/overview" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#2A2B2E] px-4 text-xs font-semibold text-white hover:bg-[#3F4045]">Open workspace <ArrowUpRight className="size-3.5" /></Link></div>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[['42', 'Active guards', Users], ['18', 'Sites covered', MapPin], ['96.4%', 'Attendance rate', Clock3], ['£84,250', 'Contract value', Wallet]].map(([value, label, Icon]) => <div key={String(label)} className="rounded-2xl border border-[#E4E4E7] bg-white p-5"><div className="flex items-center justify-between"><p className="font-mono text-2xl font-semibold">{String(value)}</p><Icon className="size-4 text-zinc-400" /></div><p className="mt-2 text-xs text-zinc-500">{String(label)}</p><p className="mt-4 text-[10px] font-semibold text-emerald-600">+8.2% this month</p></div>)}
        </section>
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
          <section className="rounded-2xl border border-[#E4E4E7] bg-white p-5"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-base font-semibold">Live coverage</h2><p className="mt-1 text-xs text-zinc-500">Last scan locations across your sites</p></div><Link href="/map" className="text-xs font-semibold text-zinc-600 hover:text-zinc-950">View map <ArrowUpRight className="ml-1 inline size-3" /></Link></div><div className="relative min-h-[258px] overflow-hidden rounded-xl bg-[#E8E9EB]"><div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(#c5c6c9 1px, transparent 1px), linear-gradient(90deg, #c5c6c9 1px, transparent 1px)', backgroundSize: '42px 42px' }} /><div className="absolute left-[22%] top-[34%] size-3 rounded-full bg-[#2A2B2E] ring-8 ring-[#2A2B2E]/10" /><div className="absolute left-[61%] top-[25%] size-3 rounded-full bg-[#2A2B2E] ring-8 ring-[#2A2B2E]/10" /><div className="absolute left-[72%] top-[66%] size-3 rounded-full bg-[#2A2B2E] ring-8 ring-[#2A2B2E]/10" /><div className="absolute bottom-4 left-4 rounded-lg bg-white/90 px-3 py-2 text-[10px] font-semibold text-zinc-600 shadow-sm"><span className="mr-1.5 inline-block size-2 rounded-full bg-emerald-500" /> 3 guards scanning now</div></div></section>
          <section className="rounded-2xl border border-[#E4E4E7] bg-white p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-base font-semibold">Guard activity</h2><p className="mt-1 text-xs text-zinc-500">Latest field updates</p></div><Activity className="size-4 text-zinc-400" /></div><div className="flex flex-col gap-1">{guards.map(([name, site, status, time]) => <div key={name} className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-zinc-50"><div className="flex size-9 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-700">{name.split(' ').map((part) => part[0]).join('')}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{name}</p><p className="truncate text-[11px] text-zinc-500">{site} · {status}</p></div><span className="whitespace-nowrap text-[10px] text-zinc-400">{time}</span></div>)}</div><button onClick={() => setNotice('Demo export prepared — no real data was changed.')} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#E4E4E7] text-xs font-semibold text-zinc-700 hover:bg-zinc-50">Export demo report</button>{notice && <p role="status" className="mt-3 text-center text-[11px] text-emerald-600">{notice}</p>}</section>
        </div>
        <section className="mt-5 rounded-2xl border border-[#E4E4E7] bg-[#2A2B2E] p-5 text-white sm:flex sm:items-center sm:justify-between"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 size-5 text-zinc-300" /><div><p className="text-sm font-semibold">Meet Napoleon AI</p><p className="mt-1 text-xs text-zinc-400">Ask questions about patrols, attendance, incidents, and finance.</p></div></div><Link href="/napoleon" className="mt-4 inline-flex h-9 items-center rounded-lg bg-white px-3 text-xs font-semibold text-zinc-800 sm:mt-0">Try Napoleon</Link></section>
      </div>
    </main>
  )
}
