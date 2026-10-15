// Suppress console warnings
(function() {
    const originalWarn = console.warn;
    const originalLog = console.log;
    console.warn = function(...args) {
        if (args[0] && typeof args[0] === 'string' && args[0].includes('touch')) return;
        originalWarn.apply(console, args);
    };
    console.log = function(...args) {
        if (args[0] && typeof args[0] === 'string' && args[0].includes('touch')) return;
        originalLog.apply(console, args);
    };
})();

// State variables - now using timestamps for persistence
let currentSeconds = 0;
let totalSeconds = 0;
let isRunning = false;
let hasStarted = false;
let deliveries = [];
let intervalId = null;
let lastSavedTotalSeconds = -1;
let bestTime = Infinity;
let theme = 'dark';
let slateOn = false;
let soundEnabled = true;
let audioContext = null;
let splitCount = 1;
let isMinimalMode = false;
let rateUnit = 'perHour'; // 'perHour' | 'perStop'
let addedTimeMs = 0; // Extra time added for late starts (baked into timestamps once started)
let showHistory = true;
let showPaceChart = true;
let recentWindow = 7;
let skipHoldEnabled = true;
let skipHoldMs = 850;
let keepScreenOn = true;
let hapticsEnabled = true;
let decimalMode = false;
let defaultFinishTime = '15:30';

// Timestamp-based tracking for persistence across tab close/phone sleep
let sessionStartTimestamp = null;     // When session started (for total time)
let deliveryStartTimestamp = null;    // When current delivery started
let totalPausedMs = 0;                // Total paused duration for session
let deliveryPausedMs = 0;             // Paused duration for current delivery
let pauseStartTimestamp = null;       // When pause started (null if not paused)

let sprintDurationMs = 0;
let sprintStartTimestamp = null;
let sprintPausedMs = 0;
let sprintStartDeliveryCount = 0;
let sprintKind = 'minutes';
let sprintStopGoal = 0;
let sprintUntilEnd = false;
let pausedForSprintPicker = false;
let overlayMode = null;
let sprintResultRate = 0;
let pendingSprintResults = null;

const MIN_SPLIT_COUNT = 1;
const MAX_SPLIT_COUNT = 99;
const SPLIT_HOLD_REPEAT_MS = 500;
const SPLIT_HOLD_STEP = 5;
const STATE_STORAGE_KEY = 'deliveryTimerState';
const RATE_UNIT_KEY = 'deliveryTimerRateUnit';
const SHOW_HISTORY_KEY = 'deliveryTimerShowHistory';
const SHOW_PACE_CHART_KEY = 'deliveryTimerShowPaceChart';
const RECENT_WINDOW_KEY = 'deliveryTimerRecentWindow';
const SKIP_HOLD_KEY = 'deliveryTimerSkipHold';
const SKIP_HOLD_MS_KEY = 'deliveryTimerSkipHoldMs';
const KEEP_SCREEN_KEY = 'deliveryTimerKeepScreenOn';
const HAPTICS_KEY = 'deliveryTimerHaptics';
const DECIMAL_MODE_KEY = 'deliveryTimerDecimalMode';
const DEFAULT_FINISH_KEY = 'deliveryTimerDefaultFinish';
const DEFAULT_FINISH_TIME = '15:30';
const DEFAULT_RECENT_WINDOW = 7;
const MIN_RECENT_WINDOW = 1;
const MAX_RECENT_WINDOW = 999;
const DEFAULT_SKIP_HOLD_MS = 850;
const MIN_SKIP_HOLD_MS = 400;
const MAX_SKIP_HOLD_MS = 2500;
const SKIP_HOLD_STEP_MS = 50;
const APP_VERSION = 16;
const SEEN_VERSION_KEY = 'deliveryTimerSeenVersion';
const MAX_DELIVERY_NUMBER = 9999;
const WHATS_NEW = [
    'A pace graph in the top bar shows how fast each stop was through the day. Each point is a stop. Touch one to read it. Turn it off in Settings.'
];

// DOM elements
const $ = id => document.getElementById(id);
const currentTimeEl = $('currentTime');
const totalTimeEl = $('totalTime');
const deliveryNumEl = $('deliveryNum');
const deliveryNumBtn = $('deliveryNumBtn');
const deliveryJumpForm = $('deliveryJumpForm');
const deliveryJumpInput = $('deliveryJumpInput');
const deliveryJumpGo = $('deliveryJumpGo');
const deliveryJumpNote = $('deliveryJumpNote');
const perHourEl = $('perHour');
const avgTimeEl = $('avgTime');
const bestTimeEl = $('bestTime');
const historyListEl = $('historyList');
const pauseBtn = $('pauseBtn');
const resetBtn = $('resetBtn');
const undoBtn = $('undoBtn');
const startBtn = $('startBtn');
const deliveredBtn = $('deliveredBtn');
const targetInput = $('targetInput');
const finishTimeInput = $('finishTimeInput');
const remainingLabel = $('remainingLabel');
const progressSection = $('progressSection');
const progressFill = $('progressFill');
const progressLeft = $('progressLeft');
const progressPercent = $('progressPercent');
const statusBadge = $('statusBadge');
const paceCurrentEl = $('paceCurrentEl');
const paceNeededEl = $('paceNeededEl');
const confirmOverlay = $('confirmOverlay');
const confirmCancel = $('confirmCancel');
const confirmYes = $('confirmYes');
const confirmTitle = $('confirmTitle');
const confirmText = $('confirmText');
const confirmButtons = $('confirmButtons');
const confirmClose = $('confirmClose');
const summaryStats = $('summaryStats');
const newRecord = $('newRecord');
const skipFlash = $('skipFlash');
const themeToggle = $('themeToggle');
const soundToggle = $('soundToggle');
const estimateTime = $('estimateTime');
const splitRow = $('splitRow');
const splitMinus = $('splitMinus');
const splitPlus = $('splitPlus');
const splitValue = $('splitValue');
const titleEl = document.querySelector('.header h1');
const addTimeBtn = $('addTimeBtn');
const sprintBtn = $('sprintBtn');
const sprintSection = $('sprintSection');
const sprintTimeEl = $('sprintTime');
const sprintModeToggle = $('sprintModeToggle');
const settingsBtn = $('settingsBtn');
const settingsOverlay = $('settingsOverlay');
const settingsClose = $('settingsClose');
const historyToggle = $('historyToggle');
const paceChartToggle = $('paceChartToggle');
const paceChartEl = $('paceChart');
const paceChartStage = $('paceChartStage');
const paceChartSvg = $('paceChartSvg');
const paceChartReadout = $('paceChartReadout');
const paceChartStart = $('paceChartStart');
const paceChartEnd = $('paceChartEnd');
const skipHoldToggle = $('skipHoldToggle');
const skipHoldHint = $('skipHoldHint');
const skipHoldInput = $('skipHoldInput');
const skipHoldMinus = $('skipHoldMinus');
const skipHoldPlus = $('skipHoldPlus');
const keepScreenToggle = $('keepScreenToggle');
const defaultFinishInput = $('defaultFinishInput');
const minimalToggle = $('minimalToggle');
const hapticsToggle = $('hapticsToggle');
const decimalToggle = $('decimalToggle');
const recentWindowInput = $('recentWindowInput');
const recentWindowMinus = $('recentWindowMinus');
const recentWindowPlus = $('recentWindowPlus');
const appVersionLabel = $('appVersionLabel');

function persistPref(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // Ignore storage errors
    }
}

function haptic(pattern) {
    if (!hapticsEnabled || !navigator.vibrate) return;
    navigator.vibrate(pattern);
}

let screenWakeLock = null;

async function requestScreenWakeLock() {
    if (!keepScreenOn || !('wakeLock' in navigator)) return;
    if (document.visibilityState !== 'visible') return;
    try {
        if (screenWakeLock) return;
        screenWakeLock = await navigator.wakeLock.request('screen');
        screenWakeLock.addEventListener('release', () => {
            screenWakeLock = null;
        });
    } catch (e) {
        screenWakeLock = null;
    }
}

function releaseScreenWakeLock() {
    if (!screenWakeLock) return;
    screenWakeLock.release().catch(() => {});
    screenWakeLock = null;
}

function applyKeepScreenOn() {
    if (keepScreenToggle) {
        keepScreenToggle.classList.toggle('on', keepScreenOn);
        keepScreenToggle.setAttribute('aria-checked', keepScreenOn ? 'true' : 'false');
    }
    if (keepScreenOn) {
        requestScreenWakeLock();
    } else {
        releaseScreenWakeLock();
    }
}

// Persistent state management - saves timer state to survive tab close/phone sleep
function saveTimerState() {
    if (!hasStarted) return;
    
    const state = {
        sessionStartTimestamp,
        deliveryStartTimestamp,
        totalPausedMs,
        deliveryPausedMs,
        pauseStartTimestamp,
        isRunning,
        hasStarted,
        deliveries,
        bestTime: bestTime === Infinity ? null : bestTime,
        targetStops: targetInput.value,
        finishTime: finishTimeInput.value,
        splitCount,
        sprintDurationMs,
        sprintStartTimestamp,
        sprintPausedMs,
        sprintStartDeliveryCount,
        sprintKind,
        sprintStopGoal,
        sprintUntilEnd,
        pausedForSprintPicker,
        pendingSprintResults,
        savedAt: Date.now()
    };
    
    try {
        localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        // Storage might be full or unavailable
    }
}

function loadTimerState() {
    try {
        const data = localStorage.getItem(STATE_STORAGE_KEY);
        if (!data) return false;
        
        const state = JSON.parse(data);
        
        // Check if state is valid (not older than 24 hours)
        if (!state.hasStarted || !state.sessionStartTimestamp) {
            return false;
        }
        
        const age = Date.now() - state.savedAt;
        if (age > 24 * 60 * 60 * 1000) {
            // State is too old, clear it
            clearTimerState();
            return false;
        }
        
        // Restore state
        sessionStartTimestamp = state.sessionStartTimestamp;
        deliveryStartTimestamp = state.deliveryStartTimestamp;
        totalPausedMs = state.totalPausedMs || 0;
        deliveryPausedMs = state.deliveryPausedMs || 0;
        pauseStartTimestamp = state.pauseStartTimestamp;
        isRunning = state.isRunning;
        hasStarted = state.hasStarted;
        deliveries = (state.deliveries || []).map(normalizeDelivery);
        bestTime = state.bestTime === null ? Infinity : state.bestTime;
        splitCount = state.splitCount || 1;
        sprintDurationMs = state.sprintDurationMs || 0;
        sprintStartTimestamp = state.sprintStartTimestamp || null;
        sprintPausedMs = state.sprintPausedMs || 0;
        sprintStartDeliveryCount = state.sprintStartDeliveryCount || 0;
        sprintKind = state.sprintKind === 'stops' ? 'stops' : 'minutes';
        sprintStopGoal = state.sprintStopGoal || 0;
        sprintUntilEnd = !!state.sprintUntilEnd;
        pausedForSprintPicker = !!state.pausedForSprintPicker;
        pendingSprintResults = state.pendingSprintResults || null;
        if (pendingSprintResults) {
            sprintResultRate = pendingSprintResults.rate || 0;
        }
        
        // Restore inputs
        if (state.targetStops) targetInput.value = state.targetStops;
        if (state.finishTime) finishTimeInput.value = state.finishTime;
        
        return true;
    } catch (e) {
        return false;
    }
}

function clearTimerState() {
    try {
        localStorage.removeItem(STATE_STORAGE_KEY);
    } catch (e) {
        // Ignore errors
    }
}

// Calculate current elapsed times from timestamps
function calculateElapsedTimes() {
    if (!hasStarted || !sessionStartTimestamp) {
        const previewSeconds = Math.floor(addedTimeMs / 1000);
        currentSeconds = previewSeconds;
        totalSeconds = previewSeconds;
        return;
    }
    
    const now = Date.now();
    
    // Calculate total session time
    let totalElapsedMs = now - sessionStartTimestamp - totalPausedMs;
    
    // If currently paused, don't count time since pause started
    if (pauseStartTimestamp !== null) {
        totalElapsedMs -= (now - pauseStartTimestamp);
    }
    
    totalSeconds = Math.max(0, Math.floor(totalElapsedMs / 1000));
    
    // Calculate current delivery time
    if (deliveryStartTimestamp) {
        let deliveryElapsedMs = now - deliveryStartTimestamp - deliveryPausedMs;
        
        // If currently paused, don't count time since pause started for current delivery
        if (pauseStartTimestamp !== null) {
            deliveryElapsedMs -= (now - pauseStartTimestamp);
        }
        
        currentSeconds = Math.max(0, deliveryElapsedMs / 1000);
    } else {
        currentSeconds = 0;
    }
}

