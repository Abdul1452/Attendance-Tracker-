# Rollcall — Attendance Tracker

A responsive attendance app prototype for instructors and students. A teacher can open a class check-in, show a rotating QR code, and see student arrivals appear on the roster. Students can scan the QR code on supported phones or enter its six-digit fallback.

## Run the app

You only need **Node.js 22 or newer** and npm. From the project folder:

```bash
cd client
npm install
npm run dev
```

Open the local address printed by Vite (normally `http://localhost:5173`). This starts the web and mobile-responsive PWA and its local demo API together. You do not need a .NET SDK, database, Docker, or separate API terminal to try the app.

Use the sign-in page's teacher or student demo buttons. The sample password is `Demo123!`. For the full flow, sign in as the teacher in one browser, start attendance, then sign in as Alex in a second browser or private window. Scan the QR code or enter the six-digit code shown beneath it. The teacher's roster refreshes automatically.

Camera check-in uses ZXing's browser QR reader, so it does not depend on the browser implementing `BarcodeDetector`. It needs camera permission and a secure browser context; localhost qualifies during development. Unsupported browsers, unavailable cameras, and denied/busy camera permissions fall back to manual six-digit code entry. Physical iOS/Android camera testing remains a release check. On narrow teacher screens, use **Show check-in QR** to open the scannable code and its six-digit fallback.

## What is running locally

- **Client:** React, TypeScript, Vite, and an installable responsive PWA.
- **Demo API:** same-origin request handlers in `vite.config.ts`. They keep sample users, sessions, and attendance in memory while the dev server runs.
- **UI colors:** Butter Yellow `#F4D879`, Dark Cocoa `#382820`, and Electric Blue `#315CFF`.

The design reference is [Attendance Tracker Prototype in Figma](https://www.figma.com/make/PorOMg0hT9GjNiXGa06Z98/Attendance-Tracker-Prototype?t=HyRmVDl3OcgbmsN9-0).

The Vite handlers are a local coursework demo, not a production backend. Attendance resets when the dev server restarts, and the dashboard includes sample metric values. Production persistence and a standalone API/gateway remain team work. Offline mode caches the app shell and static assets only; attendance data and check-in are never cached and require a network connection.

## End-to-end check

Install the Playwright browser once:

```bash
cd client
npx playwright install chromium
npm run test:e2e
```

The test command starts the Vite app, checks a teacher-started session, submits a student's six-digit code, verifies the saved confirmation, and confirms the teacher roster receives the attendance. Additional API scenarios cover duplicate and expired check-ins, closed sessions, role enforcement, and date filters; UI tests cover mobile QR visibility, camera-permission fallback, enrollment success and duplicate feedback, CSV reports, theme settings, schedule, and profile updates. The test runner shortens the code lifetime to 30 seconds so it can exercise real expiration without a long wait; the local demo defaults to 60 seconds.

## Team backlog

The first local demo is intentionally small. These four suggested workstreams leave at least five concrete tasks per teammate; agree on owners and acceptance criteria together.

### Hossain Daloar — Real backend and attendance data

1. Choose the team's backend and storage approach and document the trade-offs.
2. Replace the Vite demo handlers with a maintainable API service.
3. Add persistent storage, schema migrations, and safe repeatable seed data.
4. Model courses, enrollments, class sessions, and attendance with database constraints.
5. Implement manual Present, Absent, Late, and Excused status changes.
6. Add correction reasons and an audit trail for attendance edits.

### Aziz Ullah Muhammad — Accounts, access, and QR security

1. Replace demo buttons and sample accounts with the team's chosen sign-in flow.
2. Enforce student and teacher permissions on server routes.
3. Restrict teacher access to their own course rosters.
4. Store signing keys and configuration outside source code.
5. Add rate limits and replay/guessing protection for QR check-in.
6. Test expired codes, duplicate attendance, wrong roles, and cross-course access.

### Abdulwasiu Abdullahi Olamilekan — Containers and deployment

1. Create a multi-stage Dockerfile for the web client.
2. Create a Dockerfile for the API once the team selects its backend.
3. Add Docker Compose with persistent storage and service health checks.
4. Configure environment-specific ports, API addresses, and secrets.
5. Add a deployment guide for the team's chosen host.
6. Add CI to install dependencies, build the app, run checks, and build container images.

### Emmanuel Ebere — Product completion and quality

1. Implemented demo attendance history, reports, date filters, and CSV export; production persistence remains open.
2. Implemented student enrollment, schedule, editable profile, and attendance history in the demo.
3. Added end-to-end coverage for duplicate/expired codes, closed sessions, and role access.
4. Added camera permission/error fallback paths; real-device scanning still needs hands-on verification.
5. Improved contrast for key labels, keyboard focus visibility, accessible names, and live announcements. Complete WCAG 2.2 AA validation with assistive technology remains required.
6. Added loading, offline, error, empty, no-results, and dark theme states.
7. Added demo API examples and a runbook. Refresh the API details when the team selects its production backend.

## API demo and runbook

The current backend is the in-memory Vite middleware in `client/vite.config.ts`; it is a local demo choice, not a production backend selection. Its tokens, sessions, and enrolled students reset when the dev server restarts. Do not deploy it or use its demo password for real accounts.

| Route | Method | Access | Purpose |
| --- | --- | --- | --- |
| `/api/auth/login` | POST | Public | Sign in with a demo account |
| `/api/dashboard` | GET | Teacher | Course summary and current roster |
| `/api/sessions` | POST / GET | Teacher | Start a session / list history; optional `from=YYYY-MM-DD&to=YYYY-MM-DD` |
| `/api/sessions/active` | GET | Student | Read the active session without disclosing its code |
| `/api/sessions/{id}/refresh-code` | POST | Teacher | Rotate the six-digit check-in code |
| `/api/sessions/{id}/close` | POST | Teacher | Close a session |
| `/api/sessions/{id}/attendance` | GET | Teacher | Read that session's attendance |
| `/api/students` | POST | Teacher | Enroll a student by name and email |
| `/api/attendance/check-in` | POST | Student | Check in with a session ID and current code |
| `/api/me` | GET / PUT | Student | Read or update the student's display name |
| `/api/me/schedule` | GET | Student | Read upcoming classes |
| `/api/me/attendance` | GET | Student | Read attendance history and status |

### Request examples

Sign in and copy the returned `accessToken`:

```powershell
curl.exe -X POST http://localhost:5173/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"teacher@attendance.local","password":"Demo123!"}'
```

Use the token returned by login to start attendance or filter history:

```powershell
curl.exe -X POST http://localhost:5173/api/sessions `
  -H "Authorization: Bearer <ACCESS_TOKEN>"

curl.exe "http://localhost:5173/api/sessions?from=2026-11-01&to=2026-11-30" `
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

CSV exports are generated in the browser from the filtered history. The demo validates date ranges, rejects duplicate enrollments and invalid/expired codes, and reports closed sessions and role violations explicitly.

### Before selecting a production backend

1. Choose the production API, identity provider, database, and hosting approach as a team.
2. Replace the Vite middleware and demo login; keep the route semantics above only if they fit the selected backend.
3. Add durable migrations, course-scoped authorization, auditability, rate limits, and deployment secrets.
4. Update this route table and examples to match the real API, then add integration tests against that service.
5. Test camera permissions, scanning, and manual-code fallback on supported iOS and Android devices.
6. Re-run the end-to-end suite and complete the accessibility review before release.
