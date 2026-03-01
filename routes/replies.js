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

  const prompt = `You are a Senior Chartered Accountant and Income Tax Advocate with 20+ years of experience in Indian Income Tax litigation. You have appeared before the ITAT, High Courts, and have deep knowledge of Income Tax Act 1961, CBDT Circulars, and landmark case laws from Taxmann and TaxGuru.

TASK: Draft a complete, formal, legally-sound reply to the Income Tax notice below. The reply must be ready to submit to the Income Tax Department without any editing.

━━━ CRITICAL INSTRUCTION ━━━
The user has provided some notes (facts, explanation, provisions). These are RAW NOTES — NOT final text.
Your job is to:
1. ANALYSE these notes to understand the legal position
2. IDENTIFY the strongest legal defenses applicable
3. BUILD well-structured legal arguments using the Income Tax Act, Rules, CBDT Circulars
4. CITE 2-3 specific landmark case laws (with court, year, citation) that support the taxpayer's position
5. Use FORMAL legal language throughout — never sound casual or informal
6. NEVER copy the user's raw notes verbatim — always convert them into polished legal arguments
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OFFICE DETAILS (for letterhead):
Firm: ${settings.office_name || 'CA Firm'}
Address: ${settings.office_address || ''}
CA Membership No.: ${settings.ca_membership || ''}
Date: ${today}

CLIENT DETAILS:
Name: ${notice.client_name}
PAN: ${notice.pan}
Address: ${notice.client_address || 'As per records on income tax portal'}
Assessment Year: ${notice.assessment_year || 'As per notice'}

NOTICE UNDER REPLY:
Type: ${notice.notice_type}
Section: ${notice.section || 'As per notice'}
DIN/Reference: ${notice.din || 'As per notice'}
Notice Date: ${notice.notice_date || 'As per notice'}
Due Date for Reply: ${notice.due_date}
Issuing Authority: ${notice.issuing_authority || 'The Assessing Officer'}
Notice Summary: ${notice.description || 'Income Tax notice requiring written response'}

USER'S RAW NOTES (use as context ONLY — do not copy verbatim):
--- Facts of the Case (from user) ---
${facts || '[No facts provided — build from notice context]'}

--- User's Client Explanation (raw) ---
${client_explanation || '[None provided]'}

--- Provisions/Cases to Emphasize (hints only) ---
${legal_provisions || '[None specified — use the most relevant ones from standard litigation practice]'}

--- Special Instructions ---
${additional_remarks || '[None]'}

INCOME TAX LAW REFERENCE (from built-in legal library — use where relevant):
${libContext || 'Refer to Income Tax Act, 1961 and applicable CBDT Circulars'}

━━━ REPLY FORMAT ━━━
Structure the reply as follows:

[LETTERHEAD]
Firm name, address, membership no., date

To,
[Designation of issuing officer]
[Department details]

Subject: Reply to Notice u/s ${notice.section || notice.notice_type} — A.Y. ${notice.assessment_year} — PAN: ${notice.pan}

Reference: Your Notice dated ${notice.notice_date || 'date as per notice'}, DIN: ${notice.din || 'as per notice'}

Respected Sir/Madam,

1. BRIEF BACKGROUND
[2-3 sentences establishing client's compliance history and the notice context]

2. FACTS OF THE CASE
[Well-articulated legal narrative based on user's facts — formal language, not copy-paste]

3. LEGAL SUBMISSIONS
[Core legal argument with specific section references]
[Cite specific CBDT Circulars with number and date if applicable]

4. CASE LAWS IN SUPPORT
[Cite 2-3 relevant Supreme Court / High Court / ITAT judgments with full citation:
Format: Case Name v. Respondent [Year] ITR/Taxmann citation (Court)]

5. PRAYER
[Clear prayer for relief — dropping of notice, deletion of addition, no penalty, etc.]

6. ENCLOSURES
[List of documents to be attached]

Yours faithfully,
For ${settings.office_name || 'CA Firm'}
CA Membership No.: ${settings.ca_membership || ''}
━━━━━━━━━━━━━━━━

Now draft the COMPLETE, READY-TO-SUBMIT reply:`;


  try {
    let generatedReply = '';
    const aiProvider = (settings.ai_provider || process.env.AI_PROVIDER || 'gemini').toLowerCase();
    const apiKey = aiProvider === 'openai'
      ? (settings.openai_api_key || process.env.OPENAI_API_KEY)
      : (settings.gemini_api_key || process.env.GEMINI_API_KEY);
    const hasKey = apiKey && apiKey.length > 10 && !apiKey.includes('your_');

    if (hasKey) {
      if (aiProvider === 'gemini') {
        // ── Gemini via @google/genai SDK ────────────────────────────────
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        generatedReply = (response.text || '').trim();
      } else {
        // ── OpenAI via node-fetch ────────────────────────────────────────
        const fetch = require('node-fetch');
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 5000,
            temperature: 0.2
          })
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
