require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد الاتصال بقاعدة البيانات
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// تهيئة الجداول
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subtitle TEXT,
      icon TEXT,
      color TEXT,
      card_class TEXT,
      curriculum TEXT DEFAULT ''
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS files (
      id SERIAL PRIMARY KEY,
      subject_id TEXT NOT NULL REFERENCES subjects(id),
      name TEXT NOT NULL,
      type TEXT,
      url TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0
    )
  `);

  // إدخال المواد الافتراضية
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
  for (const s of subjects) {
    await pool.query('INSERT INTO subjects (id, name, subtitle, icon, color, card_class) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING',
      [s.id, s.name, s.subtitle, s.icon, s.color, s.card_class]);
  }

  // إنشاء مستخدم افتراضي
  const admin = await pool.query("SELECT id FROM users WHERE username='admin'");
  if (admin.rows.length === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await pool.query('INSERT INTO users (username, password, is_admin) VALUES ($1,$2,1)', ['admin', hash]);
  }
}

initDB().then(() => {
  console.log('✅ قاعدة البيانات جاهزة');
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.urlencoded({ extended: true }));
  app.use(session({
    secret: process.env.SESSION_SECRET || 'azhar-secret-change',
    resave: false, saveUninitialized: false,
    cookie: { maxAge: 1000*60*60*24 }
  }));
  app.use((req,res,next) => { res.locals.user = req.session.user || null; next(); });

  app.get('/', async (req,res) => {
    const subjects = (await pool.query('SELECT * FROM subjects ORDER BY id')).rows;
    const counts = (await pool.query('SELECT subject_id, COUNT(*) as count FROM files GROUP BY subject_id')).rows;
    const countMap = {};
    counts.forEach(c => countMap[c.subject_id] = parseInt(c.count));
    subjects.forEach(s => s.fileCount = countMap[s.id] || 0);
    res.render('index', { subjects });
  });

  app.get('/subject/:id', async (req,res) => {
    const subject = (await pool.query('SELECT * FROM subjects WHERE id=$1', [req.params.id])).rows[0];
    if (!subject) return res.status(404).send('المادة غير موجودة');
    const files = (await pool.query('SELECT * FROM files WHERE subject_id=$1', [subject.id])).rows;
    res.render('subject', { subject, files });
  });

  app.get('/login', (req,res) => res.render('login', { error: null }));
  app.post('/login', async (req,res) => {
    const { username, password } = req.body;
    const user = (await pool.query('SELECT * FROM users WHERE username=$1', [username])).rows[0];
    if (user && bcrypt.compareSync(password, user.password)) {
      req.session.user = { id: user.id, username: user.username, is_admin: user.is_admin };
      return res.redirect('/edit');
    }
    res.render('login', { error: 'بيانات خاطئة' });
  });

  app.get('/logout', (req,res) => { req.session.destroy(); res.redirect('/'); });

  function requireAdmin(req,res,next) {
    if (req.session.user && req.session.user.is_admin == 1) return next();
    res.redirect('/login');
  }

  app.get('/edit', requireAdmin, async (req,res) => {
    const subjects = (await pool.query('SELECT * FROM subjects ORDER BY id')).rows;
    for (let s of subjects) {
      s.files = (await pool.query('SELECT * FROM files WHERE subject_id=$1', [s.id])).rows;
    }
    res.render('edit', { subjects, success: req.query.success || null });
  });

  app.post('/edit/:id', requireAdmin, async (req,res) => {
    const { id } = req.params;
    const { curriculum, fileNames, fileTypes, fileUrls } = req.body;
    await pool.query('UPDATE subjects SET curriculum=$1 WHERE id=$2', [curriculum||'', id]);
    await pool.query('DELETE FROM files WHERE subject_id=$1', [id]);
    if (fileNames && Array.isArray(fileNames)) {
      for (let i=0; i<fileNames.length; i++) {
        if (fileNames[i].trim()) {
          await pool.query('INSERT INTO files (subject_id, name, type, url) VALUES ($1,$2,$3,$4)',
            [id, fileNames[i].trim(), fileTypes[i]||'آخر', fileUrls[i]||'']);
        }
      }
    }
    res.redirect('/edit?success=1');
  });

  app.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));
});