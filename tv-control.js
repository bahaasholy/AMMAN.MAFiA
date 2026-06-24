
(function () {
  'use strict';

  const STORAGE_KEY = 'ammanMafiaPublicDisplayStateV1';
  const ROOM_KEY = 'ammanMafiaPublicDisplayRoomV1';
  const LOCAL_STATE_PREFIX = 'ammanMafiaLocalDisplayStateV2:';
  const LOCAL_REQUEST_PREFIX = 'ammanMafiaLocalDisplayRequestV2:';
  const LOCAL_PRESENCE_PREFIX = 'ammanMafiaLocalDisplayPresenceV2:';
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
  let timerSyncSequence = 0;
  let realtimeStatus = 'idle';
  let realtimeErrorText = '';

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
      totalAlive: Math.max(0, Number(state.totalAlive) || 0),
      citizenAlive: Math.max(0, Number(state.citizenAlive) || 0),
      mafiaAlive: Math.max(0, Number(state.mafiaAlive) || 0),
      killerAlive: Math.max(0, Number(state.killerAlive) || 0),
      showKiller: Boolean(state.showKiller),
      mutedSeat: Number(state.mutedSeat) > 0
        ? Math.floor(Number(state.mutedSeat))
        : null,
      eliminationSeat: Number(state.eliminationSeat) > 0
        ? Math.floor(Number(state.eliminationSeat))
        : null,
      eliminationType: String(state.eliminationType || 'manual'),
      eliminationTitle: String(
        state.eliminationTitle || 'تم إقصاء اللاعب'
      ),
      eliminationIcon: String(state.eliminationIcon || '💀'),
      eliminationColor: String(state.eliminationColor || '#d1d5db'),
      eliminationEventId: Math.max(0, Number(state.eliminationEventId) || 0),
      eliminationActive: Boolean(state.eliminationActive),
      speakerSeat: Number(state.speakerSeat) > 0 ? Math.floor(Number(state.speakerSeat)) : null,
      speakerVisible: Boolean(state.speakerVisible),
      speakerDirection: ['clockwise','counterclockwise'].includes(state.speakerDirection)
        ? state.speakerDirection
        : 'clockwise',
      speakerAutoTimer: false,
      speakerChangeId: Math.max(0, Number(state.speakerChangeId) || 0),
      speakerCycleStartSeat: Number(state.speakerCycleStartSeat) > 0
        ? Math.floor(Number(state.speakerCycleStartSeat))
        : null,
      speakerVisitedSeats: Array.isArray(state.speakerVisitedSeats)
        ? [...new Set(
            state.speakerVisitedSeats
              .map(Number)
              .filter(seat => Number.isInteger(seat) && seat > 0)
          )]
        : [],
      speakerCycleActive: Boolean(state.speakerCycleActive),

      votingMode: ['choice','manual','live'].includes(state.votingMode)
        ? state.votingMode
        : 'choice',
      votingStage: [
        'choice','manual','collecting','nominees',
        'defense','exit','result'
      ].includes(state.votingStage)
        ? state.votingStage
        : 'choice',
      votingVoters: Array.isArray(state.votingVoters)
        ? state.votingVoters
            .map(Number)
            .filter(seat => Number.isInteger(seat) && seat > 0)
        : [],
      votingBallots:
        state.votingBallots && typeof state.votingBallots === 'object'
          ? { ...state.votingBallots }
          : {},
      votingVoteOrder: Array.isArray(state.votingVoteOrder)
        ? state.votingVoteOrder
            .map(Number)
            .filter(seat => Number.isInteger(seat) && seat > 0)
        : [],
      votingTallies: Array.isArray(state.votingTallies)
        ? state.votingTallies
            .map(item => ({
              seat: Math.floor(Number(item?.seat) || 0),
              votes: Math.max(0, Math.floor(Number(item?.votes) || 0))
            }))
            .filter(item => item.seat > 0)
        : [],
      votingNominees: Array.isArray(state.votingNominees)
        ? state.votingNominees
            .map(Number)
            .filter(seat => Number.isInteger(seat) && seat > 0)
        : [],
      votingCurrentVoterIndex: Math.max(
        0,
        Math.floor(Number(state.votingCurrentVoterIndex) || 0)
      ),
      votingDefenseIndex: Math.max(
        0,
        Math.floor(Number(state.votingDefenseIndex) || 0)
      ),
      votingExitVotes:
        state.votingExitVotes && typeof state.votingExitVotes === 'object'
          ? { ...state.votingExitVotes }
          : {},
      votingEligibleCount: Math.max(
        0,
        Math.floor(Number(state.votingEligibleCount) || 0)
      ),
      votingThreshold: Math.max(
        0,
        Math.floor(Number(state.votingThreshold) || 0)
      ),
      votingResultType: ['pending','eliminate','none','tie'].includes(
        state.votingResultType
      )
        ? state.votingResultType
        : 'pending',
      votingResultSeat: Number(state.votingResultSeat) > 0
        ? Math.floor(Number(state.votingResultSeat))
        : null,
      votingResultText: String(state.votingResultText || ''),
      votingResultConfirmed: Boolean(state.votingResultConfirmed),

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

  function localStateKey(code = roomCode) {
    return LOCAL_STATE_PREFIX + code;
  }

  function localRequestKey(code = roomCode) {
    return LOCAL_REQUEST_PREFIX + code;
  }

  function localPresenceKey(code = roomCode) {
    return LOCAL_PRESENCE_PREFIX + code;
  }

  function writeLocalState(payload) {
    try {
      localStorage.setItem(localStateKey(), JSON.stringify({
        event: 'state',
        payload,
        writtenAt: Date.now(),
        nonce: Math.random().toString(36).slice(2)
      }));
    } catch (_) {}
  }

  function readLocalPresence() {
    try {
      const raw = JSON.parse(localStorage.getItem(localPresenceKey()) || 'null');
      return raw && Number(raw.at) ? Number(raw.at) : 0;
    } catch (_) {
      return 0;
    }
  }

  function handleLocalStorageMessage(event) {
    if (!event || !event.key) return;

    if (event.key === localRequestKey()) {
      tvLastSeenAt = Date.now();
      broadcastState();
      updateConnectionStatus();
      return;
    }

    if (event.key === localPresenceKey()) {
      const seenAt = readLocalPresence();
      if (seenAt) tvLastSeenAt = Math.max(tvLastSeenAt, seenAt);
      updateConnectionStatus();
    }
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


  function readCounterValue(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    const parsed = parseInt(String(el.textContent || '').replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function killerWasIncludedFromStart() {
    try {
      if (typeof activeGameRoles !== 'undefined' &&
          Array.isArray(activeGameRoles) &&
          activeGameRoles.some(role =>
            role && role.value === 'serial_killer' && Number(role.limit) > 0
          )) return true;
    } catch (_) {}

    try {
      if (typeof deckSelection !== 'undefined' &&
          deckSelection &&
          Number(deckSelection.serial_killer) > 0) return true;
    } catch (_) {}

    try {
      const savedDeck = JSON.parse(localStorage.getItem('mafiaDeckSelection') || '{}');
      if (Number(savedDeck.serial_killer) > 0) return true;
    } catch (_) {}

    return Boolean(publicState.showKiller);
  }


  function readMutedSeat() {
    try {
      if (
        typeof currentMutedSeat !== 'undefined' &&
        Number(currentMutedSeat) > 0
      ) {
        return Math.floor(Number(currentMutedSeat));
      }
    } catch (_) {}

    try {
      const savedGame = JSON.parse(
        localStorage.getItem('mafiaGameState') || '{}'
      );
      if (Number(savedGame.mutedSeat) > 0) {
        return Math.floor(Number(savedGame.mutedSeat));
      }
    } catch (_) {}

    const stored = Math.floor(
      Number(localStorage.getItem('mafiaMutedSeat')) || 0
    );
    return stored > 0 ? stored : null;
  }

  function collectGameCounts() {
    return {
      totalAlive: readCounterValue('totalLiveCount'),
      citizenAlive: readCounterValue('citizenLiveCount'),
      mafiaAlive: readCounterValue('mafiaLiveCount'),
      killerAlive: readCounterValue('soloLiveCount'),
      showKiller: killerWasIncludedFromStart(),
      mutedSeat: readMutedSeat()
    };
  }

  function syncGameCounts(forceBroadcast = false) {
    const next = collectGameCounts();
    const changed =
      publicState.totalAlive !== next.totalAlive ||
      publicState.citizenAlive !== next.citizenAlive ||
      publicState.mafiaAlive !== next.mafiaAlive ||
      publicState.killerAlive !== next.killerAlive ||
      publicState.showKiller !== next.showKiller ||
      Number(publicState.mutedSeat || 0) !== Number(next.mutedSeat || 0);

    if (!changed && !forceBroadcast) return false;

    Object.assign(publicState, next);
    publicState.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(publicState));
    broadcastState();
    renderAll();
    return true;
  }


  function getAliveSeatNumbers() {
    const seats = [];

    let seatCount = 0;
    try {
      if (typeof totalGameSeats !== 'undefined') {
        seatCount = Math.max(0, Number(totalGameSeats) || 0);
      }
    } catch (_) {}

    for (let seat = 1; seat <= seatCount; seat++) {
      const card = document.getElementById(`seat-${seat}`);
      const role = document.getElementById(`select-${seat}`);

      if (!card || card.classList.contains('dead-status')) continue;
      if (role && role.value === 'unassigned') continue;

      seats.push(seat);
    }

    return seats.sort((a, b) => a - b);
  }


  function isMutedSpeaker(seat = publicState.speakerSeat) {
    return (
      publicState.phase === 'discussion' &&
      Number(seat) > 0 &&
      Number(publicState.mutedSeat) === Number(seat)
    );
  }

  function stopTimerForMutedSpeaker() {
    publicState.timerRemainingMs = publicState.timerDurationMs;
    publicState.timerEndsAt = 0;
    publicState.timerStatus = 'idle';
    hasBroadcastFinished = false;
  }

  function startFullSpeakerTimer() {
    if (isMutedSpeaker()) {
      stopTimerForMutedSpeaker();
      return false;
    }

    const duration = Math.max(
      1000,
      Number(publicState.timerDurationMs) || DEFAULT_SECONDS * 1000
    );

    publicState.timerRemainingMs = duration;
    publicState.timerEndsAt = Date.now() + duration;
    publicState.timerStatus = 'running';
    hasBroadcastFinished = false;
    return true;
  }

  function resetSpeakerCycle(options = {}) {
    publicState.speakerCycleStartSeat = null;
    publicState.speakerVisitedSeats = [];
    publicState.speakerCycleActive = false;

    if (options.clearSpeaker) {
      publicState.speakerSeat = null;
      publicState.speakerVisible = false;
    }
  }

  function beginSpeakerCycle(seat) {
    const parsedSeat = Number(seat);
    publicState.speakerCycleStartSeat = parsedSeat;
    publicState.speakerVisitedSeats = [parsedSeat];
    publicState.speakerCycleActive = true;
  }

  function selectSpeakerSeat(seat, options = {}) {
    const aliveSeats = getAliveSeatNumbers();
    const parsedSeat = Number(seat);

    if (!aliveSeats.includes(parsedSeat)) return false;

    publicState.speakerSeat = parsedSeat;
    publicState.speakerVisible = true;
    publicState.speakerChangeId += 1;

    // A manual choice always starts a fresh, single lap from that player.
    if (options.resetCycle !== false) {
      beginSpeakerCycle(parsedSeat);
    } else if (!publicState.speakerVisitedSeats.includes(parsedSeat)) {
      publicState.speakerVisitedSeats.push(parsedSeat);
    }

    if (isMutedSpeaker(parsedSeat)) {
      stopTimerForMutedSpeaker();
    }

    vibrate(28);
    saveState();
    return true;
  }

  function getCircularSeatsAfter(currentSeat, aliveSeats, direction) {
    if (!aliveSeats.length) return [];

    const ascending = direction === 'clockwise';
    const current = Number(currentSeat);

    if (ascending) {
      return [
        ...aliveSeats.filter(seat => seat > current),
        ...aliveSeats.filter(seat => seat <= current)
      ];
    }

    const descendingSeats = [...aliveSeats].sort((a, b) => b - a);
    return [
      ...descendingSeats.filter(seat => seat < current),
      ...descendingSeats.filter(seat => seat >= current)
    ];
  }

  function getFirstSpeakerForDirection(aliveSeats) {
    if (!aliveSeats.length) return null;

    return publicState.speakerDirection === 'clockwise'
      ? aliveSeats[0]
      : aliveSeats[aliveSeats.length - 1];
  }

  function ensureSpeakerCycle() {
    const aliveSeats = getAliveSeatNumbers();
    if (!aliveSeats.length) return null;

    const current = Number(publicState.speakerSeat);

    if (
      publicState.speakerCycleActive &&
      Number(publicState.speakerCycleStartSeat) > 0 &&
      publicState.speakerVisitedSeats.length
    ) {
      return current > 0 ? current : publicState.speakerCycleStartSeat;
    }

    if (aliveSeats.includes(current)) {
      beginSpeakerCycle(current);
      return current;
    }

    const first = getFirstSpeakerForDirection(aliveSeats);
    if (first != null) {
      publicState.speakerSeat = first;
      publicState.speakerVisible = true;
      publicState.speakerChangeId += 1;
      beginSpeakerCycle(first);
    }

    return first;
  }

  function isSpeakerLapComplete() {
    const aliveSeats = getAliveSeatNumbers();

    if (!aliveSeats.length) return true;
    if (!publicState.speakerCycleActive) return false;

    const visited = new Set(
      publicState.speakerVisitedSeats.map(Number)
    );

    return aliveSeats.every(seat => visited.has(seat));
  }

  function getNextUnvisitedSpeaker() {
    const aliveSeats = getAliveSeatNumbers();
    if (!aliveSeats.length) return null;

    const current = ensureSpeakerCycle();
    if (!(Number(current) > 0)) return null;

    const visited = new Set(
      publicState.speakerVisitedSeats.map(Number)
    );

    const candidates = getCircularSeatsAfter(
      current,
      aliveSeats,
      publicState.speakerDirection
    );

    return candidates.find(seat => !visited.has(seat)) ?? null;
  }

  function finishDiscussionAndStartVoting() {
    // Update everything directly so the transition does not depend on
    // another helper or on the timer state.
    publicState.phase = 'voting';
    resetVotingFlow('manual');
    publicState.speakerCycleActive = false;
    publicState.speakerVisible = false;
    publicState.speakerChangeId += 1;

    publicState.timerRemainingMs = publicState.timerDurationMs;
    publicState.timerEndsAt = 0;
    publicState.timerStatus = 'idle';
    hasBroadcastFinished = false;

    try {
      if (typeof nightRoundCounter !== 'undefined') {
        publicState.roundNumber = Math.max(
          1,
          Number(nightRoundCounter) || 1
        );
      }
    } catch (_) {}

    vibrate([45, 45, 80]);
    saveState();

    // Force a second render/broadcast on the next frame for TVs or
    // browsers that received the last speaker update at the same moment.
    requestAnimationFrame(() => {
      renderAll();
      broadcastState();
    });
  }

  function advanceSpeakerOneLap(options = {}) {
    const aliveSeats = getAliveSeatNumbers();

    if (!aliveSeats.length || isSpeakerLapComplete()) {
      finishDiscussionAndStartVoting();
      return null;
    }

    const current = ensureSpeakerCycle();

    // When no speaker existed, ensureSpeakerCycle selected the first player.
    // This is the first turn, not the end of the lap.
    if (
      Number(current) > 0 &&
      publicState.speakerVisitedSeats.length === 1 &&
      Number(publicState.speakerChangeId) > 0 &&
      options.initializedOnly
    ) {
      if (options.forceTimer) startFullSpeakerTimer();
      saveState();
      return current;
    }

    if (isSpeakerLapComplete()) {
      finishDiscussionAndStartVoting();
      return null;
    }

    const target = getNextUnvisitedSpeaker();

    if (target == null) {
      finishDiscussionAndStartVoting();
      return null;
    }

    publicState.speakerSeat = target;
    publicState.speakerVisible = true;
    publicState.speakerChangeId += 1;

    if (!publicState.speakerVisitedSeats.includes(target)) {
      publicState.speakerVisitedSeats.push(target);
    }

    if (options.forceTimer) {
      startFullSpeakerTimer();
    }

    vibrate([35, 35, 55]);
    saveState();
    return target;
  }

  function moveSpeaker(step = 1) {
    if (step >= 0) {
      return handleSpeakerNext(false);
    }

    // "السابق" يرجع خطوة داخل نفس اللفة، ويتيح المرور عليها من جديد.
    if (
      !publicState.speakerCycleActive ||
      publicState.speakerVisitedSeats.length <= 1
    ) {
      return false;
    }

    publicState.speakerVisitedSeats.pop();
    const previous =
      publicState.speakerVisitedSeats[
        publicState.speakerVisitedSeats.length - 1
      ];

    publicState.speakerSeat = previous;
    publicState.speakerVisible = true;
    publicState.speakerChangeId += 1;

    if (isMutedSpeaker(previous)) {
      stopTimerForMutedSpeaker();
    }

    vibrate(24);
    saveState();
    return true;
  }

  function handleSpeakerNext(forceTimer) {
    const hadActiveCycle =
      publicState.speakerCycleActive &&
      publicState.speakerVisitedSeats.length > 0;

    if (hadActiveCycle && isSpeakerLapComplete()) {
      finishDiscussionAndStartVoting();
      return null;
    }

    if (!hadActiveCycle) {
      const first = ensureSpeakerCycle();

      if (first == null) {
        // If the game seats are not ready yet, retain timer-only behavior.
        if (forceTimer) {
          startFullSpeakerTimer();
          vibrate([35, 35, 55]);
          saveState();
        }
        return null;
      }

      if (forceTimer) {
        startFullSpeakerTimer();
      }

      vibrate(28);
      saveState();
      return first;
    }

    return advanceSpeakerOneLap({ forceTimer });
  }

  function advanceSpeakerAndRestartTimer() {
    return handleSpeakerNext(true);
  }

  function getSpeakerOrderPreview() {
    const aliveSeats = getAliveSeatNumbers();
    if (!aliveSeats.length) return [];

    const current = Number(publicState.speakerSeat);
    const visited = new Set(
      publicState.speakerVisitedSeats.map(Number)
    );

    if (
      publicState.speakerCycleActive &&
      Number(current) > 0
    ) {
      const remaining = getCircularSeatsAfter(
        current,
        aliveSeats,
        publicState.speakerDirection
      ).filter(seat => !visited.has(seat));

      return [current, ...remaining];
    }

    const first = aliveSeats.includes(current)
      ? current
      : getFirstSpeakerForDirection(aliveSeats);

    if (first == null) return [];

    const rest = getCircularSeatsAfter(
      first,
      aliveSeats,
      publicState.speakerDirection
    ).filter(seat => seat !== first);

    return [first, ...rest];
  }

  function renderSpeakerControls() {
    const grid = document.getElementById('tvSpeakerSeats');
    if (!grid) return;

    const aliveSeats = getAliveSeatNumbers();
    const currentSeat = Number(publicState.speakerSeat);
    const currentAlive = aliveSeats.includes(currentSeat);
    const signature = [
      aliveSeats.join(','),
      currentSeat || '',
      publicState.speakerVisible ? '1' : '0',
      publicState.speakerDirection,
      publicState.speakerAutoTimer ? '1' : '0',
      Number(publicState.mutedSeat) || '',
      publicState.speakerCycleActive ? '1' : '0',
      publicState.speakerVisitedSeats.join(',')
    ].join('|');

    if (grid.dataset.signature !== signature) {
      grid.dataset.signature = signature;
      grid.innerHTML = '';

      aliveSeats.forEach(seat => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tv-speaker-seat-btn';
        button.textContent = String(seat);
        button.classList.toggle('active', seat === currentSeat);
        button.classList.toggle(
          'muted',
          Number(publicState.mutedSeat) === Number(seat)
        );
        if (Number(publicState.mutedSeat) === Number(seat)) {
          button.title = 'هذا اللاعب مسكّت في جولة النقاش';
        }
        button.addEventListener('click', () => selectSpeakerSeat(seat));
        grid.appendChild(button);
      });
    }

    document.getElementById('tvSpeakerEmpty').hidden = aliveSeats.length > 0;

    const currentBox = document.getElementById('tvSpeakerCurrent');
    const currentStrong = currentBox.querySelector('strong');
    const status = document.getElementById('tvSpeakerStatus');

    if (currentSeat > 0) {
      currentStrong.textContent = `لاعب ${currentSeat}`;
      currentBox.classList.toggle('hidden-on-tv', !publicState.speakerVisible);
      currentBox.classList.toggle('not-alive', !currentAlive);

      if (!currentAlive) {
        status.textContent = 'المتحدث الحالي مقصي — اضغط التالي للتخطي';
      } else if (isMutedSpeaker(currentSeat)) {
        status.textContent =
          `لاعب ${currentSeat} مسكّت — يظهر MUTE بدل المؤقت`;
      } else if (!publicState.speakerVisible) {
        status.textContent = 'المتحدث مخفي من شاشة التلفزيون';
      } else if (publicState.speakerCycleActive) {
        const spokenCount = publicState.speakerVisitedSeats.length;
        const totalCount = aliveSeats.length;
        status.textContent =
          `لاعب ${currentSeat} يتحدث الآن — ${spokenCount} من ${totalCount}`;
      } else {
        status.textContent = `لاعب ${currentSeat} يتحدث الآن`;
      }
    } else {
      currentStrong.textContent = '—';
      currentBox.classList.remove('hidden-on-tv', 'not-alive');

      if (Number(publicState.mutedSeat) > 0) {
        status.textContent =
          `المقعد المسكّت في هذه الجولة: ${publicState.mutedSeat} 🔇`;
      } else {
        status.textContent = 'لم يتم اختيار لاعب';
      }
    }

    document
      .getElementById('tvSpeakerClockwise')
      .classList.toggle('active', publicState.speakerDirection === 'clockwise');

    document
      .getElementById('tvSpeakerCounterclockwise')
      .classList.toggle('active', publicState.speakerDirection === 'counterclockwise');

    const preview = getSpeakerOrderPreview();
    const previewElement = document.getElementById('tvSpeakerPreview');
    if (isSpeakerLapComplete()) {
      previewElement.textContent =
        'انتهت اللفة — استخدم زر التالي الرئيسي للانتقال إلى جولة التصويت';
    } else {
      previewElement.textContent = preview.length
        ? `اللفة الحالية: ${preview.join(' ← ')} ← ثم جولة التصويت`
        : 'لا يوجد لاعبون أحياء متاحون حاليًا.';
    }

    document.getElementById('tvSpeakerPrevious').disabled =
      !publicState.speakerCycleActive ||
      publicState.speakerVisitedSeats.length <= 1;

  }

  function syncSpeakerAvailability() {
    const currentSeat = Number(publicState.speakerSeat);
    if (!(currentSeat > 0) || !publicState.speakerVisible) return false;

    const aliveSeats = getAliveSeatNumbers();
    if (aliveSeats.includes(currentSeat)) return false;

    // Keep the player number and the visited list so "التالي" skips the
    // eliminated player and continues the same single lap.
    publicState.speakerVisible = false;
    publicState.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(publicState));
    broadcastState();
    return true;
  }


  function resetVotingFlow(mode = 'choice') {
    publicState.votingMode = 'manual';
    publicState.votingStage = 'manual';
    publicState.votingVoters = [];
    publicState.votingBallots = {};
    publicState.votingVoteOrder = [];
    publicState.votingTallies = [];
    publicState.votingNominees = [];
    publicState.votingCurrentVoterIndex = 0;
    publicState.votingDefenseIndex = 0;
    publicState.votingExitVotes = {};
    publicState.votingEligibleCount = 0;
    publicState.votingThreshold = 0;
    publicState.votingResultType = 'pending';
    publicState.votingResultSeat = null;
    publicState.votingResultText = '';
    publicState.votingResultConfirmed = false;
  }

  function getVotingTallies(ballots = publicState.votingBallots) {
    const aliveSeats = getAliveSeatNumbers();
    const counts = new Map(aliveSeats.map(seat => [seat, 0]));

    Object.values(ballots || {}).forEach(target => {
      const seat = Number(target);
      if (counts.has(seat)) {
        counts.set(seat, counts.get(seat) + 1);
      }
    });

    return [...counts.entries()]
      .map(([seat, votes]) => ({ seat, votes }))
      .sort((a, b) => b.votes - a.votes || a.seat - b.seat);
  }

  function startLiveVoting() {
    useManualVoting();
  }

  function useManualVoting() {
    resetVotingFlow('manual');
    publicState.phase = 'voting';
    publicState.speakerVisible = false;
    publicState.speakerCycleActive = false;
    publicState.timerEndsAt = 0;
    publicState.timerStatus = 'idle';
    saveState();
  }

  function cancelLiveVoting() {
    useManualVoting();
  }

  function recordLiveVote(targetSeat) {
    if (
      publicState.phase !== 'voting' ||
      publicState.votingMode !== 'live' ||
      publicState.votingStage !== 'collecting'
    ) return;

    const voters = publicState.votingVoters;
    const index = Math.min(
      publicState.votingCurrentVoterIndex,
      Math.max(0, voters.length - 1)
    );
    const voter = Number(voters[index]);
    const target = Number(targetSeat);

    if (!(voter > 0) || !voters.includes(target)) return;

    publicState.votingBallots[String(voter)] = target;

    if (!publicState.votingVoteOrder.includes(voter)) {
      publicState.votingVoteOrder.push(voter);
    }

    publicState.votingTallies = getVotingTallies();

    const nextIndex = voters.findIndex((seat, voterIndex) => {
      return (
        voterIndex > index &&
        !Object.prototype.hasOwnProperty.call(
          publicState.votingBallots,
          String(seat)
        )
      );
    });

    if (nextIndex >= 0) {
      publicState.votingCurrentVoterIndex = nextIndex;
      vibrate(18);
      saveState();
      return;
    }

    const firstMissing = voters.findIndex(seat => {
      return !Object.prototype.hasOwnProperty.call(
        publicState.votingBallots,
        String(seat)
      );
    });

    if (firstMissing >= 0) {
      publicState.votingCurrentVoterIndex = firstMissing;
      vibrate(18);
      saveState();
      return;
    }

    finalizeInitialVoting();
  }

  function undoLastLiveVote() {
    if (
      publicState.votingMode !== 'live' ||
      publicState.votingStage !== 'collecting'
    ) return;

    const voter = publicState.votingVoteOrder.pop();
    if (!(Number(voter) > 0)) return;

    delete publicState.votingBallots[String(voter)];
    publicState.votingTallies = getVotingTallies();

    const index = publicState.votingVoters.indexOf(Number(voter));
    publicState.votingCurrentVoterIndex = Math.max(0, index);
    vibrate(18);
    saveState();
  }

  function finalizeInitialVoting() {
    const tallies = getVotingTallies();
    const completedVotes = Object.keys(publicState.votingBallots).length;

    if (!completedVotes) {
      alert('لم يتم تسجيل أي صوت.');
      return;
    }

    const highest = Math.max(...tallies.map(item => item.votes));
    const nominees = tallies
      .filter(item => item.votes === highest && item.votes > 0)
      .map(item => item.seat);

    publicState.votingTallies = tallies;
    publicState.votingNominees = nominees;
    publicState.votingStage = 'nominees';
    publicState.votingDefenseIndex = 0;
    vibrate([30, 40, 30]);
    saveState();
  }

  function beginVotingDefenses() {
    const nominees = publicState.votingNominees;

    if (!nominees.length) {
      alert('لا يوجد متهمون للتبرير.');
      return;
    }

    publicState.votingStage = 'defense';
    publicState.votingDefenseIndex = 0;
    publicState.timerDurationMs = 60000;
    publicState.timerRemainingMs = 60000;
    publicState.timerEndsAt = 0;
    publicState.timerStatus = 'idle';
    hasBroadcastFinished = false;
    vibrate(25);
    saveState();
  }

  function getCurrentDefenseSeat() {
    return Number(
      publicState.votingNominees[
        publicState.votingDefenseIndex
      ]
    ) || null;
  }

  function startVotingDefenseTimer() {
    if (
      publicState.votingMode !== 'live' ||
      publicState.votingStage !== 'defense'
    ) return;

    let remaining = getRemainingMs();
    if (remaining <= 0 || remaining > 60000) remaining = 60000;

    publicState.timerDurationMs = 60000;
    publicState.timerRemainingMs = remaining;
    publicState.timerEndsAt = Date.now() + remaining;
    publicState.timerStatus = 'running';
    hasBroadcastFinished = false;
    vibrate(24);
    saveState();
  }

  function pauseVotingDefenseTimer() {
    if (publicState.timerStatus !== 'running') return;

    publicState.timerRemainingMs = getRemainingMs();
    publicState.timerEndsAt = 0;
    publicState.timerStatus = 'paused';
    vibrate(18);
    saveState();
  }

  function resetVotingDefenseTimer() {
    publicState.timerDurationMs = 60000;
    publicState.timerRemainingMs = 60000;
    publicState.timerEndsAt = 0;
    publicState.timerStatus = 'idle';
    hasBroadcastFinished = false;
    vibrate(18);
    saveState();
  }

  function nextVotingDefense() {
    if (
      publicState.votingMode !== 'live' ||
      publicState.votingStage !== 'defense'
    ) return;

    const nextIndex = publicState.votingDefenseIndex + 1;

    if (nextIndex < publicState.votingNominees.length) {
      publicState.votingDefenseIndex = nextIndex;
      resetVotingDefenseTimer();
      return;
    }

    prepareExitVoting();
  }

  function previousVotingDefense() {
    if (
      publicState.votingMode !== 'live' ||
      publicState.votingStage !== 'defense'
    ) return;

    if (publicState.votingDefenseIndex <= 0) return;

    publicState.votingDefenseIndex -= 1;
    resetVotingDefenseTimer();
  }

  function prepareExitVoting() {
    const aliveSeats = getAliveSeatNumbers();
    const nominees = publicState.votingNominees;
    const eligibleCount = Math.max(0, aliveSeats.length - nominees.length);
    const threshold = eligibleCount > 0
      ? Math.ceil(eligibleCount / 2)
      : 1;

    publicState.votingStage = 'exit';
    publicState.votingEligibleCount = eligibleCount;
    publicState.votingThreshold = threshold;
    publicState.votingExitVotes = Object.fromEntries(
      nominees.map(seat => [String(seat), 0])
    );
    publicState.timerEndsAt = 0;
    publicState.timerStatus = 'idle';
    publicState.votingResultType = 'pending';
    publicState.votingResultSeat = null;
    publicState.votingResultText = '';
    publicState.votingResultConfirmed = false;
    vibrate([25, 30, 25]);
    saveState();
  }

  function adjustExitVotes(seat, delta) {
    if (
      publicState.votingMode !== 'live' ||
      publicState.votingStage !== 'exit'
    ) return;

    const key = String(Number(seat));
    if (!publicState.votingNominees.includes(Number(seat))) return;

    const current = Math.max(
      0,
      Math.floor(Number(publicState.votingExitVotes[key]) || 0)
    );
    const next = Math.max(
      0,
      Math.min(
        publicState.votingEligibleCount,
        current + Number(delta || 0)
      )
    );

    publicState.votingExitVotes[key] = next;
    vibrate(10);
    saveState();
  }

  function finalizeExitVoting() {
    const nominees = publicState.votingNominees;
    const threshold = publicState.votingThreshold;

    if (!nominees.length) return;

    const rows = nominees.map(seat => ({
      seat,
      votes: Math.max(
        0,
        Math.floor(
          Number(publicState.votingExitVotes[String(seat)]) || 0
        )
      )
    }));

    const qualified = rows.filter(row => row.votes >= threshold);

    publicState.votingStage = 'result';
    publicState.votingResultConfirmed = false;

    if (!qualified.length) {
      publicState.votingResultType = 'none';
      publicState.votingResultSeat = null;
      publicState.votingResultText =
        'لم يحصل أي لاعب على نصف الأصوات — لا يوجد إقصاء';
      saveState();
      return;
    }

    const highest = Math.max(...qualified.map(row => row.votes));
    const leaders = qualified.filter(row => row.votes === highest);

    if (leaders.length > 1) {
      publicState.votingResultType = 'tie';
      publicState.votingResultSeat = null;
      publicState.votingResultText =
        `تعادل ${leaders.map(row => `اللاعب ${row.seat}`).join(' و')} — تم إلغاء الإقصاء`;
      saveState();
      return;
    }

    publicState.votingResultType = 'eliminate';
    publicState.votingResultSeat = leaders[0].seat;
    publicState.votingResultText =
      `اللاعب رقم ${leaders[0].seat} مؤهل للخروج`;
    saveState();
  }

  function confirmVotingElimination() {
    if (
      publicState.votingResultType !== 'eliminate' ||
      !(Number(publicState.votingResultSeat) > 0) ||
      publicState.votingResultConfirmed
    ) return;

    const seat = Number(publicState.votingResultSeat);

    if (
      !confirm(
        `تأكيد إخراج اللاعب رقم ${seat} بالتصويت؟`
      )
    ) return;

    try {
      window.__ammanMafiaTypedNightEliminations = true;
      if (typeof window.toggleElimination === 'function') {
        window.toggleElimination(seat);
      }
    } finally {
      window.__ammanMafiaTypedNightEliminations = false;
    }

    publishEliminationNotice(seat, {
      type: 'vote',
      title: 'خرج بالتصويت',
      icon: '🗳️',
      color: '#f2c35b'
    });

    publicState.votingResultConfirmed = true;
    publicState.votingResultText =
      `تم إخراج اللاعب رقم ${seat} بالتصويت`;
    saveState();
  }

  function finishVotingAndOpenNight() {
    publicState.votingMode = 'choice';
    publicState.votingStage = 'choice';
    setPublicPhase('night', { syncRound: true });

    if (typeof window.switchTab === 'function') {
      window.switchTab('night');
    }
  }

  function renderVotingManager() {
    const card = document.getElementById('tvVotingManager');
    if (card) card.remove();

    const section = document.getElementById('sectionDisplayControl');
    section?.classList.remove('tv-voting-phase-active');

    if (publicState.phase === 'voting') {
      publicState.votingMode = 'manual';
      publicState.votingStage = 'manual';
    }
  }

  function handleVotingManagerClick(event) {
    return;
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
        <section class="tv-control-card full tv-timer-primary">
          <div class="tv-control-title">
            <h2>مؤقت الكلام ⏱️</h2>
            <span id="tvTimerStatusText" class="tv-muted">جاهز</span>
          </div>
          <div id="tvAdminTimer" class="tv-timer-display">01:00</div>
          <div class="tv-presets">
            <button class="tv-btn tv-preset" type="button" data-seconds="30">30 ثانية</button>
            <button class="tv-btn tv-preset" type="button" data-seconds="45">45 ثانية</button>
            <button class="tv-btn tv-preset" type="button" data-seconds="60">60 ثانية</button>
          </div>
          <button id="tvTimerNext" class="tv-btn tv-next-btn" type="button">
            التالي
            <span>ينتقل للاعب التالي — والمسكّت يظهر بدون وقت</span>
          </button>
          <div class="tv-timer-actions">
            <button id="tvTimerStart" class="tv-btn gold" type="button">بدء</button>
            <button id="tvTimerPause" class="tv-btn" type="button">إيقاف</button>
            <button id="tvTimerReset" class="tv-btn red" type="button">إعادة</button>
          </div>
        </section>

        <section class="tv-control-card full tv-speaker-card">
          <div class="tv-control-title">
            <h3>دور المتحدث 🎙️</h3>
            <span id="tvSpeakerStatus" class="tv-muted">لم يتم اختيار لاعب</span>
          </div>

          <div class="tv-speaker-direction-label">ترتيب الكلام</div>
          <div class="tv-speaker-direction">
            <button id="tvSpeakerClockwise" class="tv-btn tv-direction-btn" type="button">
              ترتيب تصاعدي
            </button>
            <button id="tvSpeakerCounterclockwise" class="tv-btn tv-direction-btn" type="button">
              ترتيب تنازلي
            </button>
          </div>

          <div id="tvSpeakerCurrent" class="tv-speaker-current">
            <span>دور الكلام الحالي</span>
            <strong>—</strong>
          </div>

          <div class="tv-speaker-direction-label">اختر أول لاعب من اللاعبين الأحياء</div>
          <div id="tvSpeakerSeats" class="tv-speaker-seats"></div>
          <div id="tvSpeakerEmpty" class="tv-speaker-empty" hidden>
            ابدأ اللعبة وحدد الأدوار حتى يظهر اللاعبون الأحياء هنا.
          </div>

          <div id="tvSpeakerPreview" class="tv-speaker-preview"></div>

          <div class="tv-speaker-actions tv-speaker-actions-single">
            <button id="tvSpeakerPrevious" class="tv-btn" type="button">السابق</button>
          </div>
        </section>
<section class="tv-control-card">
          <div class="tv-control-title"><h3>حالة الجولة</h3></div>
          <div class="tv-phase-grid">
            <button class="tv-btn tv-phase blue" type="button" data-phase="discussion">بدء جولة النقاش 💬</button>
            <button class="tv-btn tv-phase gold" type="button" data-phase="voting">بدء جولة التصويت 🗳️</button>
            <button class="tv-btn tv-phase purple" type="button" data-phase="night">بدء جولة الليل 🌙</button>
          </div>
          <div class="tv-muted" style="margin-top:10px">جولة الليل تتزامن تلقائيًا عند فتحها من لوحة الإدارة، وبعد إنهائها تتحول الشاشة تلقائيًا إلى جولة النقاش.</div>
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

        <section class="tv-control-card full tv-connection-card">
          <div class="tv-control-title">
            <h3>ربط شاشة التلفزيون 📺</h3>
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
      </div>`

    const logSection = document.getElementById('sectionLog');
    if (logSection && logSection.parentNode) logSection.parentNode.insertBefore(section, logSection.nextSibling);
    else document.body.appendChild(section);

    bindUI();
  }

  function getDisplayUrl() {
    const url = new URL('tv.html', window.location.href);
    url.searchParams.set('v', '88');
    url.searchParams.set('room', roomCode);
    return url.toString();
  }


  function setPublicPhase(phase, options = {}) {
    if (!PHASE_LABELS[phase]) return;

    publicState.phase = phase;

    if (phase === 'discussion' && options.resetTimer) {
      // Each discussion phase starts with a fresh one-lap speaker order.
      resetSpeakerCycle({ clearSpeaker:true });

      const storedMutedSeat = readMutedSeat();
      publicState.mutedSeat =
        Number(storedMutedSeat) > 0
          ? Number(storedMutedSeat)
          : null;
    }

    if (phase === 'voting') {
      publicState.speakerCycleActive = false;
      publicState.speakerVisible = false;

      if (options.keepVotingState !== true) {
        resetVotingFlow('manual');
      }
    }

    if (phase === 'night') {
      publicState.speakerCycleActive = false;
      publicState.speakerVisible = false;
    }

    if (phase === 'night') {
      if (publicState.timerStatus === 'running') {
        publicState.timerRemainingMs = getRemainingMs();
      }
      publicState.timerEndsAt = 0;
      publicState.timerStatus = 'paused';
    }

    if (phase === 'voting') {
      // جولة التصويت لا تستخدم مؤقتًا.
      publicState.timerRemainingMs = publicState.timerDurationMs;
      publicState.timerEndsAt = 0;
      publicState.timerStatus = 'idle';
      hasBroadcastFinished = false;
    }

    if (phase === 'discussion' && options.resetTimer) {
      publicState.timerRemainingMs = publicState.timerDurationMs;
      publicState.timerEndsAt = 0;
      publicState.timerStatus = 'idle';
      hasBroadcastFinished = false;
    }

    if (options.syncRound) {
      try {
        if (typeof nightRoundCounter !== 'undefined') {
          publicState.roundNumber = Math.max(1, Number(nightRoundCounter) || 1);
        }
      } catch (_) {}
    }

    saveState();
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


    document.getElementById('tvTimerNext').addEventListener('click', () => {
      advanceSpeakerAndRestartTimer();
    });

    document.getElementById('tvTimerStart').addEventListener('click', () => {
      if (isMutedSpeaker()) {
        stopTimerForMutedSpeaker();
        vibrate([20, 30, 20]);
        saveState();
        return;
      }

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
      vibrate(35);
      setPublicPhase(btn.dataset.phase, {
        resetTimer: btn.dataset.phase === 'discussion',
        syncRound: true
      });
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

    document.getElementById('tvSpeakerClockwise').addEventListener('click', () => {
      publicState.speakerDirection = 'clockwise';

      const current = Number(publicState.speakerSeat);
      if (getAliveSeatNumbers().includes(current)) {
        beginSpeakerCycle(current);
      } else {
        resetSpeakerCycle();
      }

      vibrate(18);
      saveState();
    });

    document.getElementById('tvSpeakerCounterclockwise').addEventListener('click', () => {
      publicState.speakerDirection = 'counterclockwise';

      const current = Number(publicState.speakerSeat);
      if (getAliveSeatNumbers().includes(current)) {
        beginSpeakerCycle(current);
      } else {
        resetSpeakerCycle();
      }

      vibrate(18);
      saveState();
    });

    document.getElementById('tvSpeakerPrevious').addEventListener('click', () => {
      moveSpeaker(-1);
    });

  }

  function renderAll() {
    if (!document.getElementById('sectionDisplayControl')) return;

    if (
      publicState.phase === 'discussion' &&
      Number(publicState.speakerSeat) > 0 &&
      getAliveSeatNumbers().includes(Number(publicState.speakerSeat))
    ) {
      publicState.speakerVisible = true;
    }
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
    const mutedTurn = isMutedSpeaker();

    timer.textContent = mutedTurn ? 'MUTE' : formattedTimer(remaining);
    timer.classList.toggle(
      'running',
      !mutedTurn && publicState.timerStatus === 'running'
    );
    timer.classList.toggle(
      'finished',
      !mutedTurn && publicState.timerStatus === 'finished'
    );
    timer.classList.toggle('muted-turn', mutedTurn);

    const statusTexts = {
      idle:'جاهز',
      running:'يعمل الآن',
      paused:'متوقف مؤقتًا',
      finished:'انتهى الوقت'
    };

    document.getElementById('tvTimerStatusText').textContent =
      mutedTurn
        ? 'اللاعب مسكّت — بدون مؤقت'
        : statusTexts[publicState.timerStatus];

    document.getElementById('tvTimerStart').disabled =
      mutedTurn || publicState.timerStatus === 'running';

    document.getElementById('tvTimerPause').disabled =
      mutedTurn || publicState.timerStatus !== 'running';

    document.querySelectorAll('.tv-preset').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.seconds) * 1000 === publicState.timerDurationMs);
    });
    document.querySelectorAll('.tv-phase').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.phase === publicState.phase);
    });

    let gameRound = '';
    try { if (typeof nightRoundCounter !== 'undefined') gameRound = `داخل اللعبة: ${nightRoundCounter}`; } catch (_) {}
    document.getElementById('tvGameRoundHint').textContent = gameRound;

    renderSpeakerControls();
    renderVotingManager();

    updateConnectionStatus();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function updateConnectionStatus() {
    const el = document.getElementById('tvConnectionStatus');
    if (!el) return;

    if (
      connectionMode === 'supabase' &&
      ['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(realtimeStatus)
    ) {
      el.className = 'tv-status-pill error';
      el.textContent = 'خطأ Realtime';
      el.title = realtimeErrorText || 'تحقق من إعدادات Realtime في Supabase';
      return;
    }

    const tvOnline = Date.now() - tvLastSeenAt < 18000;
    el.className = 'tv-status-pill ' + (tvOnline ? 'online' : 'waiting');
    el.title = '';

    if (tvOnline) el.textContent = 'التلفزيون متصل';
    else if (connectionMode === 'supabase' && realtimeStatus === 'SUBSCRIBED') {
      el.textContent = 'بانتظار التلفزيون';
    } else if (connectionMode === 'supabase') {
      el.textContent = 'جاري ربط Realtime';
    } else {
      el.textContent = 'تجربة محلية';
    }
  }

  function messageReceived(event, payload) {
    if (event === 'display_request' || event === 'display_ping') {
      tvLastSeenAt = Date.now();
      if (event === 'display_request') broadcastState();
      updateConnectionStatus();
    }
  }

  function broadcastState() {
    Object.assign(publicState, collectGameCounts());

    // The organizer is the authoritative clock. Sending the exact remaining
    // milliseconds and the exact displayed second prevents TV clock skew from
    // making the screen start one second ahead or behind.
    const syncedRemainingMs = getRemainingMs();
    const syncNow = Date.now();
    const payload = {
      ...publicState,
      roomCode,
      timerRemainingMs: syncedRemainingMs,
      timerDisplaySeconds: Math.max(0, Math.ceil(syncedRemainingMs / 1000)),
      timerSyncSequence: ++timerSyncSequence,
      timerSyncSentAt: syncNow,
      sentAt: syncNow
    };

    // Reliable local-tab fallback: the display can always read the latest state.
    writeLocalState(payload);

    if (connectionMode === 'supabase' && channel) {
      channel.send({ type:'broadcast', event:'state', payload }).catch(() => {});
    } else if (localChannel) {
      try { localChannel.postMessage({ event:'state', payload }); } catch (_) {}
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
      channel = supabaseClient.channel(
        `amman-mafia-display-${roomCode}`,
        {
          config:{
            private:false,
            broadcast:{self:false,ack:true}
          }
        }
      );

      realtimeStatus='connecting';
      realtimeErrorText='';

      channel
        .on('broadcast', { event:'display_request' }, ({ payload }) => messageReceived('display_request', payload))
        .on('broadcast', { event:'display_ping' }, ({ payload }) => messageReceived('display_ping', payload))
        .subscribe((status,err) => {
          realtimeStatus=status;

          if (status === 'SUBSCRIBED') {
            realtimeErrorText='';
            broadcastState();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            realtimeErrorText=[
              err?.message||'',
              err?.name||'',
              err?.cause?.message||''
            ].filter(Boolean).join(' — ');
          }

          updateConnectionStatus();
        });
    } else if ('BroadcastChannel' in window) {
      connectionMode = 'local';
      localChannel = new BroadcastChannel(`amman-mafia-display-${roomCode}`);
      localChannel.onmessage = e => {
        const data = e.data || {};
        messageReceived(data.event, data.payload);
      };

      const seenAt = readLocalPresence();
      if (seenAt) tvLastSeenAt = seenAt;

      // Publish the current state as soon as the local channel is opened.
      broadcastState();
    } else {
      connectionMode = 'local-storage';
      broadcastState();
    }

    tvPresenceTimer = setInterval(() => {
      const seenAt = readLocalPresence();
      if (seenAt) tvLastSeenAt = Math.max(tvLastSeenAt, seenAt);
      updateConnectionStatus();
    }, 2000);

    renderAll();
  }

  function timerTick() {
    syncGameCounts(false);
    syncSpeakerAvailability();
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
      } else {
        // Keep every connected television locked to the organizer's displayed
        // second instead of trusting each device's system clock.
        broadcastState();
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
      const setupBar = document.getElementById('setupBar');

      if (tabName === 'displayControl') {
        ['tabDashboard','tabNight','tabLog','tabDisplayControl'].forEach(id => document.getElementById(id)?.classList.remove('active'));
        ['sectionDashboard','sectionNight','sectionLog','sectionDisplayControl'].forEach(id => document.getElementById(id)?.classList.remove('active'));
        document.body.classList.remove('night-mode');
        if (setupBar) setupBar.style.display = 'none';
        section?.classList.add('active');
        tab?.classList.add('active');
        renderAll();
        window.scrollTo({ top:0, behavior:'instant' });
        return;
      }

      section?.classList.remove('active');
      tab?.classList.remove('active');

      if (setupBar && typeof totalGameSeats !== 'undefined' && Number(totalGameSeats) > 0) {
        setupBar.style.display = 'flex';
      }

      const result = originalSwitchTab(tabName);

      if (tabName === 'night') {
        setPublicPhase('night', { syncRound:true });
      }

      return result;
    };

    window.__tvSwitchWrapped = true;
  }


  function publishEliminationNotice(seatId, meta = {}) {
    const parsedSeat = Math.floor(Number(seatId) || 0);
    if (!(parsedSeat > 0)) return;

    const safeMeta = {
      type: String(meta.type || 'manual'),
      title: String(meta.title || 'تم إقصاء اللاعب'),
      icon: String(meta.icon || '💀'),
      color: String(meta.color || '#d1d5db')
    };

    publicState.eliminationSeat = parsedSeat;
    publicState.eliminationType = safeMeta.type;
    publicState.eliminationTitle = safeMeta.title;
    publicState.eliminationIcon = safeMeta.icon;
    publicState.eliminationColor = safeMeta.color;
    publicState.eliminationEventId =
      Math.max(0, Number(publicState.eliminationEventId) || 0) + 1;
    publicState.eliminationActive = true;

    const eventId = publicState.eliminationEventId;
    saveState();

    window.setTimeout(() => {
      if (Number(publicState.eliminationEventId) !== eventId) return;
      publicState.eliminationActive = false;
      saveState();
    }, 4500);
  }

  function handleTypedEliminationNotices(event) {
    const notices = Array.isArray(event?.detail?.notices)
      ? event.detail.notices
      : [];

    notices.forEach((notice, index) => {
      window.setTimeout(() => {
        publishEliminationNotice(notice.seat, notice);
      }, index * 180);
    });
  }

  function installEliminationNoticeSync() {
    if (
      typeof window.toggleElimination !== 'function' ||
      window.__tvEliminationNoticeWrapped
    ) return;

    const originalToggleElimination = window.toggleElimination;

    window.toggleElimination = function (seatId, ...args) {
      const cardBefore = document.getElementById(`seat-${seatId}`);
      const wasDead = Boolean(
        cardBefore && cardBefore.classList.contains('dead-status')
      );

      const result = originalToggleElimination.apply(
        this,
        [seatId, ...args]
      );

      const cardAfter = document.getElementById(`seat-${seatId}`);
      const isDead = Boolean(
        cardAfter && cardAfter.classList.contains('dead-status')
      );

      // يظهر التنبيه فقط عند التحول من حي إلى مقصي، وليس عند الإحياء.
      if (
        !wasDead &&
        isDead &&
        !window.__ammanMafiaTypedNightEliminations
      ) {
        publishEliminationNotice(seatId, {
          type: 'manual',
          title: 'تم إقصاء اللاعب',
          icon: '💀',
          color: '#d1d5db'
        });
      }

      return result;
    };

    window.__tvEliminationNoticeWrapped = true;
  }


  function handleDirectMutedSeat(event) {
    const rawSeat = Number(event?.detail?.seat);
    const mutedSeat =
      Number.isFinite(rawSeat) && rawSeat > 0
        ? Math.floor(rawSeat)
        : null;

    publicState.mutedSeat = mutedSeat;

    if (isMutedSpeaker()) {
      stopTimerForMutedSpeaker();
    }

    publicState.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(publicState));
    broadcastState();
    renderAll();

    // إعادة إرسال ثانية احتياطية بعد اكتمال انتقال صفحة الليل إلى النقاش.
    window.setTimeout(() => {
      broadcastState();
      renderAll();
    }, 180);
  }

  function installNightCompletionSync() {
    if (typeof window.endNightRound !== 'function' || window.__tvNightCompletionWrapped) return;

    const originalEndNightRound = window.endNightRound;
    window.endNightRound = function (...args) {
      const result = originalEndNightRound.apply(this, args);
      setPublicPhase('discussion', { resetTimer:true, syncRound:true });
      return result;
    };

    window.__tvNightCompletionWrapped = true;
  }

  function init() {
    createUI();
    installTabWrapper();
    installNightCompletionSync();
    installEliminationNoticeSync();

    window.addEventListener(
      'amman-mafia-muted-seat',
      handleDirectMutedSeat
    );
    window.addEventListener(
      'amman-mafia-elimination-notices',
      handleTypedEliminationNotices
    );
    window.addEventListener('storage', handleLocalStorageMessage);

    connectRealtime();
    broadcastState();
    renderAll();
    timerTicker = setInterval(timerTick, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
