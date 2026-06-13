
(function () {
  'use strict';

  const STORAGE_KEY = 'ammanMafiaPublicDisplayStateV1';
  const ROOM_KEY = 'ammanMafiaPublicDisplayRoomV1';
  const DEFAULT_SECONDS = 60;
  const PHASE_LABELS = {
    idle: 'بانتظار بدء الجولة',
    discussion: 'جولة النقاش',
    voting: 'جولة التصويت',
    night: 'جولة الليل'
  };

  let channel = null;
  let supabaseClient = null;
  let localChannel = null;
  let connectionMode = 'local';
  let tvLastSeenAt = 0;
  let tvPresenceTimer = null;
  let timerTicker = null;
  let hasBroadcastFinished = false;

  function generateRoomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(8);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 255);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  }

  function normalizeState(raw) {
    const now = Date.now();
    const state = raw && typeof raw === 'object' ? raw : {};
    return {
      version: 1,
      roundNumber: Math.max(1, Number(state.roundNumber) || 1),
      phase: PHASE_LABELS[state.phase] ? state.phase : 'idle',
      timerDurationMs: Math.max(1000, Number(state.timerDurationMs) || DEFAULT_SECONDS * 1000),
      timerRemainingMs: Math.max(0, Number(state.timerRemainingMs) || DEFAULT_SECONDS * 1000),
      timerStatus: ['idle', 'running', 'paused', 'finished'].includes(state.timerStatus) ? state.timerStatus : 'idle',
      timerEndsAt: Number(state.timerEndsAt) || 0,
      latestResult: String(state.latestResult || ''),
      publicHistory: Array.isArray(state.publicHistory) ? state.publicHistory.slice(0, 30) : [],
      updatedAt: Number(state.updatedAt) || now
    };
  }

  let publicState = (() => {
    try { return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); }
    catch (_) { return normalizeState(null); }
  })();

  let roomCode = (localStorage.getItem(ROOM_KEY) || '').trim().toUpperCase();
  if (!/^[A-Z2-9]{6,14}$/.test(roomCode)) {
    roomCode = generateRoomCode();
    localStorage.setItem(ROOM_KEY, roomCode);
  }

  function configuredForSupabase() {
    const cfg = window.AMMAN_MAFIA_REALTIME || {};
    return /^https:\/\/.+\.supabase\.co\/?$/i.test(String(cfg.supabaseUrl || '').trim()) &&
      String(cfg.supabaseAnonKey || '').trim().length > 40 &&
      !String(cfg.supabaseAnonKey).includes('PUT_YOUR_');
  }

  function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
  }

  function saveState(shouldBroadcast = true) {
    publicState.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(publicState));
    renderAll();
    if (shouldBroadcast) broadcastState();
  }

  function getRemainingMs() {
    if (publicState.timerStatus === 'running') return Math.max(0, publicState.timerEndsAt - Date.now());
    return Math.max(0, publicState.timerRemainingMs);
  }

  function formattedTimer(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function createUI() {
    const mainTabs = document.getElementById('mainTabs');
    if (!mainTabs || document.getElementById('tabDisplayControl')) return;

    const tab = document.createElement('button');
    tab.id = 'tabDisplayControl';
    tab.className = 'tab-btn';
    tab.textContent = 'العرض 📺';
    tab.setAttribute('onclick', "switchTab('displayControl')");
    mainTabs.appendChild(tab);

    const section = document.createElement('div');
    section.id = 'sectionDisplayControl';
    section.className = 'page-section';
    section.innerHTML = `
      <div class="tv-control-shell">
        <section class="tv-control-card full">
          <div class="tv-control-title">
            <h2>ربط شاشة التلفزيون 📺</h2>
            <span id="tvConnectionStatus" class="tv-status-pill waiting">جاري التجهيز</span>
          </div>
          <div class="tv-room-row">
            <div id="tvRoomCode" class="tv-room-code">${roomCode}</div>
            <button id="tvNewRoomBtn" class="tv-btn" type="button">رمز جديد</button>
          </div>
          <div class="tv-link-box">
            <input id="tvDisplayUrl" readonly aria-label="رابط شاشة العرض">
            <button id="tvCopyLinkBtn" class="tv-btn gold" type="button">نسخ الرابط</button>
          </div>
          <div id="tvDemoWarning" class="tv-demo-warning"></div>
        </section>

        <section class="tv-control-card">
          <div class="tv-control-title">
            <h3>مؤقت الكلام ⏱️</h3>
            <span id="tvTimerStatusText" class="tv-muted">جاهز</span>
          </div>
          <div id="tvAdminTimer" class="tv-timer-display">01:00</div>
          <div class="tv-presets">
            <button class="tv-btn tv-preset" type="button" data-seconds="30">30 ثانية</button>
            <button class="tv-btn tv-preset" type="button" data-seconds="45">45 ثانية</button>
            <button class="tv-btn tv-preset" type="button" data-seconds="60">60 ثانية</button>
          </div>
          <div class="tv-timer-actions">
            <button id="tvTimerStart" class="tv-btn gold" type="button">بدء</button>
            <button id="tvTimerPause" class="tv-btn" type="button">إيقاف</button>
            <button id="tvTimerReset" class="tv-btn red" type="button">إعادة</button>
          </div>
        </section>

        <section class="tv-control-card">
          <div class="tv-control-title"><h3>حالة الجولة</h3></div>
          <div class="tv-phase-grid">
            <button class="tv-btn tv-phase blue" type="button" data-phase="discussion">بدء جولة النقاش 💬</button>
            <button class="tv-btn tv-phase gold" type="button" data-phase="voting">بدء جولة التصويت 🗳️</button>
            <button class="tv-btn tv-phase purple" type="button" data-phase="night">بدء جولة الليل 🌙</button>
          </div>
          <div class="tv-muted" style="margin-top:10px">اختيار الحالة ينشرها فورًا على التلفزيون، والمؤقت تتحكم فيه بشكل منفصل.</div>
        </section>

        <section class="tv-control-card">
          <div class="tv-control-title">
            <h3>رقم الجولة</h3>
            <span id="tvGameRoundHint" class="tv-muted"></span>
          </div>
          <div class="tv-round-row">
            <button id="tvRoundMinus" class="tv-btn" type="button">−</button>
            <div id="tvRoundNumber" class="tv-round-number">1</div>
            <button id="tvRoundPlus" class="tv-btn" type="button">+</button>
          </div>
          <button id="tvPublishRound" class="tv-btn gold" type="button" style="width:100%;margin-top:9px">نشر رقم الجولة</button>
        </section>

        <section class="tv-control-card">
          <div class="tv-control-title"><h3>نشر نتيجة الجولة</h3></div>
          <textarea id="tvResultInput" class="tv-textarea" placeholder="مثال: تم إقصاء اللاعب رقم 7"></textarea>
          <div class="tv-result-actions">
            <button id="tvUseNightResult" class="tv-btn" type="button">استخدام آخر نتيجة ليل</button>
            <button id="tvPublishResult" class="tv-btn gold" type="button">نشر النتيجة</button>
          </div>
        </section>

        <section class="tv-control-card full">
          <div class="tv-control-title">
            <h3>النتائج المنشورة سابقًا</h3>
            <button id="tvClearPublicHistory" class="tv-btn red" type="button">مسح</button>
          </div>
          <div id="tvPublicHistory" class="tv-public-history"></div>
        </section>
      </div>`;

    const logSection = document.getElementById('sectionLog');
    if (logSection && logSection.parentNode) logSection.parentNode.insertBefore(section, logSection.nextSibling);
    else document.body.appendChild(section);

    bindUI();
  }

  function getDisplayUrl() {
    const url = new URL('display.html', window.location.href);
    url.searchParams.set('room', roomCode);
    return url.toString();
  }

  function bindUI() {
    document.getElementById('tvCopyLinkBtn').addEventListener('click', async () => {
      const url = getDisplayUrl();
      try { await navigator.clipboard.writeText(url); }
      catch (_) {
        const input = document.getElementById('tvDisplayUrl'); input.select(); document.execCommand('copy');
      }
      vibrate(30);
      const btn = document.getElementById('tvCopyLinkBtn');
      const old = btn.textContent; btn.textContent = 'تم النسخ ✓'; setTimeout(() => btn.textContent = old, 1200);
    });

    document.getElementById('tvNewRoomBtn').addEventListener('click', () => {
      if (!confirm('إنشاء رمز جديد سيفصل شاشة التلفزيون الحالية. متابعة؟')) return;
      disconnectRealtime();
      roomCode = generateRoomCode();
      localStorage.setItem(ROOM_KEY, roomCode);
      tvLastSeenAt = 0;
      connectRealtime();
      renderAll();
    });

    document.querySelectorAll('.tv-preset').forEach(btn => btn.addEventListener('click', () => {
      const seconds = Number(btn.dataset.seconds);
      publicState.timerDurationMs = seconds * 1000;
      publicState.timerRemainingMs = seconds * 1000;
      publicState.timerEndsAt = 0;
      publicState.timerStatus = 'idle';
      hasBroadcastFinished = false;
      vibrate(20); saveState();
    }));

    document.getElementById('tvTimerStart').addEventListener('click', () => {
      let remaining = getRemainingMs();
      if (remaining <= 0) remaining = publicState.timerDurationMs;
      publicState.timerRemainingMs = remaining;
      publicState.timerEndsAt = Date.now() + remaining;
      publicState.timerStatus = 'running';
      hasBroadcastFinished = false;
      vibrate(35); saveState();
    });

    document.getElementById('tvTimerPause').addEventListener('click', () => {
      if (publicState.timerStatus !== 'running') return;
      publicState.timerRemainingMs = getRemainingMs();
      publicState.timerEndsAt = 0;
      publicState.timerStatus = 'paused';
      vibrate(25); saveState();
    });

    document.getElementById('tvTimerReset').addEventListener('click', () => {
      publicState.timerRemainingMs = publicState.timerDurationMs;
      publicState.timerEndsAt = 0;
      publicState.timerStatus = 'idle';
      hasBroadcastFinished = false;
      vibrate([20, 40, 20]); saveState();
    });

    document.querySelectorAll('.tv-phase').forEach(btn => btn.addEventListener('click', () => {
      publicState.phase = btn.dataset.phase;
      if (publicState.phase === 'night' && publicState.timerStatus === 'running') {
        publicState.timerRemainingMs = getRemainingMs();
        publicState.timerEndsAt = 0;
        publicState.timerStatus = 'paused';
      }
      vibrate(35); saveState();
    }));

    document.getElementById('tvRoundMinus').addEventListener('click', () => {
      const el = document.getElementById('tvRoundNumber');
      el.textContent = String(Math.max(1, Number(el.textContent) - 1)); vibrate(15);
    });
    document.getElementById('tvRoundPlus').addEventListener('click', () => {
      const el = document.getElementById('tvRoundNumber');
      el.textContent = String(Math.max(1, Number(el.textContent) + 1)); vibrate(15);
    });
    document.getElementById('tvPublishRound').addEventListener('click', () => {
      publicState.roundNumber = Math.max(1, Number(document.getElementById('tvRoundNumber').textContent) || 1);
      vibrate(30); saveState();
    });

    document.getElementById('tvUseNightResult').addEventListener('click', () => {
      let text = '';
      try {
        if (typeof gameEventLog !== 'undefined' && Array.isArray(gameEventLog) && gameEventLog[0]) text = gameEventLog[0].result || '';
      } catch (_) {}
      if (!text) text = 'لا توجد نتيجة ليل محفوظة حتى الآن.';
      document.getElementById('tvResultInput').value = text.replace(/^.[^ ]*\s*النتيجة:\s*/u, '').trim();
      vibrate(20);
    });

    document.getElementById('tvPublishResult').addEventListener('click', () => {
      const input = document.getElementById('tvResultInput');
      const text = input.value.trim();
      if (!text) { alert('اكتب نتيجة الجولة أولًا.'); return; }
      const item = {
        id: Date.now(),
        round: publicState.roundNumber,
        text,
        time: new Date().toLocaleTimeString('ar-JO', { hour:'2-digit', minute:'2-digit' })
      };
      publicState.latestResult = text;
      publicState.publicHistory.unshift(item);
      publicState.publicHistory = publicState.publicHistory.slice(0, 30);
      input.value = '';
      vibrate([25, 35, 25]); saveState();
    });

    document.getElementById('tvClearPublicHistory').addEventListener('click', () => {
      if (!confirm('مسح النتائج المنشورة من شاشة التلفزيون؟')) return;
      publicState.publicHistory = [];
      publicState.latestResult = '';
      saveState();
    });
  }

  function renderAll() {
    if (!document.getElementById('sectionDisplayControl')) return;
    document.getElementById('tvRoomCode').textContent = roomCode;
    document.getElementById('tvDisplayUrl').value = getDisplayUrl();
    document.getElementById('tvRoundNumber').textContent = String(publicState.roundNumber);

    const configured = configuredForSupabase();
    const warning = document.getElementById('tvDemoWarning');
    warning.innerHTML = configured
      ? 'الربط عبر الإنترنت جاهز. افتح الرابط على التلفزيون، وسيظهر متصلًا هنا.'
      : '<b>وضع تجربة محلي:</b> يعمل بين تبويبين على نفس الجهاز فقط. للربط الحقيقي بين الموبايل والتلفزيون نضيف بيانات Supabase في ملف realtime-config.js.';

    const timer = document.getElementById('tvAdminTimer');
    const remaining = getRemainingMs();
    timer.textContent = formattedTimer(remaining);
    timer.classList.toggle('running', publicState.timerStatus === 'running');
    timer.classList.toggle('finished', publicState.timerStatus === 'finished');
    const statusTexts = { idle:'جاهز', running:'يعمل الآن', paused:'متوقف مؤقتًا', finished:'انتهى الوقت' };
    document.getElementById('tvTimerStatusText').textContent = statusTexts[publicState.timerStatus];
    document.getElementById('tvTimerStart').disabled = publicState.timerStatus === 'running';
    document.getElementById('tvTimerPause').disabled = publicState.timerStatus !== 'running';

    document.querySelectorAll('.tv-preset').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.seconds) * 1000 === publicState.timerDurationMs);
    });
    document.querySelectorAll('.tv-phase').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.phase === publicState.phase);
    });

    let gameRound = '';
    try { if (typeof nightRoundCounter !== 'undefined') gameRound = `داخل اللعبة: ${nightRoundCounter}`; } catch (_) {}
    document.getElementById('tvGameRoundHint').textContent = gameRound;

    const history = document.getElementById('tvPublicHistory');
    if (!publicState.publicHistory.length) history.innerHTML = '<div class="tv-history-empty">ما تم نشر أي نتيجة بعد.</div>';
    else history.innerHTML = publicState.publicHistory.map(item => `
      <div class="tv-history-item">
        <div class="tv-history-head"><span>الجولة ${escapeHtml(item.round)}</span><span>${escapeHtml(item.time || '')}</span></div>
        <div class="tv-history-text">${escapeHtml(item.text)}</div>
      </div>`).join('');

    updateConnectionStatus();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function updateConnectionStatus() {
    const el = document.getElementById('tvConnectionStatus');
    if (!el) return;
    const tvOnline = Date.now() - tvLastSeenAt < 18000;
    el.className = 'tv-status-pill ' + (tvOnline ? 'online' : 'waiting');
    if (tvOnline) el.textContent = 'التلفزيون متصل';
    else if (connectionMode === 'supabase') el.textContent = 'بانتظار التلفزيون';
    else el.textContent = 'تجربة محلية';
  }

  function messageReceived(event, payload) {
    if (event === 'display_request' || event === 'display_ping') {
      tvLastSeenAt = Date.now();
      if (event === 'display_request') broadcastState();
      updateConnectionStatus();
    }
  }

  function broadcastState() {
    const payload = { ...publicState, roomCode, sentAt: Date.now() };
    if (connectionMode === 'supabase' && channel) {
      channel.send({ type:'broadcast', event:'state', payload }).catch(() => {});
    } else if (localChannel) {
      localChannel.postMessage({ event:'state', payload });
    }
  }

  function disconnectRealtime() {
    if (tvPresenceTimer) clearInterval(tvPresenceTimer);
    tvPresenceTimer = null;
    try { if (channel && supabaseClient) supabaseClient.removeChannel(channel); } catch (_) {}
    channel = null; supabaseClient = null;
    try { if (localChannel) localChannel.close(); } catch (_) {}
    localChannel = null;
  }

  function connectRealtime() {
    disconnectRealtime();
    if (configuredForSupabase() && window.supabase && typeof window.supabase.createClient === 'function') {
      connectionMode = 'supabase';
      const cfg = window.AMMAN_MAFIA_REALTIME;
      supabaseClient = window.supabase.createClient(cfg.supabaseUrl.trim(), cfg.supabaseAnonKey.trim(), {
        auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false },
        realtime: { params: { eventsPerSecond: 10 } }
      });
      channel = supabaseClient.channel(`amman-mafia-display-${roomCode}`, { config:{ broadcast:{ self:false } } });
      channel
        .on('broadcast', { event:'display_request' }, ({ payload }) => messageReceived('display_request', payload))
        .on('broadcast', { event:'display_ping' }, ({ payload }) => messageReceived('display_ping', payload))
        .subscribe(status => {
          if (status === 'SUBSCRIBED') broadcastState();
          updateConnectionStatus();
        });
    } else if ('BroadcastChannel' in window) {
      connectionMode = 'local';
      localChannel = new BroadcastChannel(`amman-mafia-display-${roomCode}`);
      localChannel.onmessage = e => {
        const data = e.data || {};
        messageReceived(data.event, data.payload);
      };
    } else {
      connectionMode = 'none';
    }
    tvPresenceTimer = setInterval(updateConnectionStatus, 3000);
    renderAll();
  }

  function timerTick() {
    if (publicState.timerStatus === 'running') {
      const remaining = getRemainingMs();
      if (remaining <= 0) {
        publicState.timerRemainingMs = 0;
        publicState.timerEndsAt = 0;
        publicState.timerStatus = 'finished';
        if (!hasBroadcastFinished) {
          hasBroadcastFinished = true;
          saveState();
          vibrate([120, 80, 120]);
        }
      }
    }
    renderAll();
  }

  function installTabWrapper() {
    if (typeof window.switchTab !== 'function' || window.__tvSwitchWrapped) return;
    const originalSwitchTab = window.switchTab;
    window.switchTab = function (tabName) {
      const section = document.getElementById('sectionDisplayControl');
      const tab = document.getElementById('tabDisplayControl');
      if (tabName === 'displayControl') {
        ['tabDashboard','tabNight','tabLog','tabDisplayControl'].forEach(id => document.getElementById(id)?.classList.remove('active'));
        ['sectionDashboard','sectionNight','sectionLog','sectionDisplayControl'].forEach(id => document.getElementById(id)?.classList.remove('active'));
        document.body.classList.remove('night-mode');
        section?.classList.add('active');
        tab?.classList.add('active');
        renderAll();
        window.scrollTo({ top:0, behavior:'instant' });
        return;
      }
      section?.classList.remove('active');
      tab?.classList.remove('active');
      return originalSwitchTab(tabName);
    };
    window.__tvSwitchWrapped = true;
  }

  function init() {
    createUI();
    installTabWrapper();
    connectRealtime();
    renderAll();
    timerTicker = setInterval(timerTick, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
