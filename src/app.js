const express = require('express');
const path = require('path');
const cors = require('cors');
const taskRoutes = require('./routes/tasks');
const { verifyApiUser } = require('./middleware/auth.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const app = express();
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
const legacyPublicPath = path.join(__dirname, '..', 'public');
const hasClientBuild = require('fs').existsSync(path.join(clientBuildPath, 'index.html'));

app.use(express.json());
app.use(cors({
  origin: process.env.CORS_ORIGIN || true
}));

if (hasClientBuild) {
  app.use(express.static(clientBuildPath));
} else {
  app.use(express.static(legacyPublicPath));
}

app.get('/api/health', (req, res) => {
  res.json({ message: 'To-Do List API is running' });
});

app.use('/api/tasks', verifyApiUser, taskRoutes);

if (hasClientBuild) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    return res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
