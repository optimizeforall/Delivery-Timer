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
let isDark = true;
let soundEnabled = true;
let audioContext = null;
let splitCount = 1;
let isMinimalMode = false;
let rateUnit = 'perHour'; // 'perHour' | 'perStop'
let addedTimeMs = 0; // Extra time added for late starts (baked into timestamps once started)
let showHistory = true;
let recentWindow = 7;
let skipHoldEnabled = true;

// Timestamp-based tracking for persistence across tab close/phone sleep
let sessionStartTimestamp = null;     // When session started (for total time)
let deliveryStartTimestamp = null;    // When current delivery started
let totalPausedMs = 0;                // Total paused duration for session
let deliveryPausedMs = 0;             // Paused duration for current delivery
let pauseStartTimestamp = null;       // When pause started (null if not paused)

const MIN_SPLIT_COUNT = 1;
const MAX_SPLIT_COUNT = 99;
const STATE_STORAGE_KEY = 'deliveryTimerState';
const RATE_UNIT_KEY = 'deliveryTimerRateUnit';
const SHOW_HISTORY_KEY = 'deliveryTimerShowHistory';
const RECENT_WINDOW_KEY = 'deliveryTimerRecentWindow';
const SKIP_HOLD_KEY = 'deliveryTimerSkipHold';
const DEFAULT_FINISH_TIME = '15:30';
const DEFAULT_RECENT_WINDOW = 7;
const MIN_RECENT_WINDOW = 1;
const MAX_RECENT_WINDOW = 999;
const SKIP_HOLD_MS = 850;

// DOM elements
const $ = id => document.getElementById(id);
const currentTimeEl = $('currentTime');
const totalTimeEl = $('totalTime');
const deliveryNumEl = $('deliveryNum');
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
const settingsBtn = $('settingsBtn');
const settingsOverlay = $('settingsOverlay');
const settingsClose = $('settingsClose');
const historyToggle = $('historyToggle');
const skipHoldToggle = $('skipHoldToggle');
const recentWindowInput = $('recentWindowInput');
const recentWindowMinus = $('recentWindowMinus');
const recentWindowPlus = $('recentWindowPlus');

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
        
        currentSeconds = Math.max(0, Math.floor(deliveryElapsedMs / 1000));
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
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
}

function showAddTimeDialog() {
    if (hasStarted) return;
    confirmTitle.textContent = 'Add Time';
    confirmText.textContent = 'Add time you already worked before starting the timer.';
    summaryStats.style.display = 'none';
    summaryStats.innerHTML = '';
    confirmClose.classList.remove('hidden');

    confirmButtons.innerHTML = `
        <div style="width:100%">
            <div class="add-time-chips">
                <button type="button" class="add-time-chip" data-mins="1">+1 min</button>
                <button type="button" class="add-time-chip" data-mins="5">+5 min</button>
                <button type="button" class="add-time-chip" data-mins="10">+10 min</button>
            </div>
            <div class="add-time-custom">
                <input type="number" class="add-time-input" id="addTimeCustomInput" min="1" max="999" step="1" inputmode="numeric" pattern="[0-9]*" placeholder="min">
            </div>
            <button type="button" class="confirm-btn confirm-done" id="addTimeApplyBtn" style="width:100%">Add</button>
        </div>
    `;
    confirmOverlay.classList.add('visible');

    const customInput = document.getElementById('addTimeCustomInput');
    const applyBtn = document.getElementById('addTimeApplyBtn');

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
            addSeconds(mins * 60);
        }
        hideResetConfirm();
    };
    applyBtn.addEventListener('click', applyCustom);
    customInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyCustom();
        }
    });
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
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (includeHours || hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
    refreshRateDisplays();
}

