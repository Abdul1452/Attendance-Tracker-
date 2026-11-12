# Attendance Tracker

An academic attendance system for instructors, administrators, and students. The project is planned as a documented REST API with responsive web and mobile experiences. Its goal is to make class attendance quick to record, easy to review, and traceable when records need correction.

> **Project status:** This repository currently contains the project README only. The architecture and UI prototype are proposals; backend and client application source code, API documentation, and run instructions will be added as implementation begins.

## Planned capabilities

- Manage courses, user accounts, enrollments, and class sessions.
- Record attendance manually as **Present**, **Absent**, **Late**, or **Excused**.
- Let an instructor open a session-bound QR check-in window. Students sign in, scan the code, confirm their check-in, and see a receipt. The teacher's roster reflects saved check-ins.
- Correct records with an optional reason and retain who made the change and when.
- Let students review their own attendance history.
- Provide course, student, and date-range attendance summaries and reports.

## QR check-in design

The QR code identifies the active class session; it does not identify or authenticate a student. Students must sign in, and the system uses the student's account to record their identity. QR tokens are intended to be unpredictable, short-lived, limited to one active session, and rotated during check-in. The system should prevent duplicate records for the same student and session. The instructor's roster should refresh from persisted attendance records.

## Proposed architecture

The backend is planned as a statically typed REST API using Clean Architecture boundaries:

- **API:** HTTP endpoints, authentication and authorization, request/response mapping, validation responses, and Swagger/OpenAPI.
- **Application:** use cases such as starting session check-in, recording or correcting attendance, and querying reports.
- **Domain:** course, enrollment, session, attendance record, and attendance policy rules.
- **Infrastructure:** database access, migrations, repository implementations, and audit logging.

Web and mobile clients call the API through an API Gateway. Application and domain rules remain independent of the web framework and database implementation. A modular monolith with a relational database is the current proposal; the technology stack and deployment approach remain subject to instructor approval.

## Design prototype

The responsive web and student mobile prototype, design system, QR flow, and UI-state examples are available in [Figma Make](https://www.figma.com/make/PorOMg0hT9GjNiXGa06Z98/Attendance-Tracker-Prototype?t=HyRmVDl3OcgbmsN9-0).

## API and documentation

The planned API will use resource-oriented REST endpoints, validation, appropriate HTTP status codes, and consistent error responses. Interactive Swagger/OpenAPI documentation will be added when the API is implemented.

## Setup and running

Setup and run commands are not available yet because this repository does not contain application source code. This section will be completed with the required runtimes, database configuration, migrations, startup commands, API URL, and Swagger URL once implementation is added.

## Assumptions and current scope

- The first release targets one academic institution or course cohort.
- Instructors and administrators manage the roster; students can view their own history and check in to an active session.
- QR check-in requires student sign-in. Name-only anonymous check-in is not part of the proposal.
- Geolocation, biometrics, payroll, timetabling, and learning-management-system integration are outside the initial scope.
- Authentication provider, retention policy, exact QR rotation interval, production availability targets, and deployment environment remain to be decided.

## Development notes

The course assignment requires the team to document architectural decisions, trade-offs, AI use, installation and run instructions, and the interactive REST API. These sections should be kept current as the project is implemented.
