const { Pool } = require('pg')
const { hashPassword } = require('better-auth/crypto')
const crypto = require('crypto')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

async function main() {
  console.log('Connecting to database...')
  
  // 1. Fetch organization
  const orgRes = await pool.query('SELECT id, name FROM organization LIMIT 1')
  if (orgRes.rows.length === 0) {
    throw new Error('No organization found in database.')
  }
  const org = orgRes.rows[0]
  console.log(`Using organization: "${org.name}" (ID: ${org.id})`)

  // 2. Fetch owner/admin userId for creator reference
  const memberRes = await pool.query("SELECT user_id FROM member WHERE organization_id = $1 AND role = 'owner' LIMIT 1", [org.id])
  const ownerUserId = memberRes.rows[0]?.user_id || (await pool.query('SELECT id FROM "user" LIMIT 1')).rows[0].id

  // 3. Upsert Site: "Megabond Villa Estate Gwarimpa"
  const siteName = 'Megabond Villa Estate Gwarimpa'
  const siteAddress = 'Megabond Villa Estate, Gwarimpa, Abuja, FCT, Nigeria'
  const siteLat = 9.1128
  const siteLon = 7.4082
  const geofenceRadius = 200 // 200m perimeter

  let siteId
  const siteCheck = await pool.query('SELECT id, name FROM sites WHERE organization_id = $1 AND name = $2 LIMIT 1', [org.id, siteName])
  if (siteCheck.rows.length === 0) {
    console.log(`Creating site: "${siteName}"...`)
    const newSite = await pool.query(`
      INSERT INTO sites (id, user_id, organization_id, name, address, latitude, longitude, geofence_radius, status, danger_level, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'active', 'low', NOW())
      RETURNING id
    `, [ownerUserId, org.id, siteName, siteAddress, siteLat, siteLon, geofenceRadius])
    siteId = newSite.rows[0].id
    console.log(`Site created with ID: ${siteId}`)
  } else {
    siteId = siteCheck.rows[0].id
    console.log(`Site "${siteName}" exists (ID: ${siteId}). Updating coordinates & radius...`)
    await pool.query(`
      UPDATE sites
      SET latitude = $1, longitude = $2, geofence_radius = $3, status = 'active'
      WHERE id = $4
    `, [siteLat, siteLon, geofenceRadius, siteId])
  }

  // 4. Upsert User Account for Guard
  const guardEmail = 'guard@bastion.ng'
  const guardPassword = 'BastionGuard2026!'
  const guardName = 'Ibrahim Musa'
  const initials = 'IM'
  const passwordHash = await hashPassword(guardPassword)

  let userId
  const userCheck = await pool.query('SELECT id, email FROM "user" WHERE email = $1 LIMIT 1', [guardEmail])
  if (userCheck.rows.length === 0) {
    userId = crypto.randomUUID()
    console.log(`Creating user account for ${guardEmail} (ID: ${userId})...`)
    await pool.query(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES ($1, $2, $3, true, NOW(), NOW())
    `, [userId, guardName, guardEmail])

    // Create credential account in account table
    const accountId = crypto.randomUUID()
    await pool.query(`
      INSERT INTO account (id, user_id, account_id, provider_id, password, created_at, updated_at)
      VALUES ($1, $2, $3, 'credential', $4, NOW(), NOW())
    `, [accountId, userId, userId, passwordHash])
    console.log(`Account credential created.`)
  } else {
    userId = userCheck.rows[0].id
    console.log(`User ${guardEmail} exists (ID: ${userId}). Updating password hash...`)
    await pool.query(`
      UPDATE account
      SET password = $1, updated_at = NOW()
      WHERE user_id = $2 AND provider_id = 'credential'
    `, [passwordHash, userId])
  }

  // 5. Ensure Organization Member with Role 'guard'
  const memberCheck = await pool.query('SELECT id, role FROM member WHERE organization_id = $1 AND user_id = $2 LIMIT 1', [org.id, userId])
  if (memberCheck.rows.length === 0) {
    const memberId = crypto.randomUUID()
    console.log(`Adding ${guardEmail} to organization as role 'guard'...`)
    await pool.query(`
      INSERT INTO member (id, organization_id, user_id, role, created_at)
      VALUES ($1, $2, $3, 'guard', NOW())
    `, [memberId, org.id, userId])
  } else {
    console.log(`Updating member role to 'guard'...`)
    await pool.query(`
      UPDATE member
      SET role = 'guard'
      WHERE organization_id = $1 AND user_id = $2
    `, [org.id, userId])
  }

  // 6. Upsert Guard Profile in `guards` Table
  const guardCheck = await pool.query('SELECT id, name FROM guards WHERE organization_id = $1 AND (login_user_id = $2 OR name = $3) LIMIT 1', [org.id, userId, guardName])
  let guardRecordId
  if (guardCheck.rows.length === 0) {
    console.log(`Creating guard profile for "${guardName}"...`)
    const newGuard = await pool.query(`
      INSERT INTO guards (id, user_id, organization_id, login_user_id, name, initials, phone, nin, site, status, monthly_salary, nfc_token, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, '08023456789', 'NIN-77889900', $6, 'active', 160000, 'BOS-GWARIMPA-001', NOW())
      RETURNING id
    `, [ownerUserId, org.id, userId, guardName, initials, siteName])
    guardRecordId = newGuard.rows[0].id
    console.log(`Guard profile created with ID: ${guardRecordId}`)
  } else {
    guardRecordId = guardCheck.rows[0].id
    console.log(`Guard profile exists (ID: ${guardRecordId}). Updating site assignment to "${siteName}" and loginUserId...`)
    await pool.query(`
      UPDATE guards
      SET site = $1, login_user_id = $2, initials = $3, status = 'active'
      WHERE id = $4
    `, [siteName, userId, initials, guardRecordId])
  }

  console.log('\n======================================================')
  console.log('✅ SAMPLE GUARD ACCOUNT SUCCESSFULLY CONFIGURED!')
  console.log('======================================================')
  console.log(`Organization:        ${org.name}`)
  console.log(`Assigned Site:       ${siteName}`)
  console.log(`Site Address:        ${siteAddress}`)
  console.log(`Site Coordinates:    Latitude ${siteLat}, Longitude ${siteLon}`)
  console.log(`Geofence Perimeter:  ${geofenceRadius} meters`)
  console.log('------------------------------------------------------')
  console.log(`Guard Full Name:     ${guardName}`)
  console.log(`Login Email:         ${guardEmail}`)
  console.log(`Login Password:      ${guardPassword}`)
  console.log(`Role:                guard (locked to Guard Mobile App)`)
  console.log('======================================================\n')

  await pool.end()
}

main().catch((err) => {
  console.error('Setup failed with error:', err)
  process.exit(1)
})
