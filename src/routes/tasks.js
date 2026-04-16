const express = require('express');
const Task = require('../models/Task');

const router = express.Router();

// ─── Helper Functions ──────────────────────────────────────
const ALLOWED_PRIORITIES = ['low', 'medium', 'high'];
const ALLOWED_STATUS = ['open', 'completed'];

const SORT_MAP = {
  createdAt_desc: { createdAt: -1 },
  createdAt_asc: { createdAt: 1 },
  dueDate_asc: { dueDate: 1, createdAt: -1 },
  dueDate_desc: { dueDate: -1, createdAt: -1 },
  title_asc: { title: 1 },
  title_desc: { title: -1 },
  priority_desc: { priority: -1, createdAt: -1 },
  priority_asc: { priority: 1, createdAt: -1 }
};

const isValidPriority = (value) => ALLOWED_PRIORITIES.includes(value);

const parseDateInput = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'INVALID_DATE';
  }
  return parsed;
};

const ensureNonEmptyTitle = (title) => {
  if (!title || !title.trim()) {
    return 'Task title cannot be empty.';
  }
  return null;
};

const buildTaskQuery = (queryParams) => {
  const {
    q,
    status,
    category,
    priority,
    dueFrom,
    dueTo
  } = queryParams;

  const query = {};

  if (q && q.trim()) {
    const regex = new RegExp(q.trim(), 'i');
    query.$or = [{ title: regex }, { description: regex }];
  }

  if (status) {
    if (!ALLOWED_STATUS.includes(status)) {
      return { error: 'Status must be open or completed.' };
    }
    query.completed = status === 'completed';
  }

  if (category && category.trim()) {
    query.category = category.trim();
  }

  if (priority) {
    if (!isValidPriority(priority)) {
      return { error: 'Priority must be low, medium, or high.' };
    }
    query.priority = priority;
  }

  const parsedDueFrom = parseDateInput(dueFrom);
  const parsedDueTo = parseDateInput(dueTo);

  if (parsedDueFrom === 'INVALID_DATE' || parsedDueTo === 'INVALID_DATE') {
    return { error: 'dueFrom and dueTo must be valid dates.' };
  }

  if (parsedDueFrom && parsedDueTo && parsedDueFrom > parsedDueTo) {
    return { error: 'dueFrom cannot be greater than dueTo.' };
  }

  if (parsedDueFrom || parsedDueTo) {
    query.dueDate = {};
    if (parsedDueFrom) query.dueDate.$gte = parsedDueFrom;
    if (parsedDueTo) query.dueDate.$lte = parsedDueTo;
  }

  return { query };
};

// ─── POST /api/tasks ──────────────────────────────────────
// Create new task
router.post('/', async (req, res) => {
  try {
    const {
      title,
      description = '',
      dueDate = null,
      category = '',
      priority = 'medium',
      reminderAt = null
    } = req.body;

    const titleError = ensureNonEmptyTitle(title);
    if (titleError) {
      return res.status(400).json({ message: titleError });
    }

    if (!isValidPriority(priority)) {
      return res.status(400).json({ message: 'Priority must be low, medium, or high.' });
    }

    const parsedDueDate = parseDateInput(dueDate);
    if (parsedDueDate === 'INVALID_DATE') {
      return res.status(400).json({ message: 'dueDate must be a valid date.' });
    }

    const parsedReminderAt = parseDateInput(reminderAt);
    if (parsedReminderAt === 'INVALID_DATE') {
      return res.status(400).json({ message: 'reminderAt must be a valid date.' });
    }

    const task = await Task.create({
      title: title.trim(),
      description,
      dueDate: parsedDueDate,
      category,
      priority,
      reminderAt: parsedReminderAt,
      reminderSentAt: null
    });

    return res.status(201).json(task);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/tasks ────────────────────────────────────────
// Get all tasks with filters and sorting
router.get('/', async (req, res) => {
  try {
    const {
      sortBy = 'createdAt_desc',
      ...queryParams
    } = req.query;

    const { query, error } = buildTaskQuery(queryParams);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const sort = SORT_MAP[sortBy];
    if (!sort) {
      return res.status(400).json({ message: 'Invalid sortBy value.' });
    }

    const tasks = await Task.find(query).sort(sort);
    return res.status(200).json(tasks);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/tasks/reminders/due ──────────────────────────
// Get tasks with reminders due now
router.get('/reminders/due', async (req, res) => {
  try {
    const now = new Date();
    const dueReminders = await Task.find({
      completed: false,
      reminderAt: { $ne: null, $lte: now },
      $or: [{ reminderSentAt: null }, { reminderSentAt: { $exists: false } }]
    }).sort({ reminderAt: 1, createdAt: 1 });

    if (dueReminders.length > 0) {
      const ids = dueReminders.map((task) => task._id);
      await Task.updateMany(
        { _id: { $in: ids } },
        { $set: { reminderSentAt: now } }
      );
    }

    return res.status(200).json(dueReminders);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/tasks/:id ─────────────────────────────────
// Update task
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (typeof updates.title === 'string') {
      const titleError = ensureNonEmptyTitle(updates.title);
      if (titleError) {
        return res.status(400).json({ message: titleError });
      }
    }

    if (typeof updates.priority === 'string' && !isValidPriority(updates.priority)) {
      return res.status(400).json({ message: 'Priority must be low, medium, or high.' });
    }

    const parsedDueDate = Object.prototype.hasOwnProperty.call(updates, 'dueDate')
      ? parseDateInput(updates.dueDate)
      : undefined;

    if (parsedDueDate === 'INVALID_DATE') {
      return res.status(400).json({ message: 'dueDate must be a valid date.' });
    }

    const parsedReminderAt = Object.prototype.hasOwnProperty.call(updates, 'reminderAt')
      ? parseDateInput(updates.reminderAt)
      : undefined;

    if (parsedReminderAt === 'INVALID_DATE') {
      return res.status(400).json({ message: 'reminderAt must be a valid date.' });
    }

    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'completed')) {
      if (updates.completed === true && task.completed === true) {
        return res.status(400).json({ message: 'Task is already completed.' });
      }
      task.completed = updates.completed;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'title')) {
      task.title = updates.title.trim();
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'description')) {
      task.description = updates.description;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'dueDate')) {
      task.dueDate = parsedDueDate;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'category')) {
      task.category = updates.category;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'priority')) {
      task.priority = updates.priority;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'reminderAt')) {
      task.reminderAt = parsedReminderAt;
      task.reminderSentAt = null;
    }

    const savedTask = await task.save();
    return res.status(200).json(savedTask);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/tasks/:id/complete ────────────────────────
// Mark task as complete
router.patch('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    if (task.completed) {
      return res.status(400).json({ message: 'Task is already completed.' });
    }

    task.completed = true;
    await task.save();

    return res.status(200).json(task);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/tasks/:id ────────────────────────────────
// Delete task
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findByIdAndDelete(id);

    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    return res.status(200).json({ message: 'Task deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

module.exports = router;