// Add elapsed time before starting (for late starts).
function addSeconds(seconds) {
    if (hasStarted) return;

    const secs = Math.round(Number(seconds));
    if (!Number.isFinite(secs) || secs <= 0) return;

    addedTimeMs += secs * 1000;
    currentSeconds = Math.floor(addedTimeMs / 1000);
    totalSeconds = currentSeconds;

    updateDisplay();
    haptic(10);
}

function showDurationDialog({ title, text, chips, applyLabel, closeOnEmpty, onApply }) {
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    summaryStats.style.display = 'none';
    summaryStats.innerHTML = '';
    confirmClose.classList.remove('hidden');

    confirmButtons.innerHTML = `
        <div style="width:100%">
            <div class="add-time-chips">
                ${chips.map(m => `<button type="button" class="add-time-chip" data-mins="${m}">+${m} min</button>`).join('')}
            </div>
            <div class="add-time-custom">
                <input type="number" class="add-time-input" id="durationCustomInput" min="1" max="999" step="1" inputmode="numeric" pattern="[0-9]*" placeholder="min">
            </div>
            <button type="button" class="confirm-btn confirm-done" id="durationApplyBtn" style="width:100%">${applyLabel}</button>
        </div>
    `;
    confirmOverlay.classList.add('visible');

    const customInput = document.getElementById('durationCustomInput');
    const applyBtn = document.getElementById('durationApplyBtn');

    confirmButtons.querySelectorAll('.add-time-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const current = parseInt(customInput.value, 10) || 0;
            const next = Math.min(999, current + Number(btn.dataset.mins));
            customInput.value = String(next);
        });
    });

    const applyCustom = () => {
        const mins = parseInt(customInput.value, 10);
        if (mins && mins > 0) {
            onApply(mins);
            return;
        }
        if (closeOnEmpty) hideResetConfirm();
    };
    applyBtn.addEventListener('click', applyCustom);
    customInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyCustom();
        }
    });
}

function showAddTimeDialog() {
    if (hasStarted) return;
    overlayMode = 'addTime';
    if (sprintModeToggle) sprintModeToggle.classList.add('hidden');
    showDurationDialog({
        title: 'Add Time',
        text: 'Add time you already worked before starting the timer.',
        chips: [1, 5, 10],
        applyLabel: 'Add',
        closeOnEmpty: true,
        onApply: (mins) => {
            addSeconds(mins * 60);
            hideResetConfirm();
        }
    });
}

function getRouteRemaining() {
    const target = getTarget();
    if (target <= 0) return null;
    return Math.max(0, target - deliveries.length);
}

function isSprintActive() {
    if (!sprintStartTimestamp) return false;
    if (sprintKind === 'stops') return sprintUntilEnd || sprintStopGoal > 0;
    return sprintDurationMs > 0;
}

function getSprintElapsedMs(now = Date.now()) {
    if (!sprintStartTimestamp) return 0;
    let elapsed = now - sprintStartTimestamp - sprintPausedMs;
    if (pauseStartTimestamp !== null) {
        elapsed -= (now - pauseStartTimestamp);
    }
    return Math.max(0, elapsed);
}

function getSprintRemainingMs(now = Date.now()) {
    if (!isSprintActive()) return 0;
    return Math.max(0, sprintDurationMs - getSprintElapsedMs(now));
}

function getSprintStopCount() {
    if (!sprintStartTimestamp) return 0;
    return deliveries.slice(Math.min(sprintStartDeliveryCount, deliveries.length)).filter(d => !isSkipped(d)).length;
}

function getSprintLoggedCount() {
    if (!sprintStartTimestamp) return 0;
    return Math.max(0, deliveries.length - sprintStartDeliveryCount);
}

function getEffectiveSprintStopGoal() {
    const logged = getSprintLoggedCount();
    const routeLeft = getRouteRemaining();

    if (sprintUntilEnd) {
        const target = getTarget();
        if (target <= 0) return logged;
        return Math.max(0, target - sprintStartDeliveryCount);
    }

    let goal = sprintStopGoal;
    if (routeLeft !== null) {
        goal = Math.min(goal, logged + routeLeft);
    }
    return Math.max(0, goal);
}

function getSprintStopsLeft() {
    return Math.max(0, getEffectiveSprintStopGoal() - getSprintLoggedCount());
}

function checkSprintComplete() {
    if (!isSprintActive()) return;
    if (sprintKind === 'stops') {
        if (getSprintStopsLeft() <= 0) completeSprint(false);
        return;
    }
    if (getSprintRemainingMs() <= 0) completeSprint(false);
}

function clearSprintState() {
    sprintDurationMs = 0;
    sprintStartTimestamp = null;
    sprintPausedMs = 0;
    sprintStartDeliveryCount = 0;
    sprintKind = 'minutes';
    sprintStopGoal = 0;
    sprintUntilEnd = false;
}

function applyPauseDuration(now, { includeDelivery = true } = {}) {
    if (pauseStartTimestamp === null) return;
    const pausedDuration = now - pauseStartTimestamp;
    totalPausedMs += pausedDuration;
    if (includeDelivery) deliveryPausedMs += pausedDuration;
    if (isSprintActive()) sprintPausedMs += pausedDuration;
    pauseStartTimestamp = null;
}

function pauseForSprintPicker() {
    pausedForSprintPicker = false;
    if (isRunning) {
        togglePause();
        pausedForSprintPicker = true;
    }
}

function resumeAfterSprintPicker() {
    if (!pausedForSprintPicker) return;
    pausedForSprintPicker = false;
    if (!isRunning) togglePause();
}

function updateSprintButton() {
    if (!sprintBtn) return;
    if (!hasStarted) {
        sprintBtn.classList.add('hidden');
        sprintBtn.classList.remove('sprint-active');
        sprintBtn.setAttribute('aria-label', 'Start sprint');
        return;
    }
    sprintBtn.classList.remove('hidden');
    sprintBtn.classList.toggle('sprint-active', isSprintActive());
    sprintBtn.setAttribute('aria-label', isSprintActive() ? 'End sprint' : 'Start sprint');
}

function updateSprintDisplay() {
    if (!sprintSection || !sprintTimeEl) return;
    if (!isSprintActive()) {
        sprintSection.classList.add('hidden');
        sprintTimeEl.classList.remove('paused');
        updateSprintButton();
        return;
    }
    if (sprintKind === 'stops') {
        const left = getSprintStopsLeft();
        sprintTimeEl.textContent = left === 1 ? '1 left' : `${left} left`;
    } else {
        const remainingSecs = Math.ceil(getSprintRemainingMs() / 1000);
        sprintTimeEl.textContent = formatTime(remainingSecs);
    }
    sprintTimeEl.classList.toggle('paused', !isRunning);
    sprintSection.classList.remove('hidden');
    updateSprintButton();
}

function setSprintPickerMode(mode) {
    if (!sprintModeToggle) return;
    sprintModeToggle.querySelectorAll('.sprint-mode-btn').forEach(btn => {
        const on = btn.dataset.sprintMode === mode;
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
}

function renderSprintPicker(mode) {
    setSprintPickerMode(mode);
    confirmTitle.textContent = 'Sprint';
    summaryStats.style.display = 'none';
    summaryStats.innerHTML = '';
    confirmClose.classList.remove('hidden');
    if (sprintModeToggle) sprintModeToggle.classList.remove('hidden');

    if (mode === 'stops') {
        const remaining = getRouteRemaining();
        const canUseRemaining = remaining !== null && remaining > 0;
        confirmText.textContent = canUseRemaining
            ? `Sprint for a set number of stops, up to ${remaining} remaining. The session timer keeps running.`
            : 'Sprint for a set number of stops. Set Stops to cap this at how many you have left, or use Till the end.';
        confirmButtons.innerHTML = `
            <div style="width:100%">
                <div class="add-time-chips">
                    <button type="button" class="add-time-chip" data-stops="1">+1</button>
                    <button type="button" class="add-time-chip" data-stops="5">+5</button>
                    <button type="button" class="add-time-chip" data-until-end="true"${canUseRemaining ? '' : ' disabled'}>Till end</button>
                </div>
                <div class="add-time-custom">
                    <input type="number" class="add-time-input" id="sprintStopsInput" min="1" max="999" step="1" inputmode="numeric" pattern="[0-9]*" placeholder="stops">
                </div>
                <button type="button" class="confirm-btn confirm-done" id="durationApplyBtn" style="width:100%">Start</button>
            </div>
        `;
        const customInput = document.getElementById('sprintStopsInput');
        const applyBtn = document.getElementById('durationApplyBtn');
        let untilEnd = false;

        const clampInput = () => {
            const routeLeft = getRouteRemaining();
            let value = parseInt(customInput.value, 10);
            if (!Number.isFinite(value) || value <= 0) {
                customInput.value = '';
                return 0;
            }
            if (routeLeft !== null && value > routeLeft) {
                value = routeLeft;
                customInput.value = value ? String(value) : '';
            }
            if (value > 999) {
                value = 999;
                customInput.value = '999';
            }
            return value;
        };

        confirmButtons.querySelectorAll('.add-time-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                if (btn.dataset.untilEnd) {
                    const routeLeft = getRouteRemaining();
                    if (routeLeft === null || routeLeft <= 0) return;
                    customInput.value = String(routeLeft);
                    untilEnd = true;
                    return;
                }
                untilEnd = false;
                const current = parseInt(customInput.value, 10) || 0;
                const routeLeft = getRouteRemaining();
                const cap = routeLeft === null ? 999 : routeLeft;
                customInput.value = String(Math.min(cap, current + Number(btn.dataset.stops)));
            });
        });

        customInput.addEventListener('input', () => {
            untilEnd = false;
            clampInput();
        });

        const applyStops = () => {
            const count = clampInput();
            const routeLeft = getRouteRemaining();
            if (untilEnd && routeLeft !== null && routeLeft > 0) {
                startStopSprint(routeLeft, true);
                return;
            }
            if (count > 0 && (routeLeft === null || count <= routeLeft)) {
                startStopSprint(count, false);
            }
        };
        applyBtn.addEventListener('click', applyStops);
        customInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyStops();
            }
        });
        return;
    }

    confirmText.textContent = 'Count how many stops you log in this window. The session timer keeps running.';
    confirmButtons.innerHTML = `
        <div style="width:100%">
            <div class="add-time-chips">
                <button type="button" class="add-time-chip" data-mins="15">+15 min</button>
                <button type="button" class="add-time-chip" data-mins="30">+30 min</button>
                <button type="button" class="add-time-chip" data-mins="60">+60 min</button>
            </div>
            <div class="add-time-custom">
                <input type="number" class="add-time-input" id="durationCustomInput" min="1" max="999" step="1" inputmode="numeric" pattern="[0-9]*" placeholder="min">
            </div>
            <button type="button" class="confirm-btn confirm-done" id="durationApplyBtn" style="width:100%">Start</button>
        </div>
    `;
    const customInput = document.getElementById('durationCustomInput');
    const applyBtn = document.getElementById('durationApplyBtn');
    confirmButtons.querySelectorAll('.add-time-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const current = parseInt(customInput.value, 10) || 0;
            customInput.value = String(Math.min(999, current + Number(btn.dataset.mins)));
        });
    });
    const applyMinutes = () => {
        const mins = parseInt(customInput.value, 10);
        if (mins && mins > 0) startMinuteSprint(mins * 60 * 1000);
    };
    applyBtn.addEventListener('click', applyMinutes);
    customInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyMinutes();
        }
    });
}

function showSprintDialog() {
    if (!hasStarted || isSprintActive()) return;
    overlayMode = 'sprintPicker';
    pauseForSprintPicker();
    confirmOverlay.classList.add('visible');
    renderSprintPicker('minutes');
}

