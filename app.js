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
let bestTime = Infinity;
let isDark = true;
let soundEnabled = true;
let audioContext = null;
let splitCount = 1;
let isMinimalMode = false;
let rateUnit = 'perHour'; // 'perHour' | 'perStop'
let addedTimeMs = 0; // Extra time added for late starts (baked into timestamps once started)

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
const summaryStats = $('summaryStats');
const newRecord = $('newRecord');
const themeToggle = $('themeToggle');
const soundToggle = $('soundToggle');
const estimateTime = $('estimateTime');
const splitRow = $('splitRow');
const splitMinus = $('splitMinus');
const splitPlus = $('splitPlus');
const splitValue = $('splitValue');
const titleEl = document.querySelector('.header h1');
const addTimeBtn = $('addTimeBtn');

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
        deliveries = state.deliveries || [];
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

    confirmButtons.innerHTML = `
        <div style="width:100%">
            <div class="add-time-chips">
                <button type="button" class="add-time-chip" data-mins="1">+1 min</button>
                <button type="button" class="add-time-chip" data-mins="5">+5 min</button>
                <button type="button" class="add-time-chip" data-mins="10">+10 min</button>
            </div>
            <div class="add-time-custom">
                <input type="number" class="add-time-input" id="addTimeCustomInput" min="1" max="999" step="1" inputmode="numeric" pattern="[0-9]*" placeholder="min">
                <button type="button" class="add-time-apply" id="addTimeCustomBtn">Add</button>
            </div>
            <button type="button" class="confirm-btn confirm-cancel" id="addTimeCloseBtn" style="width:100%">Done</button>
        </div>
    `;
    confirmOverlay.classList.add('visible');

    const customInput = document.getElementById('addTimeCustomInput');
    const customBtn = document.getElementById('addTimeCustomBtn');

    confirmButtons.querySelectorAll('.add-time-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const current = parseInt(customInput.value, 10) || 0;
            const next = Math.min(999, current + Number(btn.dataset.mins));
            customInput.value = String(next);
        });
    });

    const applyCustom = () => {
        const mins = parseInt(customInput.value, 10);
        if (!mins || mins <= 0) return;
        addSeconds(mins * 60);
        customInput.value = '';
    };
    customBtn.addEventListener('click', applyCustom);
    customInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyCustom();
        }
    });
    document.getElementById('addTimeCloseBtn').addEventListener('click', hideResetConfirm);
}

// Initialize audio context
function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
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
    splitRow.classList.toggle('hidden', !hasStarted);
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
    return deliveries.reduce((sum, time) => sum + time, 0);
}

// Calculate overall rate (deliveries per hour) based on total elapsed time
function getOverallRate() {
    if (deliveries.length === 0 || totalSeconds === 0) return 0;
    const hours = totalSeconds / 3600;
    return deliveries.length / hours;
}

