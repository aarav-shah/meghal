const express = require('express');
const router = express.Router();
const { db } = require('../database');

// GET all tasks
router.get('/', (req, res) => {
  const { status = '', assigned_to_id = '', client_id = '' } = req.query;
  let sql = `SELECT t.*, c.name as client_name, c.pan, n.notice_type, n.section, n.due_date as notice_due_date 
    FROM tasks t 
    LEFT JOIN clients c ON t.client_id=c.id 
    LEFT JOIN notices n ON t.notice_id=n.id 
    WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND t.status=?'; params.push(status); }
  if (assigned_to_id) { sql += ' AND t.assigned_to_id=?'; params.push(assigned_to_id); }
  if (client_id) { sql += ' AND t.client_id=?'; params.push(client_id); }
  sql += ' ORDER BY CASE t.priority WHEN "High" THEN 1 WHEN "Medium" THEN 2 ELSE 3 END, t.due_date ASC';
  const tasks = db.prepare(sql).all(...params);
  // Add overdue flag
  const today = new Date().toISOString().split('T')[0];
  const result = tasks.map(t => ({
    ...t,
    is_overdue: t.due_date && t.due_date < today && t.status !== 'Done'
  }));
  res.json({ success: true, data: result });
});

// GET tasks by staff
router.get('/by-staff', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const staff = db.prepare("SELECT * FROM staff WHERE is_active=1 ORDER BY name ASC").all();
  const taskStmt = db.prepare("SELECT t.*, c.name as client_name, n.notice_type FROM tasks t LEFT JOIN clients c ON t.client_id=c.id LEFT JOIN notices n ON t.notice_id=n.id WHERE t.assigned_to_id=? AND t.status != 'Done' ORDER BY t.due_date ASC");
  const result = staff.map(s => ({
    ...s,
    tasks: taskStmt.all(s.id).map(t => ({ ...t, is_overdue: t.due_date && t.due_date < today }))
  }));
  // Unassigned tasks
  const unassigned = db.prepare("SELECT t.*, c.name as client_name, n.notice_type FROM tasks t LEFT JOIN clients c ON t.client_id=c.id LEFT JOIN notices n ON t.notice_id=n.id WHERE t.assigned_to_id IS NULL AND t.status != 'Done'").all();
  res.json({ success: true, data: result, unassigned });
});

// POST create task
router.post('/', (req, res) => {
  const { notice_id, client_id, title, description, assigned_to_id, assigned_to_name, due_date, status, priority } = req.body;
  if (!title) return res.status(400).json({ success: false, message: 'Title is required' });
  // Auto-fill assigned_to_name from staff if id provided
  let staffName = assigned_to_name;
  if (assigned_to_id && !staffName) {
    const s = db.prepare('SELECT name FROM staff WHERE id=?').get(assigned_to_id);
    staffName = s?.name || '';
  }
  const r = db.prepare('INSERT INTO tasks (notice_id,client_id,title,description,assigned_to_id,assigned_to_name,due_date,status,priority) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(notice_id||null, client_id||null, title, description, assigned_to_id||null, staffName, due_date, status||'Pending', priority||'Medium');
  res.json({ success: true, id: r.lastInsertRowid, message: 'Task created' });
});

// PUT update task
router.put('/:id', (req, res) => {
  const { title, description, assigned_to_id, assigned_to_name, due_date, status, priority } = req.body;
  const existing = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'Task not found' });
  let staffName = assigned_to_name || existing.assigned_to_name;
  if (assigned_to_id && assigned_to_id !== existing.assigned_to_id) {
    const s = db.prepare('SELECT name FROM staff WHERE id=?').get(assigned_to_id);
    staffName = s?.name || staffName;
  }
  db.prepare('UPDATE tasks SET title=?,description=?,assigned_to_id=?,assigned_to_name=?,due_date=?,status=?,priority=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(title||existing.title, description, assigned_to_id||null, staffName, due_date, status||existing.status, priority||existing.priority, req.params.id);
  res.json({ success: true, message: 'Task updated' });
});

// DELETE task
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
  res.json({ success: true, message: 'Task deleted' });
});

module.exports = router;