function beginSprint() {
    overlayMode = null;
    if (sprintModeToggle) sprintModeToggle.classList.add('hidden');
    confirmClose.classList.add('hidden');
    confirmOverlay.classList.remove('visible');
    resumeAfterSprintPicker();
    sprintStartTimestamp = Date.now();
    sprintPausedMs = 0;
    sprintStartDeliveryCount = deliveries.length;
    updateSprintDisplay();
    saveTimerState();
    haptic(10);
}

function startMinuteSprint(durationMs) {
    if (!hasStarted || durationMs <= 0) return;
    sprintKind = 'minutes';
    sprintDurationMs = durationMs;
    sprintStopGoal = 0;
    sprintUntilEnd = false;
    beginSprint();
}

function startStopSprint(stopGoal, untilEnd) {
    if (!hasStarted || stopGoal <= 0) return;
    const routeLeft = getRouteRemaining();
    if (routeLeft !== null && stopGoal > routeLeft) return;
    sprintKind = 'stops';
    sprintDurationMs = 0;
    sprintStopGoal = stopGoal;
    sprintUntilEnd = !!untilEnd;
    beginSprint();
}

function completeSprint(endedEarly) {
    if (!isSprintActive()) return;

    const elapsedMs = (endedEarly || sprintKind === 'stops')
        ? getSprintElapsedMs()
        : sprintDurationMs;
    const stops = getSprintStopCount();
    const elapsedSeconds = Math.max(0, Math.round(elapsedMs / 1000));
    sprintResultRate = elapsedSeconds > 0 && stops > 0
        ? stops / (elapsedSeconds / 3600)
        : 0;
    pendingSprintResults = {
        stops,
        elapsedSeconds,
        endedEarly: !!endedEarly,
        rate: sprintResultRate
    };

    clearSprintState();
    updateSprintDisplay();
    saveTimerState();
    showSprintResults(stops, elapsedSeconds, endedEarly);
    haptic(30);
}

function showSprintResults(stops, elapsedSeconds, endedEarly) {
    overlayMode = 'sprintResults';
    if (sprintModeToggle) sprintModeToggle.classList.add('hidden');
    confirmTitle.textContent = endedEarly ? 'Sprint ended' : 'Sprint complete';
    confirmText.textContent = 'Session timer is still running.';
    confirmClose.classList.remove('hidden');
    summaryStats.style.display = 'flex';
    summaryStats.innerHTML = `
        <div class="summary-row"><span class="label">Stops</span><span class="value">${stops}</span></div>
        <div class="summary-row"><span class="label">Time</span><span class="value">${formatTime(elapsedSeconds, elapsedSeconds >= 3600)}</span></div>
        <div class="summary-row"><span class="label">Rate</span><span class="value rate-toggle" id="sprintResultRate">${formatRate(sprintResultRate)}</span></div>
    `;
    confirmButtons.innerHTML = `
        <button type="button" class="confirm-btn confirm-done" id="sprintDoneBtn" style="width:100%">Done</button>
    `;
    confirmOverlay.classList.add('visible');

    const doneBtn = document.getElementById('sprintDoneBtn');
    if (doneBtn) doneBtn.addEventListener('click', hideResetConfirm);
    bindRateToggle($('sprintResultRate'));
}

function showEndSprintConfirm() {
    if (!isSprintActive()) return;
    overlayMode = 'endSprint';
    confirmTitle.textContent = 'End sprint?';
    confirmText.textContent = 'This will stop the sprint and show your results. The session timer keeps running.';
    summaryStats.style.display = 'none';
    summaryStats.innerHTML = '';
    confirmClose.classList.add('hidden');
    confirmButtons.innerHTML = `
        <button type="button" class="confirm-btn confirm-cancel" id="endSprintCancelBtn">Cancel</button>
        <button type="button" class="confirm-btn confirm-yes" id="endSprintYesBtn">End</button>
    `;
    confirmOverlay.classList.add('visible');

    document.getElementById('endSprintCancelBtn').addEventListener('click', hideResetConfirm);
    document.getElementById('endSprintYesBtn').addEventListener('click', () => completeSprint(true));
}

function onSprintBtnClick() {
    if (!hasStarted) return;
    if (isSprintActive()) {
        showEndSprintConfirm();
        return;
    }
    showSprintDialog();
}

// Initialize audio context
function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

// Desktop Chrome blocks sounds that start after a delay (the hold).
// Unlocking on pointerdown, during the real click, lets the later skip tone play.
function unlockAudio() {
    try {
        const ctx = initAudio();
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
    } catch (e) {
        // Silently fail if audio doesn't work
    }
}

// Play delivery completion sound
function playDeliverySound() {
    if (!soundEnabled) return;
    
    try {
        const ctx = initAudio();
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        
        const now = ctx.currentTime;
        
        // Create a neutral short beep
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.frequency.setValueAtTime(440, now);
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        
        oscillator.start(now);
        oscillator.stop(now + 0.18);
    } catch (e) {
        // Silently fail if audio doesn't work
    }
}

function playSplitTick() {
    if (!soundEnabled) return;

    try {
        const ctx = initAudio();
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const now = ctx.currentTime;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(1680, now);
        oscillator.frequency.exponentialRampToValueAtTime(920, now + 0.04);

        gainNode.gain.setValueAtTime(0.035, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

        oscillator.start(now);
        oscillator.stop(now + 0.045);
    } catch (e) {
        // Silently fail if audio doesn't work
    }
}

function playSplitHoldTick() {
    if (!soundEnabled) return;

    try {
        const ctx = initAudio();
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const now = ctx.currentTime;
        const gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);
        gainNode.gain.setValueAtTime(0.05, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        const first = ctx.createOscillator();
        first.type = 'sine';
        first.frequency.setValueAtTime(660, now);
        first.connect(gainNode);
        first.start(now);
        first.stop(now + 0.05);

        const second = ctx.createOscillator();
        second.type = 'sine';
        second.frequency.setValueAtTime(880, now + 0.045);
        second.connect(gainNode);
        second.start(now + 0.045);
        second.stop(now + 0.12);
    } catch (e) {
        // Silently fail if audio doesn't work
    }
}

function playSkipSound() {
    if (!soundEnabled) return;

    try {
        const ctx = initAudio();
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const now = ctx.currentTime;
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

        const low = ctx.createOscillator();
        const harsh = ctx.createOscillator();
        low.type = 'sawtooth';
        harsh.type = 'square';
        low.frequency.setValueAtTime(165, now);
        low.frequency.exponentialRampToValueAtTime(58, now + 0.5);
        harsh.frequency.setValueAtTime(196, now);
        harsh.frequency.exponentialRampToValueAtTime(72, now + 0.5);
        low.connect(gain);
        harsh.connect(gain);
        low.start(now);
        harsh.start(now);
        low.stop(now + 0.55);
        harsh.stop(now + 0.55);
    } catch (e) {
        // Silently fail if audio doesn't work
    }
}

function showSkipFlash() {
    if (!skipFlash) return;
    skipFlash.classList.remove('visible');
    void skipFlash.offsetWidth;
    skipFlash.classList.add('visible');
    setTimeout(() => skipFlash.classList.remove('visible'), 700);
}

// Format seconds to MM:SS or H:MM:SS
function formatTime(seconds, includeHours = false) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (includeHours || hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatStopTime(seconds) {
    if (!decimalMode) return formatTime(seconds);
    const safe = Math.max(0, Number(seconds) || 0);
    const hrs = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = (safe % 60).toFixed(1).padStart(4, '0');
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs}`;
    }
    return `${mins}:${secs}`;
}

// Format stops/hr as either "20.0/hr" or "3:00/stp"
function formatRate(stopsPerHour) {
    if (!Number.isFinite(stopsPerHour) || stopsPerHour <= 0) {
        return rateUnit === 'perStop' ? '--:--' : '0.0';
    }
    if (rateUnit === 'perStop') {
        return `${formatTime(Math.round(3600 / stopsPerHour))}/stp`;
    }
    return `${stopsPerHour.toFixed(1)}/hr`;
}

function toggleRateUnit() {
    rateUnit = rateUnit === 'perHour' ? 'perStop' : 'perHour';
    try {
        localStorage.setItem(RATE_UNIT_KEY, rateUnit);
    } catch (e) {
        // Ignore storage errors
    }
    haptic(10);
    refreshRateDisplays();
}

function refreshRateDisplays() {
    updateDisplay();
    updateHistory();

    const summaryRate = summaryStats && summaryStats.querySelector('.rate-toggle');
    if (confirmOverlay.classList.contains('visible') && summaryRate) {
        summaryRate.textContent = formatRate(
            overlayMode === 'sprintResults' ? sprintResultRate : getOverallRate()
        );
    }
}

function bindRateToggle(el) {
    if (!el) return;
    let touchHandled = false;
    el.addEventListener('touchstart', function(e) {
        touchHandled = true;
        e.preventDefault();
        e.stopPropagation();
        toggleRateUnit();
        setTimeout(() => { touchHandled = false; }, 300);
    }, { passive: false });
    el.addEventListener('click', function(e) {
        e.stopPropagation();
        if (touchHandled) {
            e.preventDefault();
            return;
        }
        toggleRateUnit();
    });
}

// Format Date to 12-hour AM/PM format
function formatTimeAMPM(date) {
    let hours = date.getHours();
    const mins = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${mins.toString().padStart(2, '0')} ${ampm}`;
}

function getTimeClass(seconds) {
    if (seconds < 90) return 'time-fast';
    if (seconds <= 360) return 'time-mid';
    return 'time-slow';
}

function normalizeDelivery(d) {
    if (typeof d === 'number') {
        return { time: d, skipped: false };
    }
    if (d && typeof d === 'object') {
        const time = Number(d.time);
        const entry = {
            time: Number.isFinite(time) ? time : 0,
            skipped: !!d.skipped
        };
        const at = Number(d.at);
        if (Number.isFinite(at) && at > 0) entry.at = at;
        return entry;
    }
    return { time: 0, skipped: false };
}

function deliveryTime(d) {
    return typeof d === 'number' ? d : ((d && d.time) || 0);
}

function isSkipped(d) {
    return !!(d && typeof d === 'object' && d.skipped);
}

function countedDeliveries() {
    return deliveries.filter(d => !isSkipped(d));
}

function skippedTimeSum() {
    return deliveries.reduce((sum, d) => sum + (isSkipped(d) ? deliveryTime(d) : 0), 0);
}

function refreshBestTime() {
    const counted = countedDeliveries();
    bestTime = counted.length ? Math.min(...counted.map(deliveryTime)) : Infinity;
}

// Get target stop count from input
function getTarget() {
    const val = parseInt(targetInput.value);
    return isNaN(val) || val < 0 ? 0 : val;
}

// Update split count controls
function updateSplitControls() {
    if (!splitRow) return;
    splitValue.textContent = splitCount.toString();
    splitMinus.disabled = splitCount <= MIN_SPLIT_COUNT;
    splitPlus.disabled = splitCount >= MAX_SPLIT_COUNT;
}

function setSplitCount(value) {
    const clamped = Math.max(MIN_SPLIT_COUNT, Math.min(MAX_SPLIT_COUNT, value));
    splitCount = clamped;
    updateSplitControls();
}

function nextSplitHoldValue(current, direction) {
    if (direction > 0) {
        const next = current % SPLIT_HOLD_STEP === 0
            ? current + SPLIT_HOLD_STEP
            : Math.ceil(current / SPLIT_HOLD_STEP) * SPLIT_HOLD_STEP;
        return Math.min(MAX_SPLIT_COUNT, next);
    }
    const next = current % SPLIT_HOLD_STEP === 0
        ? current - SPLIT_HOLD_STEP
        : Math.floor(current / SPLIT_HOLD_STEP) * SPLIT_HOLD_STEP;
    return Math.max(MIN_SPLIT_COUNT, next);
}

function nudgeSplitCount(nextValue, sound) {
    const before = splitCount;
    setSplitCount(nextValue);
    if (splitCount === before) return false;
    haptic(10);
    if (sound === 'hold') playSplitHoldTick();
    else playSplitTick();
    return true;
}

function bindSplitHold(btn, direction) {
    if (!btn) return;

    let pointerDown = false;
    let holdTimer = null;
    let repeatTimer = null;
    let didHold = false;
    let activePointerId = null;
    const releaseOpts = { capture: true };

    function unbindRelease() {
        window.removeEventListener('pointerup', onRelease, releaseOpts);
        window.removeEventListener('pointercancel', onCancel, releaseOpts);
        window.removeEventListener('touchend', onRelease, releaseOpts);
        window.removeEventListener('touchcancel', onCancel, releaseOpts);
        document.removeEventListener('visibilitychange', onCancel);
    }

    function bindRelease() {
        window.addEventListener('pointerup', onRelease, releaseOpts);
        window.addEventListener('pointercancel', onCancel, releaseOpts);
        window.addEventListener('touchend', onRelease, releaseOpts);
        window.addEventListener('touchcancel', onCancel, releaseOpts);
        document.addEventListener('visibilitychange', onCancel);
    }

    function isOurPointer(e) {
        if (activePointerId === null) return false;
        if (typeof e.pointerId === 'number') return e.pointerId === activePointerId;
        return true;
    }

    function clearSplitHold() {
        if (holdTimer !== null) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
        if (repeatTimer !== null) {
            clearInterval(repeatTimer);
            repeatTimer = null;
        }
        btn.classList.remove('is-holding');
        unbindRelease();
        activePointerId = null;
    }

    function applyHoldStep() {
        if (!pointerDown) {
            clearSplitHold();
            return;
        }
        nudgeSplitCount(nextSplitHoldValue(splitCount, direction), 'hold');
        const atBound = (direction < 0 && splitCount <= MIN_SPLIT_COUNT) ||
            (direction > 0 && splitCount >= MAX_SPLIT_COUNT);
        if (atBound) {
            pointerDown = false;
            clearSplitHold();
        }
    }

    function onRelease(e) {
        if (!pointerDown) return;
        if (e && !isOurPointer(e)) return;
        pointerDown = false;
        const held = didHold;
        clearSplitHold();
        if (!held && !btn.disabled) {
            nudgeSplitCount(splitCount + direction);
        }
    }

    function onCancel(e) {
        if (!pointerDown) return;
        if (e && e.type !== 'visibilitychange' && !isOurPointer(e)) return;
        pointerDown = false;
        didHold = false;
        clearSplitHold();
    }

    btn.addEventListener('pointerdown', function(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (btn.disabled) return;
        if (e.cancelable) e.preventDefault();
        clearSplitHold();
        pointerDown = true;
        didHold = false;
        activePointerId = e.pointerId;
        unlockAudio();
        try {
            btn.setPointerCapture(e.pointerId);
        } catch (err) {
            // Capture is optional
        }
        bindRelease();
        btn.classList.add('is-holding');
        holdTimer = setTimeout(() => {
            holdTimer = null;
            if (!pointerDown) return;
            didHold = true;
            applyHoldStep();
            if (!pointerDown) return;
            repeatTimer = setInterval(applyHoldStep, SPLIT_HOLD_REPEAT_MS);
        }, skipHoldMs);
    });

    btn.addEventListener('lostpointercapture', onRelease);

    btn.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });

    btn.addEventListener('click', function(e) {
        e.preventDefault();
    });
}

