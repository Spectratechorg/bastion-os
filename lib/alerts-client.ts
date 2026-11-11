/** Why an alert has its severity (mirrors the rules enforced on the server in lib/alerts.ts). */
export const ALERT_RULES: Record<string, { label: string; severity: string; rule: string }> = {
  sos: { label: 'SOS', severity: 'critical', rule: 'A guard pressed SOS in the guard app. Always critical.' },
  geofence: { label: 'Outside geofence', severity: 'high', rule: 'A guard scanned in outside the site’s geofence circle.' },
  incident: { label: 'Incident', severity: 'matches the incident', rule: 'Raised when a high or critical incident is reported, or when any incident is escalated.' },
  patrol: { label: 'Missed patrol', severity: 'medium', rule: 'A guard missed one or more hourly checkpoints during the configured shift.' },
  attendance: { label: 'Morning sign-in', severity: 'high', rule: 'A guard did not sign in by the 08:00 morning deadline.' },
  manual: { label: 'Manual alert', severity: 'chosen by the sender', rule: 'An owner, administrator or moderator created this alert for the team.' },
}
