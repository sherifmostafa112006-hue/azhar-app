const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// إنشاء المجلدات الأساسية
['views', 'public'].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d); });

// ========== package.json ==========
fs.writeFileSync('package.json', JSON.stringify({
  "name": "azhar-app",
  "version": "1.0.0",
  "description": "موقع مواد الفرقة الثالثة لغة عربية - جامعة الأزهر",
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": {
    "express": "^4.18.2",
    "ejs": "^3.1.9",
    "express-session": "^1.17.3",
    "bcrypt": "^5.1.1",
    "sql.js": "^1.9.0",
    "dotenv": "^16.3.1"
  }
}, null, 2));

// ========== database.js ==========
fs.writeFileSync('database.js', `
const initSqlJs = require('sql.js');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.db');
let db;

async function initDatabase() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(\`
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, subtitle TEXT, icon TEXT, color TEXT,
      card_class TEXT, curriculum TEXT DEFAULT ''
    )
  \`);
  db.run(\`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id TEXT NOT NULL,
      name TEXT NOT NULL, type TEXT, url TEXT,
      FOREIGN KEY (subject_id) REFERENCES subjects(id)
    )
  \`);
  db.run(\`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL, is_admin INTEGER DEFAULT 0
    )
  \`);

  const subjects = [
    { id:'hadith', name:'الحديث الشريف', subtitle:'مادة شرعية', icon:'fa-solid fa-scroll', color:'#6b4226', card_class:'c-hadith' },
    { id:'fiqh', name:'الفقه الإسلامي', subtitle:'مادة شرعية', icon:'fa-solid fa-gavel', color:'#1b5e20', card_class:'c-fiqh' },
    { id:'geography', name:'الجغرافيا', subtitle:'جغرافيا العالم الإسلامي', icon:'fa-solid fa-earth-africa', color:'#0d47a1', card_class:'c-geo' },
    { id:'french', name:'اللغة الفرنسية', subtitle:'Français - Niveau 3', icon:'fa-solid fa-language', color:'#b71c1c', card_class:'c-french' },
    { id:'english', name:'اللغة الإنجليزية', subtitle:'English - Advanced', icon:'fa-solid fa-globe', color:'#1a237e', card_class:'c-english' },
    { id:'crusades', name:'تاريخ الحملات الصليبية', subtitle:'العصور الوسطى', icon:'fa-solid fa-shield-halved', color:'#4a148c', card_class:'c-crusades' },
    { id:'ottoman', name:'تاريخ الخلافة العثمانية', subtitle:'التاريخ الحديث', icon:'fa-solid fa-crown', color:'#880e4f', card_class:'c-ottoman' },
    { id:'research', name:'قاعة البحث', subtitle:'منهجية البحث', icon:'fa-solid fa-magnifying-glass', color:'#004d40', card_class:'c-research' }
  ];
  const stmt = 'INSERT OR IGNORE INTO subjects (id,name,subtitle,icon,color,card_class) VALUES (?,?,?,?,?,?)';
  subjects.forEach(s => db.run(stmt, [s.id, s.name, s.subtitle||'', s.icon||'', s.color||'', s.card_class||'']));

  const admin = db.exec("SELECT id FROM users WHERE username = 'admin'");
  if (admin.length === 0 || admin[0].values.length === 0) {
    db.run('INSERT INTO users (username,password,is_admin) VALUES (?,?,1)', ['admin', bcrypt.hashSync('admin123', 10)]);
  }

  saveDatabase();
  return db;
}

function saveDatabase() { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); }
function all(sql, params=[]) { const rows = []; db.each(sql, params, r => rows.push(r)); return rows; }
function get(sql, params=[]) { return all(sql, params)[0]; }
function run(sql, params=[]) { db.run(sql, params); saveDatabase(); return {changes:1}; }

module.exports = { initDatabase, saveDatabase, all, get, run, getDb: ()=> db };
`.trim());

