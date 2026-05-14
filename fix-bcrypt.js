const fs = require('fs');
const { execSync } = require('child_process');

// تعديل server.js
let server = fs.readFileSync('server.js', 'utf8');
server = server.replace("require('bcrypt')", "require('bcryptjs')");
fs.writeFileSync('server.js', server);
console.log('✅ server.js تم التعديل');

// تعديل database.js
let db = fs.readFileSync('database.js', 'utf8');
db = db.replace("require('bcrypt')", "require('bcryptjs')");
fs.writeFileSync('database.js', db);
console.log('✅ database.js تم التعديل');

// تعديل package.json
let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.dependencies['bcryptjs'] = pkg.dependencies['bcrypt'];
delete pkg.dependencies['bcrypt'];
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ package.json تم التعديل');

// حذف node_modules و package-lock.json
try { fs.rmSync('node_modules', { recursive: true, force: true }); } catch (e) {}
try { fs.unlinkSync('package-lock.json'); } catch (e) {}
console.log('✅ تم حذف node_modules');

// إعادة تثبيت الحزم
console.log('📦 جاري تثبيت الحزم...');
execSync('npm install', { stdio: 'inherit', cwd: __dirname });
console.log('✅ تم التثبيت بنجاح');
console.log('🚀 الآن ارفع التغييرات إلى GitHub باستخدام:');
console.log('   git add . && git commit -m "fix bcrypt" && git push');