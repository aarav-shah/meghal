const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

// ─── PDF UPLOAD + AI EXTRACTION ───────────────────────────────────────────
// POST /api/notices/upload-pdf — upload PDF and get AI-extracted fields
router.post('/upload-pdf', upload.single('notice_pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No PDF uploaded' });

  try {
    // Get AI settings first
    const settings = db.prepare('SELECT key, value FROM settings').all()
      .reduce((a, r) => { a[r.key] = r.value; return a; }, {});
    const aiProvider = (settings.ai_provider || process.env.AI_PROVIDER || 'gemini').toLowerCase();
    const apiKey = aiProvider === 'openai'
      ? (settings.openai_api_key || process.env.OPENAI_API_KEY)
      : (settings.gemini_api_key || process.env.GEMINI_API_KEY);
    const hasKey = apiKey && apiKey.length > 10 && !apiKey.includes('your_');

    // Read the uploaded file
    const fileBuffer = fs.readFileSync(req.file.path);
    const base64PDF = fileBuffer.toString('base64');
    const mimeType = req.file.mimetype || 'application/pdf';

    let extracted = null;
    let aiUsed = false;

    const prompt = `You are an OCR and Document Analysis AI. Read the following Indian Income Tax Notice and extract the details requested.
Reply ONLY in valid JSON format matching this exact structure, putting null if unable to find the data:
{ "issuingAuthority": "name of authority", "section": "section invoked like 148A(b), 143(2) etc", "din": "document identification number", "issueDate": "YYYY-MM-DD", "dueDate": "YYYY-MM-DD", "noticeType": "e.g. Reassessment or Scrutiny", "assessment_year": "e.g. 2022-23", "main_issue": "brief summary of what the notice demands" }

If any field is not found or not clear, use null. For dueDate, if given as 'within 30 days' from a notice date, calculate the actual date.`;

    if (hasKey) {
      // ── Gemini path: send PDF directly using @google/genai SDK ──────────
      if (aiProvider === 'gemini') {
        try {
          const { GoogleGenAI } = require('@google/genai');
          const ai = new GoogleGenAI({ apiKey });

          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: base64PDF,
                    },
                  },
                  { text: prompt },
                ],
              },
            ],
          });

          let rawText = response.text || '';
          rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            extracted = JSON.parse(jsonMatch[0]);
            aiUsed = true;
          }
        } catch (geminiErr) {
          console.warn('Gemini SDK extraction failed:', geminiErr.message);
        }
      }

      // ── OpenAI path (or Gemini vision fallback): text extraction + AI ──
      if (!extracted) {
        let pdfText = '';
        try {
          const pdfParse = require('pdf-parse');
          const pdfData = await pdfParse(fileBuffer);
          pdfText = pdfData.text || '';
        } catch (e) {
          console.warn('pdf-parse failed:', e.message);
        }

        if (pdfText.trim().length > 50) {
          const textPrompt = prompt + '\n\nNotice text:\n' + pdfText.substring(0, 8000);
          try {
            let rawText = '';

            if (aiProvider === 'openai') {
              const fetch = require('node-fetch');
              const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                  model: 'gpt-4o',
                  messages: [{ role: 'user', content: textPrompt }],
                  max_tokens: 1000, temperature: 0.1,
                  response_format: { type: 'json_object' }
                })
              });
              const data = await response.json();
              rawText = data.choices?.[0]?.message?.content || '{}';
            } else {
              // Gemini text fallback when vision call failed
              const { GoogleGenAI } = require('@google/genai');
              const ai = new GoogleGenAI({ apiKey });
              const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: textPrompt,
              });
              rawText = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
            }

            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) { extracted = JSON.parse(jsonMatch[0]); aiUsed = true; }
          } catch (textAiErr) {
            console.warn('Text AI extraction failed:', textAiErr.message);
          }
        }
      }
    }

    // ── Rule-based fallback if no AI or AI failed ─────────────────────────
    if (!extracted) {
      let pdfText = '';
      try {
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(fileBuffer);
        pdfText = pdfData.text || '';
      } catch (e) {}
      if (pdfText.trim().length > 30) {
        extracted = ruleBasedExtraction(pdfText);
      }
    }

    // Normalise field names: AI may return camelCase variants
    if (extracted) {
      extracted.issuing_authority = extracted.issuing_authority || extracted.issuingAuthority || null;
      extracted.notice_date      = extracted.notice_date      || extracted.issueDate         || null;
      extracted.due_date         = extracted.due_date         || extracted.dueDate           || null;
      extracted.notice_type      = extracted.notice_type      || extracted.noticeType        || null;
      // Clean up redundant camelCase keys
      delete extracted.issuingAuthority; delete extracted.issueDate;
      delete extracted.dueDate;          delete extracted.noticeType;
    }

    const message = aiUsed
      ? '🤖 AI read and extracted notice details — please review and confirm'
      : extracted
        ? '📋 Basic text extraction done — please review and fill missing fields'
        : hasKey
          ? '⚠️ This appears to be a scanned PDF. AI tried to read it but could not extract details clearly. Please fill fields manually.'
          : '📋 PDF uploaded. Add a Gemini API key in Settings to enable automatic extraction from scanned notices.';

    res.json({
      success: true,
      filename: req.file.filename,
      extracted,
      ai_used: aiUsed,
      message
    });
  } catch (err) {
    console.error('PDF processing error:', err);
    res.json({
      success: true,
      filename: req.file?.filename || null,
      extracted: null,
      message: 'PDF uploaded. Extraction failed: ' + err.message + '. Please fill fields manually.'
    });
  }
});