// ========== server.js ==========
fs.writeFileSync('server.js', `
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const database = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

database.initDatabase().then(() => {
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.urlencoded({ extended: true }));
  app.use(session({
    secret: process.env.SESSION_SECRET || 'azhar-secret-key-change-this',
    resave: false, saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
  }));

  app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
  });

  app.get('/', (req, res) => {
    const subjects = database.all('SELECT * FROM subjects ORDER BY id');
    const fileCounts = database.all('SELECT subject_id, COUNT(*) as count FROM files GROUP BY subject_id');
    const countMap = {};
    fileCounts.forEach(f => countMap[f.subject_id] = f.count);
    subjects.forEach(s => s.fileCount = countMap[s.id] || 0);
    res.render('index', { subjects });
  });

  app.get('/subject/:id', (req, res) => {
    const subject = database.get('SELECT * FROM subjects WHERE id = ?', [req.params.id]);
    if (!subject) return res.status(404).send('المادة غير موجودة');
    const files = database.all('SELECT * FROM files WHERE subject_id = ?', [subject.id]);
    res.render('subject', { subject, files });
  });

  app.get('/login', (req, res) => res.render('login', { error: null }));
  app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = database.get('SELECT * FROM users WHERE username = ?', [username]);
    if (user && bcrypt.compareSync(password, user.password)) {
      req.session.user = { id: user.id, username: user.username, is_admin: user.is_admin };
      return res.redirect('/edit');
    }
    res.render('login', { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  });

  app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
  });

  function requireAdmin(req, res, next) {
    if (req.session.user && req.session.user.is_admin === 1) return next();
    res.redirect('/login');
  }

  app.get('/edit', requireAdmin, (req, res) => {
    const subjects = database.all('SELECT * FROM subjects ORDER BY id');
    const subjectsWithFiles = subjects.map(s => ({
      ...s,
      files: database.all('SELECT * FROM files WHERE subject_id = ?', [s.id])
    }));
    res.render('edit', { subjects: subjectsWithFiles, success: req.query.success || null });
  });

  app.post('/edit/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { curriculum, fileNames, fileTypes, fileUrls } = req.body;
    database.run('UPDATE subjects SET curriculum = ? WHERE id = ?', [curriculum || '', id]);
    database.run('DELETE FROM files WHERE subject_id = ?', [id]);
    if (fileNames && Array.isArray(fileNames)) {
      fileNames.forEach((name, i) => {
        if (name.trim()) {
          database.run('INSERT INTO files (subject_id, name, type, url) VALUES (?,?,?,?)',
            [id, name.trim(), fileTypes[i] || 'آخر', fileUrls[i] || '']);
        }
      });
    }
    res.redirect('/edit?success=1');
  });

  app.listen(PORT, () => {
    console.log('🚀 الموقع شغال على http://localhost:' + PORT);
    console.log('🔑 الأدمن: admin / admin123');
  });
}).catch(err => console.error('❌ فشل تحميل قاعدة البيانات:', err));
`.trim());

