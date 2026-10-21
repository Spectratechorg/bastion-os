'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

type Site = { id: string; name: string; latitude: number; longitude: number; geofenceRadius: number; dangerLevel: string; status: string }
type Guard = { id: string; name: string; site: string | null; status: string; lastCheckIn: string | null; lastLatitude: number | null; lastLongitude: number | null }

const risk: Record<string, string> = { low: '#16A34A', medium: '#D97706', high: '#DC2626' }
const TILES = process.env.NEXT_PUBLIC_MAP_TILES_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const esc = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * Interactive map: every site with its geofence circle (coloured by risk) and every guard's last
 * known check-in position. Data comes from the parent, which refreshes it every few seconds,
 * so markers move as guards scan in.
 */
export function LiveMap({ sites, guards, selectedSiteId, height = 'h-80' }: { sites: Site[]; guards: Guard[]; selectedSiteId?: string; height?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const state = useRef<{ map: import('leaflet').Map; layer: import('leaflet').LayerGroup; fitted: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('leaflet').then((L) => {
      if (cancelled || !box.current) return
      const map = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([6.5244, 3.3792], 11)
      L.tileLayer(TILES, { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map)
      state.current = { map, layer: L.layerGroup().addTo(map), fitted: false }
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
      const colour = risk[site.dangerLevel] ?? '#52525B'; const at: [number, number] = [site.latitude, site.longitude]
      points.push(at)
      L.circle(at, { radius: site.geofenceRadius, color: colour, weight: 2, fillColor: colour, fillOpacity: 0.12 }).addTo(s.layer)
      L.circleMarker(at, { radius: 7, color: '#fff', weight: 2, fillColor: '#2A2B2E', fillOpacity: 1 }).bindPopup(`<b>${esc(site.name)}</b><br>${site.geofenceRadius} m geofence · ${esc(site.dangerLevel)} risk`).addTo(s.layer)
    }
    const cutoff = Date.now() - 12 * 3600 * 1000
    for (const guard of guards) {
      if (guard.lastLatitude == null || guard.lastLongitude == null || !guard.lastCheckIn) continue
      const fresh = new Date(guard.lastCheckIn).getTime() > cutoff; const at: [number, number] = [guard.lastLatitude, guard.lastLongitude]
      if (fresh) points.push(at)
      const when = new Date(guard.lastCheckIn).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      L.circleMarker(at, { radius: 6, color: '#fff', weight: 2, fillColor: fresh ? '#2A2B2E' : '#A1A1AA', fillOpacity: 1 }).bindPopup(`<b>${esc(guard.name)}</b><br>${esc(guard.site ?? 'Unassigned')}<br>Last check-in ${when}`).addTo(s.layer)
    }
    const selected = sites.find((x) => x.id === selectedSiteId)
    if (selected) s.map.flyTo([selected.latitude, selected.longitude], 16, { duration: 0.6 })
    else if (!s.fitted && points.length) { s.map.fitBounds(L.latLngBounds(points).pad(0.3), { maxZoom: 16 }); s.fitted = true }
  }

  return <div ref={box} role="application" aria-label="Live map of sites and guards" className={`relative z-0 w-full ${height} [&_.leaflet-tile-pane]:grayscale`} />
}
