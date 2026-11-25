import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowRight, Bell, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, Download, Home, LayoutDashboard, LogOut, Menu, QrCode, RefreshCw, Search, Settings, ShieldCheck, Users, X } from 'lucide-react'
import './App.css'
import './AppEnhancements.css'

type User = { id: string; name: string; role: 'Teacher' | 'Student'; email: string }
type Session = { id: string; course: string; room: string; code?: string; startsAt: string; isOpen: boolean; codeExpiresAt: string }
type Entry = { studentId: string; studentName: string; initials: string; status: string; recordedAt: string }
type Student = { id: string; name: string; initials: string; email: string; course?: string }
type HistorySession = Session & { totalStudents: number; attendance: Entry[] }
type StudentAttendance = { course: string; room: string; startsAt: string; status: string; recordedAt: string | null }
type ScheduleClass = { course: string; courseCode: string; room: string; teacher: string; startsAt: string; endsAt: string }
type Dashboard = { course: string; courseCode: string; room: string; teacher: string; totalStudents: number; averageAttendance: number; classesThisWeek: number; checkedIn: number; activeSession: Session | null; attendance: Entry[]; students: Student[] }
type StudentView = 'Home' | 'Schedule' | 'Profile'

const colors = ['#d9e7ff', '#f9e9c7', '#e4ddf8', '#d7ede7', '#f5dce2', '#dcebd2']
const emptyEntries: Entry[] = []