// ========== public/style.css ==========
fs.writeFileSync('public/style.css', `
:root {
    --bg: #f5f0e8;
    --card-bg: #ffffff;
    --text: #1a1a2e;
    --primary: #0d4a35;
    --accent: #d4a843;
    --shadow: 0 8px 30px rgba(0, 0, 0, 0.07);
    --shadow-hover: 0 16px 40px rgba(0, 0, 0, 0.14);
    --border-radius: 20px;
    --transition: 0.35s ease;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    font-family: 'Cairo', 'Tajawal', sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    line-height: 1.7;
    direction: rtl;
    text-align: right;
    position: relative;
    overflow-x: hidden;
}

/* خلفية ديناميكية */
body::before {
    content: '';
    position: fixed;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background:
        radial-gradient(circle at 20% 30%, rgba(212, 168, 67, 0.08) 0%, transparent 40%),
        radial-gradient(circle at 80% 70%, rgba(11, 78, 63, 0.07) 0%, transparent 40%),
        radial-gradient(circle at 50% 50%, rgba(180, 150, 90, 0.04) 0%, transparent 50%);
    z-index: 0;
    pointer-events: none;
    animation: bgFloat 20s ease-in-out infinite alternate;
}

@keyframes bgFloat {
    0% { transform: translate(0, 0) rotate(0deg); }
    100% { transform: translate(-15px, 10px) rotate(2deg); }
}

/* طبقة النقاط */
body::after {
    content: '';
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background-image:
        radial-gradient(circle at 15% 25%, rgba(11, 78, 63, 0.04) 1px, transparent 1px),
        radial-gradient(circle at 75% 55%, rgba(212, 168, 67, 0.04) 1px, transparent 1px);
    background-size: 100px 100px, 120px 120px;
    z-index: 0; pointer-events: none; opacity: 0.5;
}

/* كل المحتوى فوق الخلفية */
header, section, main, .container, .hero, .login-container, .edit-container {
    position: relative; z-index: 1;
}

/* الهيدر */
.header {
    background: linear-gradient(135deg, #0d4a35, #0b6e4f);
    color: #fff;
    padding: 14px 28px;
    position: sticky; top: 0; z-index: 100;
    box-shadow: 0 6px 30px rgba(0,0,0,0.25);
}
.header-inner {
    max-width: 1200px; margin: 0 auto;
    display: flex; align-items: center; justify-content: space-between;
}
.logo-area { display: flex; align-items: center; gap: 12px; }
.logo-icon { font-size: 2.6rem; color: var(--accent); }
.logo-text h1 { font-size: 1.3rem; font-weight: 800; }
.logo-text span { font-size: 0.75rem; opacity: 0.85; }
.header-badge {
    background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2);
    padding: 8px 18px; border-radius: 50px; font-size: 0.85rem; font-weight: 600;
    display: flex; align-items: center; gap: 8px;
}
.header-badge i { color: var(--accent); }

/* الهيرو */
.hero { text-align: center; padding: 50px 20px 30px; max-width: 750px; margin: 0 auto; }
.hero h2 { font-size: 2rem; font-weight: 900; color: var(--primary); margin-bottom: 8px; }
.hero .line { width: 60px; height: 4px; background: var(--accent); margin: 10px auto 16px; border-radius: 2px; }
.hero p { font-size: 1rem; color: #666; }

/* شبكة المواد */
.container { max-width: 1200px; margin: 0 auto; padding: 20px; }
.subjects-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 22px; }

.subject-card {
    background: var(--card-bg);
    border-radius: var(--border-radius);
    padding: 28px 24px;
    cursor: pointer;
    transition: var(--transition);
    box-shadow: var(--shadow);
    border: 2px solid transparent;
    display: flex; flex-direction: column; gap: 12px;
    text-decoration: none; color: inherit;
}
.subject-card:hover { transform: translateY(-8px); box-shadow: var(--shadow-hover); border-color: #d5cdb8; }
.subject-card .icon-wrap {
    width: 50px; height: 50px; border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.4rem; color: #fff; transition: var(--transition);
}
.subject-card:hover .icon-wrap { transform: rotate(-5deg) scale(1.07); }
.subject-card h3 { font-size: 1.2rem; font-weight: 800; }
.subject-card .hint { font-size: 0.8rem; color: #999; }
.card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
.card-footer .badge { font-size: 0.7rem; background: #f0ede4; padding: 5px 10px; border-radius: 20px; font-weight: 600; color: #777; }
.card-footer .arrow { color: #ccc; transition: var(--transition); }
.subject-card:hover .arrow { color: var(--accent); transform: translateX(-4px); }

/* ألوان الأيقونات */
.c-hadith .icon-wrap { background: #6b4226; }
.c-fiqh .icon-wrap { background: #1b5e20; }
.c-geo .icon-wrap { background: #0d47a1; }
.c-french .icon-wrap { background: #b71c1c; }
.c-english .icon-wrap { background: #1a237e; }
.c-crusades .icon-wrap { background: #4a148c; }
.c-ottoman .icon-wrap { background: #880e4f; }
.c-research .icon-wrap { background: #004d40; }

/* صفحة المادة */
.curriculum-box {
    background: #fdfaf0; border: 1px solid #f0e6c8; border-radius: 12px;
    padding: 18px; margin-bottom: 20px; line-height: 1.9; white-space: pre-wrap;
}
.file-row {
    display: flex; align-items: center; gap: 12px; padding: 14px 16px;
    border-radius: 10px; background: #f9fafb; border: 1px solid #eef0f3;
    margin-bottom: 8px; transition: var(--transition); text-decoration: none; color: inherit;
}
.file-row:hover { background: #eef2f7; border-color: #d5dbe3; }
.file-row .f-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
.f-pdf { background: #fce4e4; color: #c62828; }
.f-doc { background: #e3f2fd; color: #0d47a1; }
.f-ppt { background: #fff3e0; color: #e65100; }
.f-video { background: #f3e5f5; color: #6a1b9a; }
.f-audio { background: #e8f5e9; color: #1b5e20; }
.f-link { background: #e8eaf6; color: #283593; }
.f-other { background: #eceff1; color: #455a64; }
.file-row .f-name { font-weight: 700; font-size: 0.9rem; }
.file-row .f-meta { font-size: 0.7rem; color: #999; }

/* أزرار */
.btn {
    padding: 10px 22px; border-radius: 50px; border: none;
    font-family: inherit; font-weight: 700; font-size: 0.85rem;
    cursor: pointer; transition: var(--transition);
    display: inline-flex; align-items: center; gap: 8px; text-decoration: none;
}
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { background: #083b2a; transform: translateY(-2px); }
.btn-outline { background: #fff; border: 2px solid var(--primary); color: var(--primary); }
.btn-outline:hover { background: var(--primary); color: #fff; }
.btn-danger { background: #c0392b; color: #fff; }
.btn-danger:hover { background: #a93226; }

/* تسجيل الدخول */
.login-container {
    max-width: 420px; margin: 100px auto; background: #fff;
    padding: 34px; border-radius: 24px; box-shadow: var(--shadow);
}
.login-container h2 { text-align: center; margin-bottom: 20px; color: var(--primary); }
.login-container label { display: block; margin-bottom: 8px; font-weight: 700; }
.login-container input {
    width: 100%; padding: 14px; margin-bottom: 16px;
    border: 2px solid #e0e0e0; border-radius: 12px; font-family: inherit;
}
.login-container input:focus { border-color: var(--accent); outline: none; }
.login-container .error { color: #fff; background: #e74c3c; padding: 10px; border-radius: 10px; margin-bottom: 14px; text-align: center; }

/* صفحة التعديل */
.edit-container {
    max-width: 950px; margin: 40px auto; background: #fff;
    padding: 34px; border-radius: 24px; box-shadow: var(--shadow);
}
.edit-container h1 { color: var(--primary); margin-bottom: 28px; text-align: center; }
.subject-edit-block {
    border: 1px solid #eee; border-radius: 16px; padding: 22px; margin-bottom: 20px; background: #fdfdfd;
}
.subject-edit-block h2 { font-size: 1.2rem; margin-bottom: 10px; color: var(--primary); }
.subject-edit-block textarea {
    width: 100%; min-height: 100px; border-radius: 12px; border: 2px solid #e0d8c0;
    padding: 14px; font-family: inherit; resize: vertical; background: #fffef9; margin-bottom: 15px;
}
.file-edit-row { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
.file-edit-row input, .file-edit-row select {
    padding: 12px; border-radius: 10px; border: 2px solid #e0e0e0; font-family: inherit;
}
.file-edit-row input[type="text"] { flex: 2; min-width: 140px; }
.file-edit-row input[type="url"] { flex: 3; min-width: 160px; }
.file-edit-row select { flex: 1; min-width: 90px; }
.btn-remove {
    background: #fff; color: #c62828; border: 2px solid #f5c6cb;
    width: 36px; height: 36px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.btn-remove:hover { background: #fff5f5; border-color: #e57373; }

/* تنبيه التوست */
.toast {
    position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
    background: #1a1a2e; color: #fff; padding: 12px 28px; border-radius: 50px;
    font-weight: 700; z-index: 9999; box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    animation: toastIn 0.4s ease-out;
}
@keyframes toastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(40px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* استجابة الجوال */
@media (max-width: 768px) {
    .subjects-grid { grid-template-columns: 1fr 1fr; }
    .subject-card { padding: 18px 14px; }
}
@media (max-width: 420px) {
    .subjects-grid { grid-template-columns: 1fr; }
}
`.trim());

