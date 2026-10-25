/** @type {import('next').NextConfig} */
const security = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Camera for guard photos, location for geofence checks; NFC is allowed for the guard app.
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), nfc=(self), microphone=()' },
]

const nextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ['192.168.1.156', 'DESKTOP-N1SDAHP'],
  images: {
    unoptimized: true,
  },
  async headers() { return [{ source: '/:path*', headers: security }] },
}

export default nextConfig
