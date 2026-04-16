const request = require('supertest');
const app = require('../src/app');
const Task = require('../src/models/Task');

jest.mock('../src/models/Task');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Task API', () => {
  it('creates a task successfully', async () => {
    Task.create.mockResolvedValue({
      _id: 'task_1',
      title: 'Write report',
      description: 'Draft the weekly report',
      category: 'Work',
      completed: false
    });

    const response = await request(app).post('/api/tasks').send({
      title: 'Write report',
      description: 'Draft the weekly report',
      category: 'Work'
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.title).toBe('Write report');
    expect(response.body.completed).toBe(false);
  });

  it('returns validation error for empty title', async () => {
    const response = await request(app).post('/api/tasks').send({
      title: '   '
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe('Task title cannot be empty.');
  });

  it('returns validation error for invalid priority', async () => {
    const response = await request(app).post('/api/tasks').send({
      title: 'Valid title',
      priority: 'urgent'
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe('Priority must be low, medium, or high.');
  });

  it('lists all tasks', async () => {
    const sortMock = jest.fn().mockResolvedValue([
      { _id: 'task_1', title: 'Task 1' },
      { _id: 'task_2', title: 'Task 2' }
    ]);

    Task.find.mockReturnValue({ sort: sortMock });

    const response = await request(app).get('/api/tasks');

    expect(response.statusCode).toBe(200);
    expect(response.body.length).toBe(2);
  });

  it('marks a task as completed and blocks duplicate completion', async () => {
    const saveMock = jest.fn().mockResolvedValue(true);
    Task.findById
      .mockResolvedValueOnce({ _id: 'task_3', title: 'Finish assignment', completed: false, save: saveMock })
      .mockResolvedValueOnce({ _id: 'task_3', title: 'Finish assignment', completed: true, save: saveMock });

    const completeResponse = await request(app).patch('/api/tasks/task_3/complete');
    expect(completeResponse.statusCode).toBe(200);
    expect(completeResponse.body.completed).toBe(true);

    const duplicateComplete = await request(app).patch('/api/tasks/task_3/complete');
    expect(duplicateComplete.statusCode).toBe(400);
    expect(duplicateComplete.body.message).toBe('Task is already completed.');
  });

  it('edits task details', async () => {
    const task = {
      _id: 'task_4',
      title: 'Old title',
      description: 'Old desc',
      completed: false,
      dueDate: null,
      category: '',
      save: jest.fn().mockImplementation(function save() {
        return Promise.resolve(this);
      })
    };

    Task.findById.mockResolvedValue(task);

    const response = await request(app).patch('/api/tasks/task_4').send({
      title: 'New title',
      description: 'Updated description',
      dueDate: '2026-05-01T00:00:00.000Z',
      category: 'Personal'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.title).toBe('New title');
    expect(response.body.description).toBe('Updated description');
    expect(response.body.category).toBe('Personal');
  });

  it('deletes a task', async () => {
    Task.findByIdAndDelete.mockResolvedValue({ _id: 'task_5', title: 'Delete me' });

    const response = await request(app).delete('/api/tasks/task_5');

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe('Task deleted successfully.');
  });
});
