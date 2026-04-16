import { useEffect, useMemo, useState } from "react";

const AUTH_STORAGE_KEY = "task-orbit-auth-profile";
const FILTER_PRESET_STORAGE_KEY = "task-orbit-filter-presets";
const PROTECTED_PAGES = new Set(["dashboard", "tasks", "analytics"]);

const defaultFilters = {
  q: "",
  status: "",
  priority: "",
  category: "",
  sortBy: "createdAt_desc"
};

const defaultForm = {
  title: "",
  description: "",
  category: "",
  priority: "medium",
  dueDate: "",
  reminderAt: ""
};

const priorityRank = { low: 1, medium: 2, high: 3 };

const isOverdue = (task) => {
  if (task.completed || !task.dueDate) return false;
  const due = new Date(task.dueDate);
  due.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return due < now;
};

const isDueSoon = (task) => {
  if (task.completed || !task.dueDate) return false;
  const due = new Date(task.dueDate);
  const now = new Date();
  const limit = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  limit.setHours(0, 0, 0, 0);
  return due >= now && due <= limit;
};

const playReminder = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.46);
  } catch (error) {
    console.error("Reminder beep failed", error);
  }
};

const formatRelativeTime = (value, futureLabel = "in", pastLabel = "ago") => {
  if (!value) return "";
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return "";

  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffAbs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  let unit = "min";
  let amount = Math.round(diffAbs / minute);

  if (diffAbs >= day) {
    unit = "day";
    amount = Math.round(diffAbs / day);
  } else if (diffAbs >= hour) {
    unit = "hour";
    amount = Math.round(diffAbs / hour);
  }

  const unitText = amount === 1 ? unit : `${unit}s`;
  if (diffMs >= 0) {
    return `${futureLabel} ${amount} ${unitText}`;
  }
  return `${amount} ${unitText} ${pastLabel}`;
};

