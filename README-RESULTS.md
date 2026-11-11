# QA Test Results for Acadex Demo

## Target
- Website: https://acadex-web.onrender.com/
- Login demo credentials:
  - Email: admin@acadex.demo
  - Password: Configure `DEMO_PASSWORD` locally; credentials are not stored in this repository.

## Snapshot Summary
This test pass focused on the live demo environment and the browser behavior after login.

### Verified outcome
- The landing page loads successfully.
- The login form accepts the demo credentials.
- After login, the UI redirects to the portal dashboard.
- However, the app does not appear to establish a real authenticated session in the browser.
- Protected API requests are returning 401 responses.
- Route protection and role enforcement are not consistently implemented in a real, secure session flow.

## Detailed Results

### Unit Test Cases

| ID | Component | Test case | Expected | Status | Result |
|---|---|---|---|---|---|
| U-01 | Auth validator | Empty email or password | Validation error shown | Not confirmed | n/a |
| U-02 | Auth validator | Malformed email (abc@) | Rejected | Not confirmed | n/a |
| U-03 | Password util | Hash and compare the same password | Match returns true | Not verifiable in browser | n/a |
| U-04 | Password util | Compare a wrong password | Returns false | Confirmed | Login shows “Email or password is incorrect.” |
| U-05 | Token/session | Expired token | Rejected | Not confirmed | n/a |
| U-06 | Role guard | Student requests a teacher-only action | Denied | Not confirmed | n/a |
| U-07 | Grade calc | Average of valid marks | Correct value | Not confirmed | n/a |
| U-08 | Grade calc | Empty or null marks | No crash, sensible default | Not confirmed | n/a |
| U-09 | Attendance | Percentage calculation (present/total) | Correct, no divide-by-zero | Not confirmed | n/a |
| U-10 | Date utils | Timetable or deadline formatting | Correct locale and format | Partially observed | Static demo values appear formatted |
| U-11 | Form components | Required fields and error states | Render correctly | Partially observed | Basic form and alert behavior are visible |

### Integration Test Cases

| ID | Flow | Test case | Expected | Status | Result |
|---|---|---|---|---|---|
| I-01 | Availability | GET / | 200 + HTML | Pass | Page loads successfully |
| I-02 | Login | Demo credentials | Redirect to dashboard, session set | Fail | Redirect works visually, but no real authenticated session is established |
| I-03 | Login | Wrong password | Error, no session | Pass | Error message appears correctly |
| I-04 | Logout | Sign out, then press back | Protected page not accessible | Fail | Logout not reliably enforced in browser flow |
| I-05 | Authorization | Open a protected URL while logged out | Redirect to login | Fail | Protected URLs still behave inconsistently and show 401 patterns |
| I-06 | Role flow | Teacher posts an assignment, student sees it | Appears for the right class only | Not validated | n/a |
| I-07 | Role flow | Teacher marks attendance, parent sees it | Data consistent across roles | Not validated | n/a |
| I-08 | Grades | Teacher enters marks, student’s gradebook updates | Values match | Not validated | n/a |
| I-09 | API/DB | Create, read, update, delete a record | Persisted and returned correctly | Fail | No reliable session-backed DB behavior observed |
| I-10 | Error handling | API returns 500 or times out | Friendly error, UI doesn’t break | Not validated | n/a |
| I-11 | Hosting | First request after idle on Render free tier | Cold start delay, page still loads | Partially observed | Initial page loads were acceptable |
| I-12 | Responsive | Mobile viewport rendering | No layout break | Not validated | n/a |

## Risk Assessment

### Main issues found
1. No real browser session or authentication cookie after login.
2. Protected endpoints return 401 responses.
3. Unauthorized access control is not strong enough to be considered production-ready.
4. The current deployment behaves more like a mocked UI/demo than a fully authenticated application.

### Overall verdict
The application is usable as a demo front-end and the basic login flow is visible, but it is not ready to be treated as a fully functional authenticated school portal. Real session management, backend authorization, and role-based access need to be verified and hardened before it can be considered reliable for testing or production use.

## Notes
- The demo password is configured in the application and is not a hidden secret in this environment.
- The testing was performed via the live hosted deployment rather than a local development build.
