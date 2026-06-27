const fs=require('fs');const s=fs.readFileSync(require('path').join(__dirname,'server.js'),'utf8');
let p=0,f=0;const ok=(c,m)=>{if(c){p++;console.log('  PASS',m)}else{f++;console.log('  FAIL',m)}};
ok(/FAILED_LOGIN', 'Auth', 'Failed login: unknown or inactive user'/.test(s),"FAILED_LOGIN on unknown/inactive user");
ok(/FAILED_LOGIN', 'Auth', 'Failed login: incorrect password'/.test(s),"FAILED_LOGIN on bad password");
ok(/'LOGOUT', 'Auth', 'User logged out'/.test(s),"LOGOUT audited");
ok((s.match(/const clientIp =/g)||[]).length>=1,"clientIp declared for audit IP (per-scope; same-scope redeclare caught by node --check)");
ok(!/password.*FAILED_LOGIN|FAILED_LOGIN.*\bpassword\b/.test(s.replace(/incorrect password/g,'')),"no password value in audit");
console.log(`\n${f===0?'ALL PASS':'FAIL'}: ${p} passed, ${f} failed`);process.exit(f===0?0:1);
