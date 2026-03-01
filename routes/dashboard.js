const express = require('express');
const router = express.Router();
const { db } = require('../database');

// GET dashboard stats
router.get('/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const next7 = new Date(Date.now() + 7*86400000).toISOString().split('T')[0];
  const next30 = new Date(Date.now() + 30*86400000).toISOString().split('T')[0];

  const stats = {
    total_clients: db.prepare('SELECT COUNT(*) as c FROM clients').get().c,
    total_notices: db.prepare('SELECT COUNT(*) as c FROM notices').get().c,
    pending: db.prepare("SELECT COUNT(*) as c FROM notices WHERE status='Pending'").get().c,
    replied: db.prepare("SELECT COUNT(*) as c FROM notices WHERE status='Reply Filed'").get().c,
    overdue: db.prepare("SELECT COUNT(*) as c FROM notices WHERE due_date < ? AND status NOT IN ('Reply Filed','Closed')").get(today).c,
    due_in_7: db.prepare("SELECT COUNT(*) as c FROM notices WHERE due_date BETWEEN ? AND ? AND status NOT IN ('Reply Filed','Closed')").get(today, next7).c,
    due_in_30: db.prepare("SELECT COUNT(*) as c FROM notices WHERE due_date BETWEEN ? AND ? AND status NOT IN ('Reply Filed','Closed')").get(today, next30).c,
    drafts: db.prepare("SELECT COUNT(*) as c FROM replies WHERE status='Draft'").get().c,
    hearing_scheduled: db.prepare("SELECT COUNT(*) as c FROM notices WHERE status='Hearing Scheduled'").get().c,
    total_tasks: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status != 'Done'").get().c,
  };
  res.json({ success: true, data: stats });
});

// GET upcoming notices (next 30 days)
router.get('/upcoming', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const next30 = new Date(Date.now() + 30*86400000).toISOString().split('T')[0];
  const notices = db.prepare(`SELECT n.*, c.name as client_name, c.pan, CAST(julianday(n.due_date) - julianday('now') AS INTEGER) as days_remaining FROM notices n JOIN clients c ON n.client_id=c.id WHERE n.due_date BETWEEN ? AND ? AND n.status NOT IN ('Reply Filed','Closed') ORDER BY n.due_date ASC LIMIT 15`).all(today, next30);
  res.json({ success: true, data: notices });
});

// GET overdue notices
router.get('/overdue', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const notices = db.prepare(`SELECT n.*, c.name as client_name, c.pan, CAST(julianday('now') - julianday(n.due_date) AS INTEGER) as days_overdue FROM notices n JOIN clients c ON n.client_id=c.id WHERE n.due_date < ? AND n.status NOT IN ('Reply Filed','Closed') ORDER BY n.due_date ASC LIMIT 20`).all(today);
  res.json({ success: true, data: notices });
});

// GET client-wise summary
router.get('/client-summary', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const summary = db.prepare(`SELECT c.id, c.name, c.pan, c.category, c.ca_assigned, COUNT(n.id) as total_notices, SUM(CASE WHEN n.status='Pending' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN n.due_date < ? AND n.status NOT IN ('Reply Filed','Closed') THEN 1 ELSE 0 END) as overdue, SUM(CASE WHEN n.status='Reply Filed' THEN 1 ELSE 0 END) as replied FROM clients c LEFT JOIN notices n ON c.id=n.client_id GROUP BY c.id ORDER BY overdue DESC, pending DESC, c.name ASC`).all(today);
  res.json({ success: true, data: summary });
});

module.exports = router;
