const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/', (req, res) => {
  const staff = db.prepare("SELECT s.*, (SELECT COUNT(*) FROM tasks WHERE assigned_to_id=s.id AND status!='Done') as active_tasks FROM staff s WHERE s.is_active=1 ORDER BY s.role ASC, s.name ASC").all();
  res.json({ success: true, data: staff });
});

router.get('/all', (req, res) => {
  const staff = db.prepare("SELECT * FROM staff ORDER BY name ASC").all();
  res.json({ success: true, data: staff });
});

router.post('/', (req, res) => {
  const { name, email, role, phone } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
  try {
    const r = db.prepare('INSERT INTO staff (name,email,role,phone) VALUES (?,?,?,?)').run(name, email, role||'Article', phone);
    res.json({ success: true, id: r.lastInsertRowid, message: 'Staff member added' });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ success: false, message: 'Email already exists' });
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/:id', (req, res) => {
  const { name, email, role, phone, is_active } = req.body;
  const s = db.prepare('SELECT * FROM staff WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ success: false, message: 'Staff not found' });
  db.prepare('UPDATE staff SET name=?,email=?,role=?,phone=?,is_active=? WHERE id=?')
    .run(name||s.name, email||s.email, role||s.role, phone||s.phone, is_active!==undefined?is_active:s.is_active, req.params.id);
  res.json({ success: true, message: 'Staff updated' });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM staff WHERE id=?').run(req.params.id);
  res.json({ success: true, message: 'Staff removed' });
});

module.exports = router;
