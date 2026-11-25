import { expect, test } from '@playwright/test'

test('teacher opens a session, student checks in, teacher sees the saved arrival', async ({ browser }) => {
  const teacherContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  const teacher = await teacherContext.newPage()
  await teacher.goto('/')
  await teacher.getByRole('button', { name: 'Continue as a teacher' }).click()
  await expect(teacher.getByRole('heading', { name: /Good morning/ })).toBeVisible()
  await teacher.getByRole('button', { name: 'Start attendance' }).click()
  await expect(teacher.getByRole('button', { name: 'Show check-in QR' })).toBeVisible()
  const code = await teacher.locator('.manual strong').textContent()
  expect(code).toMatch(/^\d{6}$/)
  await teacher.getByRole('button', { name: 'Show check-in QR' }).click()
  await expect(teacher.getByRole('img', { name: 'Attendance check-in QR code' })).toBeVisible()
  await expect(teacher.locator('.qr-mobile-content strong')).toHaveText(code!)

  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  const student = await studentContext.newPage()
  await student.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')) },
    })
  })
  await student.goto('/')
  await student.getByRole('button', { name: 'Continue as a student' }).click()
  await expect(student.getByRole('heading', { name: /Today’s class/ })).toBeVisible()
  await student.getByRole('button', { name: /Scan class QR code/ }).click()
  await expect(student.getByRole('alert')).toContainText('Camera permission was denied')
  await student.getByLabel('6-digit class code').fill(code!)
  await student.getByRole('button', { name: 'Confirm attendance' }).click()
  await expect(student.getByText('Attendance recorded')).toBeVisible()
  await expect(teacher.getByText('Present').first()).toBeVisible({ timeout: 8000 })

  await studentContext.close()
  await teacherContext.close()
})

test('demo API enforces duplicate, expired, closed-session, and role rules', async ({ request }) => {
  test.setTimeout(60000)
  const signIn = async (email: string) => {
    const response = await request.post('/api/auth/login', { data: { email, password: 'Demo123!' } })
    expect(response.ok()).toBeTruthy()
    return (await response.json() as { accessToken: string }).accessToken
  }
  const teacherToken = await signIn('teacher@attendance.local')
  const alexToken = await signIn('alex@student.attendance.local')
  const jamieToken = await signIn('jamie@student.attendance.local')
  const teacherHeaders = { Authorization: `Bearer ${teacherToken}` }
  const alexHeaders = { Authorization: `Bearer ${alexToken}` }
  const jamieHeaders = { Authorization: `Bearer ${jamieToken}` }
  const started = await request.post('/api/sessions', { headers: teacherHeaders })
  expect(started.status()).toBe(200)
  const session = await started.json() as { id: string; code: string; startsAt: string }

  expect((await request.get('/api/dashboard', { headers: alexHeaders })).status()).toBe(403)
  const teacherCheckIn = await request.post('/api/attendance/check-in', {
    headers: teacherHeaders,
    data: { sessionId: session.id, code: session.code },
  })
  expect(teacherCheckIn.status()).toBe(403)

  const firstCheckIn = await request.post('/api/attendance/check-in', {
    headers: alexHeaders,
    data: { sessionId: session.id, code: session.code },
  })
  expect(firstCheckIn.status()).toBe(200)
  const duplicate = await request.post('/api/attendance/check-in', {
    headers: alexHeaders,
    data: { sessionId: session.id, code: session.code },
  })
  expect((await duplicate.json() as { message: string }).message).toContain('already checked in')

  const history = await request.get('/api/sessions', { headers: teacherHeaders })
  expect(history.status()).toBe(200)
  expect((await history.json() as { id: string }[]).some(item => item.id === session.id)).toBeTruthy()
  const startsAt = new Date(session.startsAt)
  const sessionDate = `${startsAt.getFullYear()}-${String(startsAt.getMonth() + 1).padStart(2, '0')}-${String(startsAt.getDate()).padStart(2, '0')}`
  const filteredHistory = await request.get(`/api/sessions?from=${sessionDate}&to=${sessionDate}`, { headers: teacherHeaders })
  expect((await filteredHistory.json() as { id: string }[]).some(item => item.id === session.id)).toBeTruthy()
  expect((await request.get('/api/sessions?from=2026-12-01&to=2026-11-01', { headers: teacherHeaders })).status()).toBe(400)

  await new Promise(resolve => setTimeout(resolve, 31000))
  const active = await request.get('/api/sessions/active', { headers: jamieHeaders })
  expect(active.status()).toBe(200)
  expect((await active.json() as { id: string }).id).toBe(session.id)
  const expired = await request.post('/api/attendance/check-in', {
    headers: jamieHeaders,
    data: { sessionId: session.id, code: session.code },
  })
  expect(expired.status()).toBe(400)
  expect((await expired.json() as { message: string }).message).toContain('expired')

  expect((await request.post(`/api/sessions/${session.id}/close`, { headers: teacherHeaders })).status()).toBe(204)
  const afterClose = await request.post('/api/attendance/check-in', {
    headers: jamieHeaders,
    data: { sessionId: session.id, code: session.code },
  })
  expect(afterClose.status()).toBe(400)
  expect((await afterClose.json() as { message: string }).message).toContain('session has ended')
})