function refreshRateDisplays() {
    updateDisplay();
    updateHistory();

    const summaryRate = summaryStats && summaryStats.querySelector('.rate-toggle');
    if (confirmOverlay.classList.contains('visible') && summaryRate) {
        summaryRate.textContent = formatRate(getOverallRate());
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
        return {
            time: Number.isFinite(time) ? time : 0,
            skipped: !!d.skipped
        };
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

function splitDeliveryTimes(totalSeconds, count) {
    const safeCount = Math.max(MIN_SPLIT_COUNT, Math.min(count, Math.max(totalSeconds, MIN_SPLIT_COUNT)));
    const base = Math.floor(totalSeconds / safeCount);
    const remainder = totalSeconds % safeCount;
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
    if (target < new Date()) {
        target.setDate(target.getDate() + 1);
    }
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
            paceNeededEl.textContent = 'LATE';
            paceNeededEl.classList.remove('pace-ahead', 'pace-needed');
            paceNeededEl.classList.add('pace-behind');
            statusBadge.textContent = 'BEHIND';
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
    currentTimeEl.textContent = formatTime(currentSeconds);
    totalTimeEl.textContent = formatTime(totalSeconds, true);
    deliveryNumEl.textContent = `#${deliveries.length + 1}`;
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

    undoBtn.disabled = deliveries.length === 0;
    
    updateSplitControls();
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
            <span class="time ${timeClass}">${formatTime(time)}</span>
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
    const fire = () => {
        tick();
        if (!hasStarted) return;
        intervalId = setTimeout(fire, msUntilNextWholeSecond());
    };
    intervalId = setTimeout(fire, msUntilNextWholeSecond());
}

function tick() {
    calculateElapsedTimes();
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
        
        // Add paused duration to totals
        if (pauseStartTimestamp !== null) {
            const pausedDuration = now - pauseStartTimestamp;
            totalPausedMs += pausedDuration;
            deliveryPausedMs += pausedDuration;
            pauseStartTimestamp = null;
        }
        
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
    
    if (currentSeconds === 0) return;

    const splitTimes = splitDeliveryTimes(currentSeconds, splitCount);
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

    splitTimes.forEach(time => {
        if (!skipped) {
            const isNewRecord = time < bestTime && countedBefore > 0;
            if (time < bestTime) {
                bestTime = time;
            }
            if (isNewRecord) {
                hitNewRecord = true;
            }
        }
        deliveries.push({ time, skipped: !!skipped });
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
        if (pauseStartTimestamp !== null) {
            const pausedDuration = now - pauseStartTimestamp;
            totalPausedMs += pausedDuration;
            pauseStartTimestamp = null;
        }
        pauseBtn.textContent = 'PAUSE';
        pauseBtn.classList.remove('paused');
        currentTimeEl.classList.remove('paused');
    }

    setSplitCount(1);
    saveTimerState();
    updateDisplay();
    updateHistory();
    startTicker();

    if (navigator.vibrate) {
        navigator.vibrate(skipped ? 500 : 30);
    }
}

// Undo last delivery
function undoLast() {
    if (deliveries.length === 0) return;

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

    if (navigator.vibrate) {
        navigator.vibrate(20);
    }
}

// Show reset confirmation dialog
function showResetConfirm() {
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
    confirmClose.classList.add('hidden');
    confirmOverlay.classList.remove('visible');
}

// Reset all data
function resetAll() {
    hideResetConfirm();
    
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

function applyThemeIcons() {
    themeToggle.textContent = isDark ? '🌙' : '☀️';
    themeToggle.setAttribute(
        'aria-label',
        isDark ? 'Switch to light theme' : 'Switch to dark theme'
    );
}

// Toggle dark/light theme
function toggleTheme() {
    isDark = !isDark;
    document.body.classList.toggle('dark', isDark);
    document.body.classList.toggle('light', !isDark);
    applyThemeIcons();
    localStorage.setItem('deliveryTimerTheme', isDark ? 'dark' : 'light');
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
function toggleMinimalMode() {
    isMinimalMode = !isMinimalMode;
    document.body.classList.toggle('minimal-mode', isMinimalMode);
    localStorage.setItem('deliveryTimerMinimalMode', isMinimalMode.toString());
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
settingsBtn.addEventListener('click', showSettings);
settingsClose.addEventListener('click', hideSettings);
confirmClose.addEventListener('click', hideResetConfirm);
settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) {
        hideSettings();
    }
});
historyToggle.addEventListener('click', toggleShowHistory);
skipHoldToggle.addEventListener('click', toggleSkipHold);
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
});
finishTimeInput.addEventListener('input', updateDisplay);
themeToggle.addEventListener('click', toggleTheme);
soundToggle.addEventListener('click', toggleSound);
splitMinus.addEventListener('click', () => setSplitCount(splitCount - 1));
splitPlus.addEventListener('click', () => setSplitCount(splitCount + 1));

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
    }, SKIP_HOLD_MS);
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

confirmOverlay.addEventListener('click', function(e) {
    if (e.target === confirmOverlay) {
        hideResetConfirm();
    }
});

// Handle page visibility changes - recalculate times when returning to app
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && hasStarted) {
        // User returned to app - immediately recalculate elapsed times
        calculateElapsedTimes();
        updateDisplay();
        updateHistory();
        startTicker();
    }
});

// Also handle when app regains focus (backup for some mobile browsers)
window.addEventListener('focus', function() {
    if (hasStarted) {
        calculateElapsedTimes();
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
if (localStorage.getItem('deliveryTimerTheme') === 'light') {
    isDark = false;
    document.body.classList.remove('dark');
    document.body.classList.add('light');
}
applyThemeIcons();

if (localStorage.getItem('deliveryTimerSound') === 'false') {
    soundEnabled = false;
}
applySoundIcons();

if (localStorage.getItem('deliveryTimerMinimalMode') === 'true') {
    isMinimalMode = true;
    document.body.classList.add('minimal-mode');
}

if (localStorage.getItem(RATE_UNIT_KEY) === 'perStop') {
    rateUnit = 'perStop';
}

if (localStorage.getItem(SHOW_HISTORY_KEY) === 'false') {
    showHistory = false;
}
applyHistoryVisibility();

if (localStorage.getItem(SKIP_HOLD_KEY) === 'false') {
    skipHoldEnabled = false;
}
applySkipHoldToggle();

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
        
        // Calculate current times from timestamps
        calculateElapsedTimes();
        
        startTicker();

        applyDefaultFinishTime();
        
        // Update display and history
        updateDisplay();
        updateHistory();
        updateSplitControls();
        
        return true;
    }
    return false;
}

function applyDefaultFinishTime() {
    if (!finishTimeInput.value) {
        finishTimeInput.value = DEFAULT_FINISH_TIME;
    }
}

// Try to restore saved state, otherwise just update display
if (!initializeFromSavedState()) {
    applyDefaultFinishTime();
    updateDisplay();
}
