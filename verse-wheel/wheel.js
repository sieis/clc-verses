(function () {
  const data = window.versesData;
  if (!data) {
    console.error('versesData not loaded — make sure data.js is included before wheel.js');
    return;
  }

  const SESSION_KEY = 'clc-wheel-session-v1';
  const TRANSLATION_KEY = 'clc-translation';
  const SPIN_MS = 6000;
  const HINT_WORDS = 5;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ===== DATA ===== */
  const verses = [];
  data.modules.forEach((mod) => {
    mod.verses.forEach((v, i) => {
      verses.push({
        id: `${mod.id}.${i}`,
        ref: v.ref,
        text: v.text,
        moduleId: mod.id,
        moduleName: mod.name,
        color: mod.color
      });
    });
  });
  const N = verses.length;
  const SLICE = 360 / N;
  const byId = new Map(verses.map((v, i) => [v.id, i]));

  /* ===== STATE ===== */
  const state = {
    translation: 'NIV',
    mode: 'random',        // 'random' | 'norepeat'
    counts: {},            // verse id -> times selected this session
    roundSeen: new Set(),  // verse ids seen in the current round (drives no-repeat)
    round: 1,
    spins: 0,
    last: null,            // id of the most recent pick
    pending: null,         // id of a result still waiting to be dismissed
    angle: 0,              // wheel rotation in degrees (clockwise)
    spinning: false
  };

  /* Session state lives in sessionStorage so it survives going Home and back,
     or a refresh, but resets when the tab is closed. */
  function loadSession() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!raw) return;
      for (const [id, n] of Object.entries(raw.counts || {})) {
        if (byId.has(id) && n > 0) state.counts[id] = n | 0;
      }
      (raw.roundSeen || []).forEach((id) => { if (byId.has(id)) state.roundSeen.add(id); });
      state.round = Math.max(1, raw.round | 0 || 1);
      state.spins = Math.max(0, raw.spins | 0);
      state.last = byId.has(raw.last) ? raw.last : null;
      state.pending = byId.has(raw.pending) ? raw.pending : null;
      if (raw.mode === 'random' || raw.mode === 'norepeat') state.mode = raw.mode;
    } catch (e) { /* storage unavailable or corrupt — start fresh */ }
  }

  function saveSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        counts: state.counts,
        roundSeen: [...state.roundSeen],
        round: state.round,
        spins: state.spins,
        last: state.last,
        pending: state.pending,
        mode: state.mode
      }));
    } catch (e) { /* ignore */ }
  }

  /* ===== ELEMENTS ===== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const canvas = $('.wheel');
  const pointer = $('.pointer');
  const readout = $('.readout');
  const readoutLabel = $('.readout-label');
  const readoutRef = $('.readout-ref');
  const spinBtn = $('.spin-btn');
  const modeNote = $('.mode-note');
  const resetBtn = $('.reset-btn');
  const chipGrid = $('.chip-grid');
  const live = $('#live');
  const dlg = $('.result');
  const hintBtn = $('.hint-btn', dlg);
  const hintEl = $('.hint', dlg);

  /* ===== WHEEL DRAWING =====
     Drawn once to a canvas; spinning is a CSS rotation of that canvas, so the
     animation never repaints. Slice i covers [i*SLICE, (i+1)*SLICE) degrees
     measured clockwise from 12 o'clock. */
  function drawWheel() {
    const size = canvas.clientWidth;
    if (!size) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const c = size / 2;
    const R = c - 1;
    const hubR = R * 0.17;
    const step = (Math.PI * 2) / N;
    const start = -Math.PI / 2;

    verses.forEach((v, i) => {
      const a0 = start + i * step;
      const a1 = a0 + step;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, R, a0, a1);
      ctx.closePath();
      ctx.fillStyle = v.color;
      ctx.fill();
      if (i % 2) {            // alternate shading so neighbours in one module stay distinct
        ctx.fillStyle = 'rgba(0,0,0,0.14)';
        ctx.fill();
      }
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#181818';
      ctx.stroke();
    });

    /* One font size for the whole wheel, shrunk until the longest reference fits. */
    const family = "'Inter', -apple-system, system-ui, sans-serif";
    const maxLen = R - hubR - 24;
    let fs = Math.max(8, Math.min(14, ((2 * Math.PI * R * 0.7) / N) * 0.5));
    ctx.font = `600 ${fs}px ${family}`;
    const longest = Math.max(...verses.map((v) => ctx.measureText(v.ref).width));
    if (longest > maxLen) {
      fs = Math.max(6.5, fs * (maxLen / longest));
      ctx.font = `600 ${fs}px ${family}`;
    }

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    verses.forEach((v, i) => {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(start + (i + 0.5) * step);
      ctx.fillText(v.ref, R - 12, 0);
      ctx.restore();
    });
  }

  function setAngle(deg) {
    canvas.style.transform = `rotate(${deg}deg)`;
  }

  function indexAtPointer(angle) {
    const a = (((-angle) % 360) + 360) % 360;
    return Math.min(N - 1, Math.floor(a / SLICE));
  }

  /* ===== PICKING ===== */
  /* True random: any verse. No repeats: only verses not yet seen this round;
     once every verse has been seen a new round starts (and the verse just
     picked is held out so it can't land twice in a row across the boundary). */
  function pickTarget() {
    const rollover = state.roundSeen.size >= N;
    const seen = rollover ? new Set() : state.roundSeen;
    let pool = [];
    for (let i = 0; i < N; i++) {
      if (state.mode === 'random' || !seen.has(verses[i].id)) pool.push(i);
    }
    if (state.mode === 'norepeat' && rollover && N > 1) {
      pool = pool.filter((i) => verses[i].id !== state.last);
    }
    return { index: pool[Math.floor(Math.random() * pool.length)], rollover };
  }

  function commitPick(index, rollover) {
    const v = verses[index];
    if (rollover) {
      state.round += 1;
      state.roundSeen.clear();
    }
    state.counts[v.id] = (state.counts[v.id] || 0) + 1;
    state.roundSeen.add(v.id);
    state.spins += 1;
    state.last = v.id;
    state.pending = v.id;
    saveSession();
  }

  /* ===== SPIN ===== */
  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

  function setReadout(v, { label, mode }) {
    readout.classList.toggle('is-idle', mode === 'idle');
    readout.classList.toggle('is-spinning', mode === 'spinning');
    readout.style.setProperty('--accent', v ? v.color : 'var(--hairline)');
    if (label != null) readoutLabel.textContent = label;
    readoutRef.textContent = v ? v.ref : 'Press spin';
  }

  function spin() {
    if (state.spinning || dlg.open) return;
    state.spinning = true;
    spinBtn.disabled = true;
    resetBtn.disabled = true;
    spinBtn.textContent = 'Spinning…';
    live.textContent = 'Spinning.';

    const { index, rollover } = pickTarget();

    /* Land somewhere inside the target slice (not on an edge), after 5–7 full turns. */
    const within = (0.2 + Math.random() * 0.6) * SLICE;
    const wanted = (360 - ((index * SLICE + within) % 360)) % 360;  // angle mod 360 that puts it under the pointer
    const current = ((state.angle % 360) + 360) % 360;
    const delta = (wanted - current + 360) % 360;
    const turns = 5 + Math.floor(Math.random() * 3);
    const from = state.angle;
    const to = from + turns * 360 + delta;

    pointer.classList.remove('is-settling');
    setReadout(null, { label: 'Spinning', mode: 'spinning' });

    const finish = () => {
      state.angle = to % 360;
      setAngle(state.angle);
      pointer.classList.add('is-settling');
      pointer.style.transform = 'rotate(0deg)';
      state.spinning = false;
      spinBtn.textContent = 'Spin';
      spinBtn.disabled = false;
      resetBtn.disabled = false;

      commitPick(index, rollover);
      const v = verses[index];
      setReadout(v, { label: `Module ${String(v.moduleId).padStart(2, '0')}`, mode: 'final' });
      live.textContent = `Landed on ${v.ref}.`;
      render({ flash: v.id });
      setTimeout(() => showResult(v), reducedMotion.matches ? 0 : 450);
    };

    if (reducedMotion.matches) {
      setAngle(to);
      setTimeout(finish, 150);
      return;
    }

    let lastIdx = indexAtPointer(from);
    let kick = 0;
    const t0 = performance.now();

    function frame(now) {
      const x = Math.min(1, (now - t0) / SPIN_MS);
      const angle = from + (to - from) * easeOutCubic(x);
      setAngle(angle);

      const idx = indexAtPointer(angle);
      if (idx !== lastIdx) {
        lastIdx = idx;
        kick = 1;
        const v = verses[idx];
        readoutRef.textContent = v.ref;
        readout.style.setProperty('--accent', v.color);
      }
      kick *= 0.8;                       // pointer flicks as each slice passes, then springs back
      pointer.style.transform = `rotate(${-kick * 24}deg)`;

      if (x < 1) requestAnimationFrame(frame);
      else finish();
    }
    requestAnimationFrame(frame);
  }

  /* ===== RESULT DIALOG ===== */
  function firstWords(text, n) {
    const words = text.trim().split(/\s+/);
    return words.slice(0, n).join(' ') + (words.length > n ? '…' : '');
  }

  function setHint(open) {
    hintEl.classList.toggle('is-open', open);
    hintEl.inert = !open;
    hintBtn.setAttribute('aria-expanded', String(open));
    hintBtn.textContent = open ? 'Hide hint' : 'Show hint';
  }

  function showResult(v) {
    if (dlg.open) return;
    const times = state.counts[v.id] || 1;
    $('.result-card', dlg).style.setProperty('--accent', v.color);
    $('.result-eyebrow', dlg).textContent =
      `Module ${String(v.moduleId).padStart(2, '0')} · ${v.moduleName}`;
    $('.result-ref', dlg).textContent = v.ref;
    $('.hint-text', dlg).textContent = firstWords(v.text[state.translation], HINT_WORDS);
    $('.result-count', dlg).textContent =
      times === 1 ? 'First time this session.' : `Selected ${times} times this session.`;
    setHint(false);

    dlg.showModal();
    void dlg.offsetWidth;               // commit the start state so the transition runs
    dlg.classList.add('is-in');
  }

  function dismiss(thenSpin) {
    if (!dlg.open) return;
    state.pending = null;
    saveSession();
    dlg.classList.remove('is-in');
    const done = () => {
      if (dlg.open) dlg.close();
      if (thenSpin) spin();
      else spinBtn.focus({ preventScroll: true });
    };
    if (reducedMotion.matches) done();
    else setTimeout(done, 240);
  }

  hintBtn.addEventListener('click', () => setHint(!hintEl.classList.contains('is-open')));
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dismiss(false);                       // backdrop
    const act = e.target.closest('[data-act]');
    if (act) dismiss(act.dataset.act === 'again');
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); dismiss(false); });  // Esc

  /* ===== TRACKER + STATS ===== */
  function buildTracker() {
    chipGrid.innerHTML = '';
    verses.forEach((v) => {
      const li = document.createElement('li');
      li.className = 'chip';
      li.dataset.id = v.id;
      li.style.setProperty('--accent', v.color);
      li.title = `Module ${v.moduleId}: ${v.moduleName}`;
      li.innerHTML = '<span class="chip-ref"></span><span class="chip-count"></span>';
      li.firstChild.textContent = v.ref;
      chipGrid.appendChild(li);
    });
  }

  function render({ flash } = {}) {
    chipGrid.querySelectorAll('.chip').forEach((li) => {
      const n = state.counts[li.dataset.id] || 0;
      li.classList.toggle('is-hit', n > 0);
      li.querySelector('.chip-count').textContent = n;
      li.setAttribute('aria-label', `${verses[byId.get(li.dataset.id)].ref}: selected ${n} ${n === 1 ? 'time' : 'times'}`);
      li.classList.remove('is-new');
      if (flash === li.dataset.id) {
        void li.offsetWidth;
        li.classList.add('is-new');
      }
    });

    const seen = Object.keys(state.counts).length;
    $('[data-stat="spins"]').textContent = state.spins;
    $('[data-stat="seen"]').innerHTML = `${seen}<small> / ${N}</small>`;
    $('[data-stat="round"]').textContent = state.round;

    const left = N - state.roundSeen.size;
    if (state.mode === 'random') {
      modeNote.textContent = 'Every spin is independent, so the same verse can come up again, even back to back.';
    } else if (left === 0) {
      modeNote.textContent = `Round ${state.round} is complete. The next spin starts round ${state.round + 1}.`;
    } else {
      modeNote.textContent = `No verse repeats until all ${N} have come up. ${left} left in round ${state.round}.`;
    }

    resetBtn.disabled = state.spinning || (state.spins === 0);
  }

  /* Reset takes two clicks so a stray tap can't wipe a session. */
  let armTimer = null;
  function disarmReset() {
    clearTimeout(armTimer);
    resetBtn.classList.remove('is-armed');
    resetBtn.textContent = 'Reset session';
  }
  resetBtn.addEventListener('click', () => {
    if (!resetBtn.classList.contains('is-armed')) {
      resetBtn.classList.add('is-armed');
      resetBtn.textContent = 'Click again to confirm';
      armTimer = setTimeout(disarmReset, 3500);
      return;
    }
    disarmReset();
    state.counts = {};
    state.roundSeen = new Set();
    state.round = 1;
    state.spins = 0;
    state.last = null;
    state.pending = null;
    saveSession();
    setReadout(null, { label: 'Ready', mode: 'idle' });
    live.textContent = 'Session reset.';
    render();
  });

  /* ===== MODE + TRANSLATION ===== */
  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.mode-toggle button').forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    saveSession();
    render();
  }

  function setTranslation(tr) {
    state.translation = tr;
    document.body.dataset.translation = tr;
    document.querySelectorAll('.translation-toggle button').forEach((btn) => {
      const active = btn.dataset.tr === tr;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    const attr = $('[data-attribution]');
    if (attr) attr.textContent = data.attributions[tr];
    try { localStorage.setItem(TRANSLATION_KEY, tr); } catch (e) { /* ignore */ }
  }

  /* ===== INIT ===== */
  document.addEventListener('DOMContentLoaded', () => {
    loadSession();
    try {
      const tr = localStorage.getItem(TRANSLATION_KEY);
      if (tr === 'NIV' || tr === 'ESV') state.translation = tr;
    } catch (e) { /* ignore */ }

    buildTracker();
    setTranslation(state.translation);
    setMode(state.mode);

    document.querySelectorAll('.translation-toggle button')
      .forEach((btn) => btn.addEventListener('click', () => setTranslation(btn.dataset.tr)));
    document.querySelectorAll('.mode-toggle button')
      .forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
    spinBtn.addEventListener('click', spin);

    drawWheel();
    new ResizeObserver(drawWheel).observe(canvas);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawWheel);

    /* A result stays up until dismissed, even across a refresh or a trip Home. */
    if (state.pending) {
      const v = verses[byId.get(state.pending)];
      setReadout(v, { label: `Module ${String(v.moduleId).padStart(2, '0')}`, mode: 'final' });
      showResult(v);
    } else if (state.last) {
      const v = verses[byId.get(state.last)];
      setReadout(v, { label: `Last pick · Module ${String(v.moduleId).padStart(2, '0')}`, mode: 'final' });
    }
  });
})();
