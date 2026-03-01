const express = require('express');
const router = express.Router();
const { db } = require('../database');
const CryptoJS = require('crypto-js');

const SECRET = process.env.SESSION_SECRET || 'it-crypto-key';
const encrypt = t => t ? CryptoJS.AES.encrypt(t, SECRET).toString() : '';
const decrypt = c => { try { return c ? CryptoJS.AES.decrypt(c, SECRET).toString(CryptoJS.enc.Utf8) : ''; } catch { return ''; } };

// GET all clients
router.get('/', (req, res) => {
  const { search = '', category = '' } = req.query;
  let sql = 'SELECT * FROM clients WHERE 1=1';
  const params = [];
  if (search) { sql += ' AND (name LIKE ? OR pan LIKE ? OR email LIKE ? OR phone LIKE ?)'; const s = `%${search}%`; params.push(s,s,s,s); }
  if (category) { sql += ' AND category = ?'; params.push(category); }
  sql += ' ORDER BY name ASC';
  const clients = db.prepare(sql).all(...params);
  // Get notice counts per client
  const countStmt = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='Pending' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN due_date < date('now') AND status NOT IN ('Reply Filed','Closed') THEN 1 ELSE 0 END) as overdue FROM notices WHERE client_id=?");
  const result = clients.map(c => {
    const counts = countStmt.get(c.id);
    return { ...c, it_password_enc: c.it_password_enc ? '••••••••' : '', ...counts };
  });
  res.json({ success: true, data: result });
});

// GET single client (with decrypted creds)
router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ success: false, message: 'Client not found' });
  res.json({ success: true, data: { ...c, it_password_dec: decrypt(c.it_password_enc) } });
});

// POST create client
router.post('/', (req, res) => {
  const { name, pan, email, phone, category, gstin, it_username, it_password, ca_assigned, address, notes } = req.body;
  if (!name || !pan) return res.status(400).json({ success: false, message: 'Name and PAN are required' });
  const panUpper = pan.toUpperCase();
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  if (!panRegex.test(panUpper)) return res.status(400).json({ success: false, message: 'Invalid PAN format (e.g. ABCDE1234F)' });
  try {
    const r = db.prepare('INSERT INTO clients (name,pan,email,phone,category,gstin,it_username,it_password_enc,ca_assigned,address,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(name, panUpper, email, phone, category||'Individual', gstin, it_username, encrypt(it_password), ca_assigned, address, notes);
    res.json({ success: true, id: r.lastInsertRowid, message: 'Client added successfully' });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ success: false, message: 'A client with this PAN already exists' });
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT update client
router.put('/:id', (req, res) => {
  const { name, pan, email, phone, category, gstin, it_username, it_password, ca_assigned, address, notes } = req.body;
  const existing = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'Client not found' });
  const encPass = it_password ? encrypt(it_password) : existing.it_password_enc;
  db.prepare('UPDATE clients SET name=?,pan=?,email=?,phone=?,category=?,gstin=?,it_username=?,it_password_enc=?,ca_assigned=?,address=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(name||existing.name, (pan||existing.pan).toUpperCase(), email, phone, category, gstin, it_username, encPass, ca_assigned, address, notes, req.params.id);
  res.json({ success: true, message: 'Client updated' });
});

// DELETE client
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM clients WHERE id=?').run(req.params.id);
  res.json({ success: true, message: 'Client deleted' });
});

// GET decrypted IT credentials
router.get('/:id/credentials', (req, res) => {
  const c = db.prepare('SELECT it_username, it_password_enc FROM clients WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ success: false });
  res.json({ success: true, data: { username: c.it_username, password: decrypt(c.it_password_enc) } });
});

module.exports = router;
