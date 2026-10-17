import {
  Activity,
  Bell,
  MapPin,
  Radar,
  ScanLine,
  Shield,
  Siren,
  Users,
} from 'lucide-react'

const navigation = [
  ['Overview', Activity],
  ['Guards', Users],
  ['Sites', Radar],
  ['Attendance', ScanLine],
  ['Incidents', Siren],
  ['Alerts', Bell],
] as const

const guards = [
  { name: 'Adaeze Okafor', initials: 'AO', site: 'Victoria Island', status: 'On site' },
  { name: 'Chidi Nwosu', initials: 'CN', site: 'Lekki Phase 1', status: 'On site' },
  { name: 'Tomi Adebayo', initials: 'TA', site: 'Ikeja GRA', status: 'Check-in due' },
]

const activity = [
  { title: 'Patrol completed', detail: 'Adaeze Okafor · Victoria Island', time: '9:42 AM' },
  { title: 'Guard checked in', detail: 'Chidi Nwosu · Lekki Phase 1', time: '9:18 AM' },
  { title: 'Incident reported', detail: 'Perimeter gate inspection · Ikeja GRA', time: '8:56 AM' },
]

export default function PreviewPage() {
  return (
    <div className="min-h-screen bg-[#f6f8f7] text-[#1d302d]">
      <aside className="fixed inset-y-0 left-0 hidden w-[244px] flex-col border-r border-[#e1e8e5] bg-[#fbfcfb] lg:flex">
        <div className="flex h-[76px] items-center gap-3 border-b border-[#e8eeeb] px-6">
          <div className="flex size-9 items-center justify-center rounded-xl bg-[#173f37] text-white">
            <Shield className="size-5" />
          </div>
          <div>
            <p className="text-[15px] font-bold text-[#173f37]">Bastion<span className="text-[#df7b48]">OS</span></p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#84928e]">Security operations</p>
          </div>
        </div>
        <nav aria-label="Preview sections" className="flex flex-col gap-1 px-3 py-6 text-[13px] font-medium text-[#667772]">
          {navigation.map(([label, Icon], index) => (
            <a
              key={label}
              href={index === 0 ? '#overview' : `#${label.toLowerCase()}`}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[#eef5f1] hover:text-[#174e43] ${index === 0 ? 'bg-[#e8f0ed] text-[#174e43]' : ''}`}
            >
              <Icon className="size-[17px]" />
              {label}
            </a>
          ))}
        </nav>
        <div className="mt-auto p-4">
          <a href="/sign-in" className="block rounded-lg border border-[#dbe4e0] bg-white px-3 py-2.5 text-center text-xs font-semibold text-[#49625d] hover:bg-[#f4f8f5]">
            Back to sign in
          </a>
        </div>
      </aside>

      <main id="overview" className="lg:pl-[244px]">
        <header className="flex min-h-[76px] items-center justify-between gap-4 border-b border-[#e1e8e5] bg-[#f6f8f7] px-5 sm:px-8">
          <div>
            <p className="text-[15px] font-bold">Good morning, Adaeze</p>
            <p className="mt-0.5 text-xs text-[#82908d]">Security operations overview</p>
          </div>
          <span className="rounded-full bg-[#fff4dc] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#9a681c]">
            Demo preview
          </span>
        </header>

        <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8">
          <div className="mb-6 rounded-xl border border-[#e8d8ad] bg-[#fff9e9] px-4 py-3 text-sm text-[#765a24]">
            Preview only — these are sample records. Nothing here is connected to a database or live security operation.
          </div>

          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#82908d]">Sample workspace</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Operations overview</h1>
          </div>

          <section aria-label="Sample operations metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Active guards', '12', 'of 14 registered', Users],
              ['Attendance rate', '92.8%', 'today from check-ins', ScanLine],
              ['Open incidents', '02', 'needs attention', Siren],
              ['Alerts', '03', 'unacknowledged', Bell],
            ].map(([label, value, detail, Icon]) => {
              const MetricIcon = Icon
              return (
                <div key={label as string} className="rounded-2xl border border-[#dbe5e1] bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#7d8c88]">{label as string}</span>
                    <span className="rounded-lg bg-[#e9f5f0] p-2 text-[#27725f]">
                      <MetricIcon className="size-4" />
                    </span>
                  </div>
                  <strong className="mt-3 block text-2xl tracking-tight">{value as string}</strong>
                  <p className="mt-1 text-[11px] text-[#9aa6a2]">{detail as string}</p>
                </div>
              )
            })}
          </section>

          <section id="guards" className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-[#dbe5e1] bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-sm font-bold">Guard locations</h2>
                <p className="mt-1 text-xs text-[#82908d]">Example team coverage across sites</p>
              </div>
              <div id="sites" className="relative h-[300px] overflow-hidden rounded-xl border border-[#dbe2e7] bg-[#e9f1ee]">
                <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'linear-gradient(32deg, transparent 46%, #c5d5cf 47%, #c5d5cf 48%, transparent 49%), linear-gradient(115deg, transparent 44%, #d0ddd8 45%, #d0ddd8 46%, transparent 47%), linear-gradient(0deg, transparent 91%, #cfddd8 92%, transparent 93%)', backgroundSize: '110px 110px, 150px 130px, 100% 82px' }} />
                {guards.map((guard, index) => (
                  <div
                    key={guard.initials}
                    className={`absolute flex size-10 items-center justify-center rounded-full border-4 border-white text-[10px] font-bold text-white shadow-lg ${index === 2 ? 'left-[68%] top-[62%] bg-amber-500' : index === 1 ? 'left-[61%] top-[28%] bg-emerald-600' : 'left-[29%] top-[38%] bg-emerald-600'}`}
                    title={`${guard.name} · ${guard.site}`}
                  >
                    {guard.initials}
                  </div>
                ))}
                <span className="absolute left-4 top-4 rounded-lg border border-[#dbe2e7] bg-white/90 px-3 py-2 text-xs font-semibold text-[#263b39]">
                  Sample site map
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-[#dbe5e1] bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-bold">Guard status</h2>
              <div className="divide-y divide-[#edf1ef]">
                {guards.map((guard) => (
                  <div key={guard.initials} className="flex items-center gap-3 py-4">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#d7ebe4] text-[10px] font-bold text-[#29705e]">
                      {guard.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{guard.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[#879690]">
                        <MapPin className="size-2.5" />{guard.site}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${guard.status === 'On site' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {guard.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="incidents" className="mt-6 rounded-2xl border border-[#dbe5e1] bg-white p-5 shadow-sm">
            <div className="mb-3">
              <h2 className="text-sm font-bold">Recent activity</h2>
              <p className="mt-1 text-xs text-[#82908d]">Illustrative events for the UI preview</p>
            </div>
            <div className="divide-y divide-[#edf1ef]">
              {activity.map((event) => (
                <div key={event.title} className="flex flex-wrap items-center justify-between gap-2 py-4">
                  <div>
                    <p className="text-xs font-semibold">{event.title}</p>
                    <p className="mt-1 text-[11px] text-[#7f8e8a]">{event.detail}</p>
                  </div>
                  <time className="text-[10px] text-[#9aa6a2]">{event.time}</time>
                </div>
              ))}
            </div>
          </section>

          <section id="attendance" className="mt-6 rounded-2xl border border-[#dbe5e1] bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-bold">Today&apos;s attendance</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {guards.map((guard, index) => (
                <div key={guard.initials} className="rounded-xl bg-[#f8faf9] p-4">
                  <p className="text-xs font-semibold">{guard.name}</p>
                  <p className="mt-1 text-[11px] text-[#7f8e8a]">{guard.site}</p>
                  <p className="mt-3 text-xs font-bold text-[#27725f]">{index === 0 ? '08:02 AM' : index === 1 ? '08:18 AM' : 'Check-in due'}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="alerts" className="mt-6 rounded-2xl border border-[#dbe5e1] bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-bold">Sample alerts</h2>
            <div className="rounded-xl bg-[#fff9e9] p-4">
              <p className="text-xs font-semibold text-[#765a24]">Routine check-in due</p>
              <p className="mt-1 text-[11px] text-[#8a7343]">Tomi Adebayo · Ikeja GRA · This is example data only.</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