function loggedStopSeconds(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    if (decimalMode) return Math.round(safe * 10) / 10;
    return Math.floor(safe);
}

function splitDeliveryTimes(totalSeconds, count) {
    const logged = loggedStopSeconds(totalSeconds);
    const safeCount = Math.max(MIN_SPLIT_COUNT, Math.min(count, Math.max(Math.floor(logged) || MIN_SPLIT_COUNT, MIN_SPLIT_COUNT)));
    return divideLoggedTime(logged, safeCount);
}

// Same even split as a multi-stop DELIVERED tap, without capping the count at
// whole seconds, so a typed delivery number is reached exactly.
function splitDeliveryTimesExact(totalSeconds, count) {
    const logged = loggedStopSeconds(totalSeconds);
    const safeCount = Math.max(1, Math.floor(count));
    return divideLoggedTime(logged, safeCount);
}

function divideLoggedTime(logged, safeCount) {
    if (decimalMode) {
        const base = Math.round((logged / safeCount) * 10) / 10;
        const times = Array(safeCount).fill(base);
        const drift = Math.round((logged - base * safeCount) * 10) / 10;
        times[times.length - 1] = Math.max(0, Math.round((times[times.length - 1] + drift) * 10) / 10);
        return times;
    }
    const base = Math.floor(logged / safeCount);
    const remainder = logged % safeCount;
    const times = [];
    for (let i = 0; i < safeCount; i++) {
        times.push(base + (i < remainder ? 1 : 0));
    }
    return times;
}

// Get finish time as Date object
function getFinishTime() {
    const val = finishTimeInput.value;
    if (!val) return null;
    const [hrs, mins] = val.split(':').map(Number);
    if (isNaN(hrs) || isNaN(mins)) return null;
    const target = new Date();
    target.setHours(hrs, mins, 0, 0);
    return target;
}

// Calculate sum of all delivery times
function getDeliveryTimeSum() {
    return countedDeliveries().reduce((sum, d) => sum + deliveryTime(d), 0);
}

// Calculate overall rate (deliveries per hour), ignoring skipped/stuck stops
function getOverallRate() {
    const counted = countedDeliveries();
    const ratedSeconds = Math.max(0, totalSeconds - skippedTimeSum());
    if (counted.length === 0 || ratedSeconds === 0) return 0;
    return counted.length / (ratedSeconds / 3600);
}

// Calculate rate for last N counted (non-skipped) deliveries
function getRecentRate(n = recentWindow) {
    const counted = countedDeliveries();
    if (counted.length === 0) return 0;
    const windowSize = Math.max(MIN_RECENT_WINDOW, Math.min(n, MAX_RECENT_WINDOW));
    const recentDeliveries = counted.slice(-windowSize);
    const recentTime = recentDeliveries.reduce((sum, d) => sum + deliveryTime(d), 0);
    if (recentTime === 0) return 0;
    const hours = recentTime / 3600;
    return recentDeliveries.length / hours;
}

// Calculate per-delivery rate (what rate would be if you kept this pace)
function getSingleDeliveryRate(seconds) {
    if (seconds === 0) return 0;
    const hours = seconds / 3600;
    return 1 / hours;
}

// Update estimated finish time based on recent pace
function updateEstimate() {
    const target = getTarget();
    const remaining = target - deliveries.length;
    const recentRate = getRecentRate();

    if (target > 0 && remaining > 0 && recentRate > 0) {
        const hoursNeeded = remaining / recentRate;
        const msNeeded = hoursNeeded * 60 * 60 * 1000;
        const finishDate = new Date(Date.now() + msNeeded);
        estimateTime.textContent = formatTimeAMPM(finishDate);
    } else if (target > 0 && remaining <= 0) {
        estimateTime.textContent = 'DONE!';
    } else {
        estimateTime.textContent = '--:--';
    }
}

// Update pace needed and status badge
function updatePaceNeeded() {
    const target = getTarget();
    const finishTime = getFinishTime();
    const remaining = target - deliveries.length;
    const recentRate = getRecentRate();

    // Update remaining label
    if (target > 0) {
        remainingLabel.textContent = `(${Math.max(remaining, 0)} left)`;
    } else {
        remainingLabel.textContent = '';
    }

    // Calculate pace needed to finish on time
    if (finishTime && target > 0 && remaining > 0) {
        const msRemaining = finishTime - Date.now();
        const hoursRemaining = msRemaining / (1000 * 60 * 60);
        
        if (hoursRemaining > 0) {
            const neededRate = remaining / hoursRemaining;
            paceNeededEl.textContent = formatRate(neededRate);
            
            if (recentRate >= neededRate) {
                paceNeededEl.classList.remove('pace-needed', 'pace-behind');
                paceNeededEl.classList.add('pace-ahead');
                statusBadge.textContent = 'AHEAD';
                statusBadge.classList.remove('behind', 'on-track');
                statusBadge.classList.add('ahead', 'visible');
            } else if (recentRate >= neededRate * 0.85) {
                paceNeededEl.classList.remove('pace-ahead', 'pace-behind');
                paceNeededEl.classList.add('pace-needed');
                statusBadge.textContent = 'ON TRACK';
                statusBadge.classList.remove('ahead', 'behind');
                statusBadge.classList.add('on-track', 'visible');
            } else {
                paceNeededEl.classList.remove('pace-ahead', 'pace-needed');
                paceNeededEl.classList.add('pace-behind');
                statusBadge.textContent = 'BEHIND';
                statusBadge.classList.remove('ahead', 'on-track');
                statusBadge.classList.add('behind', 'visible');
            }
        } else {
            paceNeededEl.textContent = 'PAST';
            paceNeededEl.classList.remove('pace-ahead', 'pace-needed');
            paceNeededEl.classList.add('pace-behind');
            statusBadge.textContent = 'LATE';
            statusBadge.classList.remove('ahead', 'on-track');
            statusBadge.classList.add('behind', 'visible');
        }
    } else if (target > 0 && remaining <= 0) {
        paceNeededEl.textContent = 'DONE';
        paceNeededEl.classList.remove('pace-needed', 'pace-behind');
        paceNeededEl.classList.add('pace-ahead');
        statusBadge.classList.remove('visible');
    } else {
        paceNeededEl.textContent = '--';
        paceNeededEl.classList.remove('pace-ahead', 'pace-needed', 'pace-behind');
        statusBadge.classList.remove('visible');
    }
}

// Update progress bar
function updateProgress() {
    const target = getTarget();
    if (target > 0) {
        progressSection.classList.add('visible');
        const percent = Math.min((deliveries.length / target) * 100, 100);
        const remaining = Math.max(target - deliveries.length, 0);
        progressFill.style.width = `${percent}%`;
        progressLeft.textContent = `${remaining} remaining`;
        progressPercent.textContent = `${Math.round(percent)}%`;
    } else {
        progressSection.classList.remove('visible');
    }
}

// Main display update function
function updateDisplay() {
    currentTimeEl.textContent = formatStopTime(currentSeconds);
    totalTimeEl.textContent = formatTime(totalSeconds, true);
    deliveryNumEl.textContent = `#${deliveries.length + 1}`;
    if (deliveryNumBtn && !jumpEditorOpen) {
        deliveryNumBtn.setAttribute(
            'aria-label',
            `Delivery ${deliveries.length + 1}. Tap to jump to a higher number`
        );
    }
    currentTimeEl.classList.remove('time-fast', 'time-mid', 'time-slow');
    currentTimeEl.classList.add(getTimeClass(currentSeconds));

    const counted = countedDeliveries();
    const overallRate = getOverallRate();
    const recentRate = getRecentRate();
    
    if (counted.length > 0 && totalSeconds > 0) {
        perHourEl.textContent = formatRate(overallRate);
        
        const avgSeconds = Math.round(getDeliveryTimeSum() / counted.length);
        avgTimeEl.textContent = formatTime(avgSeconds);
        bestTimeEl.textContent = formatTime(bestTime);
        
        paceCurrentEl.textContent = formatRate(recentRate);
    } else {
        perHourEl.textContent = formatRate(0);
        avgTimeEl.textContent = '--:--';
        bestTimeEl.textContent = '--:--';
        paceCurrentEl.textContent = '--';
    }

    updateEstimate();
    updatePaceNeeded();
    updateProgress();
    updateSprintDisplay();
    renderPaceChart();

    undoBtn.disabled = deliveries.length === 0;
    
    updateSplitControls();
}

let paceChartSignature = '';
let paceChartLayout = null;
let paceScrubTimer = null;

function paceChartColors() {
    const light = document.body.classList.contains('light') && !document.body.classList.contains('slate');
    const style = getComputedStyle(document.body);
    const pick = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
    return {
        good: light ? pick('--good-strong', '#16a34a') : pick('--good', '#4ade80'),
        accent: pick('--accent', '#ff6b35'),
        bad: light ? '#dc2626' : pick('--bad', '#ef4444'),
        warn: pick('--warn', '#f59e0b'),
        muted: light ? 'rgba(28,25,23,0.38)' : 'rgba(255,255,255,0.34)',
        faint: light ? 'rgba(28,25,23,0.1)' : 'rgba(255,255,255,0.1)',
        hole: document.body.classList.contains('slate') ? '#161c24' : (light ? '#fff7ed' : '#121225'),
        area: light ? 0.18 : 0.32
    };
}

