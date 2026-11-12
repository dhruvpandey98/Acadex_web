# Acadex

Acadex is a React/Vite school portal with an Express, MongoDB, and Socket.IO backend. Authentication and the core portal views use the API for school records, attendance, assignments, grades, announcements, fees, timetables, analytics, notifications, and messaging. The AI study buddy uses a configurable OpenAI-compatible provider and stores private conversation history.

## Requirements

- Node.js 22.12 or newer (the Render deployment pins Node.js 24.22.1)
- MongoDB 6 or newer, locally or through Atlas
- npm

## Setup

```sh
npm install
cd server
npm install
```

Copy `.env.example` to `server/.env` and set unique JWT secrets (at least 32 characters each), `MONGODB_URI`, and the frontend origin. Never commit `.env`.

On Windows PowerShell, copy the example using:

```powershell
Copy-Item .env.example server\.env
```

For MongoDB Atlas, create a cluster, add a database user, and allow your client IP under **Network Access**. In Atlas, choose **Connect → Drivers** and copy the connection string. Replace `<username>` and `<password>` with the database user's credentials (URL-encode any special characters), and use `acadex` as the database name. Paste the resulting URI as the `MONGODB_URI` value in `server/.env`; do not paste it into frontend files or commit it.

Start the backend and frontend in separate terminals:

```sh
npm run dev:server
npm run dev
```

The backend waits for a successful database connection before listening. Check `http://localhost:5000/api/health`; a healthy response is `{"status":"ok","database":"connected"}`. If it reports HTTP 503 or the backend logs a connection error, verify the Atlas URI, database user/password, and Network Access IP allowlist. Vite proxies `/api` and `/socket.io` to `http://localhost:5000`. Swagger UI is available at `http://localhost:5000/api/docs`.

## Free deployment (Render and MongoDB Atlas)

The repository includes a Render Blueprint in `render.yaml`. It builds the Vite frontend and Express backend as one native Node.js web service, then serves both from the same HTTPS origin. A Dockerfile is not required: Render's Node runtime handles the build and start commands. Keeping the UI and API on one origin preserves the app's HTTP-only, `SameSite=Strict` authentication cookies.

1. Create a MongoDB Atlas free cluster, database user, and database connection string. In Atlas Network Access, allow the outbound IP ranges shown for your Render service/region. The application selects the `acadex` database. Keep the database user password URL-encoded in the connection string.
2. Push this repository to GitHub and create a Render **Blueprint** from it. Render reads `render.yaml`; choose the free web-service plan and provide the requested values:
   - `MONGODB_URI`: the Atlas connection string.
   - `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: two different, randomly generated secrets, each at least 32 characters.
3. Wait for the build and deploy to finish. Open the Render service URL; confirm `/api/health` returns `{"status":"ok","database":"connected"}`.
4. If you add a custom domain, set `CLIENT_URL` in the Render service environment to the frontend's HTTPS origin. Do not set `VITE_API_URL` for this single-origin deployment.
5. Configure optional features only if needed: `GEMINI_API_KEY` and `GEMINI_MODEL` for the academic assistant; `AI_API_KEY`, `AI_MODEL`, and optionally `AI_BASE_URL` for the AI study buddy. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM` for registration verification, account notifications, and password-reset email. Set `SCHOOL_EMAIL_DOMAINS` to a comma-separated list of school email domains and `ADMIN_EMAIL` to notify when an account uses another domain. Configure Google sign-up with the same OAuth client ID in server `GOOGLE_CLIENT_ID` and frontend build-time `VITE_GOOGLE_CLIENT_ID`. Keep credentials in Render's environment settings, never in source control.

Render's free web services sleep after 15 minutes without traffic and can take about a minute to wake. Their local filesystem is ephemeral. New uploads are stored in MongoDB so they survive service restarts and deploys; keep in mind the Atlas free cluster has limited storage, and each upload is capped at 10 MiB.

The seed script is development-only and creates accounts with a shared password. Configure a unique `DEMO_PASSWORD` before seeding; the repository does not provide a default. Do not seed a public deployment or use this free setup for real student records: free hosting is intended for demos and testing, not production workloads or sensitive education data. Public registration creates student accounts only. All sign-ups activate after email verification; accounts using domains outside `SCHOOL_EMAIL_DOMAINS` also notify `ADMIN_EMAIL`. Admin, teacher, and parent roles are not available through public registration.

For a disposable demo that needs the seeded admin, teacher, and parent accounts, set a unique `DEMO_PASSWORD` in Render's environment settings, then run `NODE_ENV=development npm --prefix server run seed` from the Render Shell. This command seeds data without changing the deployed service's `NODE_ENV`. Use only a disposable database and a unique password; do not use demo accounts for real student records.

## Importing the synthetic dataset

The synthetic CSV tables in `server/data/acadex-dataset` are imported into separate `dataset_*` MongoDB collections; the import does not modify the app's normal school records. The admin portal's **Dataset insights** page reads aggregate summaries and the synthetic master-student table only; it does not display the health time-series table.

After deploying the importer code and CSV files, run this once from the Render Shell:

