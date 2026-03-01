const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/', (req, res) => {
  const { search = '', category = '' } = req.query;
  let sql = 'SELECT * FROM library WHERE 1=1';
  const params = [];
  if (search) { sql += ' AND (title LIKE ? OR content LIKE ? OR tags LIKE ? OR section_ref LIKE ?)'; const s = `%${search}%`; params.push(s,s,s,s); }
  if (category) { sql += ' AND category=?'; params.push(category); }
  sql += ' ORDER BY category ASC, title ASC';
  res.json({ success: true, data: db.prepare(sql).all(...params) });
});

router.get('/:id', (req, res) => {
  const e = db.prepare('SELECT * FROM library WHERE id=?').get(req.params.id);
  if (!e) return res.status(404).json({ success: false, message: 'Entry not found' });
  res.json({ success: true, data: e });
});

router.post('/', (req, res) => {
  const { title, category, section_ref, content, tags, source } = req.body;
  if (!title || !content) return res.status(400).json({ success: false, message: 'Title and content are required' });
  const r = db.prepare('INSERT INTO library (title,category,section_ref,content,tags,source) VALUES (?,?,?,?,?,?)')
    .run(title, category||'Other', section_ref, content, tags, source);
  res.json({ success: true, id: r.lastInsertRowid, message: 'Entry added' });
});

router.put('/:id', (req, res) => {
  const { title, category, section_ref, content, tags, source } = req.body;
  db.prepare('UPDATE library SET title=?,category=?,section_ref=?,content=?,tags=?,source=? WHERE id=?')
    .run(title, category, section_ref, content, tags, source, req.params.id);
  res.json({ success: true, message: 'Entry updated' });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM library WHERE id=?').run(req.params.id);
  res.json({ success: true, message: 'Entry deleted' });
});

// Search for reply generator context
router.get('/search/context', (req, res) => {
  const { q = '' } = req.query;
  if (!q) return res.json({ success: true, data: [] });
  const entries = db.prepare("SELECT title, content, section_ref, source FROM library WHERE section_ref LIKE ? OR tags LIKE ? OR title LIKE ? LIMIT 5")
    .all(`%${q}%`, `%${q}%`, `%${q}%`);
  res.json({ success: true, data: entries });
});

module.exports = router;