function paceDotColor(seconds, skipped, colors) {
    if (skipped) return colors.warn;
    if (seconds < 90) return colors.good;
    if (seconds <= 360) return colors.accent;
    return colors.bad;
}

function paceCeiling(rates, overall) {
    const sorted = rates.filter(rate => rate > 0).sort((a, b) => a - b);
    if (!sorted.length) return 1;
    const quantile = (q) => {
        const pos = (sorted.length - 1) * q;
        const lo = Math.floor(pos);
        const hi = Math.ceil(pos);
        if (lo === hi) return sorted[lo];
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    };
    const median = quantile(0.5);
    const high = quantile(0.95);
    let ceiling = Math.max(high * 1.12, median * 1.65, 1);
    if (overall > 0) ceiling = Math.max(ceiling, overall * 1.08);
    return ceiling;
}

function monotoneCurve(pts) {
    if (pts.length < 2) return '';
    const n = pts.length;
    const dx = [];
    const slope = [];
    const tangent = new Array(n);
    for (let i = 0; i < n - 1; i++) {
        dx[i] = pts[i + 1].x - pts[i].x || 1;
        slope[i] = (pts[i + 1].y - pts[i].y) / dx[i];
    }
    tangent[0] = slope[0];
    tangent[n - 1] = slope[n - 2];
    for (let i = 1; i < n - 1; i++) {
        tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
    }
    for (let i = 0; i < n - 1; i++) {
        if (Math.abs(slope[i]) < 1e-6) {
            tangent[i] = 0;
            tangent[i + 1] = 0;
        } else {
            const a = tangent[i] / slope[i];
            const b = tangent[i + 1] / slope[i];
            const hypot = a * a + b * b;
            if (hypot > 9) {
                const scale = 3 / Math.sqrt(hypot);
                tangent[i] = scale * a * slope[i];
                tangent[i + 1] = scale * b * slope[i];
            }
        }
    }
    let path = `M ${svgCoord(pts[0].x)} ${svgCoord(pts[0].y)}`;
    for (let i = 0; i < n - 1; i++) {
        const c1x = pts[i].x + dx[i] / 3;
        const c1y = pts[i].y + tangent[i] * dx[i] / 3;
        const c2x = pts[i + 1].x - dx[i] / 3;
        const c2y = pts[i + 1].y - tangent[i + 1] * dx[i] / 3;
        path += ` C ${svgCoord(c1x)} ${svgCoord(c1y)} ${svgCoord(c2x)} ${svgCoord(c2y)} ${svgCoord(pts[i + 1].x)} ${svgCoord(pts[i + 1].y)}`;
    }
    return path;
}

function svgCoord(n) {
    return (Math.round(n * 10) / 10).toString();
}

function paceAxisLabels() {
    if (!deliveries.length) return ['', ''];
    const times = deliveries.map(d => Number(d && d.at));
    const timed = times.every(t => Number.isFinite(t) && t > 0);
    if (timed) {
        const start = formatTimeAMPM(new Date(times[0]));
        const end = formatTimeAMPM(new Date(times[times.length - 1]));
        return deliveries.length === 1 ? [start, ''] : [start, end];
    }
    return deliveries.length === 1 ? ['#1', ''] : ['#1', `#${deliveries.length}`];
}

function describePacePoint(point) {
    if (!point) return '';
    if (point.skipped) return `#${point.num} · Skip`;
    return `#${point.num} · ${formatStopTime(point.time)} · ${formatRate(point.rate)}`;
}

function setPaceReadout(point) {
    if (!paceChartReadout) return;
    paceChartReadout.textContent = describePacePoint(point);
    paceChartReadout.classList.remove('is-mid', 'is-slow', 'is-skip');
    if (!point) return;
    if (point.skipped) {
        paceChartReadout.classList.add('is-skip');
    } else if (point.time > 360) {
        paceChartReadout.classList.add('is-slow');
    } else if (point.time >= 90) {
        paceChartReadout.classList.add('is-mid');
    }
}

