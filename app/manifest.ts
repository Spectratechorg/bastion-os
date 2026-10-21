import type { MetadataRoute } from 'next'

/** Lets guards install the app to their home screen (Chrome: Add to Home screen). */
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'BastionOS', short_name: 'BastionOS', start_url: '/guard-app', display: 'standalone', background_color: '#2A2B2E', theme_color: '#2A2B2E', icons: [{ src: '/logo-tile.png', sizes: '512x512', type: 'image/png', purpose: 'any' }] }
}
