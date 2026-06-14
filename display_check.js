
    (() => {
      try {
        if ("caches" in window) {
          caches.keys().then(keys => {
            keys
              .filter(key => key.startsWith("amman-mafia-tv-") && key !== "amman-mafia-tv-v54-cache-v1")
              .forEach(key => caches.delete(key));
          });
        }
      } catch (_) {}
    })();
  

  (function(){
    "use strict";

    const PHASE_LABELS = {
      idle: "بانتظار الجولة",
      discussion: "جولة النقاش",
      voting: "جولة التصويت",
      night: "جولة الليل"
    };

    const RING_RADIUS = 134;
    const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

    let room = "";
    let state = null;
    let client = null;
    let channel = null;
    let localChannel = null;
    let mode = "local";
    let transportConnected = false;
    let lastStateAt = 0;
    let tick = null;
    let ping = null;
    let syncPoll = null;
    let retryTimer = null;
    let lastLocalWrittenAt = 0;

    const LOCAL_STATE_PREFIX = "ammanMafiaLocalDisplayStateV2:";
    const LOCAL_REQUEST_PREFIX = "ammanMafiaLocalDisplayRequestV2:";
    const LOCAL_PRESENCE_PREFIX = "ammanMafiaLocalDisplayPresenceV2:";
    const $ = id => document.getElementById(id);

    function configured(){
      const config = window.AMMAN_MAFIA_REALTIME || {};
      return (
        /^https:\/\/.+\.supabase\.co\/?$/i.test(String(config.supabaseUrl || "").trim()) &&
        String(config.supabaseAnonKey || "").trim().length > 40 &&
        !String(config.supabaseAnonKey).includes("PUT_YOUR_")
      );
    }

    function getWarningThresholdMs(){
      if(!state) return 5000;
      const durationSec = Math.round(Math.max(0, Number(state.timerDurationMs) || 0) / 1000);
      if(durationSec === 60) return 15000;
      if(durationSec === 45) return 10000;
      if(durationSec === 30) return 5000;
      return durationSec >= 60 ? 15000 : (durationSec > 30 ? 10000 : 5000);
    }

    function remaining(){
      if(!state) return 0;
      if(state.timerStatus === "running"){
        return Math.max(0, Number(state.timerEndsAt || 0) - Date.now());
      }
      return Math.max(0, Number(state.timerRemainingMs || 0));
    }

    function formatTime(ms){
      const total = Math.max(0, Math.ceil(ms / 1000));
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      return `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;
    }

    function apply(payload){
      if(!payload || typeof payload !== "object") return;
      if(payload.roomCode && room && String(payload.roomCode) !== room) return;
      state = {
        ...payload,
        timerEndsAt: Number(payload.timerEndsAt) || 0,
        timerRemainingMs: Math.max(0, Number(payload.timerRemainingMs) || 0),
        timerDurationMs: Math.max(1000, Number(payload.timerDurationMs) || 60000)
      };
      lastStateAt = Date.now();
      render();
    }

    function localStateKey(){ return LOCAL_STATE_PREFIX + room; }
    function localRequestKey(){ return LOCAL_REQUEST_PREFIX + room; }
    function localPresenceKey(){ return LOCAL_PRESENCE_PREFIX + room; }

    function writeLocalSignal(key,payload){
      try{
        localStorage.setItem(key, JSON.stringify({ ...payload, at: Date.now(), nonce: Math.random().toString(36).slice(2) }));
      }catch(_){}
    }

    function announcePresence(){ if(room) writeLocalSignal(localPresenceKey(), {type:"display-presence"}); }
    function requestLocalState(){ if(room) writeLocalSignal(localRequestKey(), {type:"display-request"}); }

    function pullLocalState(force=false){
      if(!room) return false;
      try{
        const envelope = JSON.parse(localStorage.getItem(localStateKey()) || "null");
        if(!envelope || !envelope.payload) return false;
        const writtenAt = Number(envelope.writtenAt) || 0;
        if(!force && writtenAt <= lastLocalWrittenAt) return false;
        lastLocalWrittenAt = writtenAt;
        apply(envelope.payload);
        return true;
      }catch(_){ return false; }
    }

    function handleStorageEvent(event){
      if(!room || !event || event.key !== localStateKey()) return;
      pullLocalState(true);
    }

    function setConnection(isOnline){
      const pill = $("connectionPill");
      pill.classList.toggle("online", Boolean(isOnline));
      $("connectionText").textContent = isOnline ? "متصل" : "غير متصل";
    }

    function updateConnection(){
      const stateFresh = !state || Date.now() - lastStateAt < 22000;
      setConnection(transportConnected && stateFresh);
    }

    function updateRing(rem, duration, warning){
      const ratio = duration > 0 ? Math.max(0, Math.min(1, rem / duration)) : 0;
      const offset = RING_CIRCUMFERENCE * (1 - ratio);
      const ring = $("ringProgress");
      ring.style.strokeDasharray = String(RING_CIRCUMFERENCE);
      ring.style.strokeDashoffset = String(offset);
      ring.style.stroke = warning ? "var(--red)" : "var(--gold)";
    }

    function render(){
      if(!state) return;

      const phase = PHASE_LABELS[state.phase] ? state.phase : "idle";
      document.body.className = `phase-${phase}`;
      $("phaseTitle").textContent = PHASE_LABELS[phase];
      $("roundBadge").textContent = String(Math.max(1, Number(state.roundNumber) || 1));

      const speakerSeat = Math.max(0, Number(state.speakerSeat) || 0);
      $("speakerValue").textContent = speakerSeat > 0 ? String(speakerSeat) : "—";

      const rem = remaining();
      const rawTimerStatus = state.timerStatus || "idle";
      const timerStatus = rawTimerStatus === "running" && rem <= 0 ? "finished" : rawTimerStatus;
      const warning = timerStatus === "running" && rem > 0 && rem <= getWarningThresholdMs();
      const timerEl = $("timer");
      timerEl.textContent = formatTime(rem);
      timerEl.classList.toggle("warning", warning || timerStatus === "finished");
      $("timerStage").classList.toggle("warning", warning || timerStatus === "finished");
      updateRing(rem, state.timerDurationMs, warning || timerStatus === "finished");

      $("aliveCount").textContent = String(Math.max(0, Number(state.totalAlive) || 0));
      $("citizenCount").textContent = String(Math.max(0, Number(state.citizenAlive) || 0));
      $("mafiaCount").textContent = String(Math.max(0, Number(state.mafiaAlive) || 0));
      $("killerCount").textContent = String(Math.max(0, Number(state.killerAlive) || 0));
    }

    function send(event,payload={}){
      if(mode === "supabase" && channel){
        channel.send({type:"broadcast",event,payload}).catch(() => {});
        return;
      }
      if(localChannel){
        try{ localChannel.postMessage({event,payload}); }catch(_){}
      }
      if(event === "display_request") requestLocalState();
      if(event === "display_ping") announcePresence();
    }

    function setDebug(text,type=""){
      const element = $("debugStatus");
      if(!element) return;
      element.textContent = text || "";
      element.className = `debug-status${type ? ` ${type}` : ""}`;
    }

    function readableRealtimeError(status,error){
      return [status || "UNKNOWN", error?.message || "", error?.name || "", error?.cause?.message || ""].filter(Boolean).join(" — ") || "Realtime connection failed";
    }

    function scheduleReconnect(){
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { if(room) connect(); }, 3000);
    }

    function showDisplay(){
      $("pairScreen").style.display = "none";
      $("displayScreen").classList.add("active");
    }

    function connect(){
      room = $("roomInput").value.trim().toUpperCase().replace(/[^A-Z2-9]/g,"");
      if(room.length < 6){
        $("pairMessage").textContent = "أدخل رمز الجلسة الظاهر في لوحة المنظم.";
        return;
      }
      localStorage.setItem("ammanMafiaDisplayLastRoom", room);
      $("pairMessage").textContent = "جاري الاتصال...";
      transportConnected = false;
      setConnection(false);

      try{ if(localChannel) localChannel.close(); }catch(_){}
      localChannel = null;
      clearInterval(ping); clearInterval(syncPoll); clearTimeout(retryTimer);

      if(configured() && window.supabase && typeof window.supabase.createClient === "function"){
        mode = "supabase";
        const config = window.AMMAN_MAFIA_REALTIME;
        client = window.supabase.createClient(config.supabaseUrl.trim(), config.supabaseAnonKey.trim(), {
          auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
          realtime:{params:{eventsPerSecond:10}}
        });
        channel = client.channel(`amman-mafia-display-${room}`, {
          config:{ private:false, broadcast:{ self:false, ack:true } }
        });
        setDebug("Connecting to Supabase Realtime…");

        channel.on("broadcast", {event:"state"}, ({payload}) => {
          setDebug("Realtime state received", "ok");
          apply(payload);
        }).subscribe((status,error) => {
          setDebug(`Realtime status: ${status}`);
          if(status === "SUBSCRIBED"){
            clearTimeout(retryTimer);
            transportConnected = true;
            lastStateAt = Date.now();
            setConnection(true);
            setDebug("Realtime connected", "ok");
            showDisplay();
            send("display_request", {at: Date.now()});
          }else if(status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED"){
            transportConnected = false;
            setConnection(false);
            setDebug(readableRealtimeError(status,error), "error");
            $("pairMessage").textContent = "تعذر ربط شاشة العرض. تحقق من الإنترنت وإعدادات Supabase.";
            scheduleReconnect();
          }
        });
      }else{
        mode = "local";
        if("BroadcastChannel" in window){
          localChannel = new BroadcastChannel(`amman-mafia-display-${room}`);
          localChannel.onmessage = event => { const data = event.data || {}; if(data.event === "state") apply(data.payload); };
        }
        transportConnected = true;
        lastStateAt = Date.now();
        pullLocalState(true);
        showDisplay();
        setConnection(true);
        announcePresence();
        requestLocalState();
        send("display_request", {at: Date.now()});
        $("pairMessage").textContent = "وضع محلي — متصل بلوحة المنظم في تبويب آخر.";
        syncPoll = setInterval(() => { pullLocalState(false); announcePresence(); }, 500);
      }

      ping = setInterval(() => {
        send("display_ping", {at: Date.now()});
        if(mode === "local"){
          pullLocalState(false);
          announcePresence();
        }
      }, 2000);
    }

    $("connectBtn").addEventListener("click", connect);
    $("roomInput").addEventListener("keydown", event => { if(event.key === "Enter") connect(); });
    $("fullscreenBtn").addEventListener("click", () => {
      const element = document.documentElement;
      if(!document.fullscreenElement){ element.requestFullscreen?.(); }
      else{ document.exitFullscreen?.(); }
    });
    window.addEventListener("storage", handleStorageEvent);

    const params = new URLSearchParams(location.search);
    const initialRoom = (params.get("room") || localStorage.getItem("ammanMafiaDisplayLastRoom") || "").toUpperCase();
    $("roomInput").value = initialRoom;

    if(params.get("preview") === "1"){
      room = "PREVIEW";
      transportConnected = true;
      lastStateAt = Date.now();
      showDisplay();
      setConnection(true);
      apply({
        roomCode:"PREVIEW",
        phase:"discussion",
        roundNumber:1,
        speakerVisible:true,
        speakerSeat:10,
        timerDurationMs:30000,
        timerRemainingMs:30000,
        timerStatus:"paused",
        timerEndsAt:0,
        totalAlive:26,
        citizenAlive:14,
        mafiaAlive:11,
        killerAlive:1
      });
    }else if(params.get("room")){
      connect();
    }

    tick = setInterval(() => { render(); updateConnection(); }, 250);
  })();
  