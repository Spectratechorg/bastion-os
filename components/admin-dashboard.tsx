'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  KeyRound,
  MapPin,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/workspace-shell'
import { Badge, ErrorBanner, btn, smallBtn } from '@/components/ui-bits'
import { api } from '@/lib/client'

type AdminData = {
  organization: {
    name: string
    guardAppCode: string
  }
  readiness: {
    totalGuards: number
    activeGuards: number
    onDutyCount: number
    lateOrNoShowCount: number
    suspendedCount: number
    attendanceRate: number
  }
  coverage: {
    totalSites: number
    activeSitesCount: number
    staffedSitesCount: number
    vacantSitesCount: number
    shiftCoverageRatio: number
    matrix: Array<{
      id: string
      name: string
      address: string
      dangerLevel: string
      status: string
      geofenceRadius: number
      assignedCount: number
      presentCount: number
      coverageStatus: 'optimal' | 'understaffed' | 'vacant'
    }>
  }
  sla: {
    completedPatrols: number
    expectedPatrols: number
    patrolSlaPercent: number
  }
  exceptions: Array<{
    id: string
    type: string
    title: string
    body: string
    severity: string
    time: string
  }>
  auditLogs: Array<{
    id: string
    type: string
    title: string
    body: string
    createdAt: string
  }>
}

