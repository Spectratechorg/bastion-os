'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Plus, RefreshCw, Search, Trash2, UserPlus } from 'lucide-react'
import { PageHeader, StatStrip } from '@/components/workspace-shell'
import { Badge, Empty, ErrorBanner, Field, Sheet, Spinner, btn, btnPrimary, inputClass, smallBtn } from '@/components/ui-bits'
import { api, naira } from '@/lib/client'

type ClientRecord = {
  id: string; name: string; contactName: string | null; email: string | null; phone: string | null
  status: string; monthlyValue: number; slaScore: number | null; renewalDate: string | null
}
type SiteRow = { id: string; name: string; status: string; clientId: string | null }
type GuardRow = { id: string; name: string; site: string | null; status: string }

const emptyForm = { name: '', contactName: '', email: '', phone: '', monthlyValue: '', slaScore: '', renewalDate: '', status: 'active' }

export function ClientsPage() {
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [sites, setSites] = useState<SiteRow[]>([])
  const [guards, setGuards] = useState<GuardRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState<ClientRecord | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [assigning, setAssigning] = useState<ClientRecord | null>(null)

  const load = useCallback(async () => {
    try {
      const [clientRows, siteRows, guardRows] = await Promise.all([
        api<ClientRecord[]>('/api/clients'),
        api<SiteRow[]>('/api/operations?section=sites'),
        api<GuardRow[]>('/api/operations?section=guards'),
      ])
      setClients(clientRows)
      setSites(siteRows)
      setGuards(guardRows)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load clients.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const sitesOf = (client: ClientRecord) => sites.filter((site) => site.clientId === client.id)
  const guardsAt = (client: ClientRecord) => {
    const names = new Set(sitesOf(client).map((site) => site.name))
    return guards.filter((guard) => guard.status === 'active' && guard.site && names.has(guard.site))
  }

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term ? clients.filter((client) => `${client.name} ${client.contactName ?? ''} ${client.email ?? ''}`.toLowerCase().includes(term)) : clients
  }, [clients, search])

  const monthlyTotal = clients.filter((client) => client.status === 'active').reduce((sum, client) => sum + Number(client.monthlyValue), 0)
  const unassignedSites = sites.filter((site) => !site.clientId)

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api(editing ? '/api/clients' : '/api/clients', {
        method: editing ? 'PATCH' : 'POST',
        json: {
          ...(editing ? { id: editing.id } : {}),
          ...form,
          monthlyValue: Number(form.monthlyValue || 0),
          slaScore: form.slaScore === '' ? '' : Number(form.slaScore),
          renewalDate: form.renewalDate ? new Date(`${form.renewalDate}T00:00:00.000Z`).toISOString() : '',
          contactName: form.contactName || null,
          email: form.email || '',
          phone: form.phone || '',
        },
      })
      setFormOpen(false); setEditing(null); setForm(emptyForm)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the client.')
    } finally { setSaving(false) }
  }

  async function remove(client: ClientRecord) {
    if (!window.confirm(`Delete ${client.name}? Their ${sitesOf(client).length} site(s) stay, but will no longer be linked to a client.`)) return
    setBusy(client.id)
    try {
      await api('/api/operations', { method: 'DELETE', json: { section: 'clients', id: client.id } })
      setClients((items) => items.filter((item) => item.id !== client.id))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete the client.')
    } finally { setBusy('') }
  }

  function edit(client: ClientRecord) {
    setEditing(client)
    setForm({
      name: client.name, contactName: client.contactName ?? '', email: client.email ?? '', phone: client.phone ?? '',
      monthlyValue: String(client.monthlyValue), slaScore: client.slaScore === null ? '' : String(client.slaScore),
      renewalDate: client.renewalDate ? new Date(client.renewalDate).toISOString().slice(0, 10) : '', status: client.status,
    })
    setFormOpen(true)
  }

  return <>
    <PageHeader title="Clients" subtitle="The companies you protect, the sites you cover for them, and the guards deployed there.">
      <a href="/api/export?section=clients" className={btn}><Download className="size-3.5" />Export CSV</a>
      <button onClick={() => { setEditing(null); setForm(emptyForm); setFormOpen(true) }} className={btnPrimary}><Plus className="size-3.5" />Add client</button>
    </PageHeader>

    <StatStrip stats={[[String(clients.length), 'Clients'], [String(clients.filter((client) => client.status === 'active').length), 'Active'], [naira(monthlyTotal), 'Monthly contract value'], [String(unassignedSites.length), 'Sites without a client']]} />

    {unassignedSites.length > 0 && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">{unassignedSites.length} site{unassignedSites.length === 1 ? ' is' : 's are'} not linked to a client yet: {unassignedSites.map((site) => site.name).join(', ')}. Use <b>Assign sites</b> on a client to link them.</p>}
    <ErrorBanner message={error} retry={() => void load()} />

    <div className="mb-3 flex items-center gap-2">
      <label className="flex h-10 max-w-sm flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3"><Search className="size-4 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search clients…" className="w-full text-xs outline-none" /></label>
      <button onClick={() => void load()} aria-label="Refresh clients" className={btn}><RefreshCw className="size-3.5" />Refresh</button>
    </div>

    <div className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
      {loading ? <Spinner label="Loading clients…" /> : rows.length === 0 ? <Empty title={search ? 'No clients match your search' : 'No clients yet'} text={search ? undefined : 'Add a client, then link their sites.'} /> : <ul className="divide-y divide-zinc-100">
        {rows.map((client) => {
          const clientSites = sitesOf(client)
          const deployed = guardsAt(client)
          return <li key={client.id} className="p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><b className="text-sm font-semibold">{client.name}</b><Badge value={client.status} />{client.slaScore !== null && <span className="text-[10px] text-zinc-500">SLA {client.slaScore}%</span>}</div>
                <p className="mt-0.5 text-[11px] text-zinc-500">{client.contactName ?? 'No contact'}{client.phone ? ` · ${client.phone}` : ''}{client.email ? ` · ${client.email}` : ''}</p>
                <p className="mt-1 text-[11px] text-zinc-600"><b>{naira(Number(client.monthlyValue))}</b>/month{client.renewalDate ? ` · renews ${new Date(client.renewalDate).toLocaleDateString()}` : ''}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <button className={smallBtn} onClick={() => setAssigning(client)}><UserPlus className="size-3" />Assign sites</button>
                <button className={smallBtn} onClick={() => edit(client)}>Edit</button>
                <button className={`${smallBtn} text-red-700`} disabled={busy === client.id} onClick={() => void remove(client)}><Trash2 className="size-3" />Delete</button>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-zinc-50 p-2.5 text-[11px]">
                <b className="block text-[10px] uppercase tracking-wide text-zinc-500">Sites protected ({clientSites.length})</b>
                {clientSites.length === 0 ? <span className="text-zinc-500">No sites linked yet.</span> : <span className="text-zinc-700">{clientSites.map((site) => site.name).join(', ')}</span>}
              </div>
              <div className="rounded-lg bg-zinc-50 p-2.5 text-[11px]">
                <b className="block text-[10px] uppercase tracking-wide text-zinc-500">Guards deployed ({deployed.length})</b>
                {deployed.length === 0 ? <span className="text-zinc-500">Nobody deployed to these sites yet.</span> : <span className="text-zinc-700">{deployed.map((guard) => guard.name).join(', ')}</span>}
              </div>
            </div>
          </li>
        })}
      </ul>}
    </div>

    {formOpen && <Sheet title={editing ? 'Edit client' : 'Add client'} kicker="CLIENT" onClose={() => setFormOpen(false)}
      footer={<><button className={btn} onClick={() => setFormOpen(false)}>Cancel</button><button form="client-form" className={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save client'}</button></>}>
      <form id="client-form" onSubmit={save} className="grid gap-4">
        <Field label="Client name"><input required className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="Contact person"><input className={inputClass} value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} /></Field>
        <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
        <Field label="Email"><input type="email" className={inputClass} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
        <Field label="Monthly contract value (₦)"><input required type="number" min={0} step="any" className={inputClass} value={form.monthlyValue} onChange={(event) => setForm({ ...form, monthlyValue: event.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SLA score (%)"><input type="number" min={0} max={100} className={inputClass} value={form.slaScore} onChange={(event) => setForm({ ...form, slaScore: event.target.value })} /></Field>
          <Field label="Renewal date"><input type="date" className={inputClass} value={form.renewalDate} onChange={(event) => setForm({ ...form, renewalDate: event.target.value })} /></Field>
        </div>
        <Field label="Status"><select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
      </form>
    </Sheet>}

    {assigning && <AssignSites client={assigning} sites={sites} close={() => setAssigning(null)} done={() => void load()} />}
  </>
}

/** Link each site to a client (or clear it). One client can own many sites. */
function AssignSites({ client, sites, close, done }: { client: ClientRecord; sites: SiteRow[]; close: () => void; done: () => void }) {
  const [selected, setSelected] = useState<string[]>(() => sites.filter((site) => site.clientId === client.id).map((site) => site.id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])

  async function save() {
    setSaving(true); setError('')
    try {
      await Promise.all(sites.map((site) => {
        const shouldOwn = selected.includes(site.id)
        const alreadyOwns = site.clientId === client.id
        if (shouldOwn === alreadyOwns) return Promise.resolve(null)
        return api('/api/operations', {
          method: 'PATCH',
          json: { section: 'sites', id: site.id, action: 'update', clientId: shouldOwn ? client.id : null },
        })
      }))
      done(); close()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update the site links.')
    } finally { setSaving(false) }
  }

  return <Sheet title={`Sites for ${client.name}`} kicker="CLIENT → SITES" onClose={close}
    footer={<><button className={btn} onClick={close}>Cancel</button><button className={btnPrimary} disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save links'}</button></>}>
    <ErrorBanner message={error} />
    <p className="mb-4 text-xs text-zinc-600">Tick every site you protect for this client. A site belongs to one client; a client can have as many sites as you need.</p>
    <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
      {sites.length === 0 ? <li className="p-4 text-xs text-zinc-500">Add a site first.</li> : sites.map((site) => <li key={site.id}>
        <label className="flex min-h-[44px] items-center gap-3 px-3 py-2 text-xs">
          <input type="checkbox" className="size-4" checked={selected.includes(site.id)} onChange={() => toggle(site.id)} />
          <span className="min-w-0 flex-1"><b className="block font-semibold">{site.name}</b>{site.clientId && site.clientId !== client.id && <span className="text-[10px] text-amber-700">Already linked to another client — ticking moves it here</span>}</span>
        </label>
      </li>)}
    </ul>
  </Sheet>
}