async function api<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
    })
  } catch {
    throw new Error('Unable to reach the demo API. Check your connection and try again.')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(body.message ?? `Request failed (${response.status})`)
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function csvCell(value: string | number) {
  const text = String(value)
  const safe = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const content = rows.map(row => row.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    try { return JSON.parse(localStorage.getItem('att-user') || 'null') as User | null } catch { return null }
  })
  const [token, setToken] = useState(() => localStorage.getItem('att-token') || '')
  const [data, setData] = useState<Dashboard | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [history, setHistory] = useState<HistorySession[]>([])
  const [studentAttendance, setStudentAttendance] = useState<StudentAttendance[]>([])
  const [schedule, setSchedule] = useState<ScheduleClass[]>([])
  const [profile, setProfile] = useState<User | null>(null)
  const [profileName, setProfileName] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(() => Boolean(user))
  const [historyLoading, setHistoryLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState('Overview')
  const [studentView, setStudentView] = useState<StudentView>('Home')
  const [menu, setMenu] = useState(false)
  const [checked, setChecked] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [dark, setDark] = useState(() => localStorage.getItem('att-theme') === 'dark')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [enrollName, setEnrollName] = useState('')
  const [enrollEmail, setEnrollEmail] = useState('')
  const [enrollError, setEnrollError] = useState('')
  const [qrOpen, setQrOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [loginBusy, setLoginBusy] = useState(false)
  const activeSessionId = session?.id

  const refresh = useCallback(async () => {
    if (!user || !token) return
    try {
      if (user.role === 'Teacher') {
        const dashboard = await api<Dashboard>('/api/dashboard', token)
        setData(dashboard)
        setSession(dashboard.activeSession)
      } else {
        const active = await api<Session | undefined>('/api/sessions/active', token)
        setSession(active ?? null)
      }
      setError('')
    } catch (reason) {
      setError(messageOf(reason, 'Unable to load attendance.'))
    } finally {
      setLoading(false)
    }
  }, [user, token])

  const loadHistory = useCallback(async () => {
    if (!user || !token) return
    setHistoryLoading(true)
    try {
      if (user.role === 'Teacher') {
        const params = new URLSearchParams()
        if (dateFrom) params.set('from', dateFrom)
        if (dateTo) params.set('to', dateTo)
        const query = params.toString() ? `?${params}` : ''
        setHistory(await api<HistorySession[]>(`/api/sessions${query}`, token))
      } else {
        setStudentAttendance(await api<StudentAttendance[]>('/api/me/attendance', token))
      }
    } catch (reason) {
      setError(messageOf(reason, 'Unable to load attendance history.'))
    } finally {
      setHistoryLoading(false)
    }
  }, [dateFrom, dateTo, token, user])

  useEffect(() => {
    if (!user) return
    const initialLoad = window.setTimeout(() => void refresh(), 0)
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(timer)
    }
  }, [user, refresh])

  useEffect(() => {
    if (!user || (user.role === 'Teacher' && page !== 'Attendance' && page !== 'Reports')) return
    const timer = window.setTimeout(() => void loadHistory(), 0)
    return () => window.clearTimeout(timer)
  }, [user, page, dateFrom, dateTo, loadHistory])

  useEffect(() => {
    if (user?.role !== 'Student') return
    let active = true
    const timer = window.setTimeout(() => {
      void api<ScheduleClass[]>('/api/me/schedule', token)
        .then(result => { if (active) setSchedule(result) })
        .catch(reason => { if (active) setError(messageOf(reason, 'Unable to load your schedule.')) })
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [user, token])

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('att-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    const sessionId = activeSessionId
    if (user?.role !== 'Teacher' || !sessionId) return
    const timer = window.setInterval(() => {
      void api<Session>(`/api/sessions/${sessionId}/refresh-code`, token, { method: 'POST' })
        .then(setSession)
        .catch(reason => setError(messageOf(reason, 'Unable to refresh the check-in code.')))
    }, 45000)
    return () => window.clearInterval(timer)
  }, [user?.role, activeSessionId, token])

  useEffect(() => {
    if (!scanOpen) return
    let stopped = false
    let stopScanning: (() => void) | undefined
    const scan = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not available in this browser.')
        if (!videoRef.current) throw new Error('Camera preview is unavailable. Enter the six-digit code instead.')
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        const reader = new BrowserQRCodeReader()
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, _decodeError, scannerControls) => {
          if (stopped || !result) return
          let value: { sessionId?: string; code?: string }
          try {
            value = JSON.parse(result.getText()) as { sessionId?: string; code?: string }
          } catch {
            setError('This QR code is not valid for attendance. Enter the six-digit class code instead.')
            scannerControls.stop()
            setScanOpen(false)
            return
          }
          if (value.sessionId !== activeSessionId || !/^\d{6}$/.test(value.code ?? '')) {
            setError('That QR code is not for this class. Enter the current six-digit code instead.')
            scannerControls.stop()
            setScanOpen(false)
            return
          }
          setCodeInput(value.code ?? '')
          setNotice('QR code scanned. Confirm your check-in below.')
          scannerControls.stop()
          setScanOpen(false)
        })
        if (stopped) controls.stop()
        else stopScanning = () => controls.stop()
      } catch (reason) {
        if (!stopped) {
          const cameraError = reason instanceof Error ? reason : new Error('Unable to open the camera.')
          const name = 'name' in cameraError ? String(cameraError.name) : ''
          const message = name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access or enter the six-digit code instead.'
            : name === 'NotFoundError'
              ? 'No camera was found. Enter the six-digit code instead.'
              : name === 'NotReadableError'
                ? 'The camera is busy or unavailable. Enter the six-digit code instead.'
                : `${cameraError.message} Enter the six-digit code instead.`
          setError(message)
          setScanOpen(false)
        }
      }
    }
    void scan()
    return () => {
      stopped = true
      stopScanning?.()
    }
  }, [scanOpen, activeSessionId])

  useEffect(() => {
    if (!scanOpen) return
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setScanOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]')
      const focusable = dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleDialogKeys)
    return () => window.removeEventListener('keydown', handleDialogKeys)
  }, [scanOpen])

  const login = async (role: 'Teacher' | 'Student') => {
    setLoginBusy(true)
    setLoading(true)
    setError('')
    try {
      const email = role === 'Teacher' ? 'teacher@attendance.local' : 'alex@student.attendance.local'
      const result = await api<{ accessToken: string; user: User }>('/api/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email, password: 'Demo123!' }),
      })
      setUser(result.user)
      setToken(result.accessToken)
      localStorage.setItem('att-token', result.accessToken)
      localStorage.setItem('att-user', JSON.stringify(result.user))
      setNotice(`Welcome, ${result.user.name.split(' ')[0]}`)
    } catch (reason) {
      setLoading(false)
      setError(messageOf(reason, 'Sign in failed.'))
    } finally {
      setLoginBusy(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('att-token')
    localStorage.removeItem('att-user')
    setUser(null)
    setToken('')
    setData(null)
    setSession(null)
    setChecked(false)
    setHistory([])
    setStudentAttendance([])
    setError('')
  }

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      setSession(await api<Session>('/api/sessions', token, { method: 'POST' }))
      setNotice('Check-in is live. Students can scan the code now.')
      await refresh()
    } catch (reason) {
      setError(messageOf(reason, 'Unable to start attendance.'))
    } finally {
      setBusy(false)
    }
  }

  const end = async () => {
    if (!session) return
    setBusy(true)
    try {
      await api(`/api/sessions/${session.id}/close`, token, { method: 'POST' })
      setSession(null)
      setNotice('Attendance session ended.')
      await Promise.all([refresh(), loadHistory()])
    } catch (reason) {
      setError(messageOf(reason, 'Unable to end session.'))
    } finally {
      setBusy(false)
    }
  }

  const rotate = async () => {
    if (!session) return
    try {
      setSession(await api<Session>(`/api/sessions/${session.id}/refresh-code`, token, { method: 'POST' }))
    } catch (reason) {
      setError(messageOf(reason, 'Unable to refresh the code.'))
    }
  }

  const checkIn = async () => {
    if (!session) return
    setBusy(true)
    setError('')
    try {
      const result = await api<{ message: string }>('/api/attendance/check-in', token, {
        method: 'POST',
        body: JSON.stringify({ sessionId: session.id, code: codeInput.trim() }),
      })
      setChecked(true)
      setNotice(result.message)
      await Promise.all([refresh(), loadHistory()])
    } catch (reason) {
      setError(messageOf(reason, 'Check-in failed.'))
    } finally {
      setBusy(false)
    }
  }

  const enroll = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setEnrollError('')
    try {
      await api<Student>('/api/students', token, {
        method: 'POST',
        body: JSON.stringify({ name: enrollName, email: enrollEmail }),
      })
      setEnrollName('')
      setEnrollEmail('')
      setEnrollOpen(false)
      setNotice('Student enrolled successfully.')
      await refresh()
    } catch (reason) {
      setEnrollError(messageOf(reason, 'Unable to enroll this student.'))
    } finally {
      setBusy(false)
    }
  }

  const openStudentView = async (view: StudentView) => {
    setStudentView(view)
    setError('')
    try {
      if (view === 'Schedule') setSchedule(await api<ScheduleClass[]>('/api/me/schedule', token))
      if (view === 'Profile') {
        const currentProfile = await api<User>('/api/me', token)
        setProfile(currentProfile)
        setProfileName(currentProfile.name)
      }
    } catch (reason) {
      setError(messageOf(reason, 'Unable to load this page.'))
    }
  }

  const saveProfile = async (name: string) => {
    setBusy(true)
    setError('')
    try {
      const updated = await api<User>('/api/me', token, { method: 'PUT', body: JSON.stringify({ name }) })
      setProfile(updated)
      setProfileName(updated.name)
      setUser(updated)
      localStorage.setItem('att-user', JSON.stringify(updated))
      setNotice('Profile updated.')
    } catch (reason) {
      setError(messageOf(reason, 'Unable to update your profile.'))
    } finally {
      setBusy(false)
    }
  }

  const entries = data?.attendance ?? emptyEntries
  const roster = useMemo(() => {
    const query = search.toLowerCase().trim()
    return (data?.students ?? [])
      .filter(student => `${student.name} ${student.email}`.toLowerCase().includes(query))
      .map(student => ({ ...student, entry: entries.find(entry => entry.studentId === student.id) }))
  }, [data, entries, search])

  if (!user) return <Login busy={loginBusy} error={error} onLogin={login}/>
  if (user.role === 'Student') {
    return <StudentHome user={user} view={studentView} setView={openStudentView} session={session} checked={checked} codeInput={codeInput} setCodeInput={setCodeInput} scanOpen={scanOpen} setScanOpen={setScanOpen} videoRef={videoRef} busy={busy} loading={loading} online={online} dark={dark} setDark={setDark} error={error} notice={notice} setNotice={setNotice} checkIn={checkIn} logout={logout} schedule={schedule} attendance={studentAttendance} profile={profile} profileName={profileName} setProfileName={setProfileName} saveProfile={saveProfile}/>
  }

  const exportHistory = () => {
    const rows: (string | number)[][] = [['Class date', 'Course', 'Room', 'Student', 'Status', 'Check-in time']]
    history.forEach(item => {
      if (!item.attendance.length) rows.push([item.startsAt, item.course, item.room, '', 'No check-ins', ''])
      item.attendance.forEach(entry => rows.push([item.startsAt, item.course, item.room, entry.studentName, entry.status, entry.recordedAt]))
    })
    downloadCsv('rollcall-attendance.csv', rows)
  }
  const totalCheckIns = history.reduce((sum, item) => sum + item.attendance.length, 0)
  const averageRate = history.length
    ? Math.round(history.reduce((sum, item) => sum + (item.totalStudents ? item.attendance.length / item.totalStudents : 0), 0) / history.length * 100)
    : 0

  return <main className="app-shell">
    <aside className={`sidebar ${menu ? 'show' : ''}`}>
      <Brand/>
      <div className="workspace">WORKSPACE</div>
      <button className="course-select" aria-label="Current course"><span>H</span><b>HCI · Spring ’26<small>Turku University</small></b><ChevronDown size={15}/></button>
      <div className="workspace teaching">TEACHING</div>
      <nav className="main-nav" aria-label="Teacher navigation">
        {[
          { label: 'Overview', Icon: LayoutDashboard },
          { label: 'Attendance', Icon: CalendarDays },
          { label: 'Students', Icon: Users },
          { label: 'Reports', Icon: Download },
          { label: 'Settings', Icon: Settings },
        ].map(({ label, Icon }) => <button key={label} className={page === label ? 'active' : ''} aria-current={page === label ? 'page' : undefined} onClick={() => { setPage(label); setMenu(false); setError('') }}>
          <Icon size={17}/>{label}{label === 'Attendance' && <i>{history.length}</i>}
        </button>)}
      </nav>
      <div className="sidebar-foot"><div className="profile"><div className="avatar teacher-avatar" aria-hidden="true">AO</div><span><b>{user.name}</b><small>Instructor</small></span><button aria-label="Sign out" onClick={logout}><LogOut size={16}/></button></div></div>
    </aside>
    <section className="main-panel">
      <header className="topbar"><button className="menu-button" onClick={() => setMenu(!menu)} aria-label={menu ? 'Close navigation' : 'Open navigation'}><Menu/></button><div className="breadcrumb">Courses <ChevronRight size={13}/> <b>Human Computer Interaction</b></div><div className="top-right"><span>Spring semester 2026</span><button className="bell" aria-label="Notifications"><Bell size={17}/></button><div className="avatar teacher-avatar" aria-hidden="true">AO</div></div></header>
      <div className="page-content">
        <div className="page-title"><div><div className="eyebrow"><i/> COURSE OVERVIEW <b>/</b> UXD-204</div><h1>{page === 'Overview' ? 'Good morning, Amara' : page}<span> ✳</span></h1><p>{page === 'Overview' ? 'Here’s what’s happening with your class today.' : 'Human Computer Interaction · Spring semester 2026'}</p></div>
          {(page === 'Attendance' || page === 'Reports') && <DateFilters from={dateFrom} to={dateTo} setFrom={setDateFrom} setTo={setDateTo}/>}
        </div>
        {!online && <div role="status" className="offline-banner">You’re offline. Live attendance data and check-in require a connection.</div>}
        {error && <div role="alert" className="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
        {notice && <div role="status" className="notice" aria-live="polite">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15}/></button></div>}
        {loading && !data ? <LoadingState/> : <>
          {page === 'Overview' && <Overview data={data} session={session} roster={roster} busy={busy} setPage={setPage} start={start} end={end}/>}
          {page === 'Attendance' && <AttendanceHistory history={history} loading={historyLoading} exportHistory={exportHistory}/>}
          {page === 'Students' && <section className="card roster-page">
            <div className="card-title"><div><h2>Students <span className="roster-count" aria-label={`${data?.students.length ?? 0} students enrolled`}>{data?.students.length ?? 0} enrolled</span></h2><p>Manage students enrolled in Human Computer Interaction.</p></div><button className="primary" onClick={() => { setEnrollOpen(!enrollOpen); setEnrollError('') }}>{enrollOpen ? 'Cancel' : 'Enroll student'} <Users size={15}/></button></div>
            {enrollOpen && <form className="enroll-form" onSubmit={event => void enroll(event)}><label>Student name<input required minLength={2} maxLength={80} value={enrollName} onChange={event => setEnrollName(event.target.value)} autoComplete="name"/></label><label>Email address<input required type="email" value={enrollEmail} onChange={event => setEnrollEmail(event.target.value)} autoComplete="email"/></label><button className="primary" disabled={busy}>{busy ? 'Enrolling…' : 'Add to roster'}</button>{enrollError && <p role="alert" className="alert enroll-error">{enrollError}</p>}</form>}
            <label className="search"><Search size={16}/><input aria-label="Search students" placeholder="Search students" value={search} onChange={event => setSearch(event.target.value)}/></label>
            <div className="roster-head all"><span>STUDENT</span><span>EMAIL</span><span>STATUS</span><span>CHECK-IN</span></div>
            {roster.length ? roster.map((student, index) => <div className="roster-row all" key={student.id}><div className="person"><div className="avatar" style={{ background: colors[index % colors.length] }}>{student.initials}</div><span><b>{student.name}</b></span></div><span className="time">{student.email}</span><span className={`status ${student.entry ? 'present' : 'pending'}`}><i/>{student.entry ? 'Present' : 'Not checked in'}</span><span className="time">{student.entry ? new Date(student.entry.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>) : <EmptyState title={search ? 'No students found' : 'No students enrolled'} detail={search ? 'Try another name or email.' : 'Enroll a student to start building this roster.'}/>}
          </section>}
          {page === 'Reports' && <Reports history={history} loading={historyLoading} totalCheckIns={totalCheckIns} averageRate={averageRate} exportHistory={exportHistory}/>}
          {page === 'Settings' && <section className="card settings-page"><h2>Settings</h2><p>Profile and appearance preferences for this device.</p><div className="settings-row"><span><b>Signed in as</b><small>{user.name} · {user.email}</small></span><button className="secondary-button" onClick={logout}>Sign out</button></div><div className="settings-row"><span><b>Dark theme</b><small>Use a darker color palette on this device.</small></span><label className="switch-label"><input type="checkbox" checked={dark} onChange={event => setDark(event.target.checked)}/> Enable dark theme</label></div></section>}
        </>}
        <footer><ShieldCheck size={14}/> Attendance data is private to your course <i/> {online ? 'Connected to demo API' : 'Offline'}</footer>
      </div>
    </section>
    {session && <>
      <aside className="qr-float" aria-label="Live check-in QR code"><div className="qr-label"><i/> LIVE CHECK-IN <button aria-label="Refresh code" onClick={() => void rotate()}><RefreshCw size={14}/></button></div>{session.code && <QRCodeSVG value={JSON.stringify({ sessionId: session.id, code: session.code })} size={142} bgColor="#fffefa" fgColor="#382820" level="H" includeMargin/>}<b>Scan to check in</b><small>Open your camera and point it here</small><div className="manual"><span>OR ENTER THIS CODE</span><strong>{session.code}</strong></div><p>Code refreshes every minute</p><button className="primary full" onClick={() => void end()} disabled={busy}>End attendance</button></aside>
      <section className="qr-mobile-card" aria-label="Live check-in QR code"><button className="secondary-button qr-mobile-toggle" aria-expanded={qrOpen} onClick={() => setQrOpen(!qrOpen)}><QrCode size={16}/>{qrOpen ? 'Hide check-in QR' : 'Show check-in QR'}<ChevronDown size={15}/></button>{qrOpen && <div className="qr-mobile-content"><b>Scan to check in</b>{session.code && <QRCodeSVG aria-label="Attendance check-in QR code" value={JSON.stringify({ sessionId: session.id, code: session.code })} size={220} bgColor="#fffefa" fgColor="#382820" level="H" includeMargin/>}<span>Or enter this six-digit code</span><strong>{session.code}</strong><button className="secondary-button" onClick={() => void rotate()}><RefreshCw size={14}/> Refresh code</button></div>}</section>
    </>}
    {menu && <button className="scrim" onClick={() => setMenu(false)} aria-label="Close navigation"/>}
  </main>
}

function DateFilters({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (value: string) => void; setTo: (value: string) => void }) {
  return <div className="date-filters"><label>From<input type="date" aria-label="From date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)}/></label><label>To<input type="date" aria-label="To date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)}/></label></div>
}

