# Examly

Examly is an existing HTML/CSS/JavaScript student and administrator portal served by an Express API. MongoDB stores courses, questions, users, results, payments, and sessions. The project has no automated test script configured.

## Run locally

Requires Node.js 20.19 or newer, npm, and a running MongoDB server.

```powershell
npm install
$env:MONGODB_URI = 'mongodb://127.0.0.1:27017'
$env:MONGODB_DB = 'examly'
npm start
```

Open `http://localhost:3000`. The API defaults to local MongoDB and database `examly` if the MongoDB variables are not set. Existing database records are retained. `data/db.json` is used only as an initial import source when the `initial-data-loaded` marker is absent and MongoDB collections are empty.

To provision an administrator, set `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` in the server process environment before its first start. The password must be at least 12 characters. An account is created only if that email does not already exist; this bootstrap does not reset existing passwords. Student accounts are created through the registration page.

## Production requirements

Set `NODE_ENV=production`, `MONGODB_URI`, `MONGODB_DB`, `SESSION_SECRET` (at least 32 characters), and administrator bootstrap variables when creating the first admin. Use a managed secret store or the hosting provider's environment configuration; do not put secrets in source control. Production uses secure session cookies and will not start without MongoDB and a session secret. Serve the app over HTTPS and use a MongoDB account with only the access this app needs.

The application uses MongoDB-backed sessions with an expiry index. Run one application instance for the course/question administration APIs; those two in-memory catalogs are persisted to MongoDB after a write but are loaded into each process at startup.

## Implemented workflows

- Student registration, sign in, sign out, and profile updates
- Student course registration and a timed, server-scored multiple-choice assessment
- Student result history and dashboard summary
- Admin course and question create, update, and delete operations
- Admin student, result, payment, and progress views
- Role checks for protected APIs, input validation, hidden answer keys on student exam routes, and blocked static access to backend/data/backup files

Payments are **not integrated**. The checkout page is explicitly a demo registration flow and does not process money or create payment transactions. Faculty accounts and payment-provider integration are not implemented. Configure an actual payment provider before accepting payments.

## API

Send JSON request bodies with `Content-Type: application/json`. Authenticated routes use the server session cookie.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | Server/database health |
| POST | `/api/auth/register` | Public | Create a student account |
| POST | `/api/auth/login` | Public | Student sign in |
| POST | `/api/auth/admin-login` | Public | Admin sign in |
| GET | `/api/auth/me` | Signed in | Current session user |
| POST | `/api/auth/logout` | Public | End the current session |
| GET | `/api/courses` | Public | List courses |
| GET | `/api/courses/:id` | Public | Get course details |
| POST, PUT, PATCH, DELETE | `/api/courses...` | Admin | Manage courses |
| GET | `/api/questions` and `/api/questions/:id` | Admin | Read question bank with answer keys |
| POST, PUT, PATCH, DELETE | `/api/questions...` | Admin | Manage questions |
| GET | `/api/exams/:courseId/questions` | Registered student | Get exam questions without answer keys |
| POST | `/api/exams/:courseId/submit` | Registered student | Score answers and store a result |
| GET, PUT | `/api/students/me` | Student | Read/update own profile |
| POST | `/api/students/me/registrations` | Student | Save course registration (demo checkout) |
| GET | `/api/students` | Admin | List students without password hashes |
| GET | `/api/results` | Signed in | List own results (student) or all results (admin) |
| GET | `/api/payments` | Admin | List payment records; currently empty unless a provider is implemented |
| GET | `/api/admin/summary` | Admin | Dashboard counts |

## Repository notes

The `origin` Git remote is configured. `render.yaml` defines a Render web service and prompts for MongoDB/admin secrets during setup; create the Render Blueprint from the repository and provide an externally hosted MongoDB connection string. The project has no automated test suite. Backups made before this work are ignored by Git and are not served by Express. Existing uncommitted project changes were preserved.
