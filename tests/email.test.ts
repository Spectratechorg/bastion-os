import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { alertEmail, sendMail } from '../lib/email'

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
  } finally {
    delete process.env.MAIL_OUTBOX_DIR
    await rm(outbox, { recursive: true, force: true })
  }
})
