import { randomInt, randomUUID } from 'node:crypto'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

type DemoUser = { id: string; name: string; role: 'Teacher' | 'Student'; email: string }
type Entry = { studentId: string; studentName: string; initials: string; status: string; recordedAt: string }
type DemoSession = { id: string; course: string; room: string; code: string; startsAt: string; isOpen: boolean; codeExpiresAt: string; entries: Entry[] }

const students = [
  { id: 's-001', name: 'Alex Morgan', email: 'alex@student.attendance.local', initials: 'AM', course: 'Human Computer Interaction' },
  { id: 's-002', name: 'Jamie Chen', email: 'jamie@student.attendance.local', initials: 'JC', course: 'Human Computer Interaction' },
  { id: 's-003', name: 'Sam Rivera', email: 'sam@student.attendance.local', initials: 'SR', course: 'Human Computer Interaction' },
  { id: 's-004', name: 'Taylor Kim', email: 'taylor@student.attendance.local', initials: 'TK', course: 'Human Computer Interaction' },
  { id: 's-005', name: 'Jordan Lee', email: 'jordan@student.attendance.local', initials: 'JL', course: 'Human Computer Interaction' },
  { id: 's-006', name: 'Casey Brown', email: 'casey@student.attendance.local', initials: 'CB', course: 'Human Computer Interaction' },
  { id: 's-007', name: 'Morgan Patel', email: 'morgan@student.attendance.local', initials: 'MP', course: 'Human Computer Interaction' },
  { id: 's-008', name: 'Riley Davis', email: 'riley@student.attendance.local', initials: 'RD', course: 'Human Computer Interaction' },
]
const demoUsers: Record<string, DemoUser> = {
  'teacher@attendance.local': { id: 'teacher-001', name: 'Dr. Amara Okafor', role: 'Teacher', email: 'teacher@attendance.local' },
  ...Object.fromEntries(students.slice(0, 3).map(student => [student.email, { id: student.id, name: student.name, role: 'Student' as const, email: student.email }])),
}

