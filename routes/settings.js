const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const data = rows.reduce((a, r) => { a[r.key] = r.value; return a; }, {});
  // Mask API keys
  if (data.gemini_api_key) data.gemini_api_key_set = data.gemini_api_key.length > 5;
  if (data.openai_api_key) data.openai_api_key_set = data.openai_api_key.length > 5;
  data.gemini_api_key = data.gemini_api_key ? '••••' + data.gemini_api_key.slice(-4) : '';
  data.openai_api_key = data.openai_api_key ? '••••' + data.openai_api_key.slice(-4) : '';
  res.json({ success: true, data });
});

router.post('/', (req, res) => {
  const allowed = ['office_name','office_address','ca_membership','ai_provider'];
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?,?,CURRENT_TIMESTAMP)');
  allowed.forEach(k => { if (req.body[k] !== undefined) stmt.run(k, req.body[k]); });
  res.json({ success: true, message: 'Settings saved' });
});

router.post('/ai', (req, res) => {
  const { ai_provider, gemini_api_key, openai_api_key } = req.body;
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?,?,CURRENT_TIMESTAMP)');
  if (ai_provider) stmt.run('ai_provider', ai_provider);
  if (gemini_api_key && !gemini_api_key.startsWith('••••')) stmt.run('gemini_api_key', gemini_api_key);
  if (openai_api_key && !openai_api_key.startsWith('••••')) stmt.run('openai_api_key', openai_api_key);
  res.json({ success: true, message: 'AI settings saved' });
});

module.exports = router;
