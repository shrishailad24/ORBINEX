import fs from 'fs';

const pagePath = 'C:/Users/shash/Downloads/osiris-master/osiris-master/src/app/page.tsx';
let content = fs.readFileSync(pagePath, 'utf8');

// 1. Replace header
const oldHeaderRegex = /\{\/\* ── HEADER ── \*\/\}[\s\S]*?\{\/\* ── TOP-RIGHT STATUS \(desktop\) ── \*\/\}/;

const newHeader = `{/* ── HEADER ── */}
      <motion.div data-hud initial={{ opacity: 0, y: -20 }} animate={revealed ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }} transition={hudIn(0.15)} className={\`absolute top-3.5 z-[200] pointer-events-none flex flex-col\`} style={{ left: isMobile ? '20px' : '56px' }}>
        <div className="flex items-center">
          <img
            src="/brand/orbinex-logo-exact-transparent.png"
            alt="ORBINEX — See the World. Understand the Change."
            className="h-10 md:h-12 w-auto object-contain filter drop-shadow-[0_0_20px_rgba(0,229,255,0.4)]"
          />
        </div>
        <div className="flex items-center gap-3 mt-1 pl-1 min-w-0 pr-4">
          <span className="text-[8.5px] md:text-[9px] text-[#00E5FF]/70 font-mono tracking-[0.2em] md:tracking-[0.28em] uppercase truncate">
            {BRAND.description} <span className="hidden md:inline text-white/40">· {BRAND.keywords}</span>
          </span>
        </div>
      </motion.div>

      {/* ── TOP-RIGHT STATUS (desktop) ── */}`;

if (oldHeaderRegex.test(content)) {
  content = content.replace(oldHeaderRegex, newHeader);
  console.log('✓ Replaced header with exact brand logo');
} else {
  console.error('Failed to match old header regex');
}

// 2. Replace splash logo
const oldSplashRegex = /\{\/\* ── Geometric tactical logo ── \*\/\}[\s\S]*?\{\/\* ── Multi-stage progress bar ── \*\/\}/;

const newSplash = `{/* ── Exact ORBINEX 3D Brand Logo ── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="mb-8 z-[2] flex flex-col items-center"
            >
              <img
                src="/brand/orbinex-logo-exact-transparent.png"
                alt="ORBINEX — See the World. Understand the Change."
                className="h-20 md:h-24 w-auto object-contain drop-shadow-[0_0_40px_rgba(0,229,255,0.6)]"
              />
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.9 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="mt-3 text-[10px] md:text-[10px] font-mono tracking-[0.3em] text-[#00E5FF] uppercase font-semibold text-center"
              >
                GLOBAL GEOSPATIAL INTELLIGENCE PLATFORM
              </motion.p>
            </motion.div>

            {/* ── Multi-stage progress bar ── */}`;

if (oldSplashRegex.test(content)) {
  content = content.replace(oldSplashRegex, newSplash);
  console.log('✓ Replaced splash logo with exact 3D brand logo');
} else {
  console.error('Failed to match old splash regex');
}

fs.writeFileSync(pagePath, content);
console.log('Successfully saved src/app/page.tsx');
