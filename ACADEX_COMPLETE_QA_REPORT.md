# Acadex Complete QA Report

## Executive summary

The available automated checks pass: the backend test suite has 32 passing tests, and the frontend production build completes. A 109-case unauthenticated API probe confirmed protected API routes reject requests without a valid session. Read-only hosted smoke checks for the landing page, login page, and health endpoint returned HTTP 200; the health response reported the database connected.

This does **not** establish that the full school workflows work end to end. Authenticated production testing and database-backed CRUD, assignment submission, grading, and cross-role synchronization were not performed. No production data was changed. The audit changes in this working tree have not been pushed or deployed.

## Scope and safety

- Reviewed authentication, role guards, assignment/resource access, dashboard queries, upload and data models, seed configuration, and the existing backend tests.
- Production checks were read-only. No production login, write operation, seed, or database mutation was attempted.
- No authenticated test account or safe test database was available for end-to-end role workflows.
- Reported secret material is intentionally omitted.

## Automated and hosted checks

| Check | Result | Notes |
|---|---|---|
| Backend tests | **PASS — 32/32** | `npm --prefix server test` |
| Frontend production build | **PASS** | `npm run build`; Vite reports an existing large-chunk advisory for the portal bundle. |
| Frontend lint | **PASS with 13 warnings** | `npm run lint` exits successfully. Warnings are unused variables, state updates in effects, and render-time date calls in existing UI files. |
| Diff whitespace validation | **PASS (CRLF-aware)** | `git -c core.whitespace=cr-at-eol diff --check`; the edited login file uses CRLF line endings. |
| Unauthenticated API matrix | **PASS — 109 method/path combinations** | The added test checks that protected endpoints reject unauthenticated requests; it does not prove role-specific access or successful data operations. |
| Hosted `GET /` and `GET /login` | **PASS** | Both returned HTTP 200. |
| Hosted `GET /api/health` | **PASS** | Returned HTTP 200 and reported the database connected. |
| Browser/UI check | **PARTIAL** | The login UI rendered locally without a prefilled password. The local API was unavailable; production credentials were not used. |

## Unit test case results

| ID | Coverage | Status | Result / limitation |
|---|---|---|---|
| U-01 | Empty email or password | **Pass** | Login validation rejects empty or malformed credentials before querying the database. |
| U-02 | Malformed email | **Pass** | Covered by the login validation test. |
| U-03 | Password hash and compare | **Pass** | Hash matches the original password. |
| U-04 | Compare wrong password | **Pass** | Password utility test confirms a different password does not match. |
| U-05 | Expired token | **Pass** | Expired access tokens are rejected before user lookup. |
| U-06 | Role guard | **Pass** | Student is denied a teacher-only action; teacher is allowed. |
| U-07 | Valid grade calculation | **Pass** | Grade percentage calculations are covered. |
| U-08 | Missing/zero-total marks | **Pass with validation** | Missing marks and zero totals are rejected without dividing by zero; the implementation returns validation errors rather than inventing a default grade. |
| U-09 | Attendance percentage | **Pass** | Valid counts and an empty denominator are covered. |
| U-10 | Date/deadline formatting | **Partial** | Timetable end-time validation is tested; locale-specific rendering and browser formatting are not comprehensively tested. |
| U-11 | Required form fields/error states | **Partial** | Login UI was inspected, but a full browser-driven form validation suite was not run. |

## Integration test case results

| ID | Flow | Status | Result / limitation |
|---|---|---|---|
| I-01 | Availability | **Pass** | Hosted landing page returns HTTP 200 with HTML. |
| I-02 | Successful login/session | **Not tested** | No authorized production credentials were used; no authenticated session was verified. |
| I-03 | Wrong password | **Not verified in this audit** | Password utility mismatch is covered by a unit test; a complete live login/session flow was not run. |
| I-04 | Logout and browser back | **Not tested** | Requires an authenticated browser session. |
| I-05 | Protected URL while logged out | **Partial** | API authentication gates passed for 109 method/path combinations. Browser redirects and protected-page history behavior were not comprehensively verified. |
| I-06 | Teacher assignment to student | **Not tested** | Requires database-backed teacher and student accounts. |
| I-07 | Attendance visible to parent | **Not tested** | Requires database-backed role accounts and persisted attendance data. |
| I-08 | Teacher grades visible to student | **Not tested** | Requires database-backed assignment/submission/evaluation workflow. |
| I-09 | API/database CRUD persistence | **Not tested** | Production database was not mutated; local database credentials were unavailable. |
| I-10 | API failure/timeout UX | **Not tested** | No controlled 500/timeout scenario was injected. |
| I-11 | Hosting/cold start | **Partial** | Hosted pages and health endpoint responded successfully during smoke checks; a controlled idle/cold-start measurement was not performed. |
| I-12 | Mobile responsiveness | **Not tested** | No viewport/device matrix was run. |

## Findings and changes made

### Credential exposure

1. A MongoDB connection credential was present in tracked environment-example files. The current working-tree examples now use a local development URI instead. **Rotate the exposed database credential immediately**; changing the current files does not remove it from Git history.
2. A shared demo password was published in project documentation/source and used as a seed fallback. The fallback was removed: seeding now requires a configured `DEMO_PASSWORD`, validates its length, and does not print it. The login screen no longer pre-fills a shared password. **Change any account password that used the disclosed value.** Historical commits may still contain it.

These are remediated in the current working tree, but the history remains sensitive until the credentials are rotated. Rewriting repository history, if desired, should be coordinated carefully and does not replace credential rotation.

### Assignment visibility correction

Student and parent dashboard assignment counts/listings are now restricted to published work intended for the relevant student(s). The student assignment resource query and dashboard queries share a visibility rule. A regression test covers class-wide assignments and student-targeted assignments. This is query-level coverage; database-backed authorization and cross-role synchronization remain unverified.

### Other limitations

- Existing backend tests do not exercise persistence, file downloads, or complete authenticated CRUD against MongoDB.
- The authentication probe verifies rejection without credentials, not each role's allowed/denied access matrix.
- The current audit did not validate exam/result publishing or any other workflow not represented by the existing tested endpoints.
- Lint has 13 warnings; they do not fail the current lint command and were not broadly changed as part of this audit.

## Files changed in the audit

- `.env.example` and `server/.env.example` — remove embedded connection details from the example configurations.
- `server/src/scripts/seed.js` — require an explicit seed password and avoid logging it.
- `src/pages/auth/AuthPage.jsx` — remove the password prefill and explain the local seed configuration.
- `README.md` and `README-RESULTS.md` — remove published demo-password instructions.
- `server/test/app.test.js` — check unauthenticated rejection across protected API routes.
- `server/src/routes/dashboard.js` and `server/src/routes/resources.js` — constrain assignment visibility by publication status and student target.
- `server/src/utils/assignmentVisibility.js` and `server/test/assignmentVisibility.test.js` — share and test the student-target visibility rule.

## Recommended next steps

1. Rotate the database credential and change any affected seeded account passwords.
2. Deploy the reviewed working-tree changes only after credential rotation and a normal code review.
3. Configure a disposable test database and dedicated student, teacher, parent, and admin accounts.
4. Add authenticated integration tests for assignment creation, upload, grading, resubmission, file access, and cross-role visibility.
5. Test logout/back navigation, API failure states, and mobile layouts in a browser test environment.
