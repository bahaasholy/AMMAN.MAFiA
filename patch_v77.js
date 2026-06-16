const fs=require('fs');
let display=fs.readFileSync('display.html','utf8');
// CSS inject before existing live-defense-seat
const injectCss=`    .live-defense-layout{\n      width:100%;\n      height:100%;\n      display:grid;\n      grid-template-columns:790px minmax(0,1fr);\n      align-items:center;\n      gap:74px;\n      direction:ltr;\n      padding:4px 8px 2px;\n    }\n    .live-defense-timer-stage{\n      width:790px;\n      height:592px;\n      display:flex;\n      align-items:center;\n      justify-content:center;\n      border-radius:38px;\n      background:rgba(5,7,12,.30);\n    }\n    .live-defense-timer-stage.warning .ring-progress{\n      stroke:var(--red);\n      filter:drop-shadow(0 0 13px rgba(255,76,86,.62));\n    }\n    .live-defense-info{\n      display:flex;\n      flex-direction:column;\n      justify-content:center;\n      min-height:475px;\n      padding:0;\n    }\n    .live-defense-player-card{\n      position:relative;\n      width:100%;\n      max-width:570px;\n      height:475px;\n      margin-inline-start:auto;\n      border-radius:30px;\n      background:linear-gradient(180deg,rgba(10,12,17,.92),rgba(7,9,13,.86));\n      border:1px solid rgba(255,255,255,.09);\n      box-shadow:0 20px 55px rgba(0,0,0,.33);\n      overflow:hidden;\n      display:flex;\n      flex-direction:column;\n      align-items:center;\n      justify-content:center;\n      gap:28px;\n    }\n    .live-defense-player-card::after{\n      content:\"\";\n      position:absolute;\n      left:40px;\n      right:40px;\n      bottom:0;\n      height:5px;\n      border-radius:999px;\n      background:linear-gradient(90deg,transparent,var(--gold),transparent);\n    }\n    .live-defense-player-label{\n      color:var(--gold);\n      font-size:46px;\n      font-weight:900;\n      line-height:1;\n    }\n    .live-defense-player-value{\n      font-family:\"Arial Black\",\"Segoe UI\",Arial,sans-serif;\n      font-size:202px;\n      line-height:1;\n      font-weight:950;\n      color:#f8f5ed;\n      text-shadow:0 0 25px rgba(255,255,255,.06);\n    }\n    .live-defense-player-note{\n      color:#9ea3af;\n      font-size:28px;\n      font-weight:700;\n      line-height:1;\n      margin-top:-4px;\n    }\n`;
display=display.replace('    .live-defense-seat{', injectCss+'    .live-defense-seat{');
// replace defense render block
const defenseRegex=/\n\s*if\(stage===\"defense\"\)\{[\s\S]*?\n\s*return;\n\s*\}/;
const newDefense=`
      if(stage==="defense"){
        const index=Math.max(
          0,
          Number(state.votingDefenseIndex)||0
        );
        const seat=Number(nominees[index])||"—";
        const remMs=Math.max(0,remaining());
        const durationMs=Math.max(1000,Number(state.timerDurationMs)||60000);
        const isWarn=remMs<=warningThreshold()||state.timerStatus==="finished";
        const ratio=Math.max(0,Math.min(1,remMs/durationMs));
        const dashOffset=RING_CIRCUMFERENCE*(1-ratio);

        content.innerHTML=\`
          <div class="live-vote-title">جولة التبرير</div>
          <div class="live-defense-layout">
            <section class="live-defense-timer-stage \${isWarn?"warning":""}">
              <div class="timer-wrap">
                <svg class="timer-svg" viewBox="0 0 640 640" aria-hidden="true">
                  <circle class="ring-track" cx="320" cy="320" r="270"></circle>
                  <circle class="ring-progress" cx="320" cy="320" r="270" style="stroke-dasharray:\${RING_CIRCUMFERENCE};stroke-dashoffset:\${dashOffset}"></circle>
                  <circle class="ring-inner" cx="320" cy="320" r="234"></circle>
                </svg>
                <div class="timer-readout \${isWarn?"warning":""}">\${formatSeconds(authoritativeDisplaySeconds())}</div>
              </div>
            </section>
            <section class="live-defense-info">
              <div class="live-defense-player-card">
                <div class="live-defense-player-label">اللاعب الذي يبرر</div>
                <div class="live-defense-player-value">\${seat}</div>
                <div class="live-defense-player-note">المرشح \${index+1} من \${nominees.length}</div>
              </div>
            </section>
          </div>\`;
        return;
      }`;
if(!defenseRegex.test(display)) throw new Error('Defense regex not found');
display=display.replace(defenseRegex,newDefense);
for(const [a,b] of [['شاشة العرض v76','شاشة العرض v77'],['realtime-config.js?v=76','realtime-config.js?v=77'],['amman-mafia-tv-v76-cache-v1','amman-mafia-tv-v77-cache-v1']]) display=display.replaceAll(a,b);
fs.writeFileSync('display.html',display);
let index=fs.readFileSync('index.html','utf8');
for(const [a,b] of [['TV Control v76','TV Control v77'],['tv-v76','tv-v77'],['manifest.json?v=76','manifest.json?v=77'],['tv-control.css?v=76','tv-control.css?v=77'],['realtime-config.js?v=76','realtime-config.js?v=77'],['tv-control.js?v=76','tv-control.js?v=77'],['apple-touch-icon.png?v=76','apple-touch-icon.png?v=77'],['favicon-32.png?v=76','favicon-32.png?v=77']]) index=index.replaceAll(a,b);
fs.writeFileSync('index.html',index);
fs.writeFileSync('tv-control.js',fs.readFileSync('tv-control.js','utf8').replaceAll("url.searchParams.set('v', '76');","url.searchParams.set('v', '77');"));
fs.writeFileSync('tv.html',fs.readFileSync('tv.html','utf8').replaceAll("target.searchParams.set('v', '76');","target.searchParams.set('v', '77');"));
fs.writeFileSync('sw.js',fs.readFileSync('sw.js','utf8').replaceAll('amman-mafia-tv-v76-cache-v1','amman-mafia-tv-v77-cache-v1'));
fs.writeFileSync('README-AR.txt',`AMMAN MAFIA — v77 — JUSTIFICATION ROUND LAYOUT\n\nالتعديلات:\n- تحويل جولة التبرير لتكون بنفس أسلوب جولة النقاش.\n- إظهار العداد الدائري الكبير على اليسار.\n- إظهار اللاعب الذي يبرر داخل بطاقة كبيرة على اليمين.\n- الحفاظ على نفس الهوية البصرية للشاشة.\n\nالرابط:\nhttps://bahaasholy.github.io/AMMAN.MAFiA/?v=77\n`);
