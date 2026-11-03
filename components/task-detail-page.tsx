'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Bell, Check, ChevronDown, Clock3, FileText, Image as ImageIcon, Link2, MoreHorizontal, Paperclip, Send, Shield, Upload, X } from 'lucide-react'

const activity = [
  { label: 'Assigned → In progress', date: '3 Nov, 12:35', tone: 'blue' },
  { label: 'Assigned', date: '3 Nov, 12:26', tone: 'indigo' },
]

export function TaskDetailPage({ taskId = 'TASK-0086' }: { taskId?: string }) {
  const [files, setFiles] = useState<string[]>([])
  const [summary, setSummary] = useState('')
  const [reference, setReference] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  function onFiles(event: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []).map((file) => file.name))
  }

  return (
    <div className="min-h-screen bg-[#f6f5ef] text-[#17152d]">
      <header className="sticky top-0 z-20 border-b border-[#d9d6d0] bg-[#f6f5ef]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:h-20 sm:px-8">
          <Link href="/overview" className="flex items-center gap-2 text-sm font-semibold"><ArrowLeft className="size-4" /> BastionOS</Link>
          <span className="hidden text-sm text-[#62627c] sm:block">spectrataskforce.xyz</span>
          <div className="flex items-center gap-2"><button aria-label="Notifications" className="relative flex size-10 items-center justify-center rounded-xl border border-[#242039] bg-[#f6f5ef]"><Bell className="size-5" /><span className="absolute -right-1 -top-2 rounded-full bg-[#d34c3f] px-1.5 py-0.5 text-[10px] font-bold text-white">9+</span></button><button aria-label="Open menu" onClick={() => setShowMenu(!showMenu)} className="flex size-10 items-center justify-center rounded-xl border border-[#242039]"><MoreHorizontal className="size-5" /></button></div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-center justify-between"><Link href="/overview" className="text-sm font-medium text-[#62627c] hover:text-[#17152d]">← Operations workspace</Link><div className="relative"><button onClick={() => setShowMenu(!showMenu)} className="flex items-center gap-2 text-sm text-[#62627c]">Actions <ChevronDown className="size-4" /></button>{showMenu && <div className="absolute right-0 top-8 z-10 w-44 rounded-xl border border-[#d9d6d0] bg-white p-1 text-sm shadow-lg"><button className="w-full rounded-lg px-3 py-2 text-left hover:bg-[#f1f1f5]">Copy task link</button><button className="w-full rounded-lg px-3 py-2 text-left hover:bg-[#f1f1f5]">Report blocker</button></div>}</div></div>
        <section className="rounded-2xl border border-[#242039] bg-[#fffdf7] shadow-[5px_5px_0_#242039]">
          <div className="border-b border-[#d9d6d0] px-5 py-5 sm:px-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#62627c]">Task detail</p><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Profile the Next.js runtime</h1><p className="mt-2 text-sm text-[#62627c]">{taskId} · BastionOS</p></div><span className="rounded-full bg-[#e4e1ff] px-3 py-1.5 text-xs font-semibold text-[#4e43bd]">In progress</span></div></div>
          <div className="grid gap-0 border-b border-[#d9d6d0] sm:grid-cols-4">{[['Owner','Edidiong'],['Assigned by','Kabiru'],['Due','3 Nov, 17:00'],['Priority','High']].map(([label,value]) => <div key={label} className="border-b border-[#d9d6d0] px-5 py-4 last:border-0 sm:border-b-0 sm:border-r sm:last:border-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#85849b]">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>)}</div>
          <div className="grid gap-6 px-5 py-6 sm:grid-cols-[1fr_280px] sm:px-8"><div><div className="mb-6"><h2 className="text-lg font-bold">The brief</h2><p className="mt-2 text-sm leading-6 text-[#62627c]">Profile the Next.js runtime.</p></div><div className="grid gap-3 sm:grid-cols-3"><InfoCard icon={<Check />} label="Done when" value="2 requirements" detail="Work complete and verified" /><InfoCard icon={<FileText />} label="Deliverables" value="2 items" detail="Implementation or decision" /><InfoCard icon={<Shield />} label="Blockers" value="0 open" detail="No blockers reported" /></div><div className="mt-8"><h2 className="mb-3 text-lg font-bold">Your move</h2><div className="rounded-xl border border-[#242039] border-l-4 border-l-[#d34c3f] bg-[#edf3f5] p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold">Submit for review</h3><p className="mt-1 text-sm text-[#62627c]">Attach screenshots and a short handoff.</p></div>{submitted && <span className="flex items-center gap-1 rounded-full bg-[#dff3e4] px-3 py-1 text-xs font-semibold text-[#23763b]"><Check className="size-3" /> Submitted</span>}</div><label className="mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#242039] bg-white/30 px-4 text-center"><Upload className="mb-2 size-5 text-[#5549e8]" /><span className="text-sm font-semibold">Work screenshots</span><span className="mt-1 text-xs text-[#62627c]">Paste, drop, or click to browse · PNG, JPG, or WebP · max 25 MB</span><input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={onFiles} /></label>{files.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{files.map((file) => <span key={file} className="flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs"><ImageIcon className="size-3" />{file}</span>)}</div>}<label className="mt-5 block text-sm font-semibold">Reference link <span className="font-normal text-[#85849b]">(optional)</span><span className="mt-2 flex items-center gap-2 rounded-lg border border-[#242039] bg-white px-3"><Link2 className="size-4 text-[#62627c]" /><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="https://code.spectra.test/pull/142" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" /></span></label><label className="mt-4 block text-sm font-semibold">Submission summary<textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What changed, what to look at, and what you tested." className="mt-2 min-h-28 w-full resize-y rounded-lg border border-[#242039] bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-[#5549e8]" /></label><button onClick={() => setSubmitted(true)} disabled={!summary.trim()} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#5549e8] px-5 text-sm font-bold text-white shadow-[3px_3px_0_#242039] transition hover:bg-[#4538d6] disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto sm:w-auto"><Send className="size-4" /> Submit for review</button></div></div></div><aside className="border-t border-[#d9d6d0] pt-6 sm:border-l sm:border-t-0 sm:pl-6"><h2 className="text-lg font-bold">Timing</h2><div className="mt-4 rounded-xl border border-[#d9d6d0] bg-white p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4" /> Deadline</div><p className="mt-3 text-2xl font-bold">3 Nov</p><p className="text-sm text-[#62627c]">17:00</p><div className="my-4 border-t border-[#d9d6d0]" /><p className="text-xs font-semibold text-[#62627c]">Effective 3 Nov at 17:00</p></div><h2 className="mt-8 text-lg font-bold">Activity</h2><div className="mt-4 flex flex-col gap-4">{activity.map((item) => <div key={item.label} className="flex gap-3"><span className={`mt-1 size-2.5 shrink-0 rounded-full ${item.tone === 'blue' ? 'bg-[#3a6ee8]' : 'bg-[#5549e8]'}`} /><div><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-xs text-[#62627c]">{item.date}</p></div></div>)}</div></aside></div>
        </section>
      </main>
    </div>
  )
}

function InfoCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) { return <div className="rounded-xl border border-[#d9d6d0] bg-white p-4"><div className="flex size-8 items-center justify-center rounded-lg bg-[#e4e1ff] text-[#5549e8]">{icon}</div><p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-[#85849b]">{label}</p><p className="mt-1 font-semibold">{value}</p><p className="mt-1 text-xs text-[#62627c]">{detail}</p></div> }