// Rule-based extraction fallback
function ruleBasedExtraction(text) {

  const extracted = {};
  // Section
  const secMatch = text.match(/[Ss]ection\s+(\d+[A-Za-z()/*\d]*)/);
  extracted.section = secMatch ? secMatch[1] : null;

  // AY
  const ayMatch = text.match(/(?:Assessment\s+Year|A\.Y\.?)\s*[:\-]?\s*(\d{4}-\d{2})/i);
  extracted.assessment_year = ayMatch ? ayMatch[1] : null;

  // DIN
  const dinMatch = text.match(/DIN[:\s]+([A-Z0-9\/\-]{10,25})/i);
  extracted.din = dinMatch ? dinMatch[1].trim() : null;

  // Due date — look for date patterns near keywords
  const dueDatePatterns = [
    /(?:on or before|last date|due date|comply by|within.*?by)\s*[:\-]?\s*(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4})/i,
    /(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{4})/
  ];
  for (const pat of dueDatePatterns) {
    const m = text.match(pat);
    if (m) {
      // Try to parse date
      const raw = m[1];
      const parts = raw.split(/[-\/\.]/);
      if (parts.length === 3) {
        const [d, mo, y] = parts;
        const yr = y.length === 2 ? '20' + y : y;
        extracted.due_date = `${yr}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
        break;
      }
    }
  }

  // Notice type
  const typePatterns = [
    /[Nn]otice\s+under\s+[Ss]ection\s+([\d()A-Za-z/]+)/,
    /[Ss]how\s+[Cc]ause\s+[Nn]otice/,
    /[Ss]ummons/,
    /[Ii]ntimation/
  ];
  for (const pat of typePatterns) {
    const m = text.match(pat);
    if (m) { extracted.notice_type = m[0]; break; }
  }

  // PAN
  const panMatch = text.match(/[A-Z]{5}[0-9]{4}[A-Z]/);
  extracted.pan = panMatch ? panMatch[0] : null;

  extracted.main_issue = 'Please review the notice and summarize the main issue.';
  return extracted;
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
  const { client_id, notice_type, section, assessment_year, notice_date, due_date, din, issuing_authority, description, status, priority, assigned_to, remarks, main_issue, extracted_filename } = req.body;
  if (!client_id || !notice_type) return res.status(400).json({ success: false, message: 'client_id and notice_type are required' });
  // Use pre-uploaded filename from AI extraction, or new file, or null
  const notice_file = req.file ? req.file.filename : (extracted_filename || null);
  const penalty = getPenalty(section, notice_type);
  const r = db.prepare('INSERT INTO notices (client_id,notice_type,section,assessment_year,notice_date,due_date,din,issuing_authority,description,status,priority,assigned_to,remarks,notice_file,penalty_applicable) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(client_id, notice_type, section, assessment_year, notice_date, due_date, din, issuing_authority, description || main_issue, status||'Pending', priority||'Medium', assigned_to, remarks, notice_file, penalty);
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