// Calculate rate for last N deliveries
function getRecentRate(n = 7) {
    if (deliveries.length === 0) return 0;
    const recentDeliveries = deliveries.slice(-n);
    const recentTime = recentDeliveries.reduce((sum, time) => sum + time, 0);
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

// Update estimated finish time based on recent pace (last 7 deliveries)
function updateEstimate() {
    const target = getTarget();
    const remaining = target - deliveries.length;
    const recentRate = getRecentRate(7);

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
    const recentRate = getRecentRate(7);

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

    const overallRate = getOverallRate();
    const recentRate = getRecentRate(7);
    
    if (deliveries.length > 0 && totalSeconds > 0) {
        perHourEl.textContent = formatRate(overallRate);
        
        const avgSeconds = Math.round(getDeliveryTimeSum() / deliveries.length);
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

    historyListEl.innerHTML = deliveries.slice().reverse().slice(0, 15).map((time, idx) => {
        const num = deliveries.length - idx;
        const singleRate = getSingleDeliveryRate(time);
        const timeClass = getTimeClass(time);

        return `<div class="history-item">
            <span class="num">#${num}</span>
            <span class="time ${timeClass}">${formatTime(time)}</span>
            <span class="rate rate-toggle">${formatRate(singleRate)}</span>
        </div>`;
    }).join('');
}

// Timer tick function - called every second to update display
// Actual time tracking is now timestamp-based for persistence
function tick() {
    calculateElapsedTimes();
    updateDisplay();
    
    // Periodically save state (every 5 seconds to reduce writes)
    if (totalSeconds % 5 === 0) {
        saveTimerState();
    }
}

// Start tracking session
function startSession() {
    if (hasStarted) return; // Prevent starting multiple times
    
    const now = Date.now();
    
    hasStarted = true;
    isRunning = true;
    sessionStartTimestamp = now - addedTimeMs;
    deliveryStartTimestamp = now - addedTimeMs;
    addedTimeMs = 0; // Already baked into timestamps
    totalPausedMs = 0;
    deliveryPausedMs = 0;
    pauseStartTimestamp = null;
    
    // Initialize audio context on first user interaction
    initAudio();
    
    startBtn.classList.add('hidden');
    deliveredBtn.classList.remove('hidden');
    pauseBtn.classList.remove('hidden');
    addTimeBtn.classList.add('hidden');
    hideResetConfirm();
    
    if (intervalId) {
        clearInterval(intervalId); // Clear any existing interval
    }
    intervalId = setInterval(tick, 1000);
    
    // Save state immediately
    saveTimerState();
    updateDisplay();
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
}

// Record a delivery
function recordDelivery() {
    // Calculate current time first
    calculateElapsedTimes();
    
    if (currentSeconds === 0) return;

    const splitTimes = splitDeliveryTimes(currentSeconds, splitCount);
    const hadPrevious = deliveries.length > 0;
    let hitNewRecord = false;

    // Flash green animation
    currentTimeEl.classList.remove('flash-green');
    void currentTimeEl.offsetWidth;
    currentTimeEl.classList.add('flash-green');

    // Play sound
    playDeliverySound();

    splitTimes.forEach(time => {
        const isNewRecord = time < bestTime && hadPrevious;
        
        if (time < bestTime) {
            bestTime = time;
        }
        
        if (isNewRecord) {
            hitNewRecord = true;
        }

        deliveries.push(time);
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

    if (navigator.vibrate) {
        navigator.vibrate(30);
    }
}

// Undo last delivery
function undoLast() {
    if (deliveries.length === 0) return;

    const lastDeliveryTime = deliveries.pop();
    
    // Adjust delivery start timestamp backwards to include the undone delivery time
    // This effectively adds the time back to the current delivery
    deliveryStartTimestamp -= (lastDeliveryTime * 1000);
    
    // Recalculate
    calculateElapsedTimes();
    
    if (deliveries.length > 0) {
        bestTime = Math.min(...deliveries);
    } else {
        bestTime = Infinity;
    }
    
    saveTimerState();
    updateDisplay();
    updateHistory();

    if (navigator.vibrate) {
        navigator.vibrate(20);
    }
}

// Show reset confirmation dialog
function showResetConfirm() {
    confirmTitle.textContent = 'Reset All Data?';
    confirmText.textContent = 'This will clear all deliveries and times. This cannot be undone.';
    summaryStats.style.display = 'none';
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
    confirmOverlay.classList.remove('visible');
}

// Reset all data
function resetAll() {
    hideResetConfirm();
    
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }

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
    currentTimeEl.classList.remove('paused', 'flash-green');
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

// Toggle dark/light theme
function toggleTheme() {
    isDark = !isDark;
    document.body.classList.toggle('dark', isDark);
    document.body.classList.toggle('light', !isDark);
    themeToggle.textContent = isDark ? '🌙' : '☀️';
    localStorage.setItem('deliveryTimerTheme', isDark ? 'dark' : 'light');
}

// Toggle sound
function toggleSound() {
    soundEnabled = !soundEnabled;
    soundToggle.textContent = soundEnabled ? '🔊' : '🔇';
    soundToggle.classList.toggle('muted', !soundEnabled);
    localStorage.setItem('deliveryTimerSound', soundEnabled.toString());
}

// Toggle minimal mode
function toggleMinimalMode() {
    isMinimalMode = !isMinimalMode;
    document.body.classList.toggle('minimal-mode', isMinimalMode);
    localStorage.setItem('deliveryTimerMinimalMode', isMinimalMode.toString());
}

// Event listeners
pauseBtn.addEventListener('click', togglePause);
resetBtn.addEventListener('click', showResetConfirm);
undoBtn.addEventListener('click', undoLast);
addTimeBtn.addEventListener('click', showAddTimeDialog);
targetInput.addEventListener('input', updateDisplay);
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
let deliveredTouchHandled = false;

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

deliveredBtn.addEventListener('touchstart', function(e) {
    deliveredTouchHandled = true;
    e.preventDefault();
    recordDelivery();
    setTimeout(() => { deliveredTouchHandled = false; }, 300);
}, { passive: false });

deliveredBtn.addEventListener('click', function(e) {
    if (deliveredTouchHandled) {
        e.preventDefault();
        return;
    }
    recordDelivery();
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
    }
});

// Also handle when app regains focus (backup for some mobile browsers)
window.addEventListener('focus', function() {
    if (hasStarted) {
        calculateElapsedTimes();
        updateDisplay();
    }
});

// Save state before page unload
window.addEventListener('beforeunload', function() {
    saveTimerState();
    if (intervalId) {
        clearInterval(intervalId);
    }
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
    themeToggle.textContent = '☀️';
}

if (localStorage.getItem('deliveryTimerSound') === 'false') {
    soundEnabled = false;
    soundToggle.textContent = '🔇';
    soundToggle.classList.add('muted');
}

if (localStorage.getItem('deliveryTimerMinimalMode') === 'true') {
    isMinimalMode = true;
    document.body.classList.add('minimal-mode');
}

if (localStorage.getItem(RATE_UNIT_KEY) === 'perStop') {
    rateUnit = 'perStop';
}

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
        
        // Start the display update interval
        if (intervalId) {
            clearInterval(intervalId);
        }
        intervalId = setInterval(tick, 1000);
        
        // Update display and history
        updateDisplay();
        updateHistory();
        updateSplitControls();
        
        return true;
    }
    return false;
}

// Try to restore saved state, otherwise just update display
if (!initializeFromSavedState()) {
    updateDisplay();
}