function renderPaceChart() {
    if (!paceChartEl || !paceChartSvg) return;
    const visible = showPaceChart && (hasStarted || deliveries.length > 0);
    paceChartEl.hidden = !visible;
    document.body.classList.toggle('pace-chart-open', visible && !isMinimalMode);
    if (!visible) {
        paceChartSignature = 'hidden';
        paceChartLayout = null;
        return;
    }

    const width = Math.round(paceChartSvg.clientWidth);
    const height = Math.round(paceChartSvg.clientHeight);
    if (width < 20 || height < 20) return;

    const signature = [
        width,
        height,
        rateUnit,
        decimalMode,
        theme,
        slateOn ? 1 : 0,
        deliveries.map(d => `${deliveryTime(d)}:${isSkipped(d) ? 1 : 0}:${d.at || 0}`).join(',')
    ].join('|');
    if (signature === paceChartSignature) return;
    paceChartSignature = signature;

    const colors = paceChartColors();
    const countedRates = [];
    deliveries.forEach(entry => {
        if (isSkipped(entry)) return;
        const time = deliveryTime(entry);
        if (time > 0) countedRates.push(3600 / time);
    });
    const overall = getOverallRate();
    const ceiling = paceCeiling(countedRates, overall);
    const pad = { l: 8, r: 8, t: height < 52 ? 7 : 12, b: height < 52 ? 5 : 8 };
    const plotW = width - pad.l - pad.r;
    const plotH = height - pad.t - pad.b;
    const n = deliveries.length;
    const yFor = (rate) => {
        const clamped = Math.max(0, Math.min(rate, ceiling));
        const t = ceiling > 0 ? clamped / ceiling : 0;
        return pad.t + (1 - t) * plotH;
    };
    const xFor = (index) => {
        if (n <= 1) return pad.l + plotW / 2;
        return pad.l + (index / (n - 1)) * plotW;
    };

    const points = deliveries.map((entry, index) => {
        const time = deliveryTime(entry);
        const skipped = isSkipped(entry);
        const rate = !skipped && time > 0 ? 3600 / time : 0;
        return {
            index,
            num: index + 1,
            time,
            rate,
            skipped,
            at: entry.at,
            x: xFor(index),
            y: skipped ? height - pad.b : yFor(rate),
            color: paceDotColor(time, skipped, colors)
        };
    });
    const linePoints = points.filter(point => !point.skipped && point.time > 0);
    const gap = n <= 1 ? 24 : plotW / (n - 1);
    const radius = Math.max(1.2, Math.min(3.5, gap * 0.42));
    const labels = paceAxisLabels();
    const latest = linePoints.length ? linePoints[linePoints.length - 1] : (points.length ? points[points.length - 1] : null);

    if (paceChartStage) paceChartStage.classList.toggle('has-data', points.length > 0);
    if (paceChartStart) paceChartStart.textContent = labels[0];
    if (paceChartEnd) paceChartEnd.textContent = labels[1];
    setPaceReadout(latest);
    if (paceChartSvg) {
        const summary = latest
            ? `Pace through the day. ${points.length} stops. Latest ${describePacePoint(latest)}.`
            : 'Pace through the day. Each point is a stop.';
        paceChartSvg.setAttribute('aria-label', summary);
        paceChartEl.setAttribute('aria-label', summary);
    }

    const parts = [
        `<defs><linearGradient id="paceAreaFill" x1="0" y1="0" x2="0" y2="1">`,
        `<stop offset="0%" stop-color="${colors.good}" stop-opacity="${colors.area}"/>`,
        `<stop offset="100%" stop-color="${colors.good}" stop-opacity="0"/>`,
        `</linearGradient></defs>`
    ];

    if (linePoints.length >= 2) {
        const curve = monotoneCurve(linePoints.map(point => ({ x: point.x, y: point.y })));
        const floor = svgCoord(height - pad.b);
        const area = `${curve} L ${svgCoord(linePoints[linePoints.length - 1].x)} ${floor} L ${svgCoord(linePoints[0].x)} ${floor} Z`;
        parts.push(`<path d="${area}" fill="url(#paceAreaFill)"/>`);
        parts.push(`<path d="${curve}" fill="none" stroke="${colors.good}" stroke-width="6" stroke-opacity="0.16" stroke-linecap="round" stroke-linejoin="round"/>`);
        parts.push(`<path d="${curve}" fill="none" stroke="${colors.good}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
        if (overall > 0) {
            const y = svgCoord(yFor(overall));
            parts.push(`<line x1="${pad.l}" y1="${y}" x2="${svgCoord(width - pad.r)}" y2="${y}" stroke="${colors.muted}" stroke-width="1" stroke-dasharray="2 4"/>`);
        }
    }

    points.forEach(point => {
        if (!point.skipped) return;
        parts.push(`<circle cx="${svgCoord(point.x)}" cy="${svgCoord(point.y)}" r="2.3" fill="none" stroke="${colors.warn}" stroke-width="1.4"/>`);
    });
    linePoints.forEach(point => {
        const emphasized = latest && point.index === latest.index;
        const r = emphasized ? radius + 1.4 : radius;
        parts.push(`<circle cx="${svgCoord(point.x)}" cy="${svgCoord(point.y)}" r="${svgCoord(r)}" fill="${point.color}" stroke="${colors.hole}" stroke-width="${emphasized ? 2 : 1}"/>`);
    });
    parts.push(`<g id="paceChartFocus" opacity="0"><line id="paceChartFocusLine" stroke="${colors.muted}" stroke-width="1"/><circle id="paceChartFocusDot" fill="none" stroke-width="2"/></g>`);

    paceChartSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    paceChartSvg.innerHTML = parts.join('');
    paceChartLayout = { width, height, points, latest };
}

function showPaceFocus(point) {
    if (!paceChartSvg || !point) return;
    const line = paceChartSvg.querySelector('#paceChartFocusLine');
    const dot = paceChartSvg.querySelector('#paceChartFocusDot');
    const height = paceChartLayout ? paceChartLayout.height : 64;
    if (line) {
        line.setAttribute('x1', svgCoord(point.x));
        line.setAttribute('x2', svgCoord(point.x));
        line.setAttribute('y1', '6');
        line.setAttribute('y2', svgCoord(height - 6));
    }
    if (dot) {
        dot.setAttribute('cx', svgCoord(point.x));
        dot.setAttribute('cy', svgCoord(point.y));
        dot.setAttribute('r', '6');
        dot.setAttribute('stroke', point.color);
    }
    setPaceReadout(point);
}

function nearestPacePoint(clientX) {
    if (!paceChartLayout || !paceChartSvg || !paceChartLayout.points.length) return null;
    const rect = paceChartSvg.getBoundingClientRect();
    if (!rect.width) return null;
    const x = ((clientX - rect.left) / rect.width) * paceChartLayout.width;
    let best = null;
    let bestDist = Infinity;
    paceChartLayout.points.forEach(point => {
        const dist = Math.abs(point.x - x);
        if (dist < bestDist) {
            best = point;
            bestDist = dist;
        }
    });
    return best;
}

function clearPaceScrub() {
    if (paceScrubTimer) {
        clearTimeout(paceScrubTimer);
        paceScrubTimer = null;
    }
    const focus = paceChartSvg && paceChartSvg.querySelector('#paceChartFocus');
    if (focus) focus.setAttribute('opacity', '0');
    if (paceChartLayout) setPaceReadout(paceChartLayout.latest);
}

function scrubPaceChart(clientX) {
    const point = nearestPacePoint(clientX);
    if (!point) return;
    const focus = paceChartSvg && paceChartSvg.querySelector('#paceChartFocus');
    if (focus) focus.setAttribute('opacity', '1');
    showPaceFocus(point);
}

function applyPaceChartToggle() {
    if (!paceChartToggle) return;
    paceChartToggle.classList.toggle('on', showPaceChart);
    paceChartToggle.setAttribute('aria-checked', showPaceChart ? 'true' : 'false');
}

function togglePaceChart() {
    showPaceChart = !showPaceChart;
    applyPaceChartToggle();
    persistPref(SHOW_PACE_CHART_KEY, showPaceChart.toString());
    paceChartSignature = '';
    renderPaceChart();
}

// Update delivery history list
function updateHistory() {
    if (deliveries.length === 0) {
        historyListEl.innerHTML = '<div class="empty-history">No deliveries yet</div>';
        return;
    }

    historyListEl.innerHTML = deliveries.slice().reverse().slice(0, 15).map((entry, idx) => {
        const num = deliveries.length - idx;
        const time = deliveryTime(entry);
        const skipped = isSkipped(entry);
        const singleRate = getSingleDeliveryRate(time);
        const timeClass = skipped ? '' : getTimeClass(time);

        return `<div class="history-item${skipped ? ' skipped' : ''}">
            <span class="num">#${num}</span>
            <span class="time ${timeClass}">${formatStopTime(time)}</span>
            <span class="rate${skipped ? '' : ' rate-toggle'}">${skipped ? 'SKIP' : formatRate(singleRate)}</span>
        </div>`;
    }).join('');
}

// Schedule the next paint at the upcoming whole elapsed second so a hitch
// cannot skip a displayed second the way setInterval(1000) can.
function stopTicker() {
    if (intervalId !== null) {
        clearTimeout(intervalId);
        intervalId = null;
    }
}

function msUntilNextWholeSecond() {
    if (!hasStarted || !deliveryStartTimestamp) return 1000;
    const now = Date.now();
    let elapsed = now - deliveryStartTimestamp - deliveryPausedMs;
    if (pauseStartTimestamp !== null) {
        elapsed -= now - pauseStartTimestamp;
    }
    elapsed = Math.max(0, elapsed);
    const remainder = elapsed % 1000;
    const delay = 1000 - remainder;
    return delay < 24 ? delay + 1000 : delay;
}

function startTicker() {
    stopTicker();
    const nextDelay = () => decimalMode ? 100 : msUntilNextWholeSecond();
    const fire = () => {
        tick();
        if (!hasStarted) return;
        intervalId = setTimeout(fire, nextDelay());
    };
    intervalId = setTimeout(fire, nextDelay());
}

function tick() {
    calculateElapsedTimes();
    checkSprintComplete();
    updateDisplay();

    if (totalSeconds !== lastSavedTotalSeconds && totalSeconds % 5 === 0) {
        lastSavedTotalSeconds = totalSeconds;
        setTimeout(saveTimerState, 0);
    }
}

// Start tracking session
function startSession() {
    if (hasStarted) return; // Prevent starting multiple times
    
    const now = Date.now();
    const pendingBacklogMs = addedTimeMs;
    const pendingSplit = splitCount;
    
    hasStarted = true;
    isRunning = true;
    sessionStartTimestamp = now - pendingBacklogMs;
    deliveryStartTimestamp = now - pendingBacklogMs;
    addedTimeMs = 0; // Already baked into timestamps
    totalPausedMs = 0;
    deliveryPausedMs = 0;
    pauseStartTimestamp = null;
    
    // Initialize audio context on first user interaction
    unlockAudio();
    
    startBtn.classList.add('hidden');
    deliveredBtn.classList.remove('hidden');
    pauseBtn.classList.remove('hidden');
    addTimeBtn.classList.add('hidden');
    updateSprintButton();
    hideResetConfirm();
    
    startTicker();
    
    // Save state immediately
    saveTimerState();
    updateDisplay();

    // If time + multi-stop were set before start, log those completed packages now
    if (pendingBacklogMs > 0 && pendingSplit > 1) {
        calculateElapsedTimes();
        recordDelivery();
    }
}

// Toggle pause/resume
function togglePause() {
    const now = Date.now();
    
    if (isRunning) {
        // Pausing
        isRunning = false;
        pauseStartTimestamp = now;
        pauseBtn.textContent = 'RESUME';
        pauseBtn.classList.add('paused');
        currentTimeEl.classList.add('paused');
    } else {
        // Resuming
        isRunning = true;
        
        applyPauseDuration(now, { includeDelivery: true });
        
        pauseBtn.textContent = 'PAUSE';
        pauseBtn.classList.remove('paused');
        currentTimeEl.classList.remove('paused');
    }
    
    saveTimerState();
    updateDisplay();
    startTicker();
}

// Record a delivery
function recordDelivery(skipped = false) {
    // Calculate current time first
    calculateElapsedTimes();
    
    if (currentSeconds < 1) return;

    commitDeliveries(splitDeliveryTimes(currentSeconds, splitCount), skipped);
}

function commitDeliveries(splitTimes, skipped) {
    if (!splitTimes.length) return;

    const countedBefore = countedDeliveries().length;
    let hitNewRecord = false;

    currentTimeEl.classList.remove('flash-green', 'flash-skip');
    void currentTimeEl.offsetWidth;
    currentTimeEl.classList.add(skipped ? 'flash-skip' : 'flash-green');

    if (skipped) {
        playSkipSound();
        showSkipFlash();
    } else {
        playDeliverySound();
    }

    const loggedAt = Date.now();
    const totalMs = splitTimes.reduce((sum, time) => sum + Math.max(0, time), 0) * 1000;
    let stampedAt = loggedAt - totalMs;
    splitTimes.forEach(time => {
        stampedAt += Math.max(0, time) * 1000;
        if (!skipped && time > 0) {
            const isNewRecord = time < bestTime && countedBefore > 0;
            if (time < bestTime) {
                bestTime = time;
            }
            if (isNewRecord) {
                hitNewRecord = true;
            }
        }
        deliveries.push({ time, skipped: !!skipped, at: Math.round(stampedAt) });
    });

    if (hitNewRecord) {
        newRecord.classList.add('visible');
        setTimeout(() => newRecord.classList.remove('visible'), 2000);
    }

    // Reset delivery timer using timestamp
    const now = Date.now();
    deliveryStartTimestamp = now;
    deliveryPausedMs = 0;
    currentSeconds = 0;

    // If paused, resume when recording delivery
    if (!isRunning) {
        isRunning = true;
        applyPauseDuration(now, { includeDelivery: false });
        pauseBtn.textContent = 'PAUSE';
        pauseBtn.classList.remove('paused');
        currentTimeEl.classList.remove('paused');
    }

    setSplitCount(1);
    saveTimerState();
    updateDisplay();
    updateHistory();
    startTicker();
    checkSprintComplete();

    haptic(skipped ? 500 : 30);
}

let jumpEditorOpen = false;
let jumpApplying = false;
let jumpNoteTimer = null;
let jumpOpenedAt = 0;

function currentDeliveryNumber() {
    return deliveries.length + 1;
}

function showJumpNote(message, isError) {
    if (!deliveryJumpNote) return;
    if (jumpNoteTimer) {
        clearTimeout(jumpNoteTimer);
        jumpNoteTimer = null;
    }
    deliveryJumpNote.textContent = message;
    deliveryJumpNote.classList.toggle('is-error', !!isError);
    deliveryJumpNote.classList.remove('hidden');
    if (!jumpEditorOpen) {
        jumpNoteTimer = setTimeout(() => {
            jumpNoteTimer = null;
            if (!jumpEditorOpen && deliveryJumpNote) deliveryJumpNote.classList.add('hidden');
        }, 1800);
    }
}

function closeJumpEditor() {
    jumpEditorOpen = false;
    if (deliveryJumpForm) deliveryJumpForm.classList.add('hidden');
    if (deliveryNumBtn) deliveryNumBtn.classList.remove('hidden');
    if (deliveryJumpNote) deliveryJumpNote.classList.add('hidden');
    if (jumpNoteTimer) {
        clearTimeout(jumpNoteTimer);
        jumpNoteTimer = null;
    }
}

function openJumpEditor() {
    if (jumpEditorOpen || !deliveryJumpForm || !deliveryJumpInput) return;
    if (!hasStarted) {
        showJumpNote('Start the timer first', true);
        return;
    }
    jumpEditorOpen = true;
    jumpOpenedAt = Date.now();
    if (deliveryNumBtn) deliveryNumBtn.classList.add('hidden');
    deliveryJumpForm.classList.remove('hidden');
    deliveryJumpInput.value = '';
    const current = currentDeliveryNumber();
    showJumpNote(`Higher than #${current}. This stop's time is split across each one.`, false);
    deliveryJumpInput.focus();
    haptic(10);
}

function jumpToDeliveryNumber(targetNumber) {
    calculateElapsedTimes();
    const steps = targetNumber - currentDeliveryNumber();
    if (!hasStarted || steps < 1 || currentSeconds < 1) return false;
    commitDeliveries(splitDeliveryTimesExact(currentSeconds, steps), false);
    return true;
}

function applyJumpFromInput() {
    if (!jumpEditorOpen || jumpApplying || !deliveryJumpInput) return;
    const raw = deliveryJumpInput.value.trim();
    const current = currentDeliveryNumber();
    if (!raw) {
        if (Date.now() - jumpOpenedAt < 400) return;
        closeJumpEditor();
        return;
    }
    const target = parseInt(raw, 10);
    if (!Number.isFinite(target) || target <= current) {
        showJumpNote(`Enter a number above ${current}`, true);
        deliveryJumpInput.focus();
        return;
    }
    if (target > MAX_DELIVERY_NUMBER) {
        showJumpNote(`Max is ${MAX_DELIVERY_NUMBER}`, true);
        deliveryJumpInput.focus();
        return;
    }
    calculateElapsedTimes();
    if (currentSeconds < 1) {
        showJumpNote('Wait at least 1 second on this stop', true);
        deliveryJumpInput.focus();
        return;
    }
    jumpApplying = true;
    closeJumpEditor();
    jumpToDeliveryNumber(target);
    jumpApplying = false;
}

// Undo last delivery
function undoLast() {
    if (deliveries.length === 0) return;
    closeJumpEditor();

    const lastDelivery = deliveries.pop();
    const lastDeliveryTime = deliveryTime(lastDelivery);
    
    // Adjust delivery start timestamp backwards to include the undone delivery time
    // This effectively adds the time back to the current delivery
    deliveryStartTimestamp -= (lastDeliveryTime * 1000);
    
    // Recalculate
    calculateElapsedTimes();
    
    refreshBestTime();
    
    saveTimerState();
    updateDisplay();
    updateHistory();
    startTicker();

    haptic(20);
}

// Show reset confirmation dialog
function showResetConfirm() {
    overlayMode = 'reset';
    if (sprintModeToggle) sprintModeToggle.classList.add('hidden');
    confirmTitle.textContent = 'Reset All Data?';
    confirmText.textContent = 'This will clear all deliveries and times. This cannot be undone.';
    summaryStats.style.display = 'none';
    confirmClose.classList.add('hidden');
    confirmButtons.innerHTML = `
        <button class="confirm-btn confirm-cancel" id="confirmCancelBtn">Cancel</button>
        <button class="confirm-btn confirm-yes" id="confirmYesBtn">Reset</button>
    `;
    confirmOverlay.classList.add('visible');
    
    // Re-attach event listeners
    document.getElementById('confirmCancelBtn').addEventListener('click', hideResetConfirm);
    document.getElementById('confirmYesBtn').addEventListener('click', resetAll);
}

// Hide confirmation dialog
function hideResetConfirm() {
    const wasSprintPicker = overlayMode === 'sprintPicker';
    const wasSprintResults = overlayMode === 'sprintResults';
    const wasWhatsNew = overlayMode === 'whatsNew';
    if (wasWhatsNew) persistPref(SEEN_VERSION_KEY, String(APP_VERSION));
    overlayMode = null;
    confirmClose.classList.add('hidden');
    if (sprintModeToggle) sprintModeToggle.classList.add('hidden');
    confirmOverlay.classList.remove('visible');
    summaryStats.style.display = 'none';
    summaryStats.innerHTML = '';
    if (wasSprintPicker) resumeAfterSprintPicker();
    if (wasSprintResults && pendingSprintResults) {
        pendingSprintResults = null;
        sprintResultRate = 0;
        saveTimerState();
    }
    if (!wasWhatsNew) maybeShowWhatsNew();
}

function hasSeenCurrentVersion() {
    try {
        return localStorage.getItem(SEEN_VERSION_KEY) === String(APP_VERSION);
    } catch (e) {
        return true;
    }
}

function showWhatsNew() {
    overlayMode = 'whatsNew';
    if (sprintModeToggle) sprintModeToggle.classList.add('hidden');
    confirmTitle.textContent = "What's new";
    confirmText.innerHTML = `<ul class="whats-new-list">${WHATS_NEW.map(item => `<li>${item}</li>`).join('')}</ul>`;
    summaryStats.style.display = 'none';
    confirmClose.classList.remove('hidden');
    confirmButtons.innerHTML = `
        <button type="button" class="confirm-btn confirm-done" id="whatsNewDoneBtn" style="width:100%">Got it</button>
    `;
    confirmOverlay.classList.add('visible');
    const doneBtn = document.getElementById('whatsNewDoneBtn');
    if (doneBtn) doneBtn.addEventListener('click', hideResetConfirm);
}

function maybeShowWhatsNew() {
    if (hasSeenCurrentVersion()) return;
    if (overlayMode) return;
    showWhatsNew();
}

// Reset all data
function resetAll() {
    hideResetConfirm();
    closeJumpEditor();
    
    stopTicker();
    lastSavedTotalSeconds = -1;

    // Reset all state including timestamps
    currentSeconds = 0;
    totalSeconds = 0;
    deliveries = [];
    bestTime = Infinity;
    isRunning = false;
    hasStarted = false;
    splitCount = 1;
    
    // Reset timestamp tracking
    sessionStartTimestamp = null;
    deliveryStartTimestamp = null;
    totalPausedMs = 0;
    deliveryPausedMs = 0;
    pauseStartTimestamp = null;
    addedTimeMs = 0;
    pausedForSprintPicker = false;
    overlayMode = null;
    sprintResultRate = 0;
    pendingSprintResults = null;
    clearSprintState();
    
    // Clear persisted state
    clearTimerState();

    pauseBtn.textContent = 'PAUSE';
    pauseBtn.classList.remove('paused');
    pauseBtn.classList.add('hidden');
    currentTimeEl.classList.remove('paused', 'flash-green', 'flash-skip');
    statusBadge.classList.remove('visible');
    startBtn.classList.remove('hidden');
    deliveredBtn.classList.add('hidden');
    addTimeBtn.classList.remove('hidden');
    updateSprintDisplay();
    finishTimeInput.value = defaultFinishTime;

    perHourEl.textContent = formatRate(0);
    avgTimeEl.textContent = '--:--';
    bestTimeEl.textContent = '--:--';
    paceCurrentEl.textContent = '--';
    paceNeededEl.textContent = '--';
    paceNeededEl.classList.remove('pace-ahead', 'pace-needed', 'pace-behind');
    estimateTime.textContent = '--:--';

    updateDisplay();
    updateHistory();
}

function applyTheme() {
    document.body.classList.remove('dark', 'light', 'slate', 'volt');
    if (slateOn) {
        document.body.classList.add('dark', 'slate');
    } else {
        document.body.classList.add(theme === 'light' ? 'light' : 'dark');
    }

    const isLight = !slateOn && theme === 'light';
    themeToggle.textContent = isLight ? '☀️' : '🌙';
    themeToggle.setAttribute(
        'aria-label',
        isLight ? 'Switch to dark theme' : 'Switch to light theme'
    );
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
        themeColor.setAttribute('content', slateOn ? '#161c24' : (isLight ? '#fff7ed' : '#121225'));
    }
    paceChartSignature = '';
    renderPaceChart();

    const slateToggle = $('slateToggle');
    if (slateToggle) {
        slateToggle.classList.toggle('on', slateOn);
        slateToggle.setAttribute('aria-checked', slateOn ? 'true' : 'false');
    }
}

function toggleTheme() {
    slateOn = false;
    theme = theme === 'light' ? 'dark' : 'light';
    persistPref('deliveryTimerTheme', theme);
    persistPref('deliveryTimerSlate', 'false');
    applyTheme();
}

function toggleSlate() {
    slateOn = !slateOn;
    persistPref('deliveryTimerSlate', slateOn ? 'true' : 'false');
    applyTheme();
}

function applySoundIcons() {
    soundToggle.textContent = soundEnabled ? '🔊' : '🔇';
    soundToggle.classList.toggle('muted', !soundEnabled);
    soundToggle.setAttribute(
        'aria-label',
        soundEnabled ? 'Mute sound' : 'Unmute sound'
    );
}

// Toggle sound
function toggleSound() {
    soundEnabled = !soundEnabled;
    applySoundIcons();
    localStorage.setItem('deliveryTimerSound', soundEnabled.toString());
}

// Toggle minimal mode
function applyMinimalMode() {
    document.body.classList.toggle('minimal-mode', isMinimalMode);
    if (minimalToggle) {
        minimalToggle.classList.toggle('on', isMinimalMode);
        minimalToggle.setAttribute('aria-checked', isMinimalMode ? 'true' : 'false');
    }
}

function toggleMinimalMode() {
    isMinimalMode = !isMinimalMode;
    applyMinimalMode();
    persistPref('deliveryTimerMinimalMode', isMinimalMode.toString());
    paceChartSignature = '';
    renderPaceChart();
}

function applyHapticsToggle() {
    if (!hapticsToggle) return;
    hapticsToggle.classList.toggle('on', hapticsEnabled);
    hapticsToggle.setAttribute('aria-checked', hapticsEnabled ? 'true' : 'false');
}

function toggleHaptics() {
    hapticsEnabled = !hapticsEnabled;
    applyHapticsToggle();
    persistPref(HAPTICS_KEY, hapticsEnabled.toString());
    if (hapticsEnabled) haptic(20);
}

function applyDecimalToggle() {
    if (!decimalToggle) return;
    decimalToggle.classList.toggle('on', decimalMode);
    decimalToggle.setAttribute('aria-checked', decimalMode ? 'true' : 'false');
}

function toggleDecimalMode() {
    decimalMode = !decimalMode;
    applyDecimalToggle();
    persistPref(DECIMAL_MODE_KEY, decimalMode.toString());
    if (hasStarted) startTicker();
    updateDisplay();
    updateHistory();
}

function toggleKeepScreenOn() {
    keepScreenOn = !keepScreenOn;
    persistPref(KEEP_SCREEN_KEY, keepScreenOn.toString());
    applyKeepScreenOn();
}

function applyDefaultFinishControls() {
    if (defaultFinishInput) defaultFinishInput.value = defaultFinishTime;
}

function setDefaultFinishTime(value) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return;
    defaultFinishTime = value;
    applyDefaultFinishControls();
    persistPref(DEFAULT_FINISH_KEY, defaultFinishTime);
    if (!hasStarted) {
        finishTimeInput.value = defaultFinishTime;
        updateDisplay();
    }
}

