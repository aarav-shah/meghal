const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { db } = require('../database');

// Export notices to Excel
router.get('/notices/excel', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const notices = db.prepare(`SELECT n.id, c.name as "Client Name", c.pan as "PAN", n.notice_type as "Notice Type", n.section as "Section", n.assessment_year as "AY", n.notice_date as "Notice Date", n.due_date as "Due Date", CAST(julianday(n.due_date) - julianday('now') AS INTEGER) as "Days Remaining", n.status as "Status", n.priority as "Priority", n.assigned_to as "Assigned To", n.din as "DIN", n.issuing_authority as "Issuing Authority" FROM notices n JOIN clients c ON n.client_id=c.id ORDER BY n.due_date ASC`).all();
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(notices);
  ws['!cols'] = [{wch:25},{wch:15},{wch:30},{wch:15},{wch:10},{wch:12},{wch:12},{wch:15},{wch:12},{wch:12},{wch:20},{wch:30},{wch:20}];
  XLSX.utils.book_append_sheet(wb, ws, 'Notices');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="notices_${today}.xlsx"`);
  res.send(buf);
});

// Export clients to Excel
router.get('/clients/excel', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const clients = db.prepare(`SELECT c.id, c.name as "Client Name", c.pan as "PAN", c.category as "Category", c.email as "Email", c.phone as "Phone", c.gstin as "GSTIN", c.ca_assigned as "CA Assigned", c.address as "Address", COUNT(n.id) as "Total Notices" FROM clients c LEFT JOIN notices n ON c.id=n.client_id GROUP BY c.id ORDER BY c.name ASC`).all();
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(clients);
  ws['!cols'] = [{wch:5},{wch:25},{wch:15},{wch:15},{wch:25},{wch:15},{wch:18},{wch:20},{wch:30},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws, 'Clients');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="clients_${today}.xlsx"`);
  res.send(buf);
});

// Download client import template
router.get('/clients/template', (req, res) => {
  const template = [{ 'Client Name': '', 'PAN': '', 'Category': 'Individual', 'Email': '', 'Phone': '', 'GSTIN': '', 'CA Assigned': '', 'Address': '' }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(template), 'Clients Template');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="client_import_template.xlsx"');
  res.send(buf);
});

// Import clients from Excel
router.post('/clients/import', async (req, res) => {
  // This endpoint expects multipart/form-data with a file field
  const multer = require('multer');
  const upload = multer({ storage: multer.memoryStorage() }).single('file');
  upload(req, res, (err) => {
    if (err || !req.file) return res.status(400).json({ success: false, message: 'File upload failed' });
    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const stmt = db.prepare('INSERT OR IGNORE INTO clients (name,pan,category,email,phone,gstin,ca_assigned,address) VALUES (?,?,?,?,?,?,?,?)');
      let imported = 0;
      rows.forEach(r => {
        if (r['Client Name'] && r['PAN']) {
          try { stmt.run(r['Client Name'], r['PAN'].toUpperCase(), r['Category']||'Individual', r['Email']||'', r['Phone']||'', r['GSTIN']||'', r['CA Assigned']||'', r['Address']||''); imported++; }
          catch(e) { /* skip duplicates */ }
        }
      });
      res.json({ success: true, imported, message: `${imported} client(s) imported` });
    } catch(e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });
});

module.exports = router;
