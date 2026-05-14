require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
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