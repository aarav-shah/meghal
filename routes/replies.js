const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { db } = require('../database');

const UPLOAD_BASE = process.env.UPLOAD_BASE || path.join(__dirname, '..', 'uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOAD_BASE, 'replies')),
  filename: (req, file, cb) => cb(null, `supp_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// GET replies for a notice
router.get('/notice/:notice_id', (req, res) => {
  const replies = db.prepare('SELECT * FROM replies WHERE notice_id=? ORDER BY version DESC').all(req.params.notice_id);
  res.json({ success: true, data: replies });
});

// GET single reply
router.get('/:id', (req, res) => {
  const reply = db.prepare(`SELECT r.*, n.notice_type, n.section, n.assessment_year, n.din, c.name as client_name, c.pan FROM replies r JOIN notices n ON r.notice_id=n.id JOIN clients c ON r.client_id=c.id WHERE r.id=?`).get(req.params.id);
  if (!reply) return res.status(404).json({ success: false, message: 'Reply not found' });
  res.json({ success: true, data: reply });
});

// POST generate AI reply
router.post('/generate', upload.array('supporting_docs', 10), async (req, res) => {
  const { notice_id, client_id, facts, legal_provisions, client_explanation, additional_remarks } = req.body;
  if (!notice_id || !client_id) return res.status(400).json({ success: false, message: 'notice_id and client_id are required' });

  const notice = db.prepare(`SELECT n.*, c.name as client_name, c.pan, c.address as client_address FROM notices n JOIN clients c ON n.client_id=c.id WHERE n.id=?`).get(notice_id);
  if (!notice) return res.status(404).json({ success: false, message: 'Notice not found' });

  // Fetch relevant library entries (wider search)
  const section = notice.section || '';
  const libEntries = db.prepare("SELECT title, content, section_ref, source FROM library WHERE section_ref LIKE ? OR tags LIKE ? OR content LIKE ? LIMIT 5")
    .all(`%${section}%`, `%${section}%`, `%${section}%`);
  const libContext = libEntries.map(e => `[${e.title} | Source: ${e.source}]:\n${e.content}`).join('\n\n---\n\n');

  const settings = db.prepare("SELECT key, value FROM settings").all().reduce((a,r) => { a[r.key]=r.value; return a; }, {});
  const today = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });

  const prompt = `You are an expert Chartered Accountant and Income Tax Advocate with 20+ years of experience in Income Tax litigation in India. Draft a formal, professional, legally sound reply to the following Income Tax notice, suitable for submission to the Income Tax Department.

OFFICE LETTERHEAD:
Firm: ${settings.office_name || 'CA Firm'}
Address: ${settings.office_address || ''}
CA Membership No.: ${settings.ca_membership || ''}
Date: ${today}

CLIENT DETAILS:
Name: ${notice.client_name}
PAN: ${notice.pan}
Address: ${notice.client_address || 'As per records'}
Assessment Year: ${notice.assessment_year || 'Not specified'}

NOTICE DETAILS:
Type: ${notice.notice_type}
Section: ${notice.section || 'Not specified'}
DIN/Reference: ${notice.din || 'As per notice'}
Notice Date: ${notice.notice_date || 'As per notice'}
Due Date: ${notice.due_date}
Issuing Authority: ${notice.issuing_authority || 'The Assessing Officer'}

FACTS OF THE CASE:
${facts || 'Our client has been regularly filing returns and complying with all statutory requirements under the Income Tax Act, 1961.'}

CLIENT'S EXPLANATION:
${client_explanation || 'Client has maintained proper books of accounts and all relevant documents in support of the income/transactions under consideration.'}

LEGAL PROVISIONS TO CITE:
${legal_provisions || 'Income Tax Act, 1961 — relevant sections as applicable to the notice'}

ADDITIONAL REMARKS:
${additional_remarks || 'None'}

INCOME TAX LAW REFERENCE (from built-in legal library):
${libContext || 'As per Income Tax Act, 1961 and Income Tax Rules, 1962'}

INSTRUCTIONS FOR DRAFTING:
1. Start with proper letterhead format (use office details above)
2. Address "To, The Assessing Officer/Authority, [As per notice details]"
3. Subject line: "Reply to Notice u/s ${notice.section || notice.notice_type} — A.Y. ${notice.assessment_year} — PAN: ${notice.pan}"
4. Reference: "Your Notice dated ${notice.notice_date || 'date as per notice'}, DIN: ${notice.din || 'as applicable'}"
5. Salutation: "Respected Sir/Madam,"
6. Background and facts (numbered paragraph)
7. Client's submission (numbered paragraph)
8. Legal position with specific WORKING CITATIONS from landmark cases — Supreme Court, High Court, ITAT (cite case name, year, court, ITR citation)
9. CBDT circulars and notifications if applicable
10. Specific prayer/relief sought
11. List of enclosures
12. Signature block: "Yours faithfully, For ${settings.office_name || 'CA Firm'}, CA Membership No. ${settings.ca_membership || ''}"
13. Use formal legal language. Do NOT use placeholder text like [Insert] or [Add here].
14. The reply should be comprehensive, professionally drafted, and ready to submit.

Draft the complete, ready-to-use reply now:`;

  try {
    let generatedReply = '';
    const aiProvider = settings.ai_provider || 'gemini';
    const apiKey = aiProvider === 'openai' ? (settings.openai_api_key || process.env.OPENAI_API_KEY) : (settings.gemini_api_key || process.env.GEMINI_API_KEY);
    const hasKey = apiKey && apiKey.length > 10 && !apiKey.includes('your_');

    if (hasKey) {
      const fetch = require('node-fetch');
      if (aiProvider === 'gemini') {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 4096 } })
        });
        const data = await response.json();
        generatedReply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], max_tokens: 4000, temperature: 0.3 })
        });
        const data = await response.json();
        generatedReply = data.choices?.[0]?.message?.content || '';
      }
    }

    if (!generatedReply) generatedReply = generateFallback(notice, settings, facts, client_explanation, legal_provisions);

    const lastVersion = db.prepare('SELECT MAX(version) as v FROM replies WHERE notice_id=?').get(notice_id);
    const version = (lastVersion.v || 0) + 1;
    const r = db.prepare('INSERT INTO replies (notice_id,client_id,version,facts,legal_provisions,client_explanation,additional_remarks,generated_reply,status) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(notice_id, client_id, version, facts, legal_provisions, client_explanation, additional_remarks, generatedReply, 'Draft');

    res.json({ success: true, id: r.lastInsertRowid, version, reply: generatedReply, ai_used: hasKey, message: hasKey ? `Reply generated with ${aiProvider} AI` : 'Reply generated from template (add API key in Settings for AI-powered replies)' });
  } catch (e) {
    console.error('Reply generation error:', e.message);
    const fallback = generateFallback(notice, settings, facts, client_explanation, legal_provisions);
    const lastVersion = db.prepare('SELECT MAX(version) as v FROM replies WHERE notice_id=?').get(notice_id);
    const version = (lastVersion.v || 0) + 1;
    const r = db.prepare('INSERT INTO replies (notice_id,client_id,version,facts,legal_provisions,client_explanation,additional_remarks,generated_reply,status) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(notice_id, client_id, version, facts, legal_provisions, client_explanation, additional_remarks, fallback, 'Draft');
    res.json({ success: true, id: r.lastInsertRowid, version, reply: fallback, ai_used: false, message: 'Reply generated from template' });
  }
});

function generateFallback(notice, settings, facts, explanation, provisions) {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  return `${settings.office_name || 'CA FIRM'}
${settings.office_address || 'Office Address'}
Membership No.: ${settings.ca_membership || 'XXXXXX'}

Date: ${today}

To,
The Assessing Officer / Income Tax Authority
(As per notice details)

Subject: Reply to Notice u/s ${notice.section || notice.notice_type} — A.Y. ${notice.assessment_year || 'Not Specified'} — PAN: ${notice.pan}

Reference: Your Notice dated ${notice.notice_date || 'date as per notice'}, DIN: ${notice.din || 'as applicable'}

Respected Sir/Madam,

We, on behalf of our client ${notice.client_name} (PAN: ${notice.pan}), acknowledge receipt of the above-mentioned notice and respectfully submit our reply as under:

1. BACKGROUND AND FACTS:
${facts || 'Our client has been regularly filing returns and complying with all statutory requirements under the Income Tax Act, 1961. The client has maintained proper books of accounts and all transactions have been conducted through proper banking channels.'}

2. CLIENT'S SUBMISSION:
${explanation || 'Our client has maintained proper books of accounts and all relevant documents in support of the income/transactions under consideration. All transactions are genuine, properly recorded, and supported by documentary evidence.'}

3. LEGAL POSITION:
The following provisions are applicable to the present case:
${provisions || `• Income Tax Act, 1961 — Section ${notice.section || 'as applicable'}
• Income Tax Rules, 1962 — applicable rules
• CBDT Circulars and Notifications as applicable
• Relevant Supreme Court and High Court judgments`}

In light of the above provisions and the facts of the case, we respectfully submit that no adverse order may be passed against our client.

4. PRAYER:
In view of the above submissions, facts, and legal position, we humbly pray that:
(a) The notice/proceedings be dropped as the same is not sustainable in law and on facts;
(b) No penalty/addition be made in the assessment;
(c) Our client be treated as having fully complied with all statutory requirements;
(d) An opportunity of personal hearing be granted, if required.

We are enclosing the relevant documents for your kind perusal. We are available for any further clarification or personal hearing as may be required by your good office.

Thanking you,

Yours faithfully,

For ${settings.office_name || 'CA Firm'}


Chartered Accountant
Membership No.: ${settings.ca_membership || ''}

ENCLOSURES:
1. Copy of the notice received
2. Relevant supporting documents as applicable
3. Books of accounts / statements for the period under consideration
4. Any other documents as referred to in the body of this reply
`;
}

// PUT update reply
router.put('/:id', (req, res) => {
  const { generated_reply, status, facts, legal_provisions, client_explanation } = req.body;
  db.prepare('UPDATE replies SET generated_reply=?,status=?,facts=?,legal_provisions=?,client_explanation=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(generated_reply, status, facts, legal_provisions, client_explanation, req.params.id);
  res.json({ success: true, message: 'Reply updated' });
});

// DELETE reply
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM replies WHERE id=?').run(req.params.id);
  res.json({ success: true, message: 'Reply deleted' });
});

module.exports = router;
