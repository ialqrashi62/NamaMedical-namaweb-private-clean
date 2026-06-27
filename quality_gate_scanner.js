const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

console.log(`${BOLD}${BLUE}============================================================${RESET}`);
console.log(`${BOLD}${BLUE}  بوابة الجودة المؤتمتة - فحص الامتثال والأمان (DevSecOps)${RESET}`);
console.log(`${BOLD}${BLUE}  Automated Quality Gate Scanner - jumanaMedical ERP${RESET}`);
console.log(`${BOLD}${BLUE}============================================================${RESET}\n`);

let hasFailures = false;

// 1. Mojibake Scan
console.log(`${BOLD}[1] فحص سلامة الترميز ومنع Mojibake (UTF-8 Integrity)...${RESET}`);
const targetDirs = [__dirname, path.join(__dirname, '../docs')];
const forbiddenPatterns = [
  { pattern: /Ø/g, name: 'Latin-1 O-slash' },
  { pattern: /Ù/g, name: 'Latin-1 U-grave' },
  { pattern: /ï»¿/g, name: 'UTF-8 BOM' }
];

function scanDirForMojibake(dir) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relativePath = path.relative(path.join(__dirname, '..'), fullPath);
    const pathSegments = relativePath.split(/[\\/]/);
    
    // Ignore version control, node_modules, temp caches, and any documentation folders/files
    if (pathSegments.includes('node_modules') || pathSegments.includes('.git') || pathSegments.includes('.claude') || pathSegments.includes('.cache') || pathSegments.includes('_archive') || pathSegments.includes('docs')) continue;
    
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDirForMojibake(fullPath);
    } else if (stat.isFile() && (item.endsWith('.md') || item.endsWith('.js') || item.endsWith('.html'))) {
      if (item === 'quality_gate_scanner.js' || item === 'run_all_tests.js') continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      forbiddenPatterns.forEach(p => {
        if (p.pattern.test(content)) {
          console.error(`  ${RED}❌ Mojibake Found:${RESET} ${item} contains ${p.name}`);
          hasFailures = true;
        }
      });
    }
  }
}
targetDirs.forEach(scanDirForMojibake);
if (!hasFailures) {
  console.log(`  ${GREEN}✅ فحص الترميز سليم بالكامل.${RESET}`);
}

// 2. Secrets Leak Scan
console.log(`\n${BOLD}[2] فحص سلامة البيانات الحساسة ومنع تسريب الأسرار (Secrets Leak Check)...${RESET}`);
const secretPatterns = [
  { pattern: /password\s*=\s*['"][a-zA-Z0-9_]{6,}['"]/gi, name: 'High entropy password assignment' },
  { pattern: /api_key\s*=\s*['"][a-zA-Z0-9_]{10,}['"]/gi, name: 'API Key assignment' },
  { pattern: /BEGIN PRIVATE KEY/g, name: 'Unencrypted Private Key' }
];

function scanDirForSecrets(dir) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relativePath = path.relative(path.join(__dirname, '..'), fullPath);
    const pathSegments = relativePath.split(/[\\/]/);
    
    if (pathSegments.includes('node_modules') || pathSegments.includes('.git') || pathSegments.includes('.claude') || pathSegments.includes('.cache') || pathSegments.includes('.env') || pathSegments.includes('docs')) continue;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDirForSecrets(fullPath);
    } else if (stat.isFile() && (item.endsWith('.js') || item.endsWith('.html') || item.endsWith('.json'))) {
      if (item === 'quality_gate_scanner.js' || item === 'run_all_tests.js') continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      secretPatterns.forEach(p => {
        if (p.pattern.test(content)) {
          console.error(`  ${RED}❌ Secret Leak Found:${RESET} ${item} contains pattern matching "${p.name}"`);
          hasFailures = true;
        }
      });
    }
  }
}
targetDirs.forEach(scanDirForSecrets);
if (!hasFailures) {
  console.log(`  ${GREEN}✅ فحص الأسرار سليم بالكامل ولا توجد تسريبات في الكود المصدري.${RESET}`);
}

// 3. Execution of Unit Tests
console.log(`\n${BOLD}[3] تشغيل اختبارات عزل المستأجرين (Tenant Isolation)...${RESET}`);
try {
  const testRunner = path.join(__dirname, 'cross_tenant_leak_test.js');
  if (fs.existsSync(testRunner)) {
    console.log(`  تشغيل اختبار عزل المستأجرين والتسريبات (cross_tenant_leak_test)...`);
    execSync(`node "${testRunner}"`, { stdio: 'inherit' });
    console.log(`  ${GREEN}✅ اختبار عزل المستأجرين مر بنجاح.${RESET}`);
  }
} catch (e) {
  console.error(`  ${RED}❌ فشل اختبار عزل المستأجرين.${RESET}`);
  hasFailures = true;
}

// 4. Overall Test Harness
try {
  console.log(`\n${BOLD}[4] تشغيل الحزمة الكاملة لـ 86 اختبار وحدة (Test Suite)...${RESET}`);
  const fallbackRunner = path.join(__dirname, 'run_all_tests.js');
  if (fs.existsSync(fallbackRunner)) {
    execSync(`node "${fallbackRunner}"`, { stdio: 'inherit' });
  } else {
    console.log(`  ${YELLOW}⏭ تخطي الحزمة الكاملة لعدم وجود ملف السكريبت.${RESET}`);
  }
} catch (e) {
  console.error(`  ${RED}❌ فشلت اختبارات الحزمة الكاملة.${RESET}`);
  hasFailures = true;
}

console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
if (hasFailures) {
  console.error(`${BOLD}${RED}  ❌ النتيجة النهائية: فشل حراس الجودة (Quality Gates FAILED)${RESET}`);
  console.log(`${BOLD}${BLUE}============================================================${RESET}`);
  process.exit(1);
} else {
  console.log(`${BOLD}${GREEN}  ✅ النتيجة النهائية: اجتاز حراس الجودة بنجاح (Quality Gates PASSED)${RESET}`);
  console.log(`${BOLD}${BLUE}============================================================${RESET}`);
  process.exit(0);
}
