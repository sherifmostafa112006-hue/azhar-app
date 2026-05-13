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

  db.run(`
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, subtitle TEXT, icon TEXT, color TEXT,
      card_class TEXT, curriculum TEXT DEFAULT ''
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id TEXT NOT NULL,
      name TEXT NOT NULL, type TEXT, url TEXT,
      FOREIGN KEY (subject_id) REFERENCES subjects(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL, is_admin INTEGER DEFAULT 0
    )
  `);

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