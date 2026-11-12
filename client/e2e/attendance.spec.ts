import { expect, test } from '@playwright/test'

test('teacher opens a session, student checks in, teacher sees the saved arrival', async ({ browser }) => {
  const teacherContext = await browser.newContext()
  const teacher = await teacherContext.newPage()
  await teacher.goto('/')
  await teacher.getByRole('button', { name: 'Continue as a teacher' }).click()
  await expect(teacher.getByRole('heading', { name: /Good morning/ })).toBeVisible()
  await teacher.getByRole('button', { name: 'Start attendance' }).click()
  await expect(teacher.getByText('LIVE CHECK-IN')).toBeVisible()
  const code = await teacher.locator('.manual strong').textContent()
  expect(code).toMatch(/^\d{6}$/)

  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  const student = await studentContext.newPage()
  await student.goto('/')
  await student.getByRole('button', { name: 'Continue as a student' }).click()
  await expect(student.getByRole('heading', { name: /Today’s class/ })).toBeVisible()
  await student.getByLabel('6-digit class code').fill(code!)
  await student.getByRole('button', { name: 'Confirm attendance' }).click()
  await expect(student.getByText('Attendance recorded')).toBeVisible()
  await expect(teacher.getByText('Present').first()).toBeVisible({ timeout: 8000 })

  await studentContext.close()
  await teacherContext.close()
})
