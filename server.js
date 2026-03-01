require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDB } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

// Upload dir — use Railway volume if available, else local
const UPLOAD_BASE = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'uploads')
  : path.join(__dirname, 'uploads');

// Make upload subdirs available globally for routes
process.env.UPLOAD_BASE = UPLOAD_BASE;

// Ensure upload directories exist
['notices', 'replies', 'library', 'documents'].forEach(dir => {
  const p = path.join(UPLOAD_BASE, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});


// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'it-litigation-v2-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 1800000 }
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_BASE));

// API Routes
app.use('/api/clients',   require('./routes/clients'));
app.use('/api/notices',   require('./routes/notices'));
app.use('/api/replies',   require('./routes/replies'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/library',   require('./routes/library'));
app.use('/api/settings',  require('./routes/settings'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/export',    require('./routes/export'));
app.use('/api/tasks',     require('./routes/tasks'));
app.use('/api/staff',     require('./routes/staff'));
app.use('/api/hearings',  require('./routes/hearings'));

// Serve SPA for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize DB and start server
initDB();
app.listen(PORT, () => {
  const bar = '═'.repeat(51);
  console.log('');
  console.log(`╔${bar}╗`);
  console.log(`║   IT Litigation Manager v2                        ║`);
  console.log(`║   🚀 Running at http://localhost:${PORT}             ║`);
  console.log(`╚${bar}╝`);
  console.log('');
});

module.exports = app;