test('teacher reports, enrollment, and student profile flows are usable', async ({ browser }) => {
  const teacherContext = await browser.newContext()
  const teacher = await teacherContext.newPage()
  await teacher.goto('/')
  await teacher.getByRole('button', { name: 'Continue as a teacher' }).click()
  await teacher.getByRole('button', { name: 'Students', exact: true }).click()
  await teacher.getByRole('button', { name: 'Enroll student' }).click()
  const email = `new.student.${Date.now()}@attendance.local`
  await teacher.getByLabel('Student name').fill('Robin Example')
  await teacher.getByLabel('Email address').fill(email)
  await teacher.getByRole('button', { name: 'Add to roster' }).click()
  await expect(teacher.getByText(email)).toBeVisible()
  await expect(teacher.locator('.roster-count')).toHaveText('9 enrolled')
  await teacher.getByRole('button', { name: 'Enroll student' }).click()
  await teacher.getByLabel('Student name').fill('Another Example')
  await teacher.getByLabel('Email address').fill(email)
  await teacher.getByRole('button', { name: 'Add to roster' }).click()
  await expect(teacher.getByRole('alert')).toContainText('already enrolled')
  await teacher.getByRole('button', { name: 'Cancel' }).click()
  await teacher.getByRole('textbox', { name: 'Search students' }).fill('no matching student')
  await expect(teacher.getByText('No students found')).toBeVisible()
  await teacher.getByRole('textbox', { name: 'Search students' }).fill('')
  await teacherContext.setOffline(true)
  await expect(teacher.getByRole('status').filter({ hasText: 'You’re offline' })).toBeVisible()
  await teacherContext.setOffline(false)

  await teacher.getByRole('button', { name: 'Reports' }).click()
  await expect(teacher.getByRole('heading', { name: 'Attendance report' })).toBeVisible()
  const downloadPromise = teacher.waitForEvent('download')
  await teacher.getByRole('button', { name: 'Download CSV' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('rollcall-attendance.csv')

  await teacher.getByRole('button', { name: 'Settings' }).click()
  await teacher.getByLabel('Enable dark theme').check()
  await expect(teacher.locator('html')).toHaveAttribute('data-theme', 'dark')
  await teacherContext.close()

  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  const student = await studentContext.newPage()
  await student.goto('/')
  await student.getByRole('button', { name: 'Continue as a student' }).click()
  await student.getByRole('button', { name: 'Schedule', exact: true }).click()
  await expect(student.getByRole('heading', { name: 'My schedule' })).toBeVisible()
  await student.getByRole('button', { name: 'Profile' }).click()
  await expect(student.getByText('alex@student.attendance.local')).toBeVisible()
  await student.getByLabel('Display name').fill('Alex Updated')
  await student.getByRole('button', { name: 'Save profile' }).click()
  await expect(student.getByText('Profile updated.')).toBeVisible()
  await expect(student.getByText('Alex Updated', { exact: true })).toBeVisible()
  await studentContext.close()
})