export default function App() {
  const [page, setPage] = useState("landing");
  const [tasks, setTasks] = useState([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authOpen, setAuthOpen] = useState(false);
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [savedPresets, setSavedPresets] = useState(() => {
    try {
      const raw = localStorage.getItem(FILTER_PRESET_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [profile, setProfile] = useState(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const isAuthenticated = Boolean(profile);

  const apiFetch = async (url, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      ...(profile ? { "x-auth-user": (profile.email || profile.name || "member").trim() } : {})
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status === 401) {
      logout();
      throw new Error("Unauthorized");
    }

    return response;
  };

  const requestNotifications = async () => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  };

  const fetchTasks = async () => {
    if (!isAuthenticated) return;
    try {
      const query = new URLSearchParams();
      if (filters.q) query.set("q", filters.q);
      if (filters.status) query.set("status", filters.status);
      if (filters.priority) query.set("priority", filters.priority);
      if (filters.category) query.set("category", filters.category);
      query.set("sortBy", filters.sortBy);

      const response = await apiFetch(`/api/tasks?${query.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch tasks");
      const data = await response.json();
      setTasks(data);
      setError("");
    } catch (err) {
      if (err.message !== "Unauthorized") {
        setError("Tasks load nahi hue. Server check karo.");
      }
    }
  };

  const checkReminders = async () => {
    if (!isAuthenticated) return;
    try {
      const response = await apiFetch("/api/tasks/reminders/due");
      if (!response.ok) return;
      const due = await response.json();
      if (!Array.isArray(due) || due.length === 0) return;

      due.forEach((task) => {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Task reminder", {
            body: task.title
          });
        }
      });

      playReminder();
      setMessage(`${due.length} reminder(s) triggered.`);
    } catch (err) {
      console.error("Reminder check failed", err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchTasks();
      checkReminders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, filters]);

  useEffect(() => {
    const timer = setInterval(() => {
      checkReminders();
    }, 60000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const openAuthModal = (mode) => {
    setAuthMode(mode);
    setAuthOpen(true);
    setError("");
  };

  const logout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setProfile(null);
    setTasks([]);
    setPage("landing");
    setMessage("Logged out successfully.");
    setError("");
  };

  const showPage = (nextPage) => {
    if (PROTECTED_PAGES.has(nextPage) && !isAuthenticated) {
      openAuthModal("login");
      setError("Please login to access this page.");
      return;
    }
    setPage(nextPage);
  };

  const submitAuth = async (event) => {
    event.preventDefault();
    if (!authForm.email.trim() || !authForm.password.trim()) {
      setError("Email and password required.");
      return;
    }
    if (authMode === "signup" && !authForm.name.trim()) {
      setError("Name is required for signup.");
      return;
    }

    const newProfile = {
      name: authForm.name.trim(),
      email: authForm.email.trim(),
      mode: authMode
    };

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newProfile));
    setProfile(newProfile);
    setAuthOpen(false);
    setAuthForm({ name: "", email: "", password: "" });
    setPage("dashboard");
    setMessage(authMode === "signup" ? "Account created." : "Logged in successfully.");
    setError("");
    requestNotifications();
  };

  const submitTask = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Title required.");
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category.trim(),
      priority: form.priority,
      dueDate: form.dueDate || null,
      reminderAt: form.reminderAt || null
    };

    try {
      const url = editingId ? `/api/tasks/${editingId}` : "/api/tasks";
      const method = editingId ? "PATCH" : "POST";
      const response = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.message || "Save failed");
        return;
      }

      setMessage(editingId ? "Task updated." : "Task created.");
      setError("");
      setForm(defaultForm);
      setEditingId("");
      fetchTasks();
    } catch {
      setError("Task save failed.");
    }
  };

  const startEdit = (task) => {
    setEditingId(task._id);
    setForm({
      title: task.title || "",
      description: task.description || "",
      category: task.category || "",
      priority: task.priority || "medium",
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "",
      reminderAt: task.reminderAt ? new Date(task.reminderAt).toISOString().slice(0, 16) : ""
    });
    setPage("tasks");
  };

  const completeTask = async (taskId) => {
    try {
      const response = await apiFetch(`/api/tasks/${taskId}/complete`, { method: "PATCH" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || "Complete failed");
        return;
      }
      setMessage("Task marked complete.");
      setError("");
      fetchTasks();
    } catch {
      setError("Complete failed.");
    }
  };

  const removeTask = async (taskId) => {
    try {
      const response = await apiFetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || "Delete failed");
        return;
      }
      setMessage("Task deleted.");
      setError("");
      fetchTasks();
    } catch {
      setError("Delete failed.");
    }
  };

  const saveCurrentPreset = () => {
    const presetName = window.prompt("Preset name?");
    if (!presetName || !presetName.trim()) return;

    const nextPreset = {
      id: String(Date.now()),
      name: presetName.trim(),
      filters: { ...filters }
    };

    const next = [...savedPresets, nextPreset];
    setSavedPresets(next);
    setSelectedPresetId(nextPreset.id);
    localStorage.setItem(FILTER_PRESET_STORAGE_KEY, JSON.stringify(next));
    setMessage("Preset saved.");
  };

  const applySelectedPreset = () => {
    if (!selectedPresetId) return;
    const preset = savedPresets.find((item) => item.id === selectedPresetId);
    if (!preset) return;
    setFilters({ ...preset.filters });
    setMessage(`Preset applied: ${preset.name}`);
  };

  const deleteSelectedPreset = () => {
    if (!selectedPresetId) return;
    const next = savedPresets.filter((item) => item.id !== selectedPresetId);
    setSavedPresets(next);
    setSelectedPresetId("");
    localStorage.setItem(FILTER_PRESET_STORAGE_KEY, JSON.stringify(next));
    setMessage("Preset deleted.");
  };

  const categories = useMemo(() => {
    const set = new Set();
    tasks.forEach((task) => {
      if (task.category) set.add(task.category);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    const searched = tasks.filter((task) => {
      const matchesQ = !filters.q || `${task.title} ${task.description || ""}`.toLowerCase().includes(filters.q.toLowerCase());
      const matchesStatus = !filters.status || (filters.status === "completed" ? task.completed : !task.completed);
      const matchesPriority = !filters.priority || task.priority === filters.priority;
      const matchesCategory = !filters.category || task.category === filters.category;
      return matchesQ && matchesStatus && matchesPriority && matchesCategory;
    });

    const sorted = [...searched].sort((a, b) => {
      switch (filters.sortBy) {
        case "createdAt_asc":
          return new Date(a.createdAt) - new Date(b.createdAt);
        case "dueDate_asc":
          return new Date(a.dueDate || 8640000000000000) - new Date(b.dueDate || 8640000000000000);
        case "dueDate_desc":
          return new Date(b.dueDate || 0) - new Date(a.dueDate || 0);
        case "title_asc":
          return a.title.localeCompare(b.title);
        case "title_desc":
          return b.title.localeCompare(a.title);
        case "priority_desc":
          return (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0);
        case "priority_asc":
          return (priorityRank[a.priority] || 0) - (priorityRank[b.priority] || 0);
        case "createdAt_desc":
        default:
          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });

    return sorted;
  }, [tasks, filters]);

  const analytics = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((task) => task.completed).length;
    const open = total - completed;
    const overdue = tasks.filter((task) => isOverdue(task)).length;
    const dueSoon = tasks.filter((task) => isDueSoon(task)).length;
    const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);

    const byCategory = tasks.reduce((acc, task) => {
      const key = task.category?.trim() || "uncategorized";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return { total, completed, open, overdue, dueSoon, completionRate, byCategory };
  }, [tasks]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <p>Task Orbit</p>
          <h1>Focus Flow React</h1>
        </div>

        <nav className="nav">
          {[
            ["landing", "Home"],
            ["dashboard", "Dashboard"],
            ["tasks", "Tasks"],
            ["analytics", "Analytics"]
          ].map(([key, label]) => (
            <button
              key={key}
              className={page === key ? "nav-link active" : "nav-link"}
              onClick={() => showPage(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="auth-row">
          <span className="chip">{profile?.name || profile?.email || "Guest"}</span>
          {!isAuthenticated ? (
            <>
              <button className="btn ghost" onClick={() => openAuthModal("login")}>Log in</button>
              <button className="btn primary" onClick={() => openAuthModal("signup")}>Sign up</button>
            </>
          ) : (
            <button className="btn ghost" onClick={logout}>Log out</button>
          )}
        </div>
      </header>

      <main className="container">
        {message ? <p className="msg">{message}</p> : null}
        {error ? <p className="msg error">{error}</p> : null}

        {page === "landing" && (
          <>
            <section className="panel landing landing-hero">
              <div className="landing-topline">
                <strong>focus flow</strong>
                <button className="waitlist-pill" onClick={() => openAuthModal("signup")}>Join the waitlist</button>
              </div>
              <h2>
                Give your ideas a glow up. Meet<br />
                your new <span>task creative collaborator.</span>
              </h2>
              <p>Capture, organize, and elevate your ideas across work, life, and leisure.</p>
              <div className="cta-row hero-actions">
                <button className="btn primary" onClick={() => openAuthModal("signup")}>Sign up free</button>
                <button className="btn ghost" onClick={() => showPage("tasks")}>Visit app</button>
              </div>

              <div className="landing-collage" aria-hidden="true">
                <article className="collage-card card-a">
                  <small>Create</small>
                  <h3>Add tasks with priority</h3>
                </article>
                <article className="collage-card card-b">
                  <small>Organize</small>
                  <h3>Filter by status & category</h3>
                </article>
                <article className="collage-card card-c">
                  <small>Track</small>
                  <h3>Mark tasks as complete</h3>
                </article>
                <article className="collage-card card-d">
                  <small>Remind</small>
                  <h3>Get alerts for due tasks</h3>
                </article>
                <span className="sticky left">Plan it, track it, complete it.</span>
                <span className="sticky right">From ideas to accomplished goals.</span>
              </div>
            </section>

            <section className="panel landing landing-story">
              <div>
                <h3>Transform your task list into achievement</h3>
                <div className="story-list">
                  <p>Create tasks with priority levels and due dates to stay focused.</p>
                  <p>Organize with categories and filter to find what matters most.</p>
                  <p>Set reminders so nothing important gets left behind.</p>
                  <p>Track progress with dashboard analytics without any distractions.</p>
                </div>
              </div>
              <div className="story-art" aria-hidden="true">
                <div className="dot pink"></div>
                <div className="dot yellow"></div>
                <div className="dot gray"></div>
                <div className="scribble">create + organize + complete</div>
                <div className="badge-card">Task Master</div>
              </div>
            </section>

            <section className="panel landing landing-search">
              <div>
                <h3>Stay on top of your goals, every single day</h3>
                <p>Smart task management that keeps you motivated and organized.</p>
              </div>
              <div className="search-strip">
                <button className="visit-site" onClick={() => showPage("dashboard")}>Visit site</button>
                <div className="search-mock">Search & filter your tasks</div>
              </div>
            </section>
          </>
        )}

        {page === "dashboard" && (
          <section className="panel dashboard-panel">
            <div className="section-head">
              <h2>Dashboard</h2>
              <p>Track work health in one glance</p>
            </div>
            <div className="stats-grid">
              <article><span>{analytics.total}</span><small>Total</small></article>
              <article><span>{analytics.open}</span><small>Open</small></article>
              <article><span>{analytics.completed}</span><small>Completed</small></article>
              <article><span>{analytics.overdue}</span><small>Overdue</small></article>
            </div>

            <div className="quick-insights">
              <div>
                <h4>Completion rate</h4>
                <p>{analytics.completionRate}% done</p>
              </div>
              <div>
                <h4>Due soon</h4>
                <p>{analytics.dueSoon} task(s) in 48h</p>
              </div>
            </div>

            <h3 className="subhead">Recent tasks</h3>
            <ul className="recent-grid">
              {visibleTasks.slice(0, 5).map((task) => (
                <li key={task._id} className="recent-item">
                  <strong>{task.title}</strong>
                  <div className="meta">
                    <span>{task.category || "general"}</span>
                    <span>{task.priority}</span>
                    <span>{task.completed ? "done" : "open"}</span>
                  </div>
                </li>
              ))}
              {visibleTasks.length === 0 ? <li className="recent-item">No tasks yet.</li> : null}
            </ul>
          </section>
        )}

        {page === "tasks" && (
          <div className="tasks-layout">
            <section className="panel tasks-create-panel">
              <div className="section-head">
                <h2>{editingId ? "Edit task" : "Create task"}</h2>
                <p>Capture title, priority, deadline, reminder</p>
              </div>
              <form className="form" onSubmit={submitTask}>
                <label>Title *</label>
                <input placeholder="e.g. Finish API docs" value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} required />

                <label>Description</label>
                <textarea rows={3} placeholder="Add useful details for this task" value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />

                <div className="two-col">
                  <div>
                    <label>Category</label>
                    <input value={form.category} onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))} />
                  </div>
                  <div>
                    <label>Priority</label>
                    <select value={form.priority} onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))}>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>

                <div className="two-col">
                  <div>
                    <label>Due date</label>
                    <input type="date" value={form.dueDate} onChange={(e) => setForm((s) => ({ ...s, dueDate: e.target.value }))} />
                  </div>
                  <div>
                    <label>Reminder at</label>
                    <input type="datetime-local" value={form.reminderAt} onChange={(e) => setForm((s) => ({ ...s, reminderAt: e.target.value }))} />
                  </div>
                </div>

                <div className="cta-row">
                  <button className="btn primary" type="submit">{editingId ? "Update task" : "Save task"}</button>
                  {editingId ? (
                    <button className="btn ghost" type="button" onClick={() => {
                      setEditingId("");
                      setForm(defaultForm);
                    }}>Cancel edit</button>
                  ) : null}
                </div>
              </form>
            </section>

            <section className="panel tasks-all-panel">
              <div className="section-head">
                <h2>All tasks</h2>
                <p>Search, filter, sort, then take action quickly</p>
              </div>
              <div className="filters">
                <input placeholder="Search" value={filters.q} onChange={(e) => setFilters((s) => ({ ...s, q: e.target.value }))} />
                <select value={filters.status} onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}>
                  <option value="">All status</option>
                  <option value="open">Open</option>
                  <option value="completed">Completed</option>
                </select>
                <select value={filters.priority} onChange={(e) => setFilters((s) => ({ ...s, priority: e.target.value }))}>
                  <option value="">All priority</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <select value={filters.category} onChange={(e) => setFilters((s) => ({ ...s, category: e.target.value }))}>
                  <option value="">All category</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select value={filters.sortBy} onChange={(e) => setFilters((s) => ({ ...s, sortBy: e.target.value }))}>
                  <option value="createdAt_desc">Newest</option>
                  <option value="createdAt_asc">Oldest</option>
                  <option value="dueDate_asc">Due date asc</option>
                  <option value="dueDate_desc">Due date desc</option>
                  <option value="title_asc">Title A-Z</option>
                  <option value="title_desc">Title Z-A</option>
                  <option value="priority_desc">Priority high-low</option>
                  <option value="priority_asc">Priority low-high</option>
                </select>
              </div>

              <div className="preset-row">
                <select value={selectedPresetId} onChange={(e) => setSelectedPresetId(e.target.value)}>
                  <option value="">Saved presets</option>
                  {savedPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.name}</option>
                  ))}
                </select>
                <button className="btn ghost" type="button" onClick={saveCurrentPreset}>Save</button>
                <button className="btn ghost" type="button" onClick={applySelectedPreset}>Apply</button>
                <button className="btn danger" type="button" onClick={deleteSelectedPreset}>Delete</button>
              </div>

              <ul className="task-list">
                {visibleTasks.map((task) => (
                  <li key={task._id} className={isOverdue(task) ? "task overdue" : "task"}>
                    <div>
                      <h3>{task.title}</h3>
                      <p>{task.description || "No description"}</p>
                      <div className="meta">
                        <span>{task.category || "Uncategorized"}</span>
                        <span>{task.priority}</span>
                        <span>{task.completed ? "completed" : "open"}</span>
                        {task.dueDate ? <span className="due-chip">due {formatRelativeTime(task.dueDate)}</span> : null}
                        {task.reminderAt ? <span className="alarm-chip">alarm {formatRelativeTime(task.reminderAt)}</span> : null}
                      </div>
                    </div>
                    <div className="row-actions">
                      {!task.completed ? <button className="btn ghost" onClick={() => completeTask(task._id)}>Complete</button> : null}
                      <button className="btn ghost" onClick={() => startEdit(task)}>Edit</button>
                      <button className="btn danger" onClick={() => removeTask(task._id)}>Delete</button>
                    </div>
                  </li>
                ))}
                {visibleTasks.length === 0 ? <li className="task">No tasks found.</li> : null}
              </ul>
            </section>
          </div>
        )}

        {page === "analytics" && (
          <section className="panel analytics-panel">
            <div className="section-head">
              <h2>Analytics</h2>
              <p>See momentum across completion and categories</p>
            </div>
            <div className="stats-grid">
              <article><span>{analytics.completionRate}%</span><small>Completion</small></article>
              <article><span>{analytics.overdue}</span><small>Overdue</small></article>
              <article><span>{analytics.dueSoon}</span><small>Due soon</small></article>
            </div>
            <h3 className="subhead">Category load</h3>
            <div className="bars">
              {Object.entries(analytics.byCategory).map(([name, count]) => {
                const width = analytics.total ? Math.max(10, Math.round((count / analytics.total) * 100)) : 0;
                return (
                  <div className="bar-row" key={name}>
                    <span>{name}</span>
                    <div className="bar-wrap"><div className="bar" style={{ width: `${width}%` }}>{count}</div></div>
                  </div>
                );
              })}
              {Object.keys(analytics.byCategory).length === 0 ? <p>No category data yet.</p> : null}
            </div>
          </section>
        )}
      </main>

      {authOpen && (
        <div className="modal-shell">
          <div className="backdrop" onClick={() => setAuthOpen(false)} />
          <form className="modal" onSubmit={submitAuth}>
            <h3>{authMode === "signup" ? "Create account" : "Log in"}</h3>
            {authMode === "signup" ? (
              <>
                <label>Name</label>
                <input value={authForm.name} onChange={(e) => setAuthForm((s) => ({ ...s, name: e.target.value }))} />
              </>
            ) : null}
            <label>Email</label>
            <input type="email" value={authForm.email} onChange={(e) => setAuthForm((s) => ({ ...s, email: e.target.value }))} required />
            <label>Password</label>
            <input type="password" value={authForm.password} onChange={(e) => setAuthForm((s) => ({ ...s, password: e.target.value }))} required />
            <div className="cta-row">
              <button className="btn primary" type="submit">{authMode === "signup" ? "Sign up" : "Log in"}</button>
              <button className="btn ghost" type="button" onClick={() => setAuthMode((m) => (m === "login" ? "signup" : "login"))}>
                {authMode === "signup" ? "Use login" : "Create account"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
