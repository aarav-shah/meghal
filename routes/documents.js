const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const archiver = require('archiver');
const fs = require('fs');
const { db } = require('../database');

const UPLOAD_BASE = process.env.UPLOAD_BASE || path.join(__dirname, '..', 'uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOAD_BASE, 'documents')),
  filename: (req, file, cb) => cb(null, `doc_${Date.now()}_${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// GET documents for a client or notice
router.get('/', (req, res) => {
  const { client_id, notice_id } = req.query;
  let sql = `SELECT d.*, n.notice_type, n.section, c.name as client_name FROM notice_documents d 
    JOIN notices n ON d.notice_id=n.id JOIN clients c ON d.client_id=c.id WHERE 1=1`;
  const params = [];
  if (client_id) { sql += ' AND d.client_id=?'; params.push(client_id); }
  if (notice_id) { sql += ' AND d.notice_id=?'; params.push(notice_id); }
  sql += ' ORDER BY d.uploaded_at DESC';
  const docs = db.prepare(sql).all(...params);
  res.json({ success: true, data: docs });
});

// POST upload documents
router.post('/upload', upload.array('files', 20), (req, res) => {
  const { notice_id, client_id, tag } = req.body;
  if (!notice_id || !client_id || !req.files?.length) return res.status(400).json({ success: false, message: 'notice_id, client_id and files are required' });
  const stmt = db.prepare('INSERT INTO notice_documents (notice_id,client_id,filename,original_name,mimetype,size,tag) VALUES (?,?,?,?,?,?,?)');
  req.files.forEach(f => stmt.run(notice_id, client_id, f.filename, f.originalname, f.mimetype, f.size, tag||'Other'));
  res.json({ success: true, count: req.files.length, message: `${req.files.length} file(s) uploaded` });
});

// DELETE document
router.delete('/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM notice_documents WHERE id=?').get(req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
  const fp = path.join(__dirname, '..', 'uploads', 'documents', doc.filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  db.prepare('DELETE FROM notice_documents WHERE id=?').run(req.params.id);
  res.json({ success: true, message: 'Document deleted' });
});

// GET download ZIP for client
router.get('/zip/:client_id', (req, res) => {
  const docs = db.prepare('SELECT * FROM notice_documents WHERE client_id=?').all(req.params.client_id);
  const client = db.prepare('SELECT name FROM clients WHERE id=?').get(req.params.client_id);
  if (!docs.length) return res.status(404).json({ success: false, message: 'No documents found' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${(client?.name||'client').replace(/\s/g,'_')}_docs.zip"`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  docs.forEach(d => {
    const fp = path.join(__dirname, '..', 'uploads', 'documents', d.filename);
    if (fs.existsSync(fp)) archive.file(fp, { name: d.original_name });
  });
  archive.finalize();
});

module.exports = router;
