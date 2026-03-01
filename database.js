const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use Railway volume if available, else local ./data
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'data')
  : path.join(__dirname, 'data');

const DB_PATH = path.join(DATA_DIR, 'litigation.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pan TEXT NOT NULL UNIQUE,
      email TEXT,
      phone TEXT,
      category TEXT DEFAULT 'Individual',
      gstin TEXT,
      it_username TEXT,
      it_password_enc TEXT,
      ca_assigned TEXT,
      address TEXT,
      notes TEXT,
      filing_status TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      notice_type TEXT NOT NULL,
      section TEXT,
      assessment_year TEXT,
      notice_date TEXT,
      due_date TEXT,
      din TEXT,
      issuing_authority TEXT,
      description TEXT,
      status TEXT DEFAULT 'Pending',
      priority TEXT DEFAULT 'Medium',
      assigned_to TEXT,
      remarks TEXT,
      notice_file TEXT,
      penalty_applicable TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notice_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notice_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mimetype TEXT,
      size INTEGER,
      tag TEXT DEFAULT 'Other',
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (notice_id) REFERENCES notices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notice_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      version INTEGER DEFAULT 1,
      facts TEXT,
      legal_provisions TEXT,
      client_explanation TEXT,
      additional_remarks TEXT,
      generated_reply TEXT,
      status TEXT DEFAULT 'Draft',
      reply_file TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (notice_id) REFERENCES notices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      section_ref TEXT,
      content TEXT NOT NULL,
      tags TEXT,
      source TEXT,
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      role TEXT DEFAULT 'Article',
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notice_id INTEGER,
      client_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      assigned_to_id INTEGER,
      assigned_to_name TEXT,
      due_date TEXT,
      status TEXT DEFAULT 'Pending',
      priority TEXT DEFAULT 'Medium',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (notice_id) REFERENCES notices(id) ON DELETE SET NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_to_id) REFERENCES staff(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS hearings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notice_id INTEGER,
      client_id INTEGER NOT NULL,
      hearing_date TEXT NOT NULL,
      hearing_time TEXT,
      venue TEXT,
      authority TEXT,
      notes TEXT,
      outcome TEXT,
      status TEXT DEFAULT 'Scheduled',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (notice_id) REFERENCES notices(id) ON DELETE SET NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
  `);

  // Default settings
  const defaultSettings = [
    ['office_name',    process.env.OFFICE_NAME    || 'Your CA Firm Name'],
    ['office_address', process.env.OFFICE_ADDRESS || 'Your Office Address'],
    ['ca_membership',  process.env.CA_MEMBERSHIP  || 'Your Membership No.'],
    ['ai_provider',    process.env.AI_PROVIDER    || 'gemini'],
    ['gemini_api_key', process.env.GEMINI_API_KEY || ''],
    ['openai_api_key', process.env.OPENAI_API_KEY || ''],
  ];
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  defaultSettings.forEach(([k, v]) => insertSetting.run(k, v));

  // Default library
  const libCount = db.prepare('SELECT COUNT(*) as cnt FROM library').get();
  if (libCount.cnt === 0) insertDefaultLibrary();

  console.log('✅ Database initialized');
}

function insertDefaultLibrary() {
  const entries = [
    {
      title: 'Section 143(1) — Intimation after Processing',
      category: 'Notice Explanation', section_ref: '143(1)',
      content: `Section 143(1) is an intimation issued after processing the return of income. It may show (a) tax refund due, (b) additional demand, or (c) no refund/demand. This is NOT an assessment order.

COMMON DEMAND REASONS: Incorrect TDS claim, arithmetic errors, disallowance of exemptions, mismatch with Form 26AS/AIS.
DOCUMENTS REQUIRED FROM CLIENT: Form 26AS, AIS/TIS, original return, bank statements, Form 16/16A, proof of deductions.
REPLY APPROACH: File rectification u/s 154 if error is on department's part. File response on IT portal within 30 days. Cite CBDT Circular 21/2019 on intimation process.
KEY CASE LAWS: Vodafone India Services Pvt. Ltd. v. UOI (2014) 368 ITR 1 (SC) — on intimation being limited to apparent errors.`,
      tags: '143,143(1),intimation,processing,rectification,demand', source: 'Income Tax Act 1961'
    },
    {
      title: 'Section 148/148A — Reassessment Notice',
      category: 'Notice Explanation', section_ref: '148/148A',
      content: `Post Finance Act 2021, mandatory procedure u/s 148A applies before issuance of 148:
(a) 148A(a) — AO conducts enquiry with prior approval
(b) 148A(b) — Show cause notice to taxpayer (7-30 days to reply)
(c) 148A(c) — AO passes order on whether to proceed
(d) 148A(d) — Order passed, then 148 notice issued

TIME LIMITS: 3 years (income < ₹50L escaped), 10 years (income ≥ ₹50L with evidence).
DOCUMENTS: All documents for relevant AY — ITR, books, bank statements, investment proofs.
KEY CASE LAWS: Union of India v. Ashish Agarwal (2022) 444 ITR 1 (SC) — on validity of 148A process; GKN Driveshafts (India) Ltd. v. ITO [2003] 259 ITR 19 (SC) — on challenge to reopening.
REPLY APPROACH: Challenge escapement reasoning. Provide complete disclosure. Cite CBDT Instruction No. 1/2022.`,
      tags: '148,148A,reassessment,escaped income,reopening', source: 'Income Tax Act 1961, Finance Act 2021'
    },
    {
      title: 'Section 131 — Summons to Appear / Produce Books',
      category: 'Notice Explanation', section_ref: '131',
      content: `Section 131 empowers IT authority to summon any person and compel production of books/documents. Non-compliance: penalty u/s 272A (₹10,000 per default).

DOCUMENTS: Books of accounts, ledgers, vouchers, invoices, bank passbooks for the period in summons.
REPLY APPROACH: Comply fully or seek adjournment with valid reason. Request copy of assessment records. Challenge jurisdiction if applicable.
KEY CASE LAWS: S.M.S. Tea Estates Pvt. Ltd. v. CIT [2011] 335 ITR 1 (SC) — on scope of summons power.`,
      tags: '131,summons,books of accounts,272A', source: 'Income Tax Act 1961'
    },
    {
      title: 'Section 133(6) — Information from Third Party',
      category: 'Notice Explanation', section_ref: '133(6)',
      content: `Section 133(6) empowers AO to gather information from any person/institution about transactions with the taxpayer. This is a PRELIMINARY inquiry — NOT an assessment notice.

DOCUMENTS: Transaction records, contracts, invoices, bank statements, purpose of transaction.
REPLY APPROACH: Provide precise information requested. Explain nature and genuineness of transactions. Submit within due date.
NOTE: Post Finance Act 2014, this power can be exercised even in non-pending assessment cases.`,
      tags: '133(6),third party,information,inquiry', source: 'Income Tax Act 1961'
    },
    {
      title: 'Section 142(1) — Enquiry Before Assessment',
      category: 'Notice Explanation', section_ref: '142(1)',
      content: `Section 142(1) is issued to call for specific information, documents, or accounts from the taxpayer before or during assessment. Non-compliance: penalty u/s 271(1)(b) ₹10,000 per default.

TYPES: (i) Return filing direction (ii) Documents/accounts production (iii) Special audit u/s 142(2A).
DOCUMENTS: Whatever is specifically called for — books, ledgers, bank statements, contracts, vouchers.
REPLY APPROACH: Comply fully and within time. Request adjournment in writing if needed. Maintain proof of submission.`,
      tags: '142(1),enquiry,assessment,271(1)(b)', source: 'Income Tax Act 1961'
    },
    {
      title: 'Section 156 — Demand Notice',
      category: 'Notice Explanation', section_ref: '156',
      content: `Section 156 demand notice is issued when any tax, penalty, fine, interest is payable after an order. Tax must be paid within 30 days. Non-payment: interest u/s 220(2) at 1% per month.

DOCUMENTS: Demand notice, assessment order, computation sheet, prior returns.
REPLY APPROACH: If agreeing — pay immediately. If disputing — file appeal u/s 246A before CIT(A) and apply for stay of demand.
KEY CASE LAWS: KEC International Ltd. v. B.R. Balakrishnan [2001] 251 ITR 158 (Bom HC) — conditions for stay of demand; Instruction 1914 — standard for 20% pre-deposit for stay.`,
      tags: '156,demand,tax payment,stay,220(2),246A', source: 'Income Tax Act 1961'
    },
    {
      title: 'Section 245 — Refund Adjustment',
      category: 'Notice Explanation', section_ref: '245',
      content: `Section 245 notice is issued when department proposes to adjust/withhold refund against outstanding demand for any other AY. Taxpayer must be given opportunity to be heard before adjustment.

DOCUMENTS: Assessment orders for both AYs, challans, returns, appeal orders.
REPLY APPROACH: If demand is disputed — furnish details of pending appeal/rectification. If demand is paid — provide challan copies. Response must be filed within 30 days.`,
      tags: '245,refund adjustment,outstanding demand', source: 'Income Tax Act 1961'
    },
    {
      title: 'Section 263 — Revision by Commissioner',
      category: 'Notice Explanation', section_ref: '263',
      content: `Section 263 empowers Principal CIT/CIT to revise assessment order if it is BOTH erroneous AND prejudicial to interests of revenue. Time limit: 2 years from end of year in which order was passed.

DOCUMENTS: Assessment order, return, all documents, correspondence with AO.
REPLY APPROACH: Challenge jurisdiction — order must be BOTH erroneous AND prejudicial (not just one). 
KEY CASE LAWS: CIT v. Max India Ltd. [2007] 295 ITR 282 (SC) — both conditions must co-exist; Malabar Industrial Co. Ltd. v. CIT [2000] 243 ITR 83 (SC) — definition of erroneous and prejudicial.`,
      tags: '263,revision,CIT,erroneous,prejudicial', source: 'Income Tax Act 1961, SC Judgments'
    },
    {
      title: 'Section 271(1)(c) — Penalty for Concealment',
      category: 'Penalty Reference', section_ref: '271(1)(c)',
      content: `Penalty for concealment of income or furnishing inaccurate particulars. Range: 100%–300% of tax sought to be evaded.

DEFENSE STRATEGIES:
1. Bona fide mistake — no mens rea for concealment
2. Full disclosure of all facts — no concealment intent
3. Reliance on professional/legal advice
4. Distinction between mere mistake vs. deliberate concealment
KEY CASE LAWS: Dharmendra Textile Processors v. CIT [2007] 295 ITR 244 (SC) — penalty not automatic; requires finding of concealment; CIT v. Reliance Petroproducts [2010] 322 ITR 158 (SC) — wrong claim ≠ concealment.
NOTE: Post Finance Act 2016, Explanation 4 — specific treatment for undisclosed foreign assets.`,
      tags: '271(1)(c),penalty,concealment,inaccurate particulars,mens rea', source: 'Income Tax Act 1961'
    },
    {
      title: 'Section 271(1)(b) — Penalty for Non-Compliance',
      category: 'Penalty Reference', section_ref: '271(1)(b)',
      content: `Penalty of ₹10,000 for EACH failure to comply with notice u/s 142(1) or 143(2) or directions u/s 142(2A). AO must be satisfied that failure was WITHOUT REASONABLE CAUSE.

DEFENSE: Reasonable cause (illness, calamity, incomplete client information). Earlier compliance attempts. Adjournment requests pending.
KEY CASE LAWS: Smt. Mrudula Nareshkumar v. DCIT — reasonable cause is a valid defense.`,
      tags: '271(1)(b),penalty,non-compliance,notice', source: 'Income Tax Act 1961'
    },
    {
      title: 'Interest u/s 234A — Default in Filing Return',
      category: 'Penalty Reference', section_ref: '234A',
      content: `Interest at 1% per month (or part thereof) on tax payable for delay in filing return beyond due date. Calculated on self-assessment tax due after advance tax and TDS.

WAIVER: Apply to CBDT u/s 119(2)(b) in genuine hardship cases. Interest is mandatory and waiver is exceptional.
KEY CASE LAWS: ITO v. M/s. Novel Enterprises [2015] — on computation of 234A interest.`,
      tags: '234A,interest,return filing,delay', source: 'Income Tax Act 1961'
    },
    {
      title: 'CBDT Circular No. 19/2019 — Faceless E-Assessment',
      category: 'CBDT Circulars', section_ref: 'E-Assessment',
      content: `CBDT Circular 19/2019 introduces Faceless Assessment u/s 143(3A). Key features: Random case allocation, team-based assessment, NO physical interface, all responses through IT portal only. Further enhanced by Faceless Assessment Scheme 2019 & 2020.

IMPORTANT: All responses must be filed through ITBA portal/registered email only. Personal hearings only through video conferencing. Time limits strictly enforced.`,
      tags: 'faceless assessment,e-assessment,CBDT,143(3A),digital', source: 'CBDT Circular No. 19/2019'
    },
    {
      title: 'Section 68 — Unexplained Cash Credit',
      category: 'Notice Explanation', section_ref: '68',
      content: `Section 68 applies where a sum is found credited in books of accounts and the assessee offers no explanation or the explanation is not satisfactory. Such sum is taxed as income.

DOCUMENTS: Source of credit, nature of transaction, identity of creditor, creditworthiness proof, genuineness of transaction.
KEY CASE LAWS: CIT v. Orissa Corporation [1986] 159 ITR 78 (SC) — onus on assessee; Sumati Dayal v. CIT [1995] 214 ITR 801 (SC) — on satisfactory explanation.
REPLY APPROACH: Prove (a) identity of creditor, (b) creditworthiness, (c) genuineness of transaction. Submit bank statements, IT returns of creditor, confirmation letters.`,
      tags: '68,unexplained credit,cash credit,bogus', source: 'Income Tax Act 1961'
    },
    {
      title: 'ITAT Landmark — Genuineness of Long-Term Capital Gain',
      category: 'Case Laws', section_ref: 'LTCG/68/69',
      content: `Key ITAT precedents on LTCG from penny stocks / SME shares:

1. Principal CIT v. NRA Iron & Steel (P.) Ltd. [2019] 103 taxmann.com 48 (SC) — AO can investigate genuineness of LTCG claims.
2. Udit Kalra v. ITO [2019] (ITAT Delhi) — mere filing of documents insufficient; economic substance required.
3. ACIT v. Parveen Kumar Gupta [2013] (ITAT Kolkata) — purchase price must be justified.

DEFENSE APPROACH: Show genuine market transactions, broker contract notes, demat statements, payment through banking channels.`,
      tags: 'LTCG,penny stocks,capital gain,ITAT,68,genuineness', source: 'ITAT/Supreme Court'
    },
  ];

  const stmt = db.prepare('INSERT INTO library (title,category,section_ref,content,tags,source) VALUES (?,?,?,?,?,?)');
  entries.forEach(e => stmt.run(e.title, e.category, e.section_ref, e.content, e.tags, e.source));
  console.log('✅ Default library entries inserted');
}

module.exports = { db, initDB };
