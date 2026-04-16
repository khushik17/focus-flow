# To-Do List App (Node.js + Express + MongoDB + React)

A simple task management REST API where users can:

- Create tasks with title and description
- View all tasks
- Mark tasks as completed
- Edit task details
- Delete tasks

The project includes a React browser UI, MongoDB persistence, input validation, meaningful error responses, reminder API integration, and unit tests.

## Features

- Task CRUD operations
- React-based frontend (Vite in `client/`, served by Express in production)
- MongoDB persistence with Mongoose
- Validation for non-empty task title
- Guard against marking an already-completed task as complete again
- Centralized error handling middleware
- Smart search and filtering (status, priority, category)
- Multiple sort modes (created date, due date, title, priority)
- Priority levels (low, medium, high)
- Reminder timestamp support and overdue indicators
- API-driven reminder delivery endpoint with deduping (`reminderSentAt`)
- Analytics dashboard (completion rate, overdue count, due-soon count, category chart)
- Bonus features:
  - Due dates
  - Categories
- Unit tests with Jest + Supertest (mocked data layer)

## Internship Requirement Checklist

### Task Management

- Create tasks with title and description: Implemented (`POST /api/tasks`)
- View list of tasks: Implemented (`GET /api/tasks`)
- Mark task as completed: Implemented (`PATCH /api/tasks/:id/complete`)
- Edit task details: Implemented (`PATCH /api/tasks/:id`)
- Delete tasks: Implemented (`DELETE /api/tasks/:id`)

### Persistence

- MongoDB + Mongoose used for storage
- Tasks are persisted and retrieved from database

### Validation

- Empty title is rejected with meaningful error
- Duplicate completion is blocked with meaningful error
- Priority/status/sort/date validation is implemented
- Centralized error middleware for graceful error handling

### Documentation

- Setup instructions included
- API endpoint documentation included
- Code structure and design decisions included

### Bonus Features

- Due dates: Implemented
- Categories: Implemented
- Unit tests: Implemented

## Tech Stack

- Backend Runtime: Node.js
- API Framework: Express.js
- Database: MongoDB
- ODM: Mongoose
- Frontend: React + Vite
- Testing: Jest + Supertest
- Dev Tooling: Nodemon

## Landing and Auth UI

- Added an eye-catching landing page (`Home`) for first impression
- Added login and signup UI modal flow in the React frontend
- Protected pages use local auth state plus backend header verification on task APIs

## Project Structure

```text
.
├── src
│   ├── config
│   │   └── db.js                 # MongoDB connection
│   ├── controllers
│   │   └── tasks.controller.js   # Request handlers/business logic
│   ├── middleware
│   │   └── error.middleware.js   # Centralized not-found and error handlers
│   ├── models
│   │   └── Task.js               # Mongoose task schema/model
│   ├── routes
│   │   └── tasks.routes.js       # Task API routes
│   ├── utils
│   │   └── asyncHandler.js       # Async error wrapper
│   ├── app.js                    # Express app setup
│   └── server.js                 # Server startup + DB connection
├── client
│   ├── index.html                # React entry HTML
│   ├── package.json              # React/Vite app package
│   └── src
│       ├── App.jsx              # React UI and app logic
│       ├── main.jsx             # React mount point
│       └── styles.css           # React styles
├── tests
│   └── tasks.test.js             # API tests (mocked model)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Setup Instructions

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file from `.env.example`:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/todo_app
NODE_ENV=development
```

### 3. Run the app

Development mode:

```bash
npm run dev
```

React frontend development mode:

```bash
npm run client:dev
```

Production/start mode:

```bash
npm start
```

`npm start` builds the React client and then starts the Express server.

Server starts on `http://localhost:5000` by default. React dev server runs on `http://localhost:5173`.

### 4. Open the frontend

In production, visit `http://localhost:5000`.

In development, visit the Vite URL shown by `npm run client:dev`.

You can:

- Create tasks from the form
- Edit a task from the task card
- Mark a task as completed
- Delete tasks
- View task counts (total/open/done)
- Search tasks by title/description
- Filter by status, priority, and category
- Sort by due date, title, priority, or creation time
- Track reminders and overdue tasks
- View analytics insights

The API health check endpoint is available at `GET /api/health`.

Reminder behavior:

- Backend decides which reminders are due.
- Frontend polls the reminder endpoint and triggers browser notification + alarm sound.
- Each due reminder is marked as sent by backend so it is not emitted repeatedly.

## API Endpoints

Base URL: `/api/tasks`

### Create a task

- `POST /api/tasks`

Body example:

```json
{
  "title": "Buy groceries",
  "description": "Milk, eggs, bread",
  "dueDate": "2026-05-01T00:00:00.000Z",
  "category": "Personal",
  "priority": "high",
  "reminderAt": "2026-04-30T09:00:00.000Z"
}
```

### Get all tasks

- `GET /api/tasks`

Supported query params:

- `q` search term for title/description
- `status` values: `open`, `completed`
- `category` exact category match
- `priority` values: `low`, `medium`, `high`
- `sortBy` values: `createdAt_desc`, `createdAt_asc`, `dueDate_asc`, `dueDate_desc`, `title_asc`, `title_desc`, `priority_desc`, `priority_asc`
- `dueFrom` and `dueTo` ISO date values

### Get due reminders (API integrated)

- `GET /api/tasks/reminders/due`

Response behavior:

- Returns reminders that are due (`reminderAt <= now`) and not yet sent.
- Marks returned reminders as sent using `reminderSentAt`.
- Prevents duplicate reminder delivery on next polls.

### Edit task details

- `PATCH /api/tasks/:id`

Body example:

```json
{
  "title": "Buy groceries and fruits",
  "description": "Milk, eggs, bread, apples",
  "category": "Home",
  "priority": "medium",
  "reminderAt": null
}
```

### Mark task as completed

- `PATCH /api/tasks/:id/complete`

### Delete a task

- `DELETE /api/tasks/:id`

## Validation and Error Handling

- Task title must not be empty.
- Priority must be one of: `low`, `medium`, `high`.
- Status filter must be one of: `open`, `completed`.
- `sortBy` must be a supported sort option.
- Date fields (`dueDate`, `reminderAt`, `dueFrom`, `dueTo`) must be valid dates.
- `dueFrom` cannot be greater than `dueTo`.
- If a task is already completed, trying to complete it again returns a `400` error.
- Invalid IDs return a `400` error.
- Missing tasks return a `404` error.
- Unknown routes return a `404` error.
- Validation issues return meaningful messages.

## Run Tests

```bash
npm test
```

## Key Design Decisions

- React frontend is kept in `client/` so UI work is isolated from backend logic.
- Express serves the React production build when it exists, with SPA fallback for client routes.
- Task APIs remain backend-driven and protected by header verification middleware.

- **Mongoose schema validation** is used to keep data integrity close to the data model.
- **Controller-level checks** handle business rules (for example, preventing duplicate completion and validating query filters).
- **Centralized error middleware** keeps route handlers clean and standardizes API error responses.
- **Reminder API endpoint** keeps reminder scheduling logic on backend and avoids duplicate alerts with `reminderSentAt`.
- **Mocked model methods in tests** keep tests fast and independent from external services.
