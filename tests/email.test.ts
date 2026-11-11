import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { alertEmail, attendanceEmail, incidentEmail, sendMail } from '../lib/email'

test('mail: outbox transport writes a real alert email', async () => {
  const outbox = await mkdtemp(join(tmpdir(), 'bastion-mail-'))
  process.env.MAIL_OUTBOX_DIR = outbox
  try {
    const mail = alertEmail({ to: 'ops@example.com', severity: 'high', title: 'Missed morning sign-in', body: 'Guard A did not sign in.' })
    const result = await sendMail(mail)
    assert.equal(result.sent, true)
    assert.equal(result.transport, 'outbox')
    const [file] = await readdir(outbox)
    const content = await readFile(join(outbox, file), 'utf8')
    assert.match(content, /To: ops@example\.com/)
    assert.match(content, /\[HIGH\] Missed morning sign-in/)

    const incident = incidentEmail({ to: 'ops@example.com', title: 'Gate breach', description: 'Rear gate forced open.', site: 'Transcorp Hilton', severity: 'critical', status: 'open' })
    assert.match(incident.subject, /CRITICAL INCIDENT/)
    assert.match(incident.text, /Transcorp Hilton/)

    const attendance = attendanceEmail({ to: 'ops@example.com', guard: 'Musa Adamu', site: 'Transcorp Hilton', message: 'Not signed in by 08:00', deadline: '08:00' })
    assert.match(attendance.subject, /ATTENDANCE/)
    assert.match(attendance.text, /Musa Adamu/)
  } finally {
    delete process.env.MAIL_OUTBOX_DIR
    await rm(outbox, { recursive: true, force: true })
  }
})
