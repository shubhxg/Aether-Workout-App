/**
 * Aetherfit - Application Logic
 * State management, workout logging, Apple activity rings, reminders, and interactive tour
 */

/**************************************************************
 * STATE & STORAGE KEYS
 **************************************************************/
const STORAGE_KEYS = {
    WORKOUTS: 'aetherfit_workouts_v1',
    REMINDER: 'aetherfit_reminder_v1',
    UNIT: 'aetherfit_unit_v1',
    ONBOARDED: 'aetherfit_onboarded_v2',
    TIP_DISMISSED: 'aetherfit_tip_dismissed_v1'
};

const EXERCISE_SUGGESTIONS = [
    'Bench Press',
    'Barbell Squat',
    'Deadlift',
    'Overhead Press',
    'Pull-Ups',
    'Barbell Row',
    'Incline DB Press',
    'Romanian Deadlift',
    'Lat Pulldown',
    'Lateral Raise',
    'Dip',
    'Barbell Curl'
];

const WORKOUT_TEMPLATES = {
    'Push': ['Bench Press', 'Incline DB Press', 'Overhead Press', 'Lateral Raise'],
    'Pull': ['Deadlift', 'Pull-Ups', 'Barbell Row', 'Barbell Curl'],
    'Legs': ['Barbell Squat', 'Romanian Deadlift'],
    'Upper': ['Bench Press', 'Barbell Row', 'Overhead Press', 'Pull-Ups'],
    'Full Body': ['Barbell Squat', 'Bench Press', 'Pull-Ups', 'Overhead Press']
};

const SET_CODES = ['1', 'W', 'F']; // Working (numbered), Warmup (W), Failure (F)

let weightUnit = localStorage.getItem(STORAGE_KEYS.UNIT) || 'kg';
let workouts = [];
let activeExercises = [];
let expandedWorkouts = new Set();

let reminderConfig = {
    enabled: true,
    time: '18:30',
    message: "Time to close your rings and log today's workout.",
    sound: true,
    lastTriggeredDate: ''
};

/**************************************************************
 * DATE, TIME & AUDIO HELPERS
 **************************************************************/
