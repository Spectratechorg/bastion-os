'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

type Site = { id: string; name: string; latitude: number; longitude: number; geofenceRadius: number; dangerLevel: string; status: string }
type Guard = { id: string; name: string; site: string | null; status: string; photoUrl?: string | null; lastCheckIn: string | null; lastLatitude: number | null; lastLongitude: number | null }

const risk: Record<string, string> = { low: '#16A34A', medium: '#D97706', high: '#DC2626' }
const TILES = process.env.NEXT_PUBLIC_MAP_TILES_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const esc = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * Interactive map: every site with its geofence circle (coloured by risk) and every guard's last
 * known check-in position. Data comes from the parent, which refreshes it every few seconds,
 * so markers move as guards scan in.
 */
export function LiveMap({ sites, guards, selectedSiteId, selectedGuardId, height = 'h-80' }: { sites: Site[]; guards: Guard[]; selectedSiteId?: string; selectedGuardId?: string; height?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const state = useRef<{ map: import('leaflet').Map; layer: import('leaflet').LayerGroup; fitted: boolean; opened: Set<string>; lastFly?: string; positions: Map<string, [number, number]> } | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('leaflet').then((L) => {
      if (cancelled || !box.current) return
      const map = L.map(box.current, { zoomControl: true, attributionControl: true, worldCopyJump: false }).setView([6.5244, 3.3792], 11)
      L.tileLayer(TILES, { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map)
      state.current = { map, layer: L.layerGroup().addTo(map), fitted: false, opened: new Set(), positions: new Map() }
      window.requestAnimationFrame(() => map.invalidateSize())
      draw(L)
    })
    return () => { cancelled = true; state.current?.map.remove(); state.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { void import('leaflet').then((L) => draw(L)) }) // redraw whenever data changes

  function draw(L: typeof import('leaflet')) {
    const s = state.current; if (!s) return
    s.layer.clearLayers()
    const points: [number, number][] = []
    for (const site of sites.filter((x) => x.status !== 'inactive')) {
      const latitude = Number(site.latitude); const longitude = Number(site.longitude)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue
      const colour = risk[site.dangerLevel] ?? '#52525B'; const at: [number, number] = [latitude, longitude]
      points.push(at)
      L.circle(at, { radius: site.geofenceRadius, color: colour, weight: 2, fillColor: colour, fillOpacity: 0.12 }).addTo(s.layer)
      L.circleMarker(at, { radius: 7, color: '#fff', weight: 2, fillColor: '#2A2B2E', fillOpacity: 1 }).bindPopup(`<b>${esc(site.name)}</b><br>${site.geofenceRadius} m geofence · ${esc(site.dangerLevel)} risk`).addTo(s.layer)
    }
    const cutoff = Date.now() - 12 * 3600 * 1000
    const siteByName = new Map(sites.map((site) => [site.name.trim().toLowerCase(), site]))
    const spread = new Map<string, number>()

    for (const guard of guards) {
      const latitude = Number(guard.lastLatitude)
      const longitude = Number(guard.lastLongitude)
      const hasGps = Number.isFinite(latitude) && Number.isFinite(longitude)
        && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
      const site = guard.site ? siteByName.get(guard.site.trim().toLowerCase()) : undefined

      // Every registered guard is placed: at their real last scan, or around their site until they scan.
      let at: [number, number] | null = null
      let approximate = false
      if (hasGps && guard.lastCheckIn) {
        at = [latitude, longitude]
      } else if (site) {
        const index = spread.get(site.id) ?? 0
        spread.set(site.id, index + 1)
        const angle = (index / Math.max(guards.filter((g) => g.site === guard.site).length, 1)) * Math.PI * 2
        const radius = 0.00022 + index * 0.00004
        at = [site.latitude + Math.cos(angle) * radius, site.longitude + Math.sin(angle) * radius]
        approximate = true
      }
      if (!at) continue

      const fresh = guard.lastCheckIn ? new Date(guard.lastCheckIn).getTime() > cutoff : false
      if (!approximate) points.push(at)
      s.positions.set(guard.id, at)
      const when = guard.lastCheckIn ? new Date(guard.lastCheckIn).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null
      const initials = guard.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
      const photo = guard.photoUrl ? `<img src="${esc(guard.photoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />` : initials
      const chosen = guard.id === selectedGuardId
      const border = chosen ? '3px solid #16A34A' : approximate ? '2px dashed #fff' : '2px solid #fff'
      const background = approximate ? '#71717A' : fresh ? '#2A2B2E' : '#A1A1AA'
      const icon = L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 17], html: `<div style="width:34px;height:34px;border-radius:50%;background:${background};color:#fff;border:${border};box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:600 11px system-ui">${photo}</div>` })
      const statusLine = approximate
        ? `<span style="color:#71717A">No scan yet — shown at ${esc(site?.name ?? 'their site')}</span>`
        : `<span style="color:#71717A">${fresh ? 'On the map as of their last scan' : 'Last scan older than 12 hours'}</span>`
      const marker = L.marker(at, { icon, title: guard.name, opacity: guard.status === 'suspended' ? 0.55 : 1 }).bindPopup(`<b>${esc(guard.name)}</b><br>${esc(guard.site ?? 'Unassigned')}${guard.status === 'suspended' ? ' · suspended' : ''}<br>${when ? `Last checked in ${when}` : 'Registered, no check-in yet'}<br>${statusLine}`).addTo(s.layer)
      if (chosen && !s.opened.has(guard.id)) { s.opened.add(guard.id); marker.openPopup() }
    }

    const chosenGuard = guards.find((x) => x.id === selectedGuardId)
    const chosenAt = chosenGuard ? s.positions.get(chosenGuard.id) : undefined
    if (chosenGuard && chosenAt) {
      if (s.lastFly !== chosenGuard.id) { s.lastFly = chosenGuard.id; s.map.flyTo(chosenAt, 17, { duration: 0.6 }) }
      return
    }
    s.lastFly = undefined

    const selected = sites.find((x) => x.id === selectedSiteId)
    if (selected) s.map.flyTo([selected.latitude, selected.longitude], 16, { duration: 0.6 })
    else if (!s.fitted && points.length) { s.map.fitBounds(L.latLngBounds(points).pad(0.3), { maxZoom: 16 }); s.fitted = true }
  }

  const plotted = guards.length
  const activeSiteNames = new Set(sites.filter((site) => site.status !== 'inactive').map((site) => site.name.trim().toLowerCase()))
  const waiting = guards.filter((guard) => {
    const latitude = Number(guard.lastLatitude); const longitude = Number(guard.lastLongitude)
    const hasGps = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 && Boolean(guard.lastCheckIn)
    return !hasGps && Boolean(guard.site) && activeSiteNames.has(guard.site!.trim().toLowerCase())
  }).length
  const unplaced = guards.filter((guard) => {
    const latitude = Number(guard.lastLatitude); const longitude = Number(guard.lastLongitude)
    const hasGps = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 && Boolean(guard.lastCheckIn)
    return !hasGps && (!guard.site || !activeSiteNames.has(guard.site.trim().toLowerCase()))
  }).length

  return <div className={`relative w-full ${height}`}>
    <div ref={box} role="application" aria-label="Map of sites and every registered guard" className="absolute inset-0 z-0" />
    <div className="pointer-events-none absolute left-3 top-3 z-[500] flex items-center gap-2 rounded-[6px] border border-[#E4E4E7] bg-white/95 px-2.5 py-1.5 text-[10.5px] text-[#3F3F46] shadow-sm">
      <span className="size-1.5 rounded-full bg-[#2A2B2E]" />{plotted} registered guards
      <span aria-hidden className="text-[#D4D4D8]">·</span>
      <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full border border-dashed border-[#71717A]" />{waiting} waiting for a scan</span>
      {unplaced > 0 && <><span aria-hidden className="text-[#D4D4D8]">·</span><span>{unplaced} unassigned</span></>}
    </div>
  </div>
}
