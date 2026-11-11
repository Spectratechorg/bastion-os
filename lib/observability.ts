/** Structured server-side logging: Vercel/runtime logs can alert on the `level:"error"` field. */
export function reportServerError(scope: string, error: unknown, context: Record<string, unknown> = {}) {
  const payload = {
    level: 'error',
    scope,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
    at: new Date().toISOString(),
  }
  console.error(JSON.stringify(payload))
}
