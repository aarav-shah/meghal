const express = require('express');
const router = express.Router();
const { db } = require('../database');

// GET all hearings
router.get('/', (req, res) => {
  const { client_id = '', status = '' } = req.query;
  let sql = `SELECT h.*, c.name as client_name, c.pan, n.notice_type, n.section FROM hearings h JOIN clients c ON h.client_id=c.id LEFT JOIN notices n ON h.notice_id=n.id WHERE 1=1`;
  const params = [];
  if (client_id) { sql += ' AND h.client_id=?'; params.push(client_id); }
  if (status) { sql += ' AND h.status=?'; params.push(status); }
  sql += ' ORDER BY h.hearing_date ASC';
  res.json({ success: true, data: db.prepare(sql).all(...params) });
});

// GET upcoming hearings (next 30 days)
router.get('/upcoming', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const next30 = new Date(Date.now() + 30*86400000).toISOString().split('T')[0];
  const hearings = db.prepare(`SELECT h.*, c.name as client_name, c.pan, n.notice_type, n.section FROM hearings h JOIN clients c ON h.client_id=c.id LEFT JOIN notices n ON h.notice_id=n.id WHERE h.hearing_date BETWEEN ? AND ? AND h.status='Scheduled' ORDER BY h.hearing_date ASC LIMIT 20`).all(today, next30);
  res.json({ success: true, data: hearings });
});

// POST create hearing
router.post('/', (req, res) => {
  const { notice_id, client_id, hearing_date, hearing_time, venue, authority, notes, status } = req.body;
  if (!client_id || !hearing_date) return res.status(400).json({ success: false, message: 'client_id and hearing_date are required' });
  const r = db.prepare('INSERT INTO hearings (notice_id,client_id,hearing_date,hearing_time,venue,authority,notes,status) VALUES (?,?,?,?,?,?,?,?)')
    .run(notice_id||null, client_id, hearing_date, hearing_time, venue, authority, notes, status||'Scheduled');
  res.json({ success: true, id: r.lastInsertRowid, message: 'Hearing scheduled' });
});

// PUT update hearing
router.put('/:id', (req, res) => {
  const h = db.prepare('SELECT * FROM hearings WHERE id=?').get(req.params.id);
  if (!h) return res.status(404).json({ success: false, message: 'Hearing not found' });
  const { notice_id, client_id, hearing_date, hearing_time, venue, authority, notes, outcome, status } = req.body;
  db.prepare('UPDATE hearings SET notice_id=?,client_id=?,hearing_date=?,hearing_time=?,venue=?,authority=?,notes=?,outcome=?,status=? WHERE id=?')
    .run(notice_id||h.notice_id, client_id||h.client_id, hearing_date||h.hearing_date, hearing_time||h.hearing_time, venue||h.venue, authority||h.authority, notes||h.notes, outcome||h.outcome, status||h.status, req.params.id);
  res.json({ success: true, message: 'Hearing updated' });
});

// DELETE hearing
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM hearings WHERE id=?').run(req.params.id);
  res.json({ success: true, message: 'Hearing deleted' });
});

module.exports = router;