// ========== views/index.ejs ==========
fs.writeFileSync('views/index.ejs', `
<!DOCTYPE html>
<html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>الفرقة الثالثة لغة عربية - جامعة الأزهر المنصورة</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link rel="stylesheet" href="/style.css">
</head><body>
<header class="header"><div class="header-inner">
<div class="logo-area"><div class="logo-icon">🕌</div><div class="logo-text"><h1>الفرقة الثالثة - لغة عربية</h1><span>جامعة الأزهر الشريف - فرع المنصورة</span></div></div>
<div class="header-badge"><i class="fas fa-book-open"></i> 8 مواد دراسية</div></div></header>
<section class="hero"><h2>📚 كل موادك في مكان واحد</h2><div class="line"></div><p>تصفح المناهج والملخصات والملفات الخاصة بكل مادة.</p></section>
<main class="container"><div class="subjects-grid">
<% subjects.forEach(subject => { %>
<a href="/subject/<%= subject.id %>" class="subject-card <%= subject.card_class %>">
<div class="icon-wrap"><i class="<%= subject.icon %>"></i></div>
<h3><%= subject.name %></h3><p class="hint"><%= subject.subtitle %></p>
<div class="card-footer"><span class="badge">📎 <%= subject.fileCount %> ملفات</span><span class="arrow"><i class="fas fa-arrow-left"></i></span></div>
</a>
<% }) %>
</div></main>
<% if (locals.user && locals.user.is_admin) { %>
<div style="text-align:center;margin:20px;">
<a href="/edit" class="btn btn-primary">⚙️ لوحة التحكم</a>
<a href="/logout" class="btn btn-outline">تسجيل الخروج</a></div>
<% } %>
</body></html>`.trim());

