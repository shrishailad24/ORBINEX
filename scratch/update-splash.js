const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');
code = code.replace(/rgba\(212,175,55,0\.25\)/g, 'rgba(0,229,255,0.25)');
code = code.replace(/background: 'var\(--gold-primary\)'/g, "background: 'var(--cyan-primary)'");
code = code.replace(/boxShadow: '0 0 8px var\(--gold-primary\)'/g, "boxShadow: '0 0 8px var(--cyan-primary)'");
code = code.replace(/rgba\(212,175,55,0\.3\)/g, 'rgba(0,229,255,0.3)');
code = code.replace(/rgba\(212,175,55,0\.15\)/g, 'rgba(0,229,255,0.2)');
code = code.replace(/rgba\(212,175,55,0\.1\)/g, 'rgba(0,229,255,0.15)');
code = code.replace(/rgba\(212,175,55,0\.4\)/g, 'rgba(0,229,255,0.4)');
code = code.replace(
  "linear-gradient(90deg, var(--gold-primary), var(--cyan-primary), var(--gold-primary))",
  "linear-gradient(90deg, #00B4D8, #00E5FF, #38BDF8)"
);
fs.writeFileSync('src/app/page.tsx', code, 'utf8');
console.log('Updated splash styling in page.tsx successfully');
