# Rollcall — Attendance Tracker

A responsive attendance app prototype for instructors and students. A teacher can open a class check-in, show a rotating QR code, and see student arrivals appear on the roster. Students can scan the QR code on supported phones or enter its six-digit fallback.

## Run the app

You only need **Node.js 22 or newer** and npm. From the project folder:

```powershell
cd client
npm.cmd install
npm.cmd run dev
```

Open the local address printed by Vite (normally `http://localhost:5173`). This starts the web and mobile-responsive PWA and its local demo API together. You do not need a .NET SDK, database, Docker, or separate API terminal to try the app.

Use the sign-in page's teacher or student demo buttons. The sample password is `Demo123!`. For the full flow, sign in as the teacher in one browser, start attendance, then sign in as Alex in a second browser or private window. Scan the QR code or enter the six-digit code shown beneath it. The teacher's roster refreshes automatically.

Camera check-in uses the browser's `BarcodeDetector` where available. It needs camera permission and a secure browser context; localhost qualifies during development. The six-digit code is the fallback.

## What is running locally

- **Client:** React, TypeScript, Vite, and an installable responsive PWA.
- **Demo API:** same-origin request handlers in `vite.config.ts`. They keep sample users, sessions, and attendance in memory while the dev server runs.
- **UI colors:** Butter Yellow `#F4D879`, Dark Cocoa `#382820`, and Electric Blue `#315CFF`.

The design reference is [Attendance Tracker Prototype in Figma](https://www.figma.com/make/PorOMg0hT9GjNiXGa06Z98/Attendance-Tracker-Prototype?t=HyRmVDl3OcgbmsN9-0).

The Vite handlers are a local coursework demo, not a production backend. Attendance resets when the dev server restarts. The dashboard also includes sample metric values. The previous .NET 10 scaffold is retained under `legacy-dotnet/` for reference, but is not used by this run path. No .NET SDK is needed to try the web app.

## End-to-end check

Install the Playwright browser once:

```powershell
cd client
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

The test command starts the Vite app, checks a teacher-started session, submits a student's six-digit code, verifies the saved confirmation, and confirms the teacher roster receives the attendance.

## Team backlog

The first local demo is intentionally small. These four suggested workstreams leave at least five concrete tasks per teammate; agree on owners and acceptance criteria together.

### Member 1 — Real backend and attendance data

1. Choose the team's backend and storage approach and document the trade-offs.
2. Replace the Vite demo handlers with a maintainable API service.
3. Add persistent storage, schema migrations, and safe repeatable seed data.
4. Model courses, enrollments, class sessions, and attendance with database constraints.
5. Implement manual Present, Absent, Late, and Excused status changes.
6. Add correction reasons and an audit trail for attendance edits.

### Member 2 — Accounts, access, and QR security

1. Replace demo buttons and sample accounts with the team's chosen sign-in flow.
2. Enforce student and teacher permissions on server routes.
3. Restrict teacher access to their own course rosters.
4. Store signing keys and configuration outside source code.
5. Add rate limits and replay/guessing protection for QR check-in.
6. Test expired codes, duplicate attendance, wrong roles, and cross-course access.

### Member 3 — Containers and deployment

1. Create a multi-stage Dockerfile for the web client.
2. Create a Dockerfile for the API once the team selects its backend.
3. Add Docker Compose with persistent storage and service health checks.
4. Configure environment-specific ports, API addresses, and secrets.
5. Add a deployment guide for the team's chosen host.
6. Add CI to install dependencies, build the app, run checks, and build container images.

### Member 4 — Product completion and quality

1. Finish attendance history, reports, date filters, and exports.
2. Add roster management, enrollment, student schedule, and profile flows.
3. Expand end-to-end cases for duplicates, expired codes, closed sessions, and role access.
4. Test phone camera scanning on real devices and improve permission/error fallbacks.
5. Review contrast, keyboard flow, focus states, labels, and screen-reader announcements against WCAG 2.2 AA.
6. Finish loading, offline, error, empty, and no-results states plus the dark theme.
7. Document API examples and refresh the runbook after the backend is selected.

## API demo routes

The local demo implements `/api/auth/login`, `/api/dashboard`, `/api/sessions`, `/api/sessions/active`, `/api/sessions/{id}/refresh-code`, `/api/sessions/{id}/close`, `/api/attendance/check-in`, `/api/sessions/{id}/attendance`, and `/api/me/attendance`. A production API, gateway, persistent database, and deployment pipeline are deliberately left for the team backlog.