function demoApi(): Plugin {
  const tokens = new Map<string, DemoUser>()
  const sessions: DemoSession[] = []
  const send = (response: { statusCode: number; setHeader: (key: string, value: string) => void; end: (body?: string) => void }, status: number, data?: unknown) => {
    response.statusCode = status
    if (status !== 204) response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(data === undefined ? undefined : JSON.stringify(data))
  }
  const readBody = (request: { on: (event: string, callback: (chunk?: Buffer) => void) => void }) => new Promise<Record<string, unknown>>((resolve, reject) => {
    let body = ''
    request.on('data', chunk => { body += chunk?.toString() ?? '' })
    request.on('end', () => { try { resolve(body ? JSON.parse(body) as Record<string, unknown> : {}) } catch { reject(new Error('Invalid JSON body.')) } })
    request.on('error', reject)
  })
  const makeCode = () => randomInt(100000, 1000000).toString()
  const withCode = (session: DemoSession) => ({ id: session.id, course: session.course, room: session.room, code: session.code, startsAt: session.startsAt, isOpen: session.isOpen, codeExpiresAt: session.codeExpiresAt })

  return {
    name: 'attendance-demo-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        const path = url.pathname
        if (!path.startsWith('/api/')) { next(); return }
        const method = request.method ?? 'GET'
        const user = tokens.get((request.headers.authorization ?? '').replace(/^Bearer\s+/i, ''))
        const teacherOnly = () => {
          if (!user) { send(response, 401, { message: 'Sign in to continue.' }); return false }
          if (user.role !== 'Teacher') { send(response, 403, { message: 'Teacher access is required.' }); return false }
          return true
        }
        try {
          if (method === 'POST' && path === '/api/auth/login') {
            const body = await readBody(request)
            const account = demoUsers[String(body.email ?? '').trim().toLowerCase()]
            if (!account || body.password !== 'Demo123!') { send(response, 401, { message: 'Email or password is incorrect.' }); return }
            const accessToken = randomUUID()
            tokens.set(accessToken, account)
            send(response, 200, { accessToken, user: account })
            return
          }
          if (method === 'GET' && path === '/api/dashboard') {
            if (!teacherOnly()) return
            const active = sessions.find(session => session.isOpen) ?? null
            send(response, 200, {
              course: 'Human Computer Interaction', courseCode: 'UXD-204', room: 'Studio 204', teacher: 'Dr. Amara Okafor',
              totalStudents: students.length, averageAttendance: 94, classesThisWeek: 8, checkedIn: active?.entries.length ?? 0,
              activeSession: active ? { ...withCode(active), entries: active.entries } : null,
              attendance: active?.entries ?? [], students,
            })
            return
          }
          if (method === 'GET' && path === '/api/sessions/active') {
            const active = sessions.find(session => session.isOpen)
            if (!active) { send(response, 204); return }
            const { code: _privateCode, entries: _entries, ...publicSession } = active
            send(response, 200, publicSession)
            return
          }
          if (method === 'POST' && path === '/api/sessions') {
            if (!teacherOnly()) return
            for (const session of sessions) session.isOpen = false
            const session: DemoSession = { id: randomUUID(), course: 'Human Computer Interaction', room: 'Studio 204', code: makeCode(), startsAt: new Date().toISOString(), isOpen: true, codeExpiresAt: new Date(Date.now() + 60000).toISOString(), entries: [] }
            sessions.unshift(session)
            send(response, 200, withCode(session))
            return
          }
          const sessionRoute = path.match(/^\/api\/sessions\/([^/]+)\/(close|refresh-code|attendance)$/)
          if (sessionRoute) {
            if (!teacherOnly()) return
            const session = sessions.find(item => item.id === sessionRoute[1])
            if (!session) { send(response, 404, { message: 'Session was not found.' }); return }
            if (method === 'POST' && sessionRoute[2] === 'close') { session.isOpen = false; send(response, 204); return }
            if (method === 'POST' && sessionRoute[2] === 'refresh-code') { session.code = makeCode(); session.codeExpiresAt = new Date(Date.now() + 60000).toISOString(); send(response, 200, withCode(session)); return }
            if (method === 'GET' && sessionRoute[2] === 'attendance') { send(response, 200, session.entries); return }
          }
          if (method === 'POST' && path === '/api/attendance/check-in') {
            if (!user) { send(response, 401, { message: 'Sign in to continue.' }); return }
            if (user.role !== 'Student') { send(response, 403, { message: 'Student access is required.' }); return }
            const body = await readBody(request)
            const session = sessions.find(item => item.id === body.sessionId && item.isOpen)
            if (!session) { send(response, 400, { message: 'This check-in session has ended.' }); return }
            if (Date.now() >= Date.parse(session.codeExpiresAt) || body.code !== session.code) { send(response, 400, { message: 'That code has expired. Ask your teacher to show the latest QR code.' }); return }
            const existing = session.entries.find(entry => entry.studentId === user.id)
            if (existing) { send(response, 200, { message: 'You are already checked in.', entry: existing }); return }
            const student = students.find(item => item.id === user.id)
            if (!student) { send(response, 404, { message: 'Student account was not found.' }); return }
            const entry: Entry = { studentId: student.id, studentName: student.name, initials: student.initials, status: 'Present', recordedAt: new Date().toISOString() }
            session.entries.push(entry)
            send(response, 200, { message: "You're checked in. Have a great class!", entry })
            return
          }
          if (method === 'GET' && path === '/api/me/attendance') {
            if (!user || user.role !== 'Student') { send(response, 403, { message: 'Student access is required.' }); return }
            send(response, 200, sessions.flatMap(session => session.entries.filter(entry => entry.studentId === user.id).map(entry => ({ course: session.course, room: session.room, startsAt: session.startsAt, status: entry.status, recordedAt: entry.recordedAt }))))
            return
          }
          send(response, 404, { message: 'API route was not found.' })
        } catch (error) {
          send(response, 400, { message: error instanceof Error ? error.message : 'Request could not be processed.' })
        }
      })
    },
  }
}

export default defineConfig({ plugins: [react(), demoApi()] })