```sh
ALLOW_DATASET_IMPORT=yes npm --prefix server run import:dataset
```

The importer requires this explicit production opt-in, upserts rows by stable source keys, and does not delete existing documents. It reports row counts after completion; rerunning the command is safe. Confirm the Render logs show all 12 collections imported, then sign in as an admin and open `/portal/dataset-insights`. Do not run the demo-account seed command as a substitute.

## Demo data

Set a unique `DEMO_PASSWORD` in `server/.env` before seeding. The seed command does not provide a built-in password. Then run:

```sh
npm run seed
```

The seed command requires `NODE_ENV=development` and is idempotent for its demo records. For a new Atlas database, run this after configuring `server/.env` and verifying Atlas access. Restart `npm run dev:server` after changing the environment file, then sign in through `http://localhost:5173/login` with one of the demo emails and the configured demo password.

| Role | Email |
|---|---|
| Admin | `admin@acadex.demo` |
| Teacher | `teacher@acadex.demo` |
| Student | `student@acadex.demo` |
| Parent | `parent@acadex.demo` |

There is no shared default demo password. Set a unique `DEMO_PASSWORD` in the server environment before running the seed command, then enter it manually at sign-in. The seed also creates 10 teachers, 100 students, 20 parent accounts, 10 classes, subjects, attendance, assignments, submissions, grades, fees, announcements, notifications, and timetable rows. Additional teacher/student/parent accounts follow the `teacherN@acadex.demo`, `studentNNN@acadex.demo`, and `parentNN@acadex.demo` patterns and use the configured seed password.

Public registration creates student accounts only. Admin, teacher, and parent demo accounts are provisioned by the development seed; there is no public admin registration endpoint.

Admins can create linked student and teacher accounts from the portal by supplying a unique admission/employee number and a temporary password. Share the temporary password securely with the account holder.

## Authentication and security

- Access JWTs expire after 15 minutes; refresh JWTs expire after 7 days and rotate on refresh.
- Both tokens are stored in HTTP-only, same-site cookies; only a password-free user profile is returned by auth endpoints.
- Passwords use bcrypt with 12 rounds. Refresh tokens and reset tokens are persisted only as SHA-256 digests.
- Login, registration, and verification endpoints have rate limits. Registration requires SMTP configuration (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM`); non-school sign-ups also require `ADMIN_EMAIL`. Password reset also requires SMTP configuration; when mail is not configured, the API reports an error rather than pretending an email was sent.
- Roles and record ownership are checked on the server. Admin accounts cannot be created through public registration.
- Uploads are limited to 10 MiB and PDF, PNG, JPEG, WebP, or plain-text MIME types. File content is stored in MongoDB so it persists across service restarts.
- Fee records are status tracking only; no payment gateway is connected.
- AI tutor requests run server-side using the OpenAI-compatible provider configured by `AI_API_KEY`, `AI_MODEL`, and optionally `AI_BASE_URL`. Keep the provider key in the server environment only. The chat is explicitly unavailable until configured; requests are rate limited and chat history is private to the authenticated user.
- School record, dashboard, messaging, and notification screens read from MongoDB-backed API endpoints. Class/subject catalogs, grades, fees, and timetable are currently read-only in the portal UI; their API resources support role-scoped CRUD where authorized.

## API overview

All endpoints are prefixed with `/api`.

| Area | Routes |
|---|---|
| Auth | `POST /auth/register`, `/login`, `/logout`, `/refresh`, `/forgot-password`, `/reset-password`; `GET /auth/me`; `PATCH /auth/change-password` |
| School records | CRUD collections at `/parents`, `/students`, `/teachers`, `/classes`, `/subjects`, `/attendance`, `/assignments`, `/submissions`, `/grades`, `/announcements`, `/fees`, `/timetable`; `PATCH /users/:id/status` is admin-only |
| Attendance | `POST /attendance/bulk`, `GET /attendance/summary`, `GET /attendance/student/:studentId` |
| Submissions | `PUT /submissions/:id/review` |
| Messaging | `GET /conversations`, `POST /conversations`, `GET /messages/:conversationId`, `POST /messages`, `PATCH /messages/:id/read` |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` |
| Analytics | `GET /dashboard/admin`, `/teacher`, `/student`, `/parent` |
| Uploads | `POST /uploads` (multipart field `file`), `GET /uploads/:id` |
| AI study buddy | `GET /ai/conversations`, `POST /ai/conversations`, `GET`/`DELETE /ai/conversations/:id`, `POST /ai/conversations/:id/messages` |

Collection list responses use `{ data, pagination }`; create and single-record responses use `{ data }`. List endpoints accept `page` and `limit` (maximum 100). Attendance is unique by student and UTC calendar day. Authenticated sockets join their own `user:<id>` room; joining `conversation:<id>` requires conversation membership. Events include `message:new`, `notification:new`, `assignment:new`, `announcement:new`, and `attendance:update`.

## Development and tests

```sh
npm run lint
npm run build
cd server
npm test
```

Seed data is for local development only. Without seed data, empty collections and zero/empty dashboard metrics are expected. The study buddy requires server-side provider configuration; do not add provider credentials to frontend environment variables.