function formatHoldSeconds(ms) {
    return (ms / 1000).toFixed(2);
}

function applySkipHoldDuration() {
    document.documentElement.style.setProperty('--skip-hold-ms', `${skipHoldMs}ms`);
    if (skipHoldInput) skipHoldInput.value = formatHoldSeconds(skipHoldMs);
    if (skipHoldMinus) skipHoldMinus.disabled = skipHoldMs <= MIN_SKIP_HOLD_MS;
    if (skipHoldPlus) skipHoldPlus.disabled = skipHoldMs >= MAX_SKIP_HOLD_MS;
    if (skipHoldHint) {
        skipHoldHint.textContent = `Hold DELIVERED for ${formatHoldSeconds(skipHoldMs)}s to log a stuck stop without using its time in Recent, Avg, Best, or Est. Finish. Hold + / − for the same time to snap to the next 5.`;
    }
}

function setSkipHoldMs(value) {
    const parsed = typeof value === 'number' ? value : Math.round(parseFloat(value) * 1000);
    const next = Number.isFinite(parsed)
        ? Math.max(MIN_SKIP_HOLD_MS, Math.min(MAX_SKIP_HOLD_MS, parsed))
        : DEFAULT_SKIP_HOLD_MS;
    skipHoldMs = next;
    applySkipHoldDuration();
    persistPref(SKIP_HOLD_MS_KEY, String(skipHoldMs));
}

function applyHistoryVisibility() {
    document.body.classList.toggle('hide-history', !showHistory);
    if (historyToggle) {
        historyToggle.classList.toggle('on', showHistory);
        historyToggle.setAttribute('aria-checked', showHistory ? 'true' : 'false');
    }
}

function applySkipHoldToggle() {
    if (!skipHoldToggle) return;
    skipHoldToggle.classList.toggle('on', skipHoldEnabled);
    skipHoldToggle.setAttribute('aria-checked', skipHoldEnabled ? 'true' : 'false');
}

function toggleSkipHold() {
    skipHoldEnabled = !skipHoldEnabled;
    applySkipHoldToggle();
    try {
        localStorage.setItem(SKIP_HOLD_KEY, skipHoldEnabled.toString());
    } catch (e) {
        // Ignore storage errors
    }
}

function toggleShowHistory() {
    showHistory = !showHistory;
    applyHistoryVisibility();
    try {
        localStorage.setItem(SHOW_HISTORY_KEY, showHistory.toString());
    } catch (e) {
        // Ignore storage errors
    }
}

function applyRecentWindowControls() {
    if (!recentWindowInput) return;
    recentWindowInput.value = String(recentWindow);
    if (recentWindowMinus) recentWindowMinus.disabled = recentWindow <= MIN_RECENT_WINDOW;
    if (recentWindowPlus) recentWindowPlus.disabled = recentWindow >= MAX_RECENT_WINDOW;
}

function setRecentWindow(value) {
    const parsed = parseInt(value, 10);
    const next = Number.isFinite(parsed)
        ? Math.max(MIN_RECENT_WINDOW, Math.min(MAX_RECENT_WINDOW, parsed))
        : DEFAULT_RECENT_WINDOW;
    recentWindow = next;
    applyRecentWindowControls();
    try {
        localStorage.setItem(RECENT_WINDOW_KEY, String(recentWindow));
    } catch (e) {
        // Ignore storage errors
    }
    updateDisplay();
}

function showSettings() {
    settingsOverlay.classList.add('visible');
}

function hideSettings() {
    settingsOverlay.classList.remove('visible');
}

// Event listeners
pauseBtn.addEventListener('click', togglePause);
resetBtn.addEventListener('click', showResetConfirm);
undoBtn.addEventListener('click', undoLast);
addTimeBtn.addEventListener('click', showAddTimeDialog);
if (sprintBtn) sprintBtn.addEventListener('click', onSprintBtnClick);
if (sprintModeToggle) {
    sprintModeToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('.sprint-mode-btn');
        if (!btn || overlayMode !== 'sprintPicker') return;
        renderSprintPicker(btn.dataset.sprintMode);
    });
}
if (sprintSection) {
    sprintSection.addEventListener('click', () => {
        if (isSprintActive()) completeSprint(true);
    });
    sprintSection.addEventListener('keydown', (e) => {
        if (!isSprintActive()) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            completeSprint(true);
        }
    });
}
settingsBtn.addEventListener('click', showSettings);
settingsClose.addEventListener('click', hideSettings);
confirmClose.addEventListener('click', hideResetConfirm);
settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) {
        hideSettings();
    }
});
historyToggle.addEventListener('click', toggleShowHistory);
if (paceChartToggle) paceChartToggle.addEventListener('click', togglePaceChart);
if (paceChartSvg) {
    let pacePointer = null;
    const endPacePointer = (e) => {
        if (pacePointer === null) return;
        if (e && typeof e.pointerId === 'number' && e.pointerId !== pacePointer) return;
        pacePointer = null;
        if (paceScrubTimer) clearTimeout(paceScrubTimer);
        paceScrubTimer = setTimeout(clearPaceScrub, 1400);
    };
    paceChartSvg.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        pacePointer = e.pointerId;
        if (paceScrubTimer) clearTimeout(paceScrubTimer);
        if (e.cancelable) e.preventDefault();
        try {
            paceChartSvg.setPointerCapture(e.pointerId);
        } catch (err) {
            // Capture is optional
        }
        scrubPaceChart(e.clientX);
    });
    paceChartSvg.addEventListener('pointermove', (e) => {
        if (pacePointer === null || e.pointerId !== pacePointer) return;
        scrubPaceChart(e.clientX);
    });
    paceChartSvg.addEventListener('pointerup', endPacePointer);
    paceChartSvg.addEventListener('pointercancel', endPacePointer);
}
skipHoldToggle.addEventListener('click', toggleSkipHold);
keepScreenToggle.addEventListener('click', toggleKeepScreenOn);
hapticsToggle.addEventListener('click', toggleHaptics);
if (decimalToggle) decimalToggle.addEventListener('click', toggleDecimalMode);
minimalToggle.addEventListener('click', toggleMinimalMode);
document.querySelectorAll('.settings-row-toggle').forEach((row) => {
    row.addEventListener('click', (e) => {
        if (e.target.closest('.settings-switch')) return;
        const sw = row.querySelector('.settings-switch');
        if (sw) sw.click();
    });
});
defaultFinishInput.addEventListener('change', () => setDefaultFinishTime(defaultFinishInput.value));
skipHoldMinus.addEventListener('click', () => setSkipHoldMs(skipHoldMs - SKIP_HOLD_STEP_MS));
skipHoldPlus.addEventListener('click', () => setSkipHoldMs(skipHoldMs + SKIP_HOLD_STEP_MS));
skipHoldInput.addEventListener('change', function() {
    setSkipHoldMs(skipHoldInput.value);
});
skipHoldInput.addEventListener('blur', function() {
    applySkipHoldDuration();
});
recentWindowMinus.addEventListener('click', () => setRecentWindow(recentWindow - 1));
recentWindowPlus.addEventListener('click', () => setRecentWindow(recentWindow + 1));
recentWindowInput.addEventListener('input', function() {
    const digits = recentWindowInput.value.replace(/\D/g, '').slice(0, 3);
    if (recentWindowInput.value !== digits) {
        recentWindowInput.value = digits;
    }
    if (digits) {
        setRecentWindow(digits);
    }
});
recentWindowInput.addEventListener('blur', function() {
    if (!recentWindowInput.value) {
        setRecentWindow(DEFAULT_RECENT_WINDOW);
    } else {
        applyRecentWindowControls();
    }
});
targetInput.addEventListener('input', function() {
    const digits = targetInput.value.replace(/\D/g, '').slice(0, 3);
    if (targetInput.value !== digits) {
        targetInput.value = digits;
    }
    updateDisplay();
    checkSprintComplete();
});
finishTimeInput.addEventListener('input', updateDisplay);
themeToggle.addEventListener('click', toggleTheme);
const slateToggle = $('slateToggle');
if (slateToggle) slateToggle.addEventListener('click', toggleSlate);
soundToggle.addEventListener('click', toggleSound);
bindSplitHold(splitMinus, -1);
bindSplitHold(splitPlus, 1);