export function AdminDashboardPage() {
  const [data, setData] = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rotating, setRotating] = useState(false)
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [broadcasting, setBroadcasting] = useState(false)
  const [actionSuccess, setActionSuccess] = useState('')

  const loadMetrics = useCallback(async () => {
    try {
      const res = await api<AdminData>('/api/admin')
      setData(res)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load command center metrics.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMetrics()
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadMetrics()
    }, 30000)
    return () => window.clearInterval(timer)
  }, [loadMetrics])

  async function handleRotateCode() {
    if (!confirm('Are you sure? Rotating the Guard App Access Code will immediately disconnect lost/stolen phones.')) {
      return
    }
    setRotating(true)
    try {
      const res = await api<{ ok: boolean; code: string }>('/api/admin', {
        method: 'POST',
        json: { action: 'rotate-code' },
      })
      if (res.code && data) {
        setData({
          ...data,
          organization: { ...data.organization, guardAppCode: res.code },
        })
        setActionSuccess(`Guard App code rotated to ${res.code}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rotate guard app code.')
    } finally {
      setRotating(false)
    }
  }

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault()
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) return
    setBroadcasting(true)
    try {
      await api('/api/admin', {
        method: 'POST',
        json: {
          action: 'broadcast-alert',
          title: broadcastTitle,
          message: broadcastMessage,
        },
      })
      setBroadcastTitle('')
      setBroadcastMessage('')
      setActionSuccess('Tactical broadcast sent to all field supervisors!')
      void loadMetrics()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch broadcast.')
    } finally {
      setBroadcasting(false)
    }
  }

  async function handleAcknowledge(id: string) {
    try {
      await api('/api/admin', {
        method: 'POST',
        json: { action: 'acknowledge-alert', id },
      })
      if (data) {
        setData({
          ...data,
          exceptions: data.exceptions.filter((ex) => ex.id !== id),
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to acknowledge alert.')
    }
  }

  const dangerBadge = (level: string) => {
    if (level === 'high') return <span className="rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[10px] font-semibold text-[#DC2626]">High Risk</span>
    if (level === 'medium') return <span className="rounded-full bg-[#FEF3E2] px-2 py-0.5 text-[10px] font-semibold text-[#B7791F]">Medium</span>
    return <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-semibold text-[#16A34A]">Low</span>
  }

  const coverageBadge = (status: 'optimal' | 'understaffed' | 'vacant') => {
    if (status === 'optimal') return <span className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-semibold text-[#16A34A]"><CheckCircle2 className="size-3" /> Staffed</span>
    if (status === 'understaffed') return <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3E2] px-2 py-0.5 text-[10px] font-semibold text-[#B7791F]"><AlertTriangle className="size-3" /> Understaffed</span>
    return <span className="inline-flex items-center gap-1 rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[10px] font-semibold text-[#DC2626]"><XCircle className="size-3" /> Vacant</span>
  }

  return (
    <>
      <PageHeader
        title="Operations Command Center"
        subtitle="Tactical supervisor controls, shift readiness SLA, and exception feeds."
        action={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F4F4F5] px-3 py-1 text-xs font-medium text-[#18181B]">
              <span className="size-2 rounded-full bg-[#16A34A] animate-pulse" />
              Live · Supabase Synced
            </span>
            <button onClick={() => void loadMetrics()} className={smallBtn}>
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        }
      />

      <ErrorBanner message={error} retry={() => void loadMetrics()} />

      {actionSuccess && (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-[#DCFCE7] px-4 py-2 text-xs font-medium text-[#16A34A]">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess('')} className="hover:opacity-75">✕</button>
        </div>
      )}

      {/* 1. Tactical SLA Readiness Gauges */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Gauge 1: Shift Coverage */}
        <div className="rounded-[20px] border border-[#E4E4E7] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-[#71717A]">
            <span>Shift Site Coverage</span>
            <MapPin className="size-4 text-[#18181B]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-[#18181B]">
              {data ? `${data.coverage.shiftCoverageRatio}%` : '—'}
            </span>
            <span className="text-xs text-[#71717A]">
              {data ? `${data.coverage.staffedSitesCount}/${data.coverage.activeSitesCount} sites staffed` : ''}
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#F4F4F5]">
            <div
              className={`h-full transition-all duration-500 ${
                (data?.coverage.shiftCoverageRatio ?? 0) >= 80 ? 'bg-[#16A34A]' : (data?.coverage.shiftCoverageRatio ?? 0) >= 50 ? 'bg-[#D97706]' : 'bg-[#DC2626]'
              }`}
              style={{ width: `${data ? data.coverage.shiftCoverageRatio : 0}%` }}
            />
          </div>
        </div>

        {/* Gauge 2: Guard Fleet Readiness */}
        <div className="rounded-[20px] border border-[#E4E4E7] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-[#71717A]">
            <span>Guard Fleet Attendance</span>
            <Users className="size-4 text-[#18181B]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-[#18181B]">
              {data ? `${data.readiness.onDutyCount}/${data.readiness.activeGuards}` : '—'}
            </span>
            <span className="text-xs text-[#71717A]">
              {data ? `${data.readiness.attendanceRate}% on duty` : ''}
            </span>
          </div>
          <div className="mt-3 flex gap-2 text-[11px]">
            <span className="rounded-md bg-[#DCFCE7] px-2 py-0.5 text-[#16A34A]">
              {data ? data.readiness.onDutyCount : 0} Active
            </span>
            <span className="rounded-md bg-[#FEF3E2] px-2 py-0.5 text-[#B7791F]">
              {data ? data.readiness.lateOrNoShowCount : 0} No-show
            </span>
          </div>
        </div>

        {/* Gauge 3: Patrol SLA Compliance */}
        <div className="rounded-[20px] border border-[#E4E4E7] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-[#71717A]">
            <span>Patrol Checkpoint SLA</span>
            <Clock className="size-4 text-[#18181B]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-[#18181B]">
              {data ? `${data.sla.patrolSlaPercent}%` : '—'}
            </span>
            <span className="text-xs text-[#71717A]">
              {data ? `${data.sla.completedPatrols}/${data.sla.expectedPatrols} scans` : ''}
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#F4F4F5]">
            <div
              className="h-full bg-[#2A2B2E] transition-all duration-500"
              style={{ width: `${data ? data.sla.patrolSlaPercent : 0}%` }}
            />
          </div>
        </div>

        {/* Gauge 4: Open Anomalies */}
        <div className="rounded-[20px] border border-[#E4E4E7] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-[#71717A]">
            <span>Critical Exceptions</span>
            <ShieldAlert className="size-4 text-[#DC2626]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-3xl font-bold tracking-tight ${(data?.exceptions.length ?? 0) > 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'}`}>
              {data ? data.exceptions.length : '—'}
            </span>
            <span className="text-xs text-[#71717A]">requiring action</span>
          </div>
          <div className="mt-3 text-[11px] text-[#71717A]">
            {(data?.exceptions.length ?? 0) === 0 ? 'All perimeters secured' : 'Urgent review recommended'}
          </div>
        </div>
      </div>

      {/* 2. Middle Section: Critical Exceptions Feed + Supervisor Rapid Actions */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Critical Exception Feed */}
        <div className="flex flex-col rounded-[20px] border border-[#E4E4E7] bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertOctagon className="size-4 text-[#DC2626]" />
              <h2 className="text-sm font-semibold text-[#18181B]">Critical Exceptions & Dispatch Ticker</h2>
            </div>
            <span className="text-xs text-[#71717A]">{data?.exceptions.length ?? 0} active</span>
          </div>

          <div className="mt-4 flex-1 space-y-3">
            {!data || data.exceptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="size-8 text-[#16A34A]" />
                <p className="mt-2 text-sm font-medium text-[#18181B]">Zero Critical Exceptions</p>
                <p className="text-xs text-[#71717A]">All patrols, check-ins, and geofences are compliant.</p>
              </div>
            ) : (
              data.exceptions.map((ex) => (
                <div
                  key={ex.id}
                  className="flex items-start justify-between rounded-xl border border-[#FEE2E2] bg-[#FEF2F2]/50 p-3.5 transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-[#DC2626] px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                        {ex.type}
                      </span>
                      <h3 className="text-xs font-semibold text-[#18181B]">{ex.title}</h3>
                    </div>
                    <p className="text-xs text-[#52525B]">{ex.body}</p>
                    <span className="text-[10px] text-[#A1A1AA]">
                      {new Date(ex.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {!ex.id.startsWith('breach-') && (
                    <button
                      onClick={() => handleAcknowledge(ex.id)}
                      className="ml-3 shrink-0 rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1 text-[11px] font-medium text-[#18181B] hover:bg-[#F4F4F5]"
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Supervisor Rapid Actions Panel */}
        <div className="flex flex-col gap-5">
          {/* Action 1: Guard App Security Access Code */}
          <div className="rounded-[20px] border border-[#E4E4E7] bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-[#18181B]" />
                <h3 className="text-sm font-semibold text-[#18181B]">Guard App Access Lockout</h3>
              </div>
              <Badge value="Security" />
            </div>
            <p className="mt-1 text-xs text-[#71717A]">
              Shared code for phone scan access. If a guard loses a phone, rotate this code to lock it out immediately.
            </p>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-[#F4F4F5] p-3">
              <span className="font-mono text-base font-bold tracking-wider text-[#18181B]">
                {data?.organization.guardAppCode ?? 'GRD-....-....'}
              </span>
              <button
                onClick={handleRotateCode}
                disabled={rotating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#27272A] disabled:opacity-50"
              >
                <RefreshCw className={`size-3 ${rotating ? 'animate-spin' : ''}`} />
                Rotate Code
              </button>
            </div>
          </div>

          {/* Action 2: Tactical Broadcast */}
          <div className="rounded-[20px] border border-[#E4E4E7] bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <Radio className="size-4 text-[#DC2626]" />
              <h3 className="text-sm font-semibold text-[#18181B]">Dispatch Tactical Broadcast</h3>
            </div>
            <form onSubmit={handleBroadcast} className="mt-3 space-y-2.5">
              <input
                type="text"
                placeholder="Alert headline (e.g. Heightened Alert: Gate 3)"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                className="w-full rounded-xl border border-[#E4E4E7] px-3 py-2 text-xs text-[#18181B] placeholder-[#A1A1AA] focus:border-[#18181B] focus:outline-hidden"
              />
              <textarea
                rows={2}
                placeholder="Operational directive to supervisors..."
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                className="w-full resize-none rounded-xl border border-[#E4E4E7] px-3 py-2 text-xs text-[#18181B] placeholder-[#A1A1AA] focus:border-[#18181B] focus:outline-hidden"
              />
              <button
                type="submit"
                disabled={broadcasting || !broadcastTitle.trim()}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#DC2626] py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
              >
                <Send className="size-3.5" />
                {broadcasting ? 'Dispatching…' : 'Broadcast to All Units'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* 3. Site Coverage & Risk Matrix */}
      <div className="mt-6 rounded-[20px] border border-[#E4E4E7] bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#18181B]">Site Coverage & Perimeter Matrix</h2>
            <p className="text-xs text-[#71717A]">Real-time site post requirements vs. on-duty guards present.</p>
          </div>
          <Link href="/sites" className={smallBtn}>
            Manage Sites
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E4E4E7] text-[11px] font-semibold text-[#71717A]">
                <th className="pb-3">Site Name</th>
                <th className="pb-3">Risk Level</th>
                <th className="pb-3">Geofence</th>
                <th className="pb-3">Guards Present</th>
                <th className="pb-3">Coverage State</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4F4F5]">
              {!data || data.coverage.matrix.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-xs text-[#71717A]">
                    No active sites registered. Go to Sites to create your first security perimeter.
                  </td>
                </tr>
              ) : (
                data.coverage.matrix.map((site) => (
                  <tr key={site.id} className="hover:bg-[#FAFAFA]">
                    <td className="py-3 font-medium text-[#18181B]">{site.name}</td>
                    <td className="py-3">{dangerBadge(site.dangerLevel)}</td>
                    <td className="py-3 text-[#71717A]">{site.geofenceRadius} meters</td>
                    <td className="py-3">
                      <span className="font-semibold text-[#18181B]">{site.presentCount}</span>
                      <span className="text-[#71717A]"> / {site.assignedCount} assigned</span>
                    </td>
                    <td className="py-3">{coverageBadge(site.coverageStatus)}</td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/overview`}
                        className="rounded-md border border-[#E4E4E7] px-2 py-1 text-[11px] font-medium text-[#18181B] hover:bg-[#F4F4F5]"
                      >
                        View Live Map
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Security Audit Trail */}
      <div className="mt-6 rounded-[20px] border border-[#E4E4E7] bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-[#18181B]" />
            <h2 className="text-sm font-semibold text-[#18181B]">Supervisor Security & Access Audit Log</h2>
          </div>
          <Link href="/reports" className="text-xs text-[#71717A] hover:underline">
            Full Audit History →
          </Link>
        </div>

        <div className="mt-4 divide-y divide-[#F4F4F5]">
          {!data || data.auditLogs.length === 0 ? (
            <p className="py-4 text-center text-xs text-[#71717A]">No security events logged today.</p>
          ) : (
            data.auditLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between py-2.5 text-xs">
                <div>
                  <span className="font-medium text-[#18181B]">{log.title}</span>
                  <span className="ml-2 text-[#71717A]">{log.body}</span>
                </div>
                <span className="text-[10px] text-[#A1A1AA]">
                  {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
