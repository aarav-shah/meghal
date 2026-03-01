const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { db } = require('../database');

const UPLOAD_BASE = process.env.UPLOAD_BASE || path.join(__dirname, '..', 'uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOAD_BASE, 'notices')),
  filename: (req, file, cb) => cb(null, `notice_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// Penalty rules by section
const PENALTY_RULES = {
  '271(1)(b)': '₹10,000 per default for non-compliance',
  '271(1)(c)': '100%–300% of tax for concealment',
  '271A': '₹25,000 for failure to maintain books',
  '271B': '0.5% of turnover (max ₹1.5L) for audit failure',
  '271H': '₹10,000–₹1,00,000 for TDS return default',
  '272A': '₹10,000 per default for summons non-compliance',
  '234A': '1% per month interest on tax due',
  '220(2)': '1% per month on outstanding demand',
};

function getPenalty(section, noticeType) {
  if (!section) return null;
  for (const [key, val] of Object.entries(PENALTY_RULES)) {
    if (section.includes(key) || noticeType.includes(key)) return `${key}: ${val}`;
  }
  if (noticeType.includes('131') || noticeType.includes('Summons')) return `272A: ${PENALTY_RULES['272A']}`;
  if (noticeType.includes('156') || noticeType.includes('Demand')) return `220(2): ${PENALTY_RULES['220(2)']}`;
  return null;
}

// GET all notices
router.get('/', (req, res) => {
  const { search = '', status = '', priority = '', client_id = '' } = req.query;
  let sql = `SELECT n.*, c.name as client_name, c.pan FROM notices n JOIN clients c ON n.client_id=c.id WHERE 1=1`;
  const params = [];
  if (search) { sql += ' AND (c.name LIKE ? OR c.pan LIKE ? OR n.section LIKE ? OR n.din LIKE ?)'; const s = `%${search}%`; params.push(s,s,s,s); }
  if (status) { sql += ' AND n.status=?'; params.push(status); }
  if (priority) { sql += ' AND n.priority=?'; params.push(priority); }
  if (client_id) { sql += ' AND n.client_id=?'; params.push(client_id); }
  sql += ' ORDER BY n.due_date ASC';
  const notices = db.prepare(sql).all(...params);
  const today = new Date().toISOString().split('T')[0];
  const result = notices.map(n => {
    const days = n.due_date ? Math.ceil((new Date(n.due_date) - new Date(today)) / 86400000) : null;
    const urgency = days === null ? 'none' : days < 0 ? 'overdue' : days <= 7 ? 'critical' : days <= 15 ? 'warning' : 'safe';
    return { ...n, days_remaining: days, urgency };
  });
  res.json({ success: true, data: result });
});

// GET single notice
router.get('/:id', (req, res) => {
  const n = db.prepare(`SELECT n.*, c.name as client_name, c.pan FROM notices n JOIN clients c ON n.client_id=c.id WHERE n.id=?`).get(req.params.id);
  if (!n) return res.status(404).json({ success: false, message: 'Notice not found' });
  const today = new Date().toISOString().split('T')[0];
  const days = n.due_date ? Math.ceil((new Date(n.due_date) - new Date(today)) / 86400000) : null;
  res.json({ success: true, data: { ...n, days_remaining: days } });
});

// POST create notice
router.post('/', upload.single('notice_file'), (req, res) => {
  const { client_id, notice_type, section, assessment_year, notice_date, due_date, din, issuing_authority, description, status, priority, assigned_to, remarks } = req.body;
  if (!client_id || !notice_type) return res.status(400).json({ success: false, message: 'client_id and notice_type are required' });
  const notice_file = req.file ? req.file.filename : null;
  const penalty = getPenalty(section, notice_type);
  const r = db.prepare('INSERT INTO notices (client_id,notice_type,section,assessment_year,notice_date,due_date,din,issuing_authority,description,status,priority,assigned_to,remarks,notice_file,penalty_applicable) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(client_id, notice_type, section, assessment_year, notice_date, due_date, din, issuing_authority, description, status||'Pending', priority||'Medium', assigned_to, remarks, notice_file, penalty);
  res.json({ success: true, id: r.lastInsertRowid, message: 'Notice added' });
});

// PUT update notice
router.put('/:id', upload.single('notice_file'), (req, res) => {
  const existing = db.prepare('SELECT * FROM notices WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'Notice not found' });
  const { client_id, notice_type, section, assessment_year, notice_date, due_date, din, issuing_authority, description, status, priority, assigned_to, remarks } = req.body;
  const notice_file = req.file ? req.file.filename : existing.notice_file;
  const penalty = getPenalty(section||existing.section, notice_type||existing.notice_type);
  db.prepare('UPDATE notices SET client_id=?,notice_type=?,section=?,assessment_year=?,notice_date=?,due_date=?,din=?,issuing_authority=?,description=?,status=?,priority=?,assigned_to=?,remarks=?,notice_file=?,penalty_applicable=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(client_id||existing.client_id, notice_type||existing.notice_type, section, assessment_year, notice_date, due_date, din, issuing_authority, description, status, priority, assigned_to, remarks, notice_file, penalty, req.params.id);
  res.json({ success: true, message: 'Notice updated' });
});

// DELETE notice
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM notices WHERE id=?').run(req.params.id);
  res.json({ success: true, message: 'Notice deleted' });
});

module.exports = router;
