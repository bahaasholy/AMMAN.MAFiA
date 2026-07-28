// إعدادات Supabase Realtime لمزامنة لوحة المنظم مع شاشة التلفزيون.
// المفتاح المستخدم Publishable ومخصص للاستخدام في تطبيقات المتصفح.
window.AMMAN_MAFIA_REALTIME = {
  supabaseUrl: "https://stkxplslyhkrslkjumwc.supabase.co",
  supabaseAnonKey: "sb_publishable_l1xbSEUgs6D7tYrquJXqQQ_CvDZpPcz"
};

// منطق كشف المحقق:
// - أدوار المواطنين الخاصة تظهر باسم الدور الحقيقي.
// - المواطن العادي وحرباية المافيا يظهران كمواطن عادي.
// - المافيا والسفاح يبقيان بنفس التصنيف الحالي.
(function installDetectiveCitizenRoleReveal() {
  const originalHandleNightSeatTouch = window.handleNightSeatTouch;
  if (typeof originalHandleNightSeatTouch !== 'function') return;

  window.handleNightSeatTouch = function handleNightSeatTouchWithCitizenRoles(seatId) {
    const step = Array.isArray(activeNightSteps)
      ? activeNightSteps[currentStep]
      : null;

    if (!step || step.code !== 'detectiveCheck') {
      return originalHandleNightSeatTouch(seatId);
    }

    const strId = String(seatId);
    clearCornerVisual('badge-bl-', '', 'detectiveCheck');

    document
      .querySelectorAll('#nightCinemaContainer .seat-card')
      .forEach(card => {
        card.style.backgroundColor = 'var(--role-none)';
      });

    if (nightSelections.detectiveCheck === strId) {
      nightSelections.detectiveCheck = 'none';
      return;
    }

    nightSelections.detectiveCheck = strId;

    const roleSelect = document.getElementById(`select-${seatId}`);
    const touchCard = document.getElementById(`night-seat-${seatId}`);
    const label = document.getElementById(`night-label-${seatId}`);

    if (!roleSelect || !touchCard || !label) return;

    const trueRoleVal = roleSelect.value;
    const roleData = activeGameRoles.find(role => role.value === trueRoleVal);

    if (roleData && roleData.value === 'mafia_chameleon') {
      touchCard.style.backgroundColor = '#34c759';
      label.textContent = 'مواطن عادي 👤';
    } else if (roleData && roleData.group === 'mafia_team') {
      touchCard.style.backgroundColor = '#e50914';
      label.textContent = 'مافيا 🩸';
    } else if (roleData && roleData.group === 'solo_team') {
      touchCard.style.backgroundColor = '#ff9500';
      label.textContent = 'سفاح 🔪';
    } else if (roleData && roleData.group === 'citizen_team') {
      touchCard.style.backgroundColor = '#34c759';
      label.textContent = trueRoleVal === 'citizen'
        ? 'مواطن عادي 👤'
        : getRoleLabel(trueRoleVal);
    } else {
      touchCard.style.backgroundColor = '#34c759';
      label.textContent = 'مواطن عادي 👤';
    }
  };
})();

// مزامنة قائد المافيا وخطوات الليل فور إقصاء أو إحياء أي لاعب.
// تمنع استمرار اسم أو صلاحية قائد خرج من اللعبة أثناء جولة ليل مفتوحة.
(function installNightRosterResync() {
  const originalToggleElimination = window.toggleElimination;
  if (typeof originalToggleElimination !== 'function') return;

  window.toggleElimination = function toggleEliminationWithNightResync(seatId) {
    const previousStepIndex = Number.isInteger(currentStep) ? currentStep : 0;
    const previousStepCode = Array.isArray(activeNightSteps)
      && activeNightSteps[previousStepIndex]
      ? activeNightSteps[previousStepIndex].code
      : null;

    const result = originalToggleElimination(seatId);

    determineLiveMafiaLeader();

    if (!nightRoundInProgress) {
      return result;
    }

    const seatCard = document.getElementById(`seat-${seatId}`);
    const seatIsDead = Boolean(
      seatCard && seatCard.classList.contains('dead-status')
    );

    if (seatIsDead && nightSelections && typeof nightSelections === 'object') {
      const eliminatedSeatId = String(seatId);
      Object.keys(nightSelections).forEach(actionCode => {
        if (nightSelections[actionCode] === eliminatedSeatId) {
          nightSelections[actionCode] = 'none';
        }
      });
    }

    buildActiveNightSteps();

    const matchingStepIndex = previousStepCode
      ? activeNightSteps.findIndex(step => step.code === previousStepCode)
      : -1;

    currentStep = matchingStepIndex >= 0
      ? matchingStepIndex
      : Math.min(previousStepIndex, Math.max(0, activeNightSteps.length - 1));

    generateNightCinemaGrid();

    if (document.body.classList.contains('night-mode')) {
      syncNightWizardStep();
      if (typeof queueNightScrollToTop === 'function') {
        queueNightScrollToTop();
      }
    }

    return result;
  };
})();