function Overview({ data, session, roster, busy, setPage, start, end }: { data: Dashboard | null; session: Session | null; roster: ({ entry?: Entry } & Student)[]; busy: boolean; setPage: (page: string) => void; start: () => void; end: () => void }) {
  const values = [
    { name: 'Enrolled students', value: data?.totalStudents ?? '—', detail: 'Across this course', Icon: Users },
    { name: 'Avg. attendance', value: data ? `${data.averageAttendance}%` : '—', detail: 'This term', Icon: CheckCircle2 },
    { name: 'Classes this week', value: data?.classesThisWeek ?? '—', detail: 'Scheduled classes', Icon: CalendarDays },
    { name: 'Checked in today', value: `${data?.checkedIn ?? 0}/${data?.totalStudents ?? '—'}`, detail: 'Live attendance', Icon: Clock3 },
  ]
  return <>
    <section className={`live-banner ${session ? 'is-live' : ''}`}><div className="banner-icon">{session ? <i className="pulse"/> : <QrCode size={20}/>}</div><div><b>{session ? 'Attendance is live' : 'Ready for today’s class?'}</b><small>{session ? 'Students can check in now · QR code refreshes every 45 seconds' : 'Start a check-in session and let students scan their way in.'}</small></div><button className="primary" onClick={session ? end : start} disabled={busy}>{session ? 'End session' : 'Start attendance'}<ArrowRight size={15}/></button></section>
    <section className="metrics">{values.map(({ name, value, detail, Icon }, index) => <article className="metric" key={name}><div className={`metric-icon mi-${index}`}><Icon size={17}/></div><small>{name}</small><strong>{value}</strong><em>{detail}</em></article>)}</section>
    <section className="dashboard-grid"><article className="card attendance"><div className="card-title"><div><h2>Today’s attendance</h2><p>Latest check-ins for UXD-204</p></div><button className="link-button" onClick={() => setPage('Attendance')}>View history <ArrowRight size={14}/></button></div><div className="roster-head"><span>STUDENT</span><span>CHECK-IN TIME</span><span>STATUS</span></div>{roster.slice(0, 6).map((student, index) => <div className="roster-row" key={student.id}><div className="person"><div className="avatar" style={{ background: colors[index % colors.length] }}>{student.initials}</div><span><b>{student.name}</b><small>{student.email}</small></span></div><span className="time">{student.entry ? new Date(student.entry.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span><span className={`status ${student.entry ? 'present' : 'pending'}`}><i/>{student.entry ? 'Present' : 'Pending'}</span></div>)}{roster.length === 0 && <EmptyState title="Roster is empty" detail="Enroll students to see attendance here."/>}<button className="table-footer" onClick={() => setPage('Students')}>See all {data?.totalStudents ?? 0} students <ArrowRight size={14}/></button></article>
      <div className="side-column"><article className="card next-class"><div className="card-title"><div><h2>Next class</h2><p>Your upcoming schedule</p></div></div><div className="schedule"><div className="schedule-date"><small>FRI</small><b>14</b><small>NOV</small></div><div><strong>Human Computer Interaction</strong><p><Clock3 size={13}/>10:15 – 11:45</p><p>⌖ &nbsp;Studio 204</p></div></div><div className="schedule-foot"><div className="avatar-stack"><i>AM</i><i>JC</i><i>+18</i></div><span>{data?.totalStudents ?? 0} students enrolled</span></div></article><article className="insight"><div className="eyebrow">✳ &nbsp;A LITTLE INSIGHT</div><h3>Showing up pays off.</h3><p>Students with 90%+ attendance are performing <b>18% better</b> this term.</p><div className="bars">{[35, 48, 42, 61, 55, 70, 67, 86, 100].map((height, index) => <i key={index} style={{ height: `${height}%`, background: index === 8 ? '#315cff' : undefined }}/>)}</div><small>WEEK 1 <span>WEEK 9</span></small></article></div>
    </section>
  </>
}

function AttendanceHistory({ history, loading, exportHistory }: { history: HistorySession[]; loading: boolean; exportHistory: () => void }) {
  return <section className="card roster-page"><div className="card-title"><div><h2>Attendance history</h2><p>Sessions and check-ins in the selected date range.</p></div><button className="secondary-button" onClick={exportHistory} disabled={!history.length}><Download size={15}/> Export CSV</button></div>
    {loading && <p className="inline-loading" role="status">Refreshing attendance history…</p>}
    {history.length ? <div className="history-list">{history.map(item => <article className="history-session" key={item.id}><header><div><h3>{item.course}</h3><p>{formatDate(item.startsAt)} · {item.room}</p></div><span className="session-count">{item.attendance.length}/{item.totalStudents} present</span></header>{item.attendance.length ? <ul>{item.attendance.map(entry => <li key={entry.studentId}><span>{entry.studentName}</span><span>{entry.status} · {new Date(entry.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></li>)}</ul> : <p className="empty-inline">No check-ins were recorded for this class.</p>}</article>)}</div> : !loading && <EmptyState title="No attendance sessions found" detail="Try a different date range or start an attendance session."/>}
  </section>
}

function Reports({ history, loading, totalCheckIns, averageRate, exportHistory }: { history: HistorySession[]; loading: boolean; totalCheckIns: number; averageRate: number; exportHistory: () => void }) {
  return <section className="reports-page"><div className="report-metrics"><article className="metric"><small>Class sessions</small><strong>{history.length}</strong><em>In selected date range</em></article><article className="metric"><small>Total check-ins</small><strong>{totalCheckIns}</strong><em>Across all sessions</em></article><article className="metric"><small>Average attendance</small><strong>{history.length ? `${averageRate}%` : '—'}</strong><em>Per class session</em></article></div><section className="card roster-page"><div className="card-title"><div><h2>Attendance report</h2><p>Export detailed records for offline analysis.</p></div><button className="primary" onClick={exportHistory} disabled={!history.length}><Download size={15}/> Download CSV</button></div>{loading && <p className="inline-loading" role="status">Loading report…</p>}{history.length ? <div className="report-table"><div className="report-row report-head"><span>CLASS DATE</span><span>COURSE</span><span>ATTENDANCE</span><span>STATUS</span></div>{history.map(item => <div className="report-row" key={item.id}><span>{formatDate(item.startsAt)}</span><span>{item.course}</span><span>{item.attendance.length}/{item.totalStudents}</span><span>{item.isOpen ? 'In progress' : 'Closed'}</span></div>)}</div> : !loading && <EmptyState title="No report data for this range" detail="Clear or adjust the date filters to see attendance."/>}</section></section>
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><CalendarDays size={21}/><b>{title}</b><p>{detail}</p></div>
}

function LoadingState() {
  return <div className="loading-state" role="status" aria-live="polite"><span className="spinner"/><b>Loading your attendance data…</b></div>
}

function Brand() {
  return <div className="brand"><span className="brand-mark"><Check size={17} strokeWidth={3}/></span>rollcall<span className="brand-dot">.</span></div>
}

function Login({ busy, error, onLogin }: { busy: boolean; error: string; onLogin: (role: 'Teacher' | 'Student') => void }) {
  return <main className="login"><section className="login-art"><Brand/><div className="art-copy"><div className="eyebrow">● &nbsp;CLASS TIME, WELL SPENT</div><h1>Every class<br/>counts<span>.</span></h1><p>One calm place to keep attendance on track, so you can focus on what matters in the room.</p><div className="art-illustration"><div className="sun"/><div className="board"><i/><i/><i/><b>✓</b></div><div className="plant">✳</div></div></div><small>MADE FOR THE MOMENTS THAT MATTER &nbsp; ✳</small></section><section className="login-side"><div className="login-form"><div className="login-small"><Brand/></div><div className="eyebrow">● &nbsp;YOUR CLASSROOM, IN SYNC</div><h2>Welcome back</h2><p>Choose a demo account to explore attendance.</p>{error && <div className="alert" role="alert">{error}</div>}<button className="login-option" onClick={() => onLogin('Teacher')} disabled={busy}><i className="option-teacher"><LayoutDashboard/></i><span><b>{busy ? 'Signing in…' : 'Continue as a teacher'}</b><small>Manage your class and track attendance</small></span><ArrowRight size={16}/></button><button className="login-option" onClick={() => onLogin('Student')} disabled={busy}><i className="option-student"><QrCode/></i><span><b>Continue as a student</b><small>Check in and view your attendance</small></span><ArrowRight size={16}/></button><div className="demo"><b>Demo access</b><span>Password: Demo123!</span><i>● &nbsp;READY</i></div><p className="privacy"><ShieldCheck size={14}/> Your class information stays private and secure.</p></div><footer>© 2026 Rollcall &nbsp;·&nbsp; A little more present, every day.</footer></section></main>
}

function StudentHome({ user, view, setView, session, checked, codeInput, setCodeInput, scanOpen, setScanOpen, videoRef, busy, loading, online, dark, setDark, error, notice, setNotice, checkIn, logout, schedule, attendance, profile, profileName, setProfileName, saveProfile }: {
  user: User; view: StudentView; setView: (view: StudentView) => void; session: Session | null; checked: boolean; codeInput: string; setCodeInput: (value: string) => void
  scanOpen: boolean; setScanOpen: (value: boolean) => void; videoRef: React.RefObject<HTMLVideoElement | null>; busy: boolean; loading: boolean; online: boolean
  dark: boolean; setDark: (value: boolean) => void; error: string; notice: string; setNotice: (value: string) => void; checkIn: () => void; logout: () => void
  schedule: ScheduleClass[]; attendance: StudentAttendance[]; profile: User | null; profileName: string; setProfileName: (value: string) => void; saveProfile: (name: string) => void
}) {
  const presentCount = attendance.filter(item => item.status === 'Present').length
  const attendanceRate = attendance.length ? Math.round(presentCount / attendance.length * 100) : null
  return <main className="student-shell">
    <header className="student-bar"><Brand/><button className="role-link" onClick={logout}>Sign out</button></header>
    <div className="student-wrap">
      {!online && <div role="status" className="offline-banner">You’re offline. Check-in requires a connection.</div>}
      <div className="eyebrow"><i/> YOUR LEARNING SPACE</div><h1>Hey, {user.name.split(' ')[0]} <span>✳</span></h1><p className="muted">Ready to make today count?</p>
      {view === 'Home' && <>
        <section className="student-course"><span className="course-tag">UXD-204</span><span className="term-tag">SPRING ’26</span><h2>Human Computer<br/>Interaction</h2><div className="teacher-line"><div className="mini-avatar">AO</div>Dr. Amara Okafor <b>·</b> Studio 204</div><div className="course-progress"><div><small>YOUR ATTENDANCE</small><strong>{attendanceRate === null ? '—' : `${attendanceRate}%`}</strong></div><i><span style={{ width: `${attendanceRate ?? 0}%` }}/></i><em>{attendance.length ? 'Based on recorded classes' : 'No attendance history yet'}</em></div></section>
        <section className="student-check"><div className="check-head"><div><h2>{checked ? 'You’re all set!' : 'Today’s class'}</h2><p>{checked ? 'You’re checked in. Have a great class!' : session ? 'Your teacher is taking attendance now.' : 'Check-in opens when class starts.'}</p></div><div className="soft-icon"><QrCode size={19}/></div></div><div className="class-line"><Clock3 size={17}/><span><strong>{session ? 'In session now' : 'Friday, November 14'}</strong><small>{session ? `${session.room} · started ${new Date(session.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '10:15 – 11:45 · Studio 204'}</small></span><ChevronRight size={16}/></div>
          {session && !checked && <><button className="scan-button" onClick={() => setScanOpen(true)} disabled={!online}><QrCode size={17}/> Scan class QR code <ArrowRight size={15}/></button><label className="code-input"><span>Or enter the 6-digit class code</span><input aria-label="6-digit class code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={codeInput} onChange={event => setCodeInput(event.target.value.replace(/\D/g, '').slice(0, 6))}/></label><button className="primary full student-submit" disabled={busy || codeInput.length !== 6 || !online} onClick={checkIn}>{busy ? 'Checking in…' : 'Confirm attendance'} <ArrowRight size={16}/></button></>}
          {checked && <div className="checked-receipt" role="status"><CheckCircle2 size={19}/><span><b>Attendance recorded</b><small>You're all set. Enjoy your class.</small></span></div>}
          {!session && <button className="primary full student-submit" disabled><Clock3 size={16}/> Check-in opens when class starts</button>}
          <div className="secure-note"><ShieldCheck size={14}/>{online ? 'Secure check-in · Only your teacher sees your status' : 'Reconnect to check in securely'}</div>
        </section>
        <section className="coming"><div className="section-head"><h2>Coming up</h2><button onClick={() => setView('Schedule')}>See schedule <ArrowRight size={14}/></button></div>{schedule.length ? schedule.slice(0, 1).map(item => <div className="upcoming" key={item.courseCode}><div className="date-square"><small>{new Date(item.startsAt).toLocaleDateString([], { weekday: 'short' }).toUpperCase()}</small><b>{new Date(item.startsAt).getDate()}</b></div><span><strong>{item.course}</strong><small>{formatDate(item.startsAt)} · {item.room}</small></span></div>) : <div className="upcoming"><span><strong>Human Computer Interaction</strong><small>Schedule will appear here when available.</small></span></div>}</section>
      </>}
      {view === 'Schedule' && <section className="card student-subpage"><div className="card-title"><div><h2>My schedule</h2><p>Upcoming classes and locations</p></div></div>{loading ? <p role="status">Loading schedule…</p> : schedule.length ? schedule.map(item => <article className="schedule-item" key={item.courseCode}><div className="date-square"><small>{new Date(item.startsAt).toLocaleDateString([], { weekday: 'short' }).toUpperCase()}</small><b>{new Date(item.startsAt).getDate()}</b></div><span><strong>{item.course}</strong><small>{item.courseCode} · {formatDate(item.startsAt)} – {new Date(item.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small><small>{item.room} · {item.teacher}</small></span></article>) : <EmptyState title="No upcoming classes" detail="Your schedule is currently clear."/>}</section>}
      {view === 'Profile' && <section className="card student-subpage"><div className="card-title"><div><h2>My profile</h2><p>Your account information</p></div></div><div className="student-profile"><div className="avatar">{(profile ?? user).name.split(' ').map(part => part[0]).slice(0, 2).join('')}</div><div><b>{profile?.name ?? user.name}</b><small>{profile?.email ?? user.email}</small><small>Student · Human Computer Interaction</small></div></div><form className="profile-form" onSubmit={event => { event.preventDefault(); void saveProfile(profileName) }}><label htmlFor="profile-name">Display name</label><input id="profile-name" required minLength={2} maxLength={80} value={profileName} onChange={event => setProfileName(event.target.value)}/><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></form><label className="student-theme"><input type="checkbox" checked={dark} onChange={event => setDark(event.target.checked)}/> Use dark theme</label><h3>Recent attendance</h3>{attendance.length ? <div className="profile-attendance">{attendance.map((item, index) => <div key={`${item.startsAt}-${index}`}><span><b>{item.course}</b><small>{formatDate(item.startsAt)} · {item.recordedAt ? new Date(item.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No check-in time'}</small></span><span className={`status ${item.status.toLowerCase()}`}><i/>{item.status}</span></div>)}</div> : <EmptyState title="No attendance history yet" detail="Your check-ins will appear here."/>}</section>}
      {error && <p role="alert" className="alert">{error}</p>}
      {notice && <div role="status" className="mobile-notice" aria-live="polite">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={14}/></button></div>}
      <nav className="bottom-nav" aria-label="Student navigation"><button className={view === 'Home' ? 'on' : ''} aria-current={view === 'Home' ? 'page' : undefined} onClick={() => setView('Home')}><Home/><span>Home</span></button><button className={view === 'Schedule' ? 'on' : ''} aria-current={view === 'Schedule' ? 'page' : undefined} onClick={() => setView('Schedule')}><CalendarDays/><span>Schedule</span></button><button className={view === 'Profile' ? 'on' : ''} aria-current={view === 'Profile' ? 'page' : undefined} onClick={() => setView('Profile')}><Users/><span>Profile</span></button></nav>
      {scanOpen && <div className="scanner-backdrop"><section className="scanner" role="dialog" aria-modal="true" aria-labelledby="scanner-title"><button className="scanner-close" autoFocus onClick={() => setScanOpen(false)} aria-label="Close QR scanner"><X/></button><h2 id="scanner-title">Scan class QR</h2><p>Point your camera at the code your teacher is showing.</p><video ref={videoRef} playsInline muted aria-label="Live camera preview for QR scanning"/><small>If the camera is unavailable, enter the 6-digit class code manually.</small><button className="scan-button" onClick={() => setScanOpen(false)}>Enter code instead</button></section></div>}
    </div>
  </main>
}