function getTodayISO(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getNowTimeHHMM() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function format12HourTime(hhmm) {
    if (!hhmm) return '6:30 PM';
    const [hStr, mStr] = hhmm.split(':');
    let h = parseInt(hStr, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${mStr} ${ampm}`;
}

function formatAppleDate(isoDate) {
    if (!isoDate) return '';
    const today = getTodayISO();
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    if (isoDate === today) return 'Today';
    if (isoDate === getTodayISO(yest)) return 'Yesterday';

    const [y, m, d] = isoDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function uid() {
    return 'id_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

// Subtle Apple Watch / iOS Haptic-like Dual Tone Chime
function playAppleChime() {
    if (!reminderConfig.sound) return;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        // Clean two-note fifth interval (G5 -> D6)
        const freqs = [783.99, 1174.66];
        freqs.forEach((f, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, now + i * 0.11);

            gain.gain.setValueAtTime(0.0001, now + i * 0.11);
            gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.11 + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.11 + 0.45);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + i * 0.11);
            osc.stop(now + i * 0.11 + 0.48);
        });
    } catch (e) {}
}

/**************************************************************
 * SAMPLE HISTORY & PREVIOUS LIFT LOOKUP
 **************************************************************/
function getDefaultWorkouts() {
    const d1 = new Date();
    d1.setDate(d1.getDate() - 1);
    const d2 = new Date();
    d2.setDate(d2.getDate() - 3);

    return [
        {
            id: 'w_sample_1',
            title: 'Upper Body Strength',
            date: getTodayISO(d1),
            time: '18:15',
            duration: 55,
            notes: 'Smooth bar speed on top bench set.',
            exercises: [
                {
                    id: 'ex_1',
                    name: 'Bench Press',
                    sets: [
                        { id: 's1', weight: 60, reps: 10, type: 'Warmup', done: true },
                        { id: 's2', weight: 85, reps: 8, type: 'Working', done: true },
                        { id: 's3', weight: 90, reps: 6, type: 'Working', done: true }
                    ]
                },
                {
                    id: 'ex_2',
                    name: 'Barbell Row',
                    sets: [
                        { id: 's4', weight: 75, reps: 10, type: 'Working', done: true },
                        { id: 's5', weight: 80, reps: 8, type: 'Working', done: true }
                    ]
                },
                {
                    id: 'ex_3',
                    name: 'Overhead Press',
                    sets: [
                        { id: 's6', weight: 50, reps: 8, type: 'Working', done: true },
                        { id: 's7', weight: 52.5, reps: 6, type: 'Failure', done: true }
                    ]
                }
            ]
        },
        {
            id: 'w_sample_2',
            title: 'Lower Body Power',
            date: getTodayISO(d2),
            time: '17:30',
            duration: 60,
            notes: 'Focused on depth and controlled tempo.',
            exercises: [
                {
                    id: 'ex_4',
                    name: 'Barbell Squat',
                    sets: [
                        { id: 's8', weight: 80, reps: 8, type: 'Warmup', done: true },
                        { id: 's9', weight: 115, reps: 5, type: 'Working', done: true },
                        { id: 's10', weight: 120, reps: 5, type: 'Working', done: true }
                    ]
                },
                {
                    id: 'ex_5',
                    name: 'Romanian Deadlift',
                    sets: [
                        { id: 's11', weight: 95, reps: 10, type: 'Working', done: true },
                        { id: 's12', weight: 100, reps: 8, type: 'Working', done: true }
                    ]
                }
            ]
        }
    ];
}

// Find previous performance for an exercise & set index to display in the "PREV" column
function getPreviousSetString(exerciseName, setIndex) {
    const norm = exerciseName.trim().toLowerCase();
    for (const w of workouts) {
        const matchEx = w.exercises.find(e => e.name.trim().toLowerCase() === norm);
        if (matchEx && matchEx.sets[setIndex]) {
            const s = matchEx.sets[setIndex];
            return `${s.weight}×${s.reps}`;
        }
    }
    return '—';
}

/**************************************************************
 * INITIALIZATION
 **************************************************************/
function initApp() {
    // Header Date (e.g. WEDNESDAY, OCT 14)
    const now = new Date();
    document.getElementById('ios-header-date').textContent = now.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
    }).toUpperCase();

    // Load Workouts
    const rawWorkouts = localStorage.getItem(STORAGE_KEYS.WORKOUTS);
    if (rawWorkouts) {
        try {
            workouts = JSON.parse(rawWorkouts);
        } catch (e) {
            workouts = getDefaultWorkouts();
        }
    } else {
        workouts = getDefaultWorkouts();
        persistWorkouts();
    }

    if (workouts.length > 0) {
        expandedWorkouts.add(workouts[0].id);
    }

    // Load Reminder Config
    const rawReminder = localStorage.getItem(STORAGE_KEYS.REMINDER);
    if (rawReminder) {
        try {
            reminderConfig = { ...reminderConfig, ...JSON.parse(rawReminder) };
        } catch (e) {}
    }

    renderSuggestionPills();
    resetLoggerToDefault();
    syncUnitDisplay();
    refreshSummaryAndHistory();
    syncReminderHeaderUI();

    // Check if Quick Tip Banner was dismissed previously
    if (localStorage.getItem(STORAGE_KEYS.TIP_DISMISSED) === '1') {
        const tipBanner = document.getElementById('quick-tip-banner');
        if (tipBanner) tipBanner.classList.add('hidden');
    }

    // Show Apple "Welcome to Fitness" onboarding sheet on first visit
    if (!localStorage.getItem(STORAGE_KEYS.ONBOARDED)) {
        setTimeout(() => {
            openWelcomeSheet();
        }, 350);
    }

    // Check reminder every second for accurate daily notification trigger
    setInterval(evaluateReminderTick, 1000);
    window.addEventListener('resize', () => {
        if (activeTourIndex >= 0) positionTourSpotlight();
    });
}

function persistWorkouts() {
    localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(workouts));
}

function persistReminder() {
    localStorage.setItem(STORAGE_KEYS.REMINDER, JSON.stringify(reminderConfig));
}

/**************************************************************
 * SEGMENTED VIEW SWITCHER
 **************************************************************/
function switchSegment(view) {
    const logView = document.getElementById('view-log');
    const historyView = document.getElementById('view-history');
    const btnLog = document.getElementById('seg-btn-log');
    const btnHistory = document.getElementById('seg-btn-history');

    if (view === 'log') {
        logView.classList.remove('hidden');
        historyView.classList.add('hidden');
        btnLog.className = 'ios-spring py-1.5 rounded-[8px] text-[13px] font-semibold bg-ios-elevated text-white shadow-sm';
        btnHistory.className = 'ios-spring py-1.5 rounded-[8px] text-[13px] font-semibold text-ios-label hover:text-white flex items-center justify-center gap-1.5';
    } else {
        logView.classList.add('hidden');
        historyView.classList.remove('hidden');
        btnHistory.className = 'ios-spring py-1.5 rounded-[8px] text-[13px] font-semibold bg-ios-elevated text-white shadow-sm flex items-center justify-center gap-1.5';
        btnLog.className = 'ios-spring py-1.5 rounded-[8px] text-[13px] font-semibold text-ios-label hover:text-white';
        renderHistoryList();
    }
}

/**************************************************************
 * UNIT TOGGLE (KG / LBS)
 **************************************************************/
function toggleWeightUnit() {
    weightUnit = weightUnit === 'kg' ? 'lbs' : 'kg';
    localStorage.setItem(STORAGE_KEYS.UNIT, weightUnit);
    syncUnitDisplay();
    renderExerciseCards();
    refreshSummaryAndHistory();
}

function syncUnitDisplay() {
    const upper = weightUnit.toUpperCase();
    document.getElementById('unit-pill-label').textContent = upper;
    document.getElementById('metric-volume-unit').textContent = upper;
}

/**************************************************************
 * WORKOUT LOGGER
 **************************************************************/
function resetLoggerToDefault() {
    document.getElementById('session-title').value = 'Upper Body Strength';
    document.getElementById('session-date').value = getTodayISO();
    document.getElementById('session-time').value = getNowTimeHHMM();
    document.getElementById('session-duration').value = '45';
    document.getElementById('session-notes').value = '';

    // 1 simple starter exercise with 2 sets so a new user immediately sees how it works
    activeExercises = [
        {
            id: uid(),
            name: 'Bench Press',
            sets: [
                { id: uid(), weight: 60, reps: 10, type: 'Warmup', done: true },
                { id: uid(), weight: 80, reps: 8, type: 'Working', done: false }
            ]
        }
    ];

    renderExerciseCards();
}

function clearLoggerToBlank() {
    document.getElementById('session-title').value = '';
    document.getElementById('session-notes').value = '';
    activeExercises = [];
    renderExerciseCards();
    showDynamicIsland('Started Blank', 'Tap any exercise chip below to build your workout.');
}

function dismissQuickTipBanner() {
    const banner = document.getElementById('quick-tip-banner');
    if (banner) banner.classList.add('hidden');
    localStorage.setItem(STORAGE_KEYS.TIP_DISMISSED, '1');
}

function renderSuggestionPills() {
    const container = document.getElementById('exercise-suggestions');
    container.innerHTML = EXERCISE_SUGGESTIONS.map(name => `
        <button type="button" onclick="appendExercise('${name.replace(/'/g, "\\'")}')"
            class="ios-tap px-2.5 py-1 rounded-full bg-ios-elevated text-[12px] font-medium text-white/90 hover:text-ios-fitness shrink-0 flex items-center gap-1">
            <i class="ph-bold ph-plus text-[10px] text-ios-fitness"></i>
            <span>${name}</span>
        </button>
    `).join('');
}

function applyWorkoutTemplate(splitName) {
    document.getElementById('session-title').value = `${splitName} Session`;
    const list = WORKOUT_TEMPLATES[splitName] || [];
    activeExercises = list.map(name => ({
        id: uid(),
        name,
        sets: [
            { id: uid(), weight: 60, reps: 10, type: 'Working', done: true },
            { id: uid(), weight: 65, reps: 8, type: 'Working', done: false }
        ]
    }));
    renderExerciseCards();
}

function addCustomExercise() {
    const input = document.getElementById('custom-exercise-name');
    const name = input.value.trim();
    if (!name) return;
    appendExercise(name);
    input.value = '';
}

function appendExercise(name) {
    activeExercises.push({
        id: uid(),
        name,
        sets: [
            { id: uid(), weight: 50, reps: 10, type: 'Working', done: true },
            { id: uid(), weight: 50, reps: 10, type: 'Working', done: false }
        ]
    });
    renderExerciseCards();
}

function removeExercise(exId) {
    activeExercises = activeExercises.filter(e => e.id !== exId);
    renderExerciseCards();
}

function updateExerciseTitle(exId, val) {
    const ex = activeExercises.find(e => e.id === exId);
    if (ex) ex.name = val;
}

function addSetRow(exId) {
    const ex = activeExercises.find(e => e.id === exId);
    if (!ex) return;
    const prev = ex.sets[ex.sets.length - 1];
    ex.sets.push({
        id: uid(),
        weight: prev ? prev.weight : 50,
        reps: prev ? prev.reps : 10,
        type: 'Working',
        done: false
    });
    renderExerciseCards();
}

function removeSetRow(exId, setId) {
    const ex = activeExercises.find(e => e.id === exId);
    if (!ex) return;
    ex.sets = ex.sets.filter(s => s.id !== setId);
    if (ex.sets.length === 0) {
        removeExercise(exId);
    } else {
        renderExerciseCards();
    }
}

// Cycle Set Badge between Working (#), Warmup (W), and Failure (F)
function cycleSetType(exId, setId) {
    const ex = activeExercises.find(e => e.id === exId);
    if (!ex) return;
    const s = ex.sets.find(item => item.id === setId);
    if (!s) return;

    if (s.type === 'Working') s.type = 'Warmup';
    else if (s.type === 'Warmup') s.type = 'Failure';
    else s.type = 'Working';

    renderExerciseCards();
}

function updateSetValue(exId, setId, field, val) {
    const ex = activeExercises.find(e => e.id === exId);
    if (!ex) return;
    const s = ex.sets.find(item => item.id === setId);
    if (!s) return;

    if (field === 'done') {
        s.done = !s.done;
        renderExerciseCards();
        return;
    }
    s[field] = Math.max(0, parseFloat(val) || 0);
    updateLiveSessionSummary();
}

function renderExerciseCards() {
    const container = document.getElementById('exercises-list');
    const unitUpper = weightUnit.toUpperCase();

    if (activeExercises.length === 0) {
        container.innerHTML = `
            <div class="bg-ios-card hairline-border rounded-[14px] p-6 text-center">
                <p class="text-[14px] text-ios-label">No exercises added yet. Tap a suggestion below to begin.</p>
            </div>
        `;
        updateLiveSessionSummary();
        return;
    }

    container.innerHTML = activeExercises.map((ex) => {
        let workingNum = 0;
        return `
            <div class="bg-ios-card hairline-border rounded-[14px] overflow-hidden">
                <!-- Exercise Title Header -->
                <div class="flex items-center justify-between px-4 py-3 hairline-b">
                    <input type="text" value="${ex.name.replace(/"/g, '&quot;')}"
                        onchange="updateExerciseTitle('${ex.id}', this.value)"
                        class="bg-transparent text-[16px] font-semibold text-ios-fitness focus:outline-none w-full"
                        placeholder="Exercise Name">
                    <button type="button" onclick="removeExercise('${ex.id}')"
                        class="ios-tap text-ios-label hover:text-ios-red ml-2 p-1" title="Remove Exercise">
                        <i class="ph ph-trash text-base"></i>
                    </button>
                </div>

                <!-- Tabular Column Headers -->
                <div class="grid grid-cols-12 gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ios-label items-center">
                    <div class="col-span-2 text-center">Set</div>
                    <div class="col-span-3 text-center">Previous</div>
                    <div class="col-span-3 text-center">${unitUpper}</div>
                    <div class="col-span-2 text-center">Reps</div>
                    <div class="col-span-2 text-right pr-1.5"><i class="ph-bold ph-check"></i></div>
                </div>

                <!-- Set Rows -->
                <div class="divide-y divide-white/[0.06]">
                    ${ex.sets.map((s, idx) => {
                        if (s.type !== 'Warmup') workingNum++;
                        const badgeLabel = s.type === 'Warmup' ? 'W' : (s.type === 'Failure' ? 'F' : workingNum);
                        const badgeStyle = s.type === 'Warmup'
                            ? 'text-ios-orange bg-ios-orange/15'
                            : (s.type === 'Failure' ? 'text-ios-move bg-ios-move/15' : 'text-ios-label bg-ios-elevated');
                        const prevText = getPreviousSetString(ex.name, idx);

                        return `
                            <div class="grid grid-cols-12 gap-1.5 px-3 py-2 items-center transition-colors ${s.done ? 'bg-ios-fitness/[0.05]' : ''}">
                                <!-- Set Number / Type Button -->
                                <div class="col-span-2 flex justify-center">
                                    <button type="button" onclick="cycleSetType('${ex.id}', '${s.id}')"
                                        title="Tap to toggle Working / Warmup (W) / Failure (F)"
                                        class="ios-tap w-7 h-7 rounded-[7px] text-[13px] font-bold tabular-nums flex items-center justify-center ${badgeStyle}">
                                        ${badgeLabel}
                                    </button>
                                </div>

                                <!-- Previous Lift Reference -->
                                <div class="col-span-3 text-center text-[13px] text-ios-label tabular-nums">
                                    ${prevText}
                                </div>

                                <!-- Weight Input -->
                                <div class="col-span-3">
                                    <input type="number" step="0.5" min="0" value="${s.weight}"
                                        oninput="updateSetValue('${ex.id}', '${s.id}', 'weight', this.value)"
                                        class="w-full bg-ios-elevated rounded-[7px] py-1 text-center text-[15px] font-semibold text-white tabular-nums focus:outline-none focus:ring-1 focus:ring-ios-fitness">
                                </div>

                                <!-- Reps Input -->
                                <div class="col-span-2">
                                    <input type="number" step="1" min="0" value="${s.reps}"
                                        oninput="updateSetValue('${ex.id}', '${s.id}', 'reps', this.value)"
                                        class="w-full bg-ios-elevated rounded-[7px] py-1 text-center text-[15px] font-semibold text-white tabular-nums focus:outline-none focus:ring-1 focus:ring-ios-fitness">
                                </div>

                                <!-- Complete Check & Remove -->
                                <div class="col-span-2 flex items-center justify-end gap-1">
                                    <button type="button" onclick="updateSetValue('${ex.id}', '${s.id}', 'done')"
                                        class="ios-tap w-7 h-7 rounded-[8px] flex items-center justify-center transition-all ${
                                            s.done
                                                ? 'bg-ios-fitness text-black font-bold'
                                                : 'bg-ios-elevated text-ios-label hover:text-white'
                                        }">
                                        <i class="ph-bold ph-check text-xs"></i>
                                    </button>
                                    <button type="button" onclick="removeSetRow('${ex.id}', '${s.id}')"
                                        class="ios-tap text-ios-tertiary hover:text-ios-red p-0.5" title="Delete Set">
                                        <i class="ph ph-x text-xs"></i>
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <!-- Add Set Footer Row -->
                <div class="px-3 py-2 hairline-t bg-white/[0.01]">
                    <button type="button" onclick="addSetRow('${ex.id}')"
                        class="ios-tap w-full py-1.5 rounded-[8px] bg-ios-elevated/70 hover:bg-ios-elevated text-[13px] font-semibold text-white flex items-center justify-center gap-1">
                        <i class="ph-bold ph-plus text-xs text-ios-fitness"></i>
                        <span>Add Set</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    updateLiveSessionSummary();
}

function updateLiveSessionSummary() {
    let totalSets = 0;
    let totalVol = 0;
    activeExercises.forEach(ex => {
        ex.sets.forEach(s => {
            totalSets++;
            totalVol += (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
        });
    });
    document.getElementById('live-summary-caption').textContent =
        `${totalSets} Sets • ${Math.round(totalVol).toLocaleString()} ${weightUnit.toUpperCase()}`;
}

function saveWorkout() {
    if (activeExercises.length === 0) {
        showDynamicIsland('Add Exercise', 'Please add at least one exercise before saving.');
        return;
    }

    const title = document.getElementById('session-title').value.trim() || 'Workout';
    const date = document.getElementById('session-date').value || getTodayISO();
    const time = document.getElementById('session-time').value || getNowTimeHHMM();
    const duration = parseInt(document.getElementById('session-duration').value, 10) || 45;
    const notes = document.getElementById('session-notes').value.trim();

    const savedWorkout = {
        id: uid(),
        title,
        date,
        time,
        duration,
        notes,
        exercises: activeExercises.map(ex => ({
            id: uid(),
            name: ex.name.trim() || 'Exercise',
            sets: ex.sets.map(s => ({
                id: uid(),
                weight: parseFloat(s.weight) || 0,
                reps: parseInt(s.reps) || 0,
                type: s.type || 'Working',
                done: true
            }))
        }))
    };

    workouts.unshift(savedWorkout);
    workouts.sort((a, b) => (`${b.date}T${b.time || '00:00'}`).localeCompare(`${a.date}T${a.time || '00:00'}`));

    expandedWorkouts.add(savedWorkout.id);
    persistWorkouts();
    refreshSummaryAndHistory();
    playAppleChime();

    showDynamicIsland('Workout Saved', `${title} logged to your Fitness history.`);
    switchSegment('history');
}

/**************************************************************
 * SUMMARY RINGS, METRICS & HISTORY RENDERING
 **************************************************************/
function refreshSummaryAndHistory() {
    renderWeekStripAndMetrics();
    renderHistoryList();
    document.getElementById('history-count-pill').textContent = workouts.length;
}

function computeCurrentStreak() {
    if (workouts.length === 0) return 0;
    const dates = new Set(workouts.map(w => w.date));
    let streak = 0;
    const cur = new Date();
    const todayStr = getTodayISO(cur);

    if (!dates.has(todayStr)) {
        cur.setDate(cur.getDate() - 1);
        if (!dates.has(getTodayISO(cur))) return 0;
    }

    while (dates.has(getTodayISO(cur))) {
        streak++;
        cur.setDate(cur.getDate() - 1);
    }
    return streak;
}

function renderWeekStripAndMetrics() {
    const now = new Date();
    const todayISO = getTodayISO(now);
    const dayIdx = now.getDay(); // 0 Sun .. 6 Sat
    const offsetToMonday = dayIdx === 0 ? -6 : 1 - dayIdx;

    const monday = new Date(now);
    monday.setDate(now.getDate() + offsetToMonday);

    const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const loggedDates = new Set(workouts.map(w => w.date));

    const weekDatesSet = new Set();
    let stripHTML = '';

    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const iso = getTodayISO(d);
        weekDatesSet.add(iso);

        const done = loggedDates.has(iso);
        const isToday = iso === todayISO;

        stripHTML += `
            <div class="flex flex-col items-center gap-1.5">
                <span class="text-[11px] font-semibold ${isToday ? 'text-white' : 'text-ios-label'}">${letters[i]}</span>
                <div class="w-8 h-8 rounded-full flex items-center justify-center tabular-nums text-[12px] font-bold transition-all ${
                    done
                        ? 'bg-ios-fitness text-black shadow-[0_0_10px_rgba(164,255,0,0.25)]'
                        : isToday
                            ? 'border-2 border-ios-fitness text-white'
                            : 'border border-white/15 text-ios-label'
                }">
                    ${done ? '<i class="ph-bold ph-check text-xs"></i>' : d.getDate()}
                </div>
            </div>
        `;
    }

    document.getElementById('week-rings-strip').innerHTML = stripHTML;

    // Calculate Week Volume
    let weekVol = 0;
    workouts.forEach(w => {
        if (weekDatesSet.has(w.date)) {
            w.exercises.forEach(ex => {
                ex.sets.forEach(s => {
                    weekVol += (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
                });
            });
        }
    });

    document.getElementById('metric-streak').textContent = computeCurrentStreak();
    document.getElementById('metric-volume').textContent = weekVol >= 10000
        ? (weekVol / 1000).toFixed(1) + 'k'
        : Math.round(weekVol).toLocaleString();
    document.getElementById('metric-sessions').textContent = workouts.length;

    // Status caption in header
    const statusBadge = document.getElementById('today-status-badge');
    if (loggedDates.has(todayISO)) {
        statusBadge.innerHTML = `<span class="text-ios-fitness font-semibold">● Completed Today</span>`;
    } else {
        statusBadge.innerHTML = `<span class="text-ios-label">Not Logged Today</span>`;
    }
}

function renderHistoryList() {
    const container = document.getElementById('history-list');
    const query = (document.getElementById('history-search').value || '').toLowerCase().trim();
    const unitUpper = weightUnit.toUpperCase();

    const filtered = workouts.filter(w => {
        if (!query) return true;
        return w.title.toLowerCase().includes(query) ||
            w.exercises.some(e => e.name.toLowerCase().includes(query));
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="bg-ios-card hairline-border rounded-[16px] p-8 text-center">
                <p class="text-[15px] font-medium text-white">No Workouts</p>
                <p class="text-[13px] text-ios-label mt-1">Logged sessions will appear here.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(w => {
        const expanded = expandedWorkouts.has(w.id);
        let vol = 0;
        let setsCount = 0;
        w.exercises.forEach(e => {
            e.sets.forEach(s => {
                setsCount++;
                vol += (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
            });
        });

        return `
            <div class="bg-ios-card hairline-border rounded-[16px] overflow-hidden">
                <!-- Summary Row -->
                <div onclick="toggleHistoryExpand('${w.id}')" class="p-4 cursor-pointer flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3.5 min-w-0">
                        <div class="w-10 h-10 rounded-full bg-ios-fitness/15 flex items-center justify-center text-ios-fitness shrink-0">
                            <i class="ph-fill ph-barbell text-xl"></i>
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <h3 class="text-[16px] font-semibold text-white truncate">${w.title}</h3>
                            </div>
                            <p class="text-[12px] text-ios-label tabular-nums mt-0.5">
                                ${formatAppleDate(w.date)} • ${format12HourTime(w.time)} • ${w.duration || 45}m
                            </p>
                        </div>
                    </div>

                    <div class="text-right shrink-0 flex items-center gap-2.5">
                        <div>
                            <span class="text-[15px] font-bold text-ios-fitness tabular-nums block">${Math.round(vol).toLocaleString()} ${unitUpper}</span>
                            <span class="text-[11px] text-ios-label tabular-nums">${setsCount} Sets</span>
                        </div>
                        <i class="ph-bold ${expanded ? 'ph-caret-up' : 'ph-caret-down'} text-ios-label text-xs"></i>
                    </div>
                </div>

                <!-- Expanded Details -->
                <div class="${expanded ? 'block' : 'hidden'} px-4 pb-4 pt-3 hairline-t space-y-3 bg-black/25">
                    ${w.notes ? `<p class="text-[13px] text-ios-label italic">"${w.notes}"</p>` : ''}

                    <div class="space-y-2">
                        ${w.exercises.map(ex => `
                            <div class="bg-ios-elevated/60 rounded-[10px] p-2.5">
                                <div class="flex items-center justify-between text-[13px] font-semibold text-white mb-1.5">
                                    <span>${ex.name}</span>
                                    <span class="text-[11px] text-ios-label tabular-nums">${ex.sets.length} sets</span>
                                </div>
                                <div class="flex flex-wrap gap-1.5">
                                    ${ex.sets.map((s, idx) => `
                                        <span class="px-2 py-0.5 rounded-[6px] bg-black/40 text-[12px] tabular-nums text-white/90">
                                            <span class="text-ios-label mr-1">${s.type === 'Warmup' ? 'W' : idx + 1}</span>${s.weight}${weightUnit} × ${s.reps}
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="flex items-center justify-between pt-1">
                        <button onclick="repeatWorkoutInLogger('${w.id}')" class="ios-tap text-[13px] font-semibold text-ios-fitness flex items-center gap-1">
                            <i class="ph-bold ph-arrow-counter-clockwise"></i> Repeat Workout
                        </button>
                        <button onclick="promptDeleteWorkout('${w.id}')" class="ios-tap text-[13px] font-medium text-ios-red">
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function toggleHistoryExpand(id) {
    if (expandedWorkouts.has(id)) expandedWorkouts.delete(id);
    else expandedWorkouts.add(id);
    renderHistoryList();
}

function repeatWorkoutInLogger(id) {
    const source = workouts.find(w => w.id === id);
    if (!source) return;

    document.getElementById('session-title').value = source.title;
    document.getElementById('session-date').value = getTodayISO();
    document.getElementById('session-time').value = getNowTimeHHMM();
    document.getElementById('session-duration').value = source.duration || 50;
    document.getElementById('session-notes').value = source.notes || '';

    activeExercises = source.exercises.map(ex => ({
        id: uid(),
        name: ex.name,
        sets: ex.sets.map(s => ({
            id: uid(),
            weight: s.weight,
            reps: s.reps,
            type: s.type || 'Working',
            done: false
        }))
    }));

    renderExerciseCards();
    switchSegment('log');
    showDynamicIsland('Workout Loaded', `${source.title} copied into logger.`);
}

function promptDeleteWorkout(id) {
    openIOSDialog(
        'Delete Workout?',
        'This workout and its sets will be permanently deleted.',
        () => {
            workouts = workouts.filter(w => w.id !== id);
            persistWorkouts();
            refreshSummaryAndHistory();
        }
    );
}

function promptClearAllHistory() {
    openIOSDialog(
        'Delete All Workouts?',
        'This will permanently clear all workout history from this device.',
        () => {
            workouts = [];
            persistWorkouts();
            refreshSummaryAndHistory();
        }
    );
}

/**************************************************************
 * DAILY REMINDER SHEET & DYNAMIC ISLAND ENGINE
 **************************************************************/
function openReminderSheet() {
    document.getElementById('sheet-reminder-enabled').checked = reminderConfig.enabled;
    document.getElementById('sheet-reminder-time').value = reminderConfig.time;
    document.getElementById('sheet-reminder-sound').checked = reminderConfig.sound;
    document.getElementById('sheet-reminder-msg').value = reminderConfig.message;
    updateOSPermissionBadge();

    const wrapper = document.getElementById('reminder-sheet-wrapper');
    wrapper.classList.remove('hidden');
    wrapper.classList.add('flex');
}

function closeReminderSheet() {
    const wrapper = document.getElementById('reminder-sheet-wrapper');
    wrapper.classList.add('hidden');
    wrapper.classList.remove('flex');
}

function saveReminderSheet() {
    reminderConfig.enabled = document.getElementById('sheet-reminder-enabled').checked;
    reminderConfig.time = document.getElementById('sheet-reminder-time').value || '18:30';
    reminderConfig.sound = document.getElementById('sheet-reminder-sound').checked;
    reminderConfig.message = document.getElementById('sheet-reminder-msg').value.trim() || "Time to close your rings and log today's workout.";

    persistReminder();
    syncReminderHeaderUI();
    closeReminderSheet();
    showDynamicIsland('Reminder Updated', reminderConfig.enabled ? `Scheduled daily for ${format12HourTime(reminderConfig.time)}.` : 'Daily workout notifications paused.');
}

function syncReminderHeaderUI() {
    const bell = document.getElementById('header-bell-icon');
    const label = document.getElementById('header-reminder-time');

    if (reminderConfig.enabled) {
        bell.className = 'ph-fill ph-bell text-ios-orange text-xs';
        label.textContent = format12HourTime(reminderConfig.time);
        label.className = 'tabular-nums text-white font-medium';
    } else {
        bell.className = 'ph ph-bell-slash text-ios-label text-xs';
        label.textContent = 'Off';
        label.className = 'text-ios-label';
    }
}

function requestOSNotifications() {
    if (!('Notification' in window)) {
        showDynamicIsland('In-App Banner Active', 'Dynamic Island & audio chime are active.');
        return;
    }
    Notification.requestPermission().then(perm => {
        updateOSPermissionBadge();
        if (perm === 'granted') {
            triggerWorkoutReminder(true);
        }
    }).catch(() => {});
}

function updateOSPermissionBadge() {
    const badge = document.getElementById('os-perm-badge');
    if ('Notification' in window && Notification.permission === 'granted') {
        badge.textContent = 'Allowed';
        badge.className = 'text-[13px] text-ios-green font-medium';
    } else {
        badge.textContent = 'Enable';
        badge.className = 'text-[13px] text-ios-orange font-medium';
    }
}

function evaluateReminderTick() {
    if (!reminderConfig.enabled) return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const todayISO = getTodayISO(now);

    if (hhmm === reminderConfig.time && reminderConfig.lastTriggeredDate !== todayISO) {
        const loggedToday = workouts.some(w => w.date === todayISO);
        if (!loggedToday) {
            reminderConfig.lastTriggeredDate = todayISO;
            persistReminder();
            triggerWorkoutReminder(false);
        }
    }
}

function triggerWorkoutReminder(isTest = false) {
    playAppleChime();
    const title = isTest ? 'Test Reminder' : 'Workout Reminder';
    const body = reminderConfig.message || "Time to close your rings and log today's workout.";

    showDynamicIsland(title, body);

    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(`Fitness — ${title}`, { body });
        } catch (e) {}
    }
}

let islandTimer = null;
function showDynamicIsland(title, body) {
    const island = document.getElementById('dynamic-island');
    document.getElementById('island-title').textContent = title;
    document.getElementById('island-body').textContent = body;

    island.classList.remove('island-hidden');
    island.classList.add('island-visible');

    if (islandTimer) clearTimeout(islandTimer);
    islandTimer = setTimeout(hideDynamicIsland, 6000);
}

function hideDynamicIsland() {
    const island = document.getElementById('dynamic-island');
    island.classList.remove('island-visible');
    island.classList.add('island-hidden');
}

function handleIslandLogAction() {
    hideDynamicIsland();
    closeReminderSheet();
    switchSegment('log');
    document.getElementById('session-title').focus();
}

/**************************************************************
 * iOS DIALOG HELPER
 **************************************************************/
function openIOSDialog(title, desc, onConfirm) {
    const dialog = document.getElementById('ios-dialog');
    document.getElementById('ios-dialog-title').textContent = title;
    document.getElementById('ios-dialog-desc').textContent = desc;

    const close = () => {
        dialog.classList.add('hidden');
        dialog.classList.remove('flex');
    };

    document.getElementById('ios-dialog-cancel').onclick = close;
    document.getElementById('ios-dialog-confirm').onclick = () => {
        close();
        if (typeof onConfirm === 'function') onConfirm();
    };

    dialog.classList.remove('hidden');
    dialog.classList.add('flex');
}

/**************************************************************
 * APPLE ONBOARDING SHEET & INTERACTIVE SPOTLIGHT TOUR
 **************************************************************/
const TOUR_STEPS = [
    {
        targetId: 'tour-target-activity',
        title: '7-Day Activity & Streak',
        desc: 'Whenever you log a workout, that day’s circle fills in Apple Fitness Green and automatically updates your daily streak and weekly volume.'
    },
    {
        targetId: 'tour-target-session',
        title: 'Pick a Split or Name Session',
        desc: 'Tap a quick template (Push, Pull, Legs, Upper, Full) to pre-load exercises in one tap, or enter your own workout title, date, and duration.'
    },
    {
        targetId: 'tour-target-exercises',
        title: 'Log Weight, Reps & Checkmarks',
        desc: 'See your last lift under PREVIOUS. Tap the set number (1) to switch between Warmup (W) or Failure (F), and tap the green ✓ as you finish each set.'
    },
    {
        targetId: 'tour-target-add-exercise',
        title: 'Add Exercises in One Tap',
        desc: 'Tap any suggested exercise pill (like Barbell Squat or Pull-Ups) or type your own custom exercise name and tap Add.'
    },
    {
        targetId: 'tour-target-reminder',
        title: 'Daily Smart Reminder',
        desc: 'Tap this bell anytime to set your daily workout reminder time and test the Dynamic Island notification & audio chime.'
    }
];

let activeTourIndex = -1;

function openWelcomeSheet() {
    const wrapper = document.getElementById('welcome-sheet-wrapper');
    wrapper.classList.remove('hidden');
    wrapper.classList.add('flex');
}

function closeWelcomeSheet() {
    const wrapper = document.getElementById('welcome-sheet-wrapper');
    wrapper.classList.add('hidden');
    wrapper.classList.remove('flex');
    localStorage.setItem(STORAGE_KEYS.ONBOARDED, '1');
}

function startInteractiveTour() {
    closeWelcomeSheet();
    switchSegment('log');

    // Ensure there is at least 1 exercise visible for Step 3
    if (activeExercises.length === 0) {
        resetLoggerToDefault();
    }

    activeTourIndex = 0;
    const overlay = document.getElementById('tour-overlay');
    overlay.classList.remove('hidden');
    renderCurrentTourStep();
}

function nextTourStep() {
    if (activeTourIndex < TOUR_STEPS.length - 1) {
        activeTourIndex++;
        renderCurrentTourStep();
    } else {
        endInteractiveTour();
        showDynamicIsland('Tour Complete', 'You’re ready to log your first workout!');
    }
}

function prevTourStep() {
    if (activeTourIndex > 0) {
        activeTourIndex--;
        renderCurrentTourStep();
    }
}

function endInteractiveTour() {
    activeTourIndex = -1;
    const overlay = document.getElementById('tour-overlay');
    overlay.classList.add('hidden');
    localStorage.setItem(STORAGE_KEYS.ONBOARDED, '1');
}

function renderCurrentTourStep() {
    const step = TOUR_STEPS[activeTourIndex];
    if (!step) return;

    const el = document.getElementById(step.targetId);
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    document.getElementById('tour-step-badge').textContent = `STEP ${activeTourIndex + 1} OF ${TOUR_STEPS.length}`;
    document.getElementById('tour-step-title').textContent = step.title;
    document.getElementById('tour-step-desc').textContent = step.desc;

    const prevBtn = document.getElementById('tour-prev-btn');
    const nextBtn = document.getElementById('tour-next-btn');

    prevBtn.style.visibility = activeTourIndex === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = activeTourIndex === TOUR_STEPS.length - 1 ? 'Done' : 'Next';

    setTimeout(positionTourSpotlight, 220);
}

function positionTourSpotlight() {
    if (activeTourIndex < 0) return;
    const step = TOUR_STEPS[activeTourIndex];
    const el = document.getElementById(step.targetId);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const pad = 6;
    const spotlight = document.getElementById('tour-spotlight');
    const popover = document.getElementById('tour-popover');

    const top = Math.max(8, rect.top - pad);
    const left = Math.max(8, rect.left - pad);
    const width = Math.min(window.innerWidth - 16, rect.width + pad * 2);
    const height = rect.height + pad * 2;

    spotlight.style.top = `${top}px`;
    spotlight.style.left = `${left}px`;
    spotlight.style.width = `${width}px`;
    spotlight.style.height = `${height}px`;

    // Position floating popover either below or above the spotlight target
    const popHeight = popover.offsetHeight || 175;
    const spaceBelow = window.innerHeight - (top + height);
    let popTop = top + height + 14;

    if (spaceBelow < popHeight + 24 && top > popHeight + 24) {
        popTop = top - popHeight - 14;
    } else if (spaceBelow < popHeight + 24) {
        popTop = Math.max(16, window.innerHeight - popHeight - 16);
    }

    const popWidth = Math.min(340, window.innerWidth * 0.9);
    const centeredLeft = Math.max(16, Math.min(window.innerWidth - popWidth - 16, (window.innerWidth - popWidth) / 2));

    popover.style.top = `${popTop}px`;
    popover.style.left = `${centeredLeft}px`;
}

window.addEventListener('DOMContentLoaded', initApp);
