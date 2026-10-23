'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/workspace-shell'
import { Avatar, Badge, ErrorBanner, inputClass } from '@/components/ui-bits'
import { api, when } from '@/lib/client'

const LiveMap = dynamic(() => import('@/components/live-map').then((m) => m.LiveMap), { ssr: false, loading: () => <div className="h-[60vh] animate-pulse bg-zinc-100" /> })
type Row = Record<string, any> & { id: string } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Full-size live map: every site with its geofence, and every guard where they last checked in. */
export function MapPage() {
  const [sites, setSites] = useState<Row[]>([]); const [guards, setGuards] = useState<Row[]>([]); const [error, setError] = useState('')
  const [siteId, setSiteId] = useState(''); const [guardId, setGuardId] = useState(''); const [q, setQ] = useState('')
  const load = useCallback(async () => { try { const [s, g] = await Promise.all([api<Row[]>('/api/operations?section=sites'), api<Row[]>('/api/operations?section=guards')]); setSites(s); setGuards(g); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load the map.') } }, [])
  useEffect(() => { void load(); const t = window.setInterval(() => void load(), 10000); return () => window.clearInterval(t) }, [load])
  const list = guards.filter((g) => g.status === 'active' && `${g.name} ${g.site ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  const located = (g: Row) => g.lastLatitude != null && g.lastLongitude != null && g.lastCheckIn
  return <>
    <PageHeader title="Live map" subtitle="Sites with their geofence circles, and each guard at the point where they last checked in. Updates every 10 seconds." />
    <ErrorBanner message={error} retry={() => void load()} />
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white"><LiveMap sites={sites as never} guards={guards as never} selectedSiteId={siteId || undefined} selectedGuardId={guardId || undefined} height="h-[60vh] lg:h-[calc(100vh-230px)] min-h-[380px]" /></section>
      <aside className="flex max-h-[70vh] flex-col rounded-[18px] border border-zinc-200 bg-white p-4 lg:max-h-[calc(100vh-230px)]">
        <select aria-label="Zoom to site" value={siteId} onChange={(e) => { setSiteId(e.target.value); setGuardId('') }} className={inputClass}><option value="">All sites</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.dangerLevel} risk)</option>)}</select>
        <input aria-label="Search guards" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guards…" className={`${inputClass} mt-2`} />
        <ul className="mt-3 flex-1 divide-y divide-zinc-100 overflow-y-auto">{list.map((g) => <li key={g.id}><button disabled={!located(g)} onClick={() => { setSiteId(''); setGuardId(g.id) }} className={`flex min-h-[52px] w-full items-center gap-2.5 px-1 text-left text-xs disabled:opacity-60 ${guardId === g.id ? 'bg-zinc-50' : ''}`}><Avatar name={g.name} src={g.photoUrl} size={32} /><span className="min-w-0 flex-1"><b className="block truncate text-[13px] font-semibold">{g.name}</b><span className="block truncate text-zinc-500">{located(g) ? `${g.site ?? 'Unassigned'} · ${when(g.lastCheckIn)}` : 'No check-in yet'}</span></span>{located(g) && <Badge value={Date.now() - new Date(g.lastCheckIn).getTime() < 12 * 3600000 ? 'Active' : 'Older'} />}</button></li>)}{list.length === 0 && <li className="py-8 text-center text-xs text-zinc-500">No guards match.</li>}</ul>
        <p className="mt-2 text-[11px] text-zinc-500">Grey pins are check-ins older than 12 hours.</p>
      </aside>
    </div>
  </>
}
