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
