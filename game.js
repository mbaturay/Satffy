/* Staff Wars Clone - minimal scaffold with a starfield */
(function () {
  'use strict';

  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  // VexFlow setup (global Vex from UMD)
  const VF = (window.Vex && window.Vex.Flow) || window.Flow || window.VexFlow || null;
  // Persistent VexFlow renderer/context/stave (single) and grand staff
  /** @type {{ renderer: any, context: CanvasRenderingContext2D, stave: any, key: string, scale: number } | null } */
  let vfState = null;
  /** @type {{ renderer: any, context: CanvasRenderingContext2D, treble: any, bass: any, key: string, scale: number } | null } */
  let vfGrand = null;
  // Notation scale presets (percentage multipliers)
  const SCALE_PRESETS = [1.25, 1.5, 1.75, 2.0];
  const PREF_SCALE = 'staffy.scale';
  function getNotationScale() {
    const saved = parseFloat(localStorage.getItem(PREF_SCALE) || '');
    if (Number.isFinite(saved) && saved > 0.5 && saved <= 3) return saved;
    return SCALE_PRESETS[1]; // default 1.5x
  }

  // Resize canvas to fit device pixel ratio for crisp rendering
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const fit = (localStorage.getItem('staffy.fit') || 'width');
    // In fit-window mode, we lock to the viewport size to truly fill the window
    const overrideW = fit === 'window' ? window.innerWidth : null;
    const overrideH = fit === 'window' ? window.innerHeight : null;
    const cssWidth = Math.max(1, (overrideW ?? canvas.clientWidth) || canvas.width);
    const cssHeight = Math.max(1, (overrideH ?? canvas.clientHeight) || canvas.height);
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    // Reset transform before applying DPR scale
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }

  window.addEventListener('resize', () => {
    resizeCanvas();
    initStars();
    // force VexFlow to recompute geometry on next frame
    vfState = null;
  });
  // Ensure layout is ready before initial resize
  requestAnimationFrame(() => { resizeCanvas(); initStars(); });

  // Simple starfield (responsive)
  const stars = [];
  function computeStarCount() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const area = (w * h) / 10000; // area in 100x100 blocks
    return Math.max(60, Math.min(180, Math.round(area * 8)));
  }

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function initStars() {
    stars.length = 0;
    const count = computeStarCount();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    for (let i = 0; i < count; i++) {
      stars.push({
        x: rand(0, w),
        y: rand(0, h),
        z: rand(0.2, 1), // depth factor controls speed/brightness
      });
    }
  }

  function updateStars(dt) {
    const speed = 50; // px/sec base speed
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    for (const s of stars) {
      s.y += speed * s.z * dt;
      if (s.y > h) {
        s.x = rand(0, w);
        s.y = -rand(0, 40);
        s.z = rand(0.2, 1);
      }
    }
  }

  function drawStars() {
    // Clear entire canvas in CSS pixel coordinates (ctx is already scaled by DPR)
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const alpha = 0.4 + 0.6 * s.z;
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      const size = 1 + Math.floor(2 * s.z);
      ctx.fillRect(s.x, s.y, size, size);
    }
  }

  // Compute staff layout metrics (CSS pixels)
  function getStaffMetrics() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const marginX = Math.max(16, w * 0.05);
    const staffWidth = Math.max(50, w - marginX * 2);
    const centerY = h / 2;
    const lineSpacing = Math.max(8, Math.min(24, Math.floor(h * 0.04)));
    const topLineY = centerY - 2 * lineSpacing;
    const bottomLineY = topLineY + 4 * lineSpacing;
    return { w, h, marginX, staffWidth, centerY, lineSpacing, topLineY, bottomLineY };
  }

  // Grand staff metrics helper
  function getGrandMetrics() {
    const base = getStaffMetrics();
    const gap = Math.round(base.lineSpacing * 2.2);
    return { ...base, gap };
  }

  // Ensure a persistent VexFlow context/stave is ready for the current canvas metrics
  function ensureVexflow() {
    if (!VF) return null;
  const { marginX, staffWidth, w, h } = getStaffMetrics();
  const scale = getNotationScale();
    // Work in pre-scale coordinates so that after scaling, the width equals staffWidth
    const preX = marginX / scale;
    const preWidth = staffWidth / scale;
    const key = `${preX}|${preWidth}|${w}|${h}|s${scale}`;
    if (!vfState || !vfState.renderer || vfState.key !== key) {
      // Create/recreate renderer and stave when geometry changes
      const renderer = new VF.Renderer(canvas, VF.Renderer.Backends.CANVAS);
      const ctxVF = renderer.getContext();
      // Create at (0,0) with pre-scale width, we will center vertically using its height
      const stave = new VF.Stave(preX, 0, preWidth);
      stave.addClef('treble');
      // Estimate height (pre-scale units), then center vertically after scale
      let height = 0;
      try { height = typeof stave.getHeight === 'function' ? stave.getHeight() : 0; } catch {}
      if (!height || !isFinite(height)) height = 60; // sensible default
      const preY = Math.max(0, Math.round(((h / scale) - height) / 2));
      stave.y = preY;
      vfState = { renderer, context: ctxVF, stave, key, scale };
    } else {
      // Update stave position if needed (without recreating objects)
      vfState.scale = scale;
      vfState.stave.x = preX;
      vfState.stave.width = preWidth;
      let height = 0;
      try { height = typeof vfState.stave.getHeight === 'function' ? vfState.stave.getHeight() : 0; } catch {}
      if (!height || !isFinite(height)) height = 60;
      vfState.stave.y = Math.max(0, Math.round(((h / scale) - height) / 2));
      vfState.key = key;
    }
    return vfState;
  }

  // Ensure a persistent grand staff (treble + bass) ready for current metrics
  function ensureVexflowGrand() {
    if (!VF) return null;
    const { marginX, staffWidth, w, h, gap } = getGrandMetrics();
    const scale = getNotationScale();
    const preX = marginX / scale;
    const preWidth = staffWidth / scale;
    const key = `grand|${preX}|${preWidth}|${w}|${h}|s${scale}|g${gap}`;
    if (!vfGrand || !vfGrand.renderer || vfGrand.key !== key) {
      const renderer = new VF.Renderer(canvas, VF.Renderer.Backends.CANVAS);
      const ctxVF = renderer.getContext();
      const treble = new VF.Stave(preX, 0, preWidth);
      treble.addClef('treble');
      const bass = new VF.Stave(preX, 0, preWidth);
      bass.addClef('bass');
      let tH = 60, bH = 60;
      try { tH = treble.getHeight ? treble.getHeight() : 60; } catch {}
      try { bH = bass.getHeight ? bass.getHeight() : 60; } catch {}
      const total = tH + gap + bH;
      const preYTop = Math.max(0, Math.round(((h / scale) - total) / 2));
      treble.y = preYTop;
      bass.y = preYTop + tH + gap;
      vfGrand = { renderer, context: ctxVF, treble, bass, key, scale };
    } else {
      vfGrand.scale = scale;
      vfGrand.treble.x = preX; vfGrand.treble.width = preWidth;
      vfGrand.bass.x = preX; vfGrand.bass.width = preWidth;
      let tH = 60, bH = 60;
      try { tH = vfGrand.treble.getHeight ? vfGrand.treble.getHeight() : 60; } catch {}
      try { bH = vfGrand.bass.getHeight ? vfGrand.bass.getHeight() : 60; } catch {}
      const total = tH + gap + bH;
      const preYTop = Math.max(0, Math.round(((h / scale) - total) / 2));
      vfGrand.treble.y = preYTop;
      vfGrand.bass.y = preYTop + tH + gap;
      vfGrand.key = key;
    }
    return vfGrand;
  }

  // Draw grand staff (treble + bass)
  function drawGrandStaff() {
    const vf = ensureVexflowGrand();
    if (!vf) return;
    vf.context.save();
    vf.context.scale(vf.scale, vf.scale);
    vf.treble.setContext(vf.context).draw();
    vf.bass.setContext(vf.context).draw();
    vf.context.restore();
  }

  // Notes storage and generation
  /** @typedef {{ letter: 'A'|'B'|'C'|'D'|'E'|'F'|'G', octave: number, clef: 'treble'|'bass', xNorm: number, createdAt: number, speedPxSec: number }} Note */
  /** @type {Note[]} */
  const notes = [];
  /** @type {Note|null} */
  let activeNote = null;

  // Spawn mode: Both (default), Treble-only, Bass-only
  const PREF_MODE = 'staffy.mode';
  /** @type {'Both'|'Treble'|'Bass'} */
  let spawnMode = (localStorage.getItem(PREF_MODE) || 'Both');
  function setSpawnMode(mode) {
    spawnMode = mode;
    localStorage.setItem(PREF_MODE, spawnMode);
    // Provide immediate feedback
    addFeedback(`Mode: ${spawnMode}`, 'rgba(200,220,255,0.95)', 0.7);
  }

  // Map letter to diatonic step relative to E4 (bottom line). Each step is half lineSpacing.
  const LETTER_TO_STEP = { E: 0, F: 1, G: 2, A: 3, B: 4, C: 5, D: 6 };
  function getDiatonicStep(letter, octave) {
    const base = LETTER_TO_STEP[letter];
    return base + (octave - 4) * 7; // relative to E4 baseline; each octave adds 7 diatonic steps
  }

  let spawnIndex = 0;
  function addRandomNote() {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const letter = letters[Math.floor(Math.random() * letters.length)];
    // Spawn at the right edge (a bit off-canvas) so notes flow leftwards across the staff
    const xNorm = 1.06; // just outside the right edge of the staff
    // Per-note horizontal speed in CSS pixels per second
    const jitter = 0.6 + Math.random() * 0.8; // 60%..140%
    const speedPxSec = baseNoteSpeed * jitter;
    spawnIndex++;
    notes.push({ letter, xNorm, createdAt: performance.now(), speedPxSec });
  }

  function drawNotes() {
    if (!VF || !notes.length) return;
    const vf = ensureVexflowGrand();
    if (!vf) return;
    const { staffWidth, marginX } = getStaffMetrics();
    const vexX = vf.treble.x ?? (marginX / vf.scale);
    const vexWidth = vf.treble.width ?? (staffWidth / vf.scale);

    const n = notes[0];
    const keyStr = `${n.letter.toLowerCase()}/${n.octave}`;
    const isTreble = (n.clef === 'treble');
    const noteObj = new VF.StaveNote({ clef: isTreble ? 'treble' : 'bass', keys: [keyStr], duration: 'q' });
    const voice = new VF.Voice({ num_beats: 1, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT);
    voice.addTickables([noteObj]);
    const formatter = new VF.Formatter();
    formatter.joinVoices([voice]).format([voice], vexWidth);

    const desiredX = vexX + n.xNorm * vexWidth;
    noteObj.setStave(isTreble ? vf.treble : vf.bass);
    const currentX = noteObj.getX();
    const delta = desiredX - currentX;
    noteObj.setXShift((noteObj.getXShift ? noteObj.getXShift() : 0) + delta);

    vf.context.save();
    vf.context.scale(vf.scale, vf.scale);
    voice.draw(vf.context, isTreble ? vf.treble : vf.bass);
    vf.context.restore();
  }

  function updateNotes(dt) {
    if (!notes.length) return;
    const { staffWidth } = getStaffMetrics();
    // Single active note moves left; no auto-despawn
    const n = notes[0];
    const normPerSec = n.speedPxSec / staffWidth;
    n.xNorm -= normPerSec * dt;
    // Rule 1: If note reaches the left edge without being hit -> immediate game over
    if (!gameOver && n.xNorm <= 0) {
      registerMiss('note-expired');
      gameOver = true;
      stopAllSounds();
    }
  }

  // --- Input, Scoring & Game State ---
  let score = 0;
  let gameOver = false;
  let currentMisses = 0; // total misses (cumulative)
  let totalCorrectHits = 0; // cumulative correct hits for level progression

  // Difficulty scaling and scoring
  const SPEED_INITIAL = 140; // px/s
  const LEVELUP_SPEED_DELTA = 6; // px/s increase when level-up triggers
  const SPEED_CAP = 320; // safety cap
  let baseNoteSpeed = SPEED_INITIAL;
  const HITS_PER_LEVEL = 10; // level up every M correct hits
  const SCORE_BASE = 1; // base points
  const SCORE_EARLY_BONUS = 4; // bonus scales with xNorm (0..1)

  // Level computation and small flash effect when level changes
  function getLevel() {
    return Math.floor((baseNoteSpeed - SPEED_INITIAL) / LEVELUP_SPEED_DELTA) + 1;
  }
  let levelFlashAt = 0; // timestamp when level increased

  function spawnNewNote() {
    notes.length = 0; // enforce single active note
    // Allowed pools
    const allowedTreble = [
      { letter: 'C', octave: 4 }, { letter: 'D', octave: 4 }, { letter: 'E', octave: 4 },
      { letter: 'F', octave: 4 }, { letter: 'G', octave: 4 }, { letter: 'A', octave: 4 }, { letter: 'B', octave: 4 },
      { letter: 'C', octave: 5 }, { letter: 'D', octave: 5 }, { letter: 'E', octave: 5 },
      { letter: 'F', octave: 5 }, { letter: 'G', octave: 5 }, { letter: 'A', octave: 5 }, { letter: 'B', octave: 5 },
    ];
    const allowedBass = [
      // Octave 2 (C..B) and Octave 3 (C..G)
      { letter: 'C', octave: 2 }, { letter: 'D', octave: 2 }, { letter: 'E', octave: 2 }, { letter: 'F', octave: 2 }, { letter: 'G', octave: 2 }, { letter: 'A', octave: 2 }, { letter: 'B', octave: 2 },
      { letter: 'C', octave: 3 }, { letter: 'D', octave: 3 }, { letter: 'E', octave: 3 }, { letter: 'F', octave: 3 }, { letter: 'G', octave: 3 },
    ];
    // Decide pool based on mode
    let pool;
    let pickBass = false;
    if (spawnMode === 'Treble') {
      pool = allowedTreble;
      pickBass = false;
    } else if (spawnMode === 'Bass') {
      pool = allowedBass;
      pickBass = true;
    } else {
      // Both -> random
      pickBass = Math.random() < 0.5;
      pool = pickBass ? allowedBass : allowedTreble;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const letter = pick.letter;
    const octave = pick.octave;
    const clef = pickBass ? 'bass' : 'treble';
    const xNorm = 1.06; // start slightly off the right edge
    const jitter = 0.85 + Math.random() * 0.3; // minor variation 85%..115%
    const speedPxSec = Math.min(SPEED_CAP, baseNoteSpeed * jitter);
    const n = { letter, octave, clef, xNorm, createdAt: performance.now(), speedPxSec };
    notes.push(n);
    activeNote = n;
  }

  // Lightweight feedback messages (e.g., "Miss", "+1")
  /** @type {{ text: string, color: string, createdAt: number, duration: number }[]} */
  const feedbacks = [];
  function addFeedback(text, color, duration = 0.8) {
    feedbacks.push({ text, color, createdAt: performance.now(), duration });
  }

  // Centralized miss registration with debug log
  function registerMiss(reason = 'unknown') {
    currentMisses += 1;
    console.debug('[Miss]', { reason, currentMisses });
    addFeedback('Miss', 'rgba(255,80,80,0.95)');
    playMissSound();
    // Invalidate only when the note actually expires; allow retries after wrong inputs
    if (reason === 'note-expired') {
      activeNote = null;
    }
    if (currentMisses >= 3) {
      gameOver = true;
      console.debug('[GameOver] Miss threshold reached');
      stopAllSounds();
    }
  }

  // Optional audio and miss sound
  let audioCtx = null;
  let audioPromptShown = false;
  /** @type {Set<{o: OscillatorNode, g: GainNode}>} */
  const activeSounds = new Set();
  // Create/retrieve AudioContext; uses bracket access for legacy webkit to avoid TS warning
  function getOrCreateAudioContext() {
    try {
      if (audioCtx && audioCtx.state !== 'closed') return audioCtx;
      const Ctx = window.AudioContext || window['webkitAudioContext'];
      if (!Ctx) return null;
      audioCtx = new Ctx();
      return audioCtx;
    } catch { return null; }
  }
  function stopAllSounds() {
    for (const pair of activeSounds) {
      try { pair.o.stop(0); } catch {}
      try { pair.o.disconnect(); } catch {}
      try { pair.g.disconnect(); } catch {}
      activeSounds.delete(pair);
    }
  }
  function ensureAudioHandlers() {
    const handler = () => {
      try {
        audioCtx = getOrCreateAudioContext() || audioCtx;
        if (audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume().catch(() => {});
      } catch {}
      // Remove once attempted
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
    };
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });
  }
  ensureAudioHandlers();
  function ensureAudioRunning() {
    try {
      audioCtx = getOrCreateAudioContext() || audioCtx;
      if (audioCtx && audioCtx.state !== 'running' && audioCtx.resume) {
        return audioCtx.resume().catch(() => {
          if (!audioPromptShown) { audioPromptShown = true; addFeedback('Click or press a key to enable sound', 'rgba(255,255,255,0.85)', 1.6); }
        });
      }
    } catch {}
    return Promise.resolve();
  }
  function playMissSound() {
    try {
      audioCtx = getOrCreateAudioContext() || audioCtx;
      if (!audioCtx) return;
      const run = () => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'square';
        o.frequency.value = 180; // low buzz
        g.gain.value = 0.08;
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start();
        activeSounds.add({ o, g });
        setTimeout(() => { try { o.stop(); } catch {} }, 120);
        o.onended = () => { try { o.disconnect(); g.disconnect(); } catch {} activeSounds.forEach(item => { if (item.o === o) activeSounds.delete(item); }); };
      };
      if (audioCtx.state === 'running') run();
      else if (audioCtx.resume) audioCtx.resume().then(run).catch(() => {
        if (!audioPromptShown) { audioPromptShown = true; addFeedback('Click or press a key to enable sound', 'rgba(255,255,255,0.85)', 1.6); }
      });
    } catch {}
  }

  // --- Correct note sound (simple synth) ---
  const LETTER_TO_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  function letterOctaveToMidi(letter, octave) {
    const pc = LETTER_TO_PC[(letter || 'C').toUpperCase()];
    if (pc == null) return 60; // default C4
    return (octave + 1) * 12 + pc;
  }
  function playNoteSound(letter, octave, { duration = 0.32, type = 'triangle', gain = 0.12 } = {}) {
    try {
      audioCtx = getOrCreateAudioContext() || audioCtx;
      if (!audioCtx) return;
      const run = () => {
        const midi = typeof letter === 'number' ? letter : letterOctaveToMidi(letter, octave);
        const freq = midiToFreq(midi);
        const now = audioCtx.currentTime;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, now);
        // Simple ADSR envelope to avoid clicks
        const attack = 0.005;
        const decay = 0.08;
        const sustain = gain * 0.6;
        const release = 0.18;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(gain, now + attack);
        g.gain.linearRampToValueAtTime(sustain, now + attack + decay);
        g.gain.setTargetAtTime(0, now + duration, release);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(now);
        o.stop(now + duration + release * 4);
        activeSounds.add({ o, g });
        o.onended = () => { try { o.disconnect(); g.disconnect(); } catch {} activeSounds.forEach(item => { if (item.o === o) activeSounds.delete(item); }); };
      };
      if (audioCtx.state === 'running') run();
      else if (audioCtx.resume) audioCtx.resume().then(run).catch(() => {
        if (!audioPromptShown) { audioPromptShown = true; addFeedback('Click or press a key to enable sound', 'rgba(255,255,255,0.85)', 1.6); }
      });
    } catch {}
  }

  // Find index of the first (leftmost) visible note on/near the staff
  function getFirstVisibleNoteIndex() {
    // Single-note mode: if present, it's index 0
    return notes.length ? 0 : -1;
  }

  function attemptHit(noteObj) {
    if (gameOver) return;
    if (noteObj == null) return; // skip if out-of-range or unmapped
    // Do not block hits if we had a previous miss; as long as a note exists, we can try to hit it
    const k = (noteObj.letter || '').toUpperCase();
    if (!/^[A-G]$/.test(k) || typeof noteObj.octave !== 'number') return;
    const idx = getFirstVisibleNoteIndex();
    if (idx < 0) { registerMiss('no-active-note'); return; }
    const target = notes[idx];
    if (target.letter !== k) {
      registerMiss('wrong-letter');
      return;
    }
    if (target.octave !== noteObj.octave) {
      registerMiss('wrong-pitch'); // wrong octave; reversible miss
      return;
    }
    if (target.letter === k && target.octave === noteObj.octave) {
      // Early-hit scoring: xNorm in [0..1], earlier (closer to 1) yields more points
      const xn = Math.max(0, Math.min(1, target.xNorm));
      const points = SCORE_BASE + Math.round(SCORE_EARLY_BONUS * xn);
      score += points;
      addFeedback(`+${points}`, 'rgba(120,255,120,0.98)');
      // Play the correct pitch as feedback
      playNoteSound(target.letter, target.octave);
  notes.splice(idx, 1);
  activeNote = null;
      // Level-up every HITS_PER_LEVEL correct hits regardless of timing
      totalCorrectHits += 1;
      if (totalCorrectHits % HITS_PER_LEVEL === 0) {
        const prevLevel = getLevel();
        baseNoteSpeed = Math.min(SPEED_CAP, baseNoteSpeed + LEVELUP_SPEED_DELTA);
        const newLevel = getLevel();
        if (newLevel > prevLevel) {
          levelFlashAt = performance.now();
          addFeedback('Level Up!', 'rgba(120,200,255,0.98)', 1.0);
        }
      }
      // Spawn the next note only after a correct hit
      spawnNewNote();
    }
  }

  function handleKeyDown(e) {
    ensureAudioRunning();
    const k = (e.key || '').toUpperCase();
    if (!/^[A-G]$/.test(k)) return;
    // Keyboard fallback: use the current visible note's octave
    const idx = getFirstVisibleNoteIndex();
    const octave = idx >= 0 ? notes[idx].octave : 4;
    attemptHit({ letter: k, octave });
  }
  window.addEventListener('keydown', handleKeyDown);

  // --- Web MIDI API support ---
  const NATURAL_PC_TO_LETTER = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };
  const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11];

  function midiNoteToLetter(midiNote) {
    // Accept grand staff registers: Bass C2 (36) up to Treble B5 (83)
    if (typeof midiNote !== 'number' || midiNote < 36 || midiNote > 83) return null;
    const pc = ((midiNote % 12) + 12) % 12;
    const octave = Math.floor(midiNote / 12) - 1;
    if (NATURAL_PC_TO_LETTER[pc]) return { letter: NATURAL_PC_TO_LETTER[pc], octave };
    // Find nearest natural pitch class; on tie, prefer upward (sharper) mapping
    let best = NATURAL_PCS[0];
    let bestDist = 99;
    for (const npc of NATURAL_PCS) {
      const d = Math.min((pc - npc + 12) % 12, (npc - pc + 12) % 12);
      if (d < bestDist || (d === bestDist && ((npc - pc + 12) % 12) < ((best - pc + 12) % 12))) {
        bestDist = d;
        best = npc;
      }
    }
    return { letter: NATURAL_PC_TO_LETTER[best], octave };
  }

  // Map MIDI note to letter ignoring register range (used for out-of-register handling)
  function midiNoteToLetterAny(midiNote) {
    if (typeof midiNote !== 'number') return null;
    const pc = ((midiNote % 12) + 12) % 12;
    const octave = Math.floor(midiNote / 12) - 1;
    if (NATURAL_PC_TO_LETTER[pc]) return { letter: NATURAL_PC_TO_LETTER[pc], octave };
    let best = NATURAL_PCS[0];
    let bestDist = 99;
    for (const npc of NATURAL_PCS) {
      const d = Math.min((pc - npc + 12) % 12, (npc - pc + 12) % 12);
      if (d < bestDist || (d === bestDist && ((npc - pc + 12) % 12) < ((best - pc + 12) % 12))) {
        bestDist = d;
        best = npc;
      }
    }
    return { letter: NATURAL_PC_TO_LETTER[best], octave };
  }

  function onMIDIMessage(e) {
    const [status, data1, data2] = e.data || [];
    if (status == null) return;
    const cmd = status & 0xf0;
    const isNoteOn = cmd === 0x90 && data2 > 0;
    const isNoteOff = cmd === 0x80 || (cmd === 0x90 && data2 === 0);
    if (!isNoteOn && !isNoteOff) return;
    if (isNoteOn) {
      ensureAudioRunning();
      // Range depends on current mode
      let lo = 36, hi = 83; // Both
      if (spawnMode === 'Treble') { lo = 60; hi = 83; } // C4..B5
      else if (spawnMode === 'Bass') { lo = 36; hi = 55; } // C2..G3
      const inRange = typeof data1 === 'number' && data1 >= lo && data1 <= hi;
      const mappedAny = midiNoteToLetterAny(data1);
      console.debug('[MIDI NoteOn]', { note: data1, velocity: data2, mapped: mappedAny, inRange });
      if (!inRange) {
        // Out-of-register counts as miss
        registerMiss('out-of-register');
        return;
      }
      const noteObj = midiNoteToLetter(data1);
      if (noteObj != null) attemptHit(noteObj);
    }
  }

  function wireMIDIInputs(midiAccess) {
    try {
      for (const input of midiAccess.inputs.values()) {
        input.onmidimessage = onMIDIMessage;
      }
      // React to devices added/removed
      midiAccess.onstatechange = () => {
        for (const input of midiAccess.inputs.values()) {
          input.onmidimessage = onMIDIMessage;
        }
      };
    } catch {}
  }

  function initMIDI() {
    if (!navigator.requestMIDIAccess) {
      // No MIDI support; keep keyboard fallback
      return;
    }
    navigator.requestMIDIAccess({ sysex: false })
      .then((midiAccess) => {
        wireMIDIInputs(midiAccess);
        addFeedback('MIDI Ready', 'rgba(120,200,255,0.95)', 0.8);
      })
      .catch(() => {
        // Permission denied or other error; ignore
      });
  }

  function drawHUD() {
    const { w, marginX, centerY, lineSpacing } = getStaffMetrics();
    ctx.save();
    // Score in top-left corner relative to canvas content
    const hudFont = `${Math.max(14, Math.floor(lineSpacing * 0.9))}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    const hudFontSmall = `${Math.max(12, Math.floor(lineSpacing * 0.8))}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    const leftPad = Math.max(10, marginX * 0.5);

    ctx.fillStyle = 'rgba(255,232,80,0.96)';
    ctx.font = hudFont;
    ctx.textBaseline = 'top';
    ctx.fillText(`Score: ${score}`, leftPad, 8);

    // Misses and Level labels below score
    ctx.font = hudFontSmall;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const line1Y = 8 + Math.ceil(parseInt(hudFont, 10) * 1.1);
    ctx.fillText(`Misses: ${currentMisses}`, leftPad, line1Y);

    // Level with a subtle flash when just increased
    const level = getLevel();
    let levelColor = 'rgba(180,220,255,0.95)';
    const nowHud = performance.now();
    if (nowHud - levelFlashAt < 500) {
      const t = (nowHud - levelFlashAt) / 500; // 0..1
      const a = (1 - t) * 0.7 + 0.3; // fade from bright to normal
      levelColor = `rgba(120,200,255,${a.toFixed(3)})`;
    }
    ctx.fillStyle = levelColor;
    const line2Y = line1Y + Math.ceil(parseInt(hudFontSmall, 10) * 1.25);
    ctx.fillText(`Level: ${level}`, leftPad, line2Y);

  // Feedback messages fade out
    const now = performance.now();
    for (let i = feedbacks.length - 1; i >= 0; i--) {
      const f = feedbacks[i];
      const t = (now - f.createdAt) / 1000;
      if (t > f.duration) {
        feedbacks.splice(i, 1);
        continue;
      }
      const alpha = Math.max(0, 1 - t / f.duration);
      ctx.fillStyle = f.color.replace(/\)(?=[^)]*$)/, `, ${alpha})`);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.max(16, Math.floor(lineSpacing * 1.1))}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      ctx.fillText(f.text, w * 0.5, centerY - lineSpacing * 3);
    }

    // Game Over overlay
    if (gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, w, canvas.height / (window.devicePixelRatio || 1));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 80, 80, 0.98)';
      ctx.font = `${Math.max(28, Math.floor(lineSpacing * 2.2))}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      ctx.fillText('Game Over', w / 2, centerY);
    }
    ctx.restore();
  }

  // Game loop
  let last = performance.now();

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); // cap dt for stability
    last = now;
    updateStars(dt);
    drawStars();
  drawGrandStaff();
    if (!gameOver) {
      updateNotes(dt);
    }
    drawNotes();
    drawHUD();
    requestAnimationFrame(loop);
  }

  // Initialize
  initMIDI();
  // UI: Fit mode & Aspect controls
  const btnFit = document.getElementById('btnFit');
  const btnAspect = document.getElementById('btnAspect');
  const btnScale = document.getElementById('btnScale');
  const btnMode = document.getElementById('btnMode');
  const PREF_FIT = 'staffy.fit';
  const PREF_ASPECT = 'staffy.aspect';

  function applyLayoutPrefs() {
  const fit = (localStorage.getItem(PREF_FIT) || 'width');
    const aspect = (localStorage.getItem(PREF_ASPECT) || '4:3');
    document.documentElement.style.setProperty('--aspect', aspect === '16:9' ? '16 / 9' : '4 / 3');
  document.body.classList.toggle('fit-height', fit === 'height');
  document.body.classList.toggle('fit-width', fit === 'width');
  document.body.classList.toggle('fit-window', fit === 'window');
  if (btnFit) btnFit.textContent = `Fit: ${fit === 'height' ? 'Height' : fit === 'window' ? 'Window' : 'Width'}`;
    if (btnAspect) btnAspect.textContent = `Aspect: ${aspect}`;
  if (btnScale) btnScale.textContent = `Size: ${Math.round(getNotationScale() * 100)}%`;
  if (btnMode) btnMode.textContent = `Mode: ${spawnMode}`;
    // Recompute sizes and visuals
    resizeCanvas();
    initStars();
    vfState = null;
  }

  if (btnFit) {
    btnFit.addEventListener('click', () => {
      const current = localStorage.getItem(PREF_FIT) || 'width';
      const next = current === 'width' ? 'height' : current === 'height' ? 'window' : 'width';
      localStorage.setItem(PREF_FIT, next);
      applyLayoutPrefs();
    });
  }

  if (btnAspect) {
    btnAspect.addEventListener('click', () => {
      const current = localStorage.getItem(PREF_ASPECT) || '4:3';
      const next = current === '4:3' ? '16:9' : '4:3';
      localStorage.setItem(PREF_ASPECT, next);
      applyLayoutPrefs();
    });
  }

  if (btnScale) {
    btnScale.addEventListener('click', () => {
      const current = getNotationScale();
      const i = SCALE_PRESETS.findIndex(v => Math.abs(v - current) < 1e-6);
      const next = SCALE_PRESETS[(i + 1) % SCALE_PRESETS.length];
      localStorage.setItem(PREF_SCALE, String(next));
      applyLayoutPrefs();
    });
  }

  if (btnMode) {
    btnMode.addEventListener('click', () => {
      const next = spawnMode === 'Both' ? 'Treble' : spawnMode === 'Treble' ? 'Bass' : 'Both';
      setSpawnMode(next);
      applyLayoutPrefs();
    });
  }

  // Start with one active note
  // Ensure mode from storage is applied
  setSpawnMode(spawnMode);
  spawnNewNote();
  applyLayoutPrefs();
  requestAnimationFrame(loop);
})();
