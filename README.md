# Examly Express server

The Express server serves the existing Examly pages and exposes JSON REST APIs for managing courses and exam questions. Data is saved to `data/db.json` and survives server restarts.
The admin dashboard includes a **Manage courses** page to add, edit, and delete courses. Student exam registration displays the saved course catalog. If the app is opened from a static file server that does not provide the Express API, course changes are saved to that browser's `localStorage` instead.

## Run

Requires Node.js 18 or newer.

```powershell
npm install
npm start
```

Open `http://localhost:3000`. Set `PORT` to change the port. Set `DATA_FILE` to use a different JSON data file.

## API

Send JSON request bodies with `Content-Type: application/json`.

| Method | Path | Action |
| --- | --- | --- |
| GET | `/api/health` | Check that the server is running |
| GET | `/api/courses` | List courses |
| GET | `/api/courses/:id` | Get one course |
| POST | `/api/courses` | Add a course |
| PUT | `/api/courses/:id` | Replace a course |
| PATCH | `/api/courses/:id` | Update selected course fields |
| DELETE | `/api/courses/:id` | Delete a course |
| GET | `/api/questions` | List questions |
| GET | `/api/questions/:id` | Get one question |
| POST | `/api/questions` | Insert a question |
| PUT | `/api/questions/:id` | Replace a question |
| PATCH | `/api/questions/:id` | Update selected question fields |
| DELETE | `/api/questions/:id` | Delete a question |

Question data has a `question` string, exactly four `options` strings, and an `answer` integer from 1 to 4.
Course data has `name`, `category`, `duration`, and `icon` strings plus a non-negative numeric `fee`.

### Examples

```powershell
# Add a course
curl.exe -X POST http://localhost:3000/api/courses `
  -H "Content-Type: application/json" `
  -d '{"name":"Data Science","category":"Data","duration":"60 min","fee":900,"icon":"📊"}'

# Change a course fee (replace the ID with the ID returned by POST)
curl.exe -X PATCH http://localhost:3000/api/courses/COURSE_ID `
  -H "Content-Type: application/json" `
  -d '{"fee":950}'

# Delete a course
curl.exe -X DELETE http://localhost:3000/api/courses/COURSE_ID

# Insert
curl.exe -X POST http://localhost:3000/api/questions `
  -H "Content-Type: application/json" `
  -d '{"question":"What is 2 + 2?","options":["2","3","4","5"],"answer":3}'

# List
curl.exe http://localhost:3000/api/questions

# Update one field (replace the ID with the ID returned by POST)
curl.exe -X PATCH http://localhost:3000/api/questions/QUESTION_ID `
  -H "Content-Type: application/json" `
  -d '{"question":"What is 3 + 1?"}'

# Delete
curl.exe -X DELETE http://localhost:3000/api/questions/QUESTION_ID
```

The server includes request logging, JSON body parsing with a size limit, input validation, JSON 404 responses for unknown API routes, and a centralized error handler. It is a learning/demo API and does not include authentication or production database concurrency controls.