// Tap any rate display to toggle stops/hr â†” min/stp
bindRateToggle($('rateStat'));
bindRateToggle(paceCurrentEl);
bindRateToggle(paceNeededEl);

let listRateTouchHandled = false;
function handleListRateToggle(e) {
    if (!e.target.closest('.rate-toggle')) return false;
    e.stopPropagation();
    if (e.type === 'touchstart') {
        listRateTouchHandled = true;
        e.preventDefault();
        toggleRateUnit();
        setTimeout(() => { listRateTouchHandled = false; }, 300);
    } else if (!listRateTouchHandled) {
        toggleRateUnit();
    } else {
        e.preventDefault();
    }
    return true;
}
historyListEl.addEventListener('touchstart', handleListRateToggle, { passive: false });
historyListEl.addEventListener('click', handleListRateToggle);

// Minimal mode toggle on title click
let titleTouchHandled = false;
if (titleEl) {
    titleEl.addEventListener('touchstart', function(e) {
        titleTouchHandled = true;
        e.preventDefault();
        toggleMinimalMode();
        setTimeout(() => { titleTouchHandled = false; }, 300);
    }, { passive: false });

    titleEl.addEventListener('click', function(e) {
        if (titleTouchHandled) {
            e.preventDefault();
            return;
        }
        toggleMinimalMode();
    });
}

// Touch event handlers to prevent double-firing on mobile
let startTouchHandled = false;
let deliveredPointerDown = false;
let skipHoldTimer = null;
let skipHoldCompleted = false;

startBtn.addEventListener('touchstart', function(e) {
    if (hasStarted) return; // Prevent starting twice
    startTouchHandled = true;
    e.preventDefault();
    startSession();
    setTimeout(() => { startTouchHandled = false; }, 300);
}, { passive: false });

startBtn.addEventListener('click', function(e) {
    if (startTouchHandled) {
        e.preventDefault();
        return;
    }
    if (hasStarted) return; // Prevent starting twice
    startSession();
});

function clearSkipHoldTimer() {
    if (skipHoldTimer !== null) {
        clearTimeout(skipHoldTimer);
        skipHoldTimer = null;
    }
    deliveredBtn.classList.remove('is-holding');
}

function onDeliveredPointerDown(e) {
    if (jumpEditorOpen) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.cancelable) e.preventDefault();
    deliveredPointerDown = true;
    skipHoldCompleted = false;
    unlockAudio();
    try {
        deliveredBtn.setPointerCapture(e.pointerId);
    } catch (err) {
        // Capture is optional
    }
    if (!skipHoldEnabled) {
        recordDelivery(false);
        return;
    }
    deliveredBtn.classList.add('is-holding');
    skipHoldTimer = setTimeout(() => {
        skipHoldTimer = null;
        skipHoldCompleted = true;
        deliveredBtn.classList.remove('is-holding');
        recordDelivery(true);
    }, skipHoldMs);
}

function onDeliveredPointerUp(e) {
    if (!deliveredPointerDown) return;
    deliveredPointerDown = false;
    if (!skipHoldEnabled) return;
    if (skipHoldCompleted) return;
    clearSkipHoldTimer();
    recordDelivery(false);
}

function onDeliveredPointerCancel() {
    deliveredPointerDown = false;
    skipHoldCompleted = false;
    clearSkipHoldTimer();
}

deliveredBtn.addEventListener('pointerdown', onDeliveredPointerDown);
deliveredBtn.addEventListener('pointerup', onDeliveredPointerUp);
deliveredBtn.addEventListener('pointercancel', onDeliveredPointerCancel);
deliveredBtn.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});
deliveredBtn.addEventListener('click', function(e) {
    e.preventDefault();
});

if (deliveryNumBtn) {
    deliveryNumBtn.addEventListener('click', function(e) {
        e.preventDefault();
        openJumpEditor();
    });
}

if (deliveryJumpForm) {
    deliveryJumpForm.addEventListener('submit', function(e) {
        e.preventDefault();
        applyJumpFromInput();
    });
}

if (deliveryJumpInput) {
    deliveryJumpInput.addEventListener('input', function() {
        const digits = deliveryJumpInput.value.replace(/\D/g, '').slice(0, 4);
        if (deliveryJumpInput.value !== digits) deliveryJumpInput.value = digits;
        if (!jumpEditorOpen) return;
        const current = currentDeliveryNumber();
        showJumpNote(`Higher than #${current}. This stop's time is split across each one.`, false);
    });
    deliveryJumpInput.addEventListener('blur', function() {
        setTimeout(function() {
            if (!jumpEditorOpen || jumpApplying) return;
            const active = document.activeElement;
            if (active === deliveryJumpInput || active === deliveryJumpGo) return;
            closeJumpEditor();
        }, 250);
    });
}

confirmOverlay.addEventListener('click', function(e) {
    if (e.target === confirmOverlay) {
        hideResetConfirm();
    }
});

// Handle page visibility changes - recalculate times when returning to app
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        applyKeepScreenOn();
        if (hasStarted) {
            calculateElapsedTimes();
            checkSprintComplete();
            updateDisplay();
            updateHistory();
            startTicker();
        }
    }
});

// Also handle when app regains focus (backup for some mobile browsers)
window.addEventListener('focus', function() {
    if (hasStarted) {
        calculateElapsedTimes();
        checkSprintComplete();
        updateDisplay();
        startTicker();
    }
});

// Save state before page unload
window.addEventListener('beforeunload', function() {
    saveTimerState();
    stopTicker();
});

// Also save state when page becomes hidden (mobile Chrome/Safari)
window.addEventListener('pagehide', function() {
    saveTimerState();
});

// Load saved preferences
const savedTheme = localStorage.getItem('deliveryTimerTheme');
if (savedTheme === 'light') {
    theme = 'light';
} else if (savedTheme === 'slate') {
    slateOn = true;
    theme = 'dark';
} else {
    theme = 'dark';
}
if (localStorage.getItem('deliveryTimerSlate') === 'true') {
    slateOn = true;
}
applyTheme();

if (localStorage.getItem('deliveryTimerSound') === 'false') {
    soundEnabled = false;
}
applySoundIcons();

if (localStorage.getItem('deliveryTimerMinimalMode') === 'true') {
    isMinimalMode = true;
}
applyMinimalMode();

if (localStorage.getItem(RATE_UNIT_KEY) === 'perStop') {
    rateUnit = 'perStop';
}

if (localStorage.getItem(SHOW_HISTORY_KEY) === 'false') {
    showHistory = false;
}
applyHistoryVisibility();

if (localStorage.getItem(SHOW_PACE_CHART_KEY) === 'false') {
    showPaceChart = false;
}
applyPaceChartToggle();

if (localStorage.getItem(SKIP_HOLD_KEY) === 'false') {
    skipHoldEnabled = false;
}
applySkipHoldToggle();

if (localStorage.getItem(KEEP_SCREEN_KEY) === 'false') {
    keepScreenOn = false;
}
applyKeepScreenOn();

if (localStorage.getItem(HAPTICS_KEY) === 'false') {
    hapticsEnabled = false;
}
applyHapticsToggle();

if (localStorage.getItem(DECIMAL_MODE_KEY) === 'true') {
    decimalMode = true;
}
applyDecimalToggle();

const savedFinish = localStorage.getItem(DEFAULT_FINISH_KEY);
if (savedFinish && /^\d{2}:\d{2}$/.test(savedFinish)) {
    defaultFinishTime = savedFinish;
}
applyDefaultFinishControls();

const savedHoldMs = parseInt(localStorage.getItem(SKIP_HOLD_MS_KEY), 10);
if (Number.isFinite(savedHoldMs)) {
    skipHoldMs = Math.max(MIN_SKIP_HOLD_MS, Math.min(MAX_SKIP_HOLD_MS, savedHoldMs));
}
applySkipHoldDuration();

const savedRecentWindow = parseInt(localStorage.getItem(RECENT_WINDOW_KEY), 10);
if (Number.isFinite(savedRecentWindow)) {
    recentWindow = Math.max(MIN_RECENT_WINDOW, Math.min(MAX_RECENT_WINDOW, savedRecentWindow));
}
applyRecentWindowControls();

// Restore timer state from localStorage if available
// This allows the timer to persist across page closes and phone sleep
function initializeFromSavedState() {
    if (loadTimerState()) {
        // State was restored - update UI to match
        startBtn.classList.add('hidden');
        deliveredBtn.classList.remove('hidden');
        pauseBtn.classList.remove('hidden');
        addTimeBtn.classList.add('hidden');
        
        // Restore pause button state
        if (!isRunning) {
            pauseBtn.textContent = 'RESUME';
            pauseBtn.classList.add('paused');
            currentTimeEl.classList.add('paused');
        }

        if (pausedForSprintPicker) {
            resumeAfterSprintPicker();
        }
        
        // Calculate current times from timestamps
        calculateElapsedTimes();
        
        startTicker();

        applyDefaultFinishTime();
        
        // Update display and history
        updateDisplay();
        updateHistory();
        updateSplitControls();

        if (pendingSprintResults) {
            showSprintResults(
                pendingSprintResults.stops,
                pendingSprintResults.elapsedSeconds,
                pendingSprintResults.endedEarly
            );
        } else {
            checkSprintComplete();
        }
        
        return true;
    }
    return false;
}

function applyDefaultFinishTime() {
    if (!finishTimeInput.value) {
        finishTimeInput.value = defaultFinishTime;
    }
}

// Try to restore saved state, otherwise just update display
if (!initializeFromSavedState()) {
    applyDefaultFinishTime();
    updateDisplay();
}

if (appVersionLabel) appVersionLabel.textContent = `Version ${APP_VERSION}`;
maybeShowWhatsNew();

if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
        const checkForUpdate = () => reg.update().catch(() => {});
        checkForUpdate();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') checkForUpdate();
        });
    }).catch(() => {});
}

window.addEventListener('pointerdown', () => {
    if (keepScreenOn) requestScreenWakeLock();
});

window.addEventListener('resize', () => {
    paceChartSignature = '';
    renderPaceChart();
});
