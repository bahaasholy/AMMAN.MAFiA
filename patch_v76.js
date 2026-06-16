const fs = require('fs');

function mustReplace(str, from, to, label){
  if(!str.includes(from)) throw new Error('Missing pattern: '+label);
  return str.replace(from, to);
}

let display = fs.readFileSync('display.html','utf8');

display = mustReplace(display,
`.live-voting-panel{
      position:absolute;
      left:55px;
      right:55px;
      top:130px;
      bottom:196px;
      z-index:15;
      display:none;
      align-items:center;
      justify-content:center;
      flex-direction:column;
      gap:18px;
      padding:30px 38px;
      border-radius:38px;`,
`.live-voting-panel{
      position:absolute;
      left:55px;
      right:55px;
      top:130px;
      bottom:196px;
      z-index:15;
      display:none;
      align-items:center;
      justify-content:flex-start;
      flex-direction:column;
      gap:16px;
      padding:34px 38px 26px;
      border-radius:38px;`,
'panel layout');

display = mustReplace(display,
`body.voting-live .live-voting-panel{display:flex}
    body.voting-live .phase-panel.voting{display:none!important}
`,
`body.voting-live .live-voting-panel{display:flex}
    body.voting-live .phase-panel.voting{display:none!important}

    #liveVotingContent{
      width:100%;
      max-width:1560px;
      margin:0 auto;
      display:flex;
      flex-direction:column;
      align-items:center;
      gap:16px;
    }
`,
'content container');

display = mustReplace(display,
`.live-vote-title{
      color:#f7f4ec;
      font-size:54px;
      line-height:1;
      font-weight:900;
    }`,
`.live-vote-title{
      color:#f7f4ec;
      font-size:clamp(46px,4.3vw,64px);
      line-height:1.06;
      font-weight:900;
      margin:0;
    }`,
'title');

display = mustReplace(display,
`.live-vote-subtitle{
      color:#9ea3af;
      font-size:24px;
      line-height:1.4;
    }`,
`.live-vote-subtitle{
      color:#9ea3af;
      font-size:24px;
      line-height:1.45;
      margin:0;
    }`,
'subtitle');

display = mustReplace(display,
`.live-vote-progress{
      min-width:260px;
      padding:12px 22px;
      color:var(--gold);
      font-size:29px;
      font-weight:900;
      border-radius:16px;
      background:rgba(0,0,0,.30);
      border:1px solid rgba(242,195,91,.22);
    }`,
`.live-vote-progress{
      width:min(100%,980px);
      min-height:96px;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:16px 28px;
      color:var(--gold);
      font-size:clamp(28px,2.3vw,40px);
      font-weight:900;
      text-align:center;
      border-radius:20px;
      background:rgba(0,0,0,.30);
      border:1px solid rgba(242,195,91,.22);
    }`,
'progress');

display = mustReplace(display,
`.live-tally-list{
      width:100%;
      display:grid;
      grid-template-columns:repeat(4,minmax(0,1fr));
      gap:14px;
      max-height:350px;
      overflow:hidden;
    }`,
`.live-tally-list{
      width:100%;
      display:grid;
      grid-template-columns:repeat(4,minmax(0,1fr));
      gap:18px 20px;
      align-content:start;
      justify-items:stretch;
      max-height:none;
      overflow:visible;
    }`,
'tally list');

display = mustReplace(display,
`.live-tally-row{
      position:relative;
      min-height:86px;
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      align-items:center;
      gap:12px;
      padding:16px 18px 18px;`,
`.live-tally-row{
      width:100%;
      position:relative;
      min-height:98px;
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      align-items:center;
      gap:14px;
      padding:18px 22px 18px;`,
'tally row');

display = mustReplace(display,
`.live-tally-seat{
      color:#f4f0e6;
      font-size:23px;
      font-weight:800;
      white-space:nowrap;
    }`,
`.live-tally-seat{
      color:#f4f0e6;
      font-size:clamp(22px,1.65vw,31px);
      font-weight:800;
      white-space:nowrap;
      text-align:right;
    }`,
'tally seat');

display = mustReplace(display,
`.live-tally-votes{
      color:var(--gold);
      font-family:"Arial Black","Segoe UI",Arial,sans-serif;
      font-size:38px;
      line-height:1;
      text-align:left;
    }`,
`.live-tally-votes{
      color:var(--gold);
      font-family:"Arial Black","Segoe UI",Arial,sans-serif;
      font-size:clamp(40px,2.4vw,56px);
      line-height:1;
      text-align:left;
      min-width:40px;
    }`,
'tally votes');

display = mustReplace(display,
`.live-nominees{
      display:flex;
      flex-wrap:wrap;
      align-items:center;
      justify-content:center;
      gap:22px;
      margin-top:34px;
      padding:8px 0 18px;
    }`,
`.live-nominees{
      width:100%;
      display:flex;
      flex-wrap:wrap;
      align-items:center;
      justify-content:center;
      gap:24px;
      margin-top:42px;
      padding:14px 0 24px;
    }`,
'nominees');

display = mustReplace(display,
`style="grid-column:1/-1;margin-top:24px"`,
`style="grid-column:1/-1;padding:34px 0 12px"`,
'waiting style');

display = display.replace('شاشة العرض v75','شاشة العرض v76');
display = display.replaceAll('realtime-config.js?v=75','realtime-config.js?v=76');
display = display.replaceAll('amman-mafia-tv-v75-cache-v1','amman-mafia-tv-v76-cache-v1');
fs.writeFileSync('display.html', display);

let index = fs.readFileSync('index.html','utf8');
index = index.replace('TV Control v75','TV Control v76');
index = index.replace('tv-v75','tv-v76');
index = index.replaceAll('manifest.json?v=75','manifest.json?v=76');
index = index.replaceAll('tv-control.css?v=75','tv-control.css?v=76');
index = index.replaceAll('realtime-config.js?v=75','realtime-config.js?v=76');
index = index.replaceAll('tv-control.js?v=75','tv-control.js?v=76');
index = index.replaceAll('apple-touch-icon.png?v=75','apple-touch-icon.png?v=76');
index = index.replaceAll('favicon-32.png?v=75','favicon-32.png?v=76');
fs.writeFileSync('index.html', index);

let tvc = fs.readFileSync('tv-control.js','utf8').replace("url.searchParams.set('v', '75');", "url.searchParams.set('v', '76');");
fs.writeFileSync('tv-control.js', tvc);
let tvh = fs.readFileSync('tv.html','utf8').replace("target.searchParams.set('v', '75');", "target.searchParams.set('v', '76');");
fs.writeFileSync('tv.html', tvh);
let sw = fs.readFileSync('sw.js','utf8').replaceAll('amman-mafia-tv-v75-cache-v1','amman-mafia-tv-v76-cache-v1');
fs.writeFileSync('sw.js', sw);

fs.writeFileSync('README-AR.txt', `AMMAN MAFIA — v76 — VOTING SCREEN LAYOUT FIX\n\nالتعديلات:\n- إصلاح تداخل عنوان شاشة التصويت مع العناصر.\n- توسيع مساحة بطاقات النتائج واستغلال الفراغ على اليمين واليسار.\n- الإبقاء على 4 بطاقات في كل صف لكن بعرض أكبر وارتفاع أفخم.\n- تكبير وتحسين شريط \"تم التصويت\".\n- ضبط محاذاة ومقاسات النصوص داخل بطاقات نتائج التصويت.\n- تحسين المسافات في شاشة المرشحين للتبرير.\n\nالرابط:\nhttps://bahaasholy.github.io/AMMAN.MAFiA/?v=76\n`);