// ========== views/login.ejs ==========
fs.writeFileSync('views/login.ejs', `
<!DOCTYPE html>
<html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>تسجيل الدخول - لوحة التحكم</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link rel="stylesheet" href="/style.css">
</head><body>
<div class="login-container"><h2><i class="fas fa-lock"></i> دخول المشرف</h2>
<% if (typeof error !== 'undefined' && error) { %><div class="error"><%= error %></div><% } %>
<form method="POST" action="/login">
<label>اسم المستخدم:</label><input type="text" name="username" placeholder="admin" required>
<label>كلمة المرور:</label><input type="password" name="password" placeholder="********" required>
<button type="submit" class="btn btn-primary" style="width:100%;">دخول</button></form>
<div style="text-align:center;margin-top:15px;"><a href="/">العودة للصفحة الرئيسية</a></div></div>
</body></html>`.trim());

// ========== views/subject.ejs ==========
fs.writeFileSync('views/subject.ejs', `
<!DOCTYPE html>
<html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><%= subject.name %> - الفرقة الثالثة</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link rel="stylesheet" href="/style.css">
</head><body>
<header class="header"><div class="header-inner">
<div class="logo-area"><div class="logo-icon">🕌</div><div class="logo-text"><h1><%= subject.name %></h1><span><%= subject.subtitle %></span></div></div>
<a href="/" class="btn btn-outline" style="color:white;border-color:white;">العودة للرئيسية</a></div></header>
<main class="container" style="margin-top:30px;">
<div style="background:white;border-radius:16px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,0.07);">
<div class="curriculum-box"><%= subject.curriculum ? subject.curriculum.replace(/\\n/g, '<br>') : 'لم يُحدد المنهج بعد.' %></div>
<h3 style="margin:20px 0 15px;"><i class="fas fa-paperclip" style="color:var(--accent);margin-left:10px;"></i> الملفات والملخصات</h3>
<% if (files && files.length > 0) { %>
<% files.forEach(file => { %>
<a href="<%= file.url || '#' %>" class="file-row" <%= file.url ? 'target="_blank"' : '' %>>
<% let iconClass = 'f-other'; let iconFa = 'fa-file';
if (file.type === 'PDF') { iconClass = 'f-pdf'; iconFa = 'fa-file-pdf'; }
else if (file.type === 'Word') { iconClass = 'f-doc'; iconFa = 'fa-file-word'; }
else if (file.type === 'PowerPoint') { iconClass = 'f-ppt'; iconFa = 'fa-file-powerpoint'; }
else if (file.type === 'فيديو') { iconClass = 'f-video'; iconFa = 'fa-video'; }
else if (file.type === 'صوت') { iconClass = 'f-audio'; iconFa = 'fa-headphones'; }
else if (file.type === 'رابط') { iconClass = 'f-link'; iconFa = 'fa-link'; } %>
<div class="f-icon <%= iconClass %>"><i class="fas <%= iconFa %>"></i></div>
<div class="f-info"><div class="f-name"><%= file.name %></div><div class="f-meta"><%= file.type %><%= file.url ? ' · رابط خارجي' : '' %></div></div>
<div class="f-dl"><i class="fas fa-<%= file.url ? 'external-link-alt' : 'info-circle' %>"></i></div></a>
<% }) } else { %>
<p style="text-align:center;color:#999;">لا توجد ملفات مرفوعة حالياً.</p><% } %>
</div></main></body></html>`.trim());

