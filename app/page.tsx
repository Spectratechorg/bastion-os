import { redirect } from 'next/navigation'

import { requireWorkspace } from '@/lib/session'

/**
 * The app entry point. Guard it on the server so a signed-out visitor is redirected to sign-in
 * instead of briefly rendering the dashboard shell before the client-side session check runs.
 */
export default async function HomePage() {
  await requireWorkspace()
  redirect('/overview')
}