// ========== views/edit.ejs ==========
fs.writeFileSync('views/edit.ejs', `
<!DOCTYPE html>
<html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>تعديل المواد - لوحة التحكم</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link rel="stylesheet" href="/style.css">
<script>
function addFileRow(btn) {
  const c = btn.parentElement.querySelector('.files-edit-area');
  const r = document.createElement('div');
  r.className = 'file-edit-row';
  r.innerHTML = '<input type="text" name="fileNames[]" placeholder="اسم الملف" required> ' +
    '<select name="fileTypes[]"><option value="PDF">PDF</option><option value="Word">Word</option><option value="PowerPoint">PowerPoint</option><option value="فيديو">فيديو</option><option value="صوت">صوت</option><option value="رابط">رابط</option><option value="آخر">آخر</option></select> ' +
    '<input type="url" name="fileUrls[]" placeholder="رابط الملف (اختياري)"> ' +
    '<button type="button" class="btn-remove" onclick="this.parentElement.remove()"><i class="fas fa-trash"></i></button>';
  c.appendChild(r);
}
</script>
</head><body>
<div class="edit-container"><h1>⚙️ تعديل المواد الدراسية</h1>
<p style="text-align:center;margin-bottom:30px;">مرحباً <strong><%= user.username %></strong> | <a href="/logout">تسجيل الخروج</a></p>
<% if (locals.success) { %><div style="background:#e8f5e9;color:#2e7d32;padding:10px;border-radius:8px;margin-bottom:20px;text-align:center;">✅ تم الحفظ بنجاح</div><% } %>
<% subjects.forEach(subject => { %>
<div class="subject-edit-block">
<h2><i class="<%= subject.icon %>" style="color:<%= subject.color %>;margin-left:10px;"></i> <%= subject.name %></h2>
<form method="POST" action="/edit/<%= subject.id %>">
<label style="font-weight:bold;">تفاصيل المنهج:</label>
<textarea name="curriculum"><%= subject.curriculum || '' %></textarea>
<label style="font-weight:bold;display:block;margin:15px 0 10px;">الملفات المرفوعة:</label>
<div class="files-edit-area">
<% (subject.files || []).forEach(file => { %>
<div class="file-edit-row">
<input type="text" name="fileNames[]" value="<%= file.name %>" required>
<select name="fileTypes[]">
<option value="PDF" <%= file.type==='PDF'?'selected':'' %>>PDF</option>
<option value="Word" <%= file.type==='Word'?'selected':'' %>>Word</option>
<option value="PowerPoint" <%= file.type==='PowerPoint'?'selected':'' %>>PowerPoint</option>
<option value="فيديو" <%= file.type==='فيديو'?'selected':'' %>>فيديو</option>
<option value="صوت" <%= file.type==='صوت'?'selected':'' %>>صوت</option>
<option value="رابط" <%= file.type==='رابط'?'selected':'' %>>رابط</option>
<option value="آخر" <%= file.type==='آخر'?'selected':'' %>>آخر</option>
</select>
<input type="url" name="fileUrls[]" value="<%= file.url || '' %>" placeholder="رابط الملف">
<button type="button" class="btn-remove" onclick="this.parentElement.remove()"><i class="fas fa-trash"></i></button>
</div>
<% }) %>
</div>
<button type="button" class="btn btn-outline" onclick="addFileRow(this)" style="margin-top:8px;"><i class="fas fa-plus"></i> إضافة ملف</button>
<div style="margin-top:20px;"><button type="submit" class="btn btn-primary">💾 حفظ التغييرات</button></div>
</form></div>
<% }) %>
<div style="text-align:center;margin-top:30px;"><a href="/" class="btn btn-outline">العودة للموقع</a></div></div>
</body></html>`.trim());

// ========== .env ==========
fs.writeFileSync('.env', 'SESSION_SECRET=azhar-very-secret-2025\n');

console.log('✅ تم إنشاء جميع الملفات.');

// تثبيت الحزم
console.log('📦 جاري تثبيت الحزم...');
try {
  execSync('npm install', { stdio: 'inherit', cwd: __dirname });
  console.log('✅ تم تثبيت الحزم.');
} catch (e) {
  console.error('❌ فشل تثبيت الحزم. تأكد من اتصالك بالإنترنت ثم جرب: npm install');
  process.exit(1);
}

console.log('🚀 جاهز! شغّل الموقع: node server.js');
console.log('🔗 http://localhost:3000');
console.log('🔑 الأدمن: admin / admin123');