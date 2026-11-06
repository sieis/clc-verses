(function () {
  const data = window.versesData;
  if (!data) {
    console.error('versesData not loaded — make sure data.js is included before app.js');
    return;
  }

  const VT_SOURCE_CLASS = 'is-vt-source';
  const VT_SUPPORTED = typeof document.startViewTransition === 'function';

  /* One-time diagnostic so it's obvious in DevTools whether the API is being used. */
  console.log('[CLC] View Transitions API supported:', VT_SUPPORTED,
    '| prefers-reduced-motion:', window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const state = {
    translation: 'NIV',
    display: 'inline',   // 'inline' | 'popup'
    reveal: 'hint',      // 'hint' | 'verse' | 'none' (shared by inline cards and the popup)
    view: 'modules',
    activeModule: null,
    isAnimating: false
  };

  /* Wraps a DOM swap in a View Transition when supported. The CSS handles
     prefers-reduced-motion (animation: none on ::view-transition-* pseudos),
     so we don't gate on it in JS — that way the API still gets called and
     the swap stays consistent. */
  function withViewTransition(run) {
    if (VT_SUPPORTED) {
      return document.startViewTransition(run).finished.catch(() => {});
    }
    run();
    return Promise.resolve();
  }

  /* FLIP fallback for browsers without VT API: animate the new panel from the
     clicked card's rect to its natural rect using Web Animations API. */
  function flipPanelFromCard(cardRect) {
    const panel = document.querySelector('.panel');
    if (!panel || !cardRect) return Promise.resolve();
    const panelRect = panel.getBoundingClientRect();
    const dx = cardRect.left - panelRect.left;
    const dy = cardRect.top - panelRect.top;
    const sx = cardRect.width / Math.max(panelRect.width, 1);
    const sy = cardRect.height / Math.max(panelRect.height, 1);
    panel.style.transformOrigin = '0 0';
    return panel.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.3 },
      { transform: 'translate(0, 0) scale(1, 1)', opacity: 1 }
    ], { duration: 420, easing: 'cubic-bezier(0.2, 0.65, 0.3, 1)' })
      .finished.then(() => { panel.style.transformOrigin = ''; })
      .catch(() => {});
  }

  function fadePanelOut() {
    const panel = document.querySelector('.panel');
    if (!panel) return Promise.resolve();
    return panel.animate([
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'translateY(8px) scale(0.99)' }
    ], { duration: 240, easing: 'cubic-bezier(0.2, 0.65, 0.3, 1)' })
      .finished.catch(() => {});
  }

  /* tiny DOM helper — handles --custom-property style values correctly */
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') {
        node.className = v;
      } else if (k === 'style' && typeof v === 'object') {
        for (const [prop, val] of Object.entries(v)) {
          if (prop.startsWith('--')) node.style.setProperty(prop, val);
          else node.style[prop] = val;
        }
      } else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2), v);
      } else if (k === 'dataset') {
        Object.assign(node.dataset, v);
      } else if (v !== undefined && v !== null) {
        node.setAttribute(k, v);
      }
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  };

  /* ===== RENDER ===== */
  function renderGrid() {
    const grid = document.querySelector('.module-grid');
    grid.innerHTML = '';
    data.modules.forEach((mod) => {
      const card = el('button', {
        class: 'module-card',
        type: 'button',
        dataset: { module: mod.id },
        style: { '--accent': mod.color },
        onclick: () => openModule(mod.id)
      }, [
        el('div', { class: 'card-top' }),
        el('div', { class: 'card-bottom' }, [
          el('div', { class: 'module-num' }, `Module ${String(mod.id).padStart(2, '0')}`),
          el('div', { class: 'module-name' }, mod.name)
        ])
      ]);
      grid.appendChild(card);
    });
  }

  function renderPanel(moduleId) {
    const mod = data.modules.find(m => m.id === moduleId);
    const idx = data.modules.findIndex(m => m.id === moduleId);
    const prevMod = idx > 0 ? data.modules[idx - 1] : null;
    const nextMod = idx >= 0 && idx < data.modules.length - 1 ? data.modules[idx + 1] : null;
    const container = document.querySelector('.panel-container');
    container.innerHTML = '';

    const panel = el('section', {
      class: 'panel',
      style: { '--accent': mod.color }
    }, [
      el('div', { class: 'panel-toolbar' }, [
        el('div', { class: 'panel-nav' }, [
          el('button', {
            class: 'nav-link nav-prev',
            type: 'button',
            'aria-label': prevMod ? `Previous module: ${prevMod.name}` : 'No previous module',
            disabled: prevMod ? null : '',
            onclick: prevMod ? () => goToModule(prevMod.id) : null
          }, '←'),
          el('button', {
            class: 'back-link',
            type: 'button',
            onclick: closeModule
          }, 'All Modules'),
          el('button', {
            class: 'nav-link nav-next',
            type: 'button',
            'aria-label': nextMod ? `Next module: ${nextMod.name}` : 'No next module',
            disabled: nextMod ? null : '',
            onclick: nextMod ? () => goToModule(nextMod.id) : null
          }, '→')
        ]),
        el('div', { class: 'toolbar-toggles' }, [
          el('div', { class: 'translation-toggle', role: 'group', 'aria-label': 'Bible translation' }, [
            el('button', { type: 'button', dataset: { tr: 'NIV' } }, 'NIV'),
            el('button', { type: 'button', dataset: { tr: 'ESV' } }, 'ESV')
          ]),
          el('div', { class: 'display-toggle', role: 'group', 'aria-label': 'Verse display' }, [
            el('button', { type: 'button', dataset: { display: 'inline' } }, 'Inline'),
            el('button', { type: 'button', dataset: { display: 'popup' } }, 'Pop up')
          ])
        ])
      ]),
      el('div', { class: 'panel-header' }, [
        el('div', { class: 'panel-eyebrow' },
          `Module ${String(mod.id).padStart(2, '0')}`),
        el('h2', { class: 'panel-title' }, mod.name)
      ]),
      el('div', { class: 'verse-grid' },
        mod.verses.map((v, i) => renderVerseCard(v, { seq: panelSeq(mod), index: i, accent: mod.color }))
      )
    ]);

    container.appendChild(panel);
    bindTranslationButtons(panel);
    bindDisplayButtons(panel);
    setTranslation(state.translation);
    setDisplay(state.display);
    return panel;
  }

  function firstWords(text, n) {
    const words = text.trim().split(/\s+/);
    return words.slice(0, n).join(' ') + (words.length > n ? '…' : '');
  }
  const HINT_WORDS = 5;

  function panelSeq(mod) {
    return mod.verses.map(v => ({ verse: v, mod }));
  }
  let allSeq = null;

  function revealButtons() {
    return ['hint', 'verse'].map(mode => el('button', {
      class: 'hint-btn',
      type: 'button',
      dataset: { reveal: mode },
      'aria-expanded': 'false',
      onclick: () => setReveal(state.reveal === mode ? 'none' : mode)
    }, `Show ${mode}`));
  }

  function renderVerseCard(verse, opts = {}) {
    const refChildren = opts.moduleLabel
      ? [
          el('div', { class: 'verse-card-module' }, opts.moduleLabel),
          el('div', {}, verse.ref)
        ]
      : verse.ref;

    const head = el('button', {
      class: 'verse-head',
      type: 'button',
      'aria-expanded': 'false'
    }, [
      el('div', { class: 'verse-top' }),
      el('div', { class: 'verse-ref' }, refChildren)
    ]);

    const text = el('div', { class: 'verse-text-inner', inert: '' }, [
      el('div', { class: 'verse-text' }, [
        el('div', { class: 'reveal-btns' }, revealButtons()),
        el('p', { class: 'verse-body' }, ['NIV', 'ESV'].flatMap(tr => [
          el('span', { class: `${tr.toLowerCase()} h` }, firstWords(verse.text[tr], HINT_WORDS)),
          el('span', { class: `${tr.toLowerCase()} f` }, verse.text[tr])
        ]))
      ])
    ]);

    const attrs = { class: 'verse-card' };
    if (opts.accent) attrs.style = { '--accent': opts.accent };
    const card = el('div', attrs, [head, text]);
    head.addEventListener('click', () => {
      if (state.display === 'popup') openPopup(opts.seq, opts.index, head);
      else toggleVerse(card);
    });
    return card;
  }

  function renderAllVerses() {
    const grid = document.querySelector('.all-verses-grid');
    if (!grid) return;
    grid.innerHTML = '';
    allSeq = data.modules.flatMap(mod => panelSeq(mod));
    let n = 0;
    data.modules.forEach((mod) => {
      const moduleLabel = `Module ${String(mod.id).padStart(2, '0')}`;
      mod.verses.forEach((v) => {
        grid.appendChild(renderVerseCard(v, { accent: mod.color, moduleLabel, seq: allSeq, index: n++ }));
      });
    });
    setDisplay(state.display);
    syncReveal();
  }

  /* ===== MODULE OPEN / CLOSE =====
     Uses View Transitions API when available; falls back to FLIP (open) /
     fade (close) via the Web Animations API. */
  function openModule(moduleId) {
    if (state.isAnimating) return;
    state.isAnimating = true;
    state.activeModule = moduleId;

    const grid = document.querySelector('.module-grid');
    const card = grid.querySelector(`[data-module="${moduleId}"]`);
    const sectionHead = document.querySelector('.grid-scene .modules-section-head');
    const cardRect = card ? card.getBoundingClientRect() : null;

    if (card) card.classList.add(VT_SOURCE_CLASS);

    const siteHeader = document.querySelector('.site-header');

    const swap = () => {
      grid.hidden = true;
      if (sectionHead) sectionHead.hidden = true;
      if (siteHeader) siteHeader.hidden = true;
      renderPanel(moduleId);
      window.scrollTo(0, 0);
    };

    let done;
    if (VT_SUPPORTED) {
      done = document.startViewTransition(swap).finished.catch(() => {});
    } else {
      swap();
      done = flipPanelFromCard(cardRect);
    }

    done.finally(() => {
      if (card) card.classList.remove(VT_SOURCE_CLASS);
      state.isAnimating = false;
    });
  }

  function goToModule(moduleId) {
    if (state.isAnimating) return;
    if (moduleId === state.activeModule) return;
    state.isAnimating = true;
    state.activeModule = moduleId;

    const swap = () => {
      renderPanel(moduleId);
      window.scrollTo(0, 0);
    };

    let done;
    if (VT_SUPPORTED) {
      done = document.startViewTransition(swap).finished.catch(() => {});
    } else {
      swap();
      done = Promise.resolve();
    }

    done.finally(() => {
      state.isAnimating = false;
    });
  }

  function closeModule() {
    if (state.isAnimating) return;
    state.isAnimating = true;

    const moduleId = state.activeModule;
    const panelContainer = document.querySelector('.panel-container');
    const grid = document.querySelector('.module-grid');
    const sectionHead = document.querySelector('.grid-scene .modules-section-head');

    const siteHeader = document.querySelector('.site-header');

    const swap = () => {
      panelContainer.innerHTML = '';
      state.activeModule = null;
      grid.hidden = false;
      if (sectionHead) sectionHead.hidden = false;
      if (siteHeader) siteHeader.hidden = false;
      const card = document.querySelector(`.module-card[data-module="${moduleId}"]`);
      if (card) card.classList.add(VT_SOURCE_CLASS);
    };

    let done;
    if (VT_SUPPORTED) {
      done = document.startViewTransition(swap).finished.catch(() => {});
    } else {
      done = fadePanelOut().then(swap);
    }

    done.finally(() => {
      const card = document.querySelector(`.module-card[data-module="${moduleId}"]`);
      if (card) card.classList.remove(VT_SOURCE_CLASS);
      state.isAnimating = false;
    });
  }

  /* ===== VIEW TOGGLE — Modules ⇄ All Verses ===== */
  function applyView(view) {
    const gridScene = document.querySelector('.grid-scene');
    const allScene = document.querySelector('.all-scene');
    const panelContainer = document.querySelector('.panel-container');
    const moduleGrid = document.querySelector('.module-grid');
    const moduleSectionHead = document.querySelector('.grid-scene .modules-section-head');

    const siteHeader = document.querySelector('.site-header');

    /* Any open module panel is closed when view changes. */
    panelContainer.innerHTML = '';
    state.activeModule = null;
    if (moduleGrid) moduleGrid.hidden = false;
    if (moduleSectionHead) moduleSectionHead.hidden = false;
    if (siteHeader) siteHeader.hidden = false;

    if (view === 'all') {
      gridScene.hidden = true;
      renderAllVerses();
      allScene.hidden = false;
    } else {
      allScene.hidden = true;
      gridScene.hidden = false;
    }
  }

  function syncViewToggleButtons(view) {
    document.querySelectorAll('.view-toggle button').forEach(btn => {
      const active = btn.dataset.view === view;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function setView(view) {
    if (view === state.view) return;
    state.view = view;
    syncViewToggleButtons(view);
    withViewTransition(() => applyView(view));
  }

  function initViewToggle() {
    document.querySelectorAll('.view-toggle button').forEach(btn => {
      btn.addEventListener('click', () => setView(btn.dataset.view));
    });
    syncViewToggleButtons(state.view);
    applyView(state.view);
  }

  /* ===== VERSE TOGGLE — accordion (one open at a time), CSS grid-template-rows ===== */
  function toggleVerse(card) {
    const wasOpen = card.classList.contains('is-open');
    document.querySelectorAll('.verse-card.is-open').forEach(c => closeVerseCard(c));
    if (!wasOpen) openVerseCard(card);
  }

  function openVerseCard(card) {
    card.classList.add('is-open');
    card.querySelector('.verse-head').setAttribute('aria-expanded', 'true');
    card.querySelector('.verse-text-inner').inert = false;
  }

  function closeVerseCard(card) {
    card.classList.remove('is-open');
    card.querySelector('.verse-head').setAttribute('aria-expanded', 'false');
    card.querySelector('.verse-text-inner').inert = true;
  }

  /* ===== REVEAL (hint / verse / hidden) ===== */
  function setReveal(mode) {
    state.reveal = mode;
    syncReveal();
  }

  function syncReveal() {
    document.body.dataset.reveal = state.reveal;
    document.querySelectorAll('[data-reveal]').forEach(btn => {
      if (!btn.classList.contains('hint-btn')) return;
      const on = btn.dataset.reveal === state.reveal;
      btn.setAttribute('aria-expanded', String(on));
      btn.textContent = `${on ? 'Hide' : 'Show'} ${btn.dataset.reveal}`;
    });
    fillPopupText();
  }

  /* ===== DISPLAY MODE (inline / popup) ===== */
  function setDisplay(mode) {
    state.display = mode;
    document.body.dataset.display = mode;
    try { localStorage.setItem('clc-display', mode); } catch (e) { /* ignore */ }
    document.querySelectorAll('.display-toggle button').forEach(btn => {
      const active = btn.dataset.display === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('.verse-card').forEach(card => {
      if (mode === 'popup') closeVerseCard(card);
      const head = card.querySelector('.verse-head');
      if (mode === 'popup') {
        head.removeAttribute('aria-expanded');
        head.setAttribute('aria-haspopup', 'dialog');
      } else {
        head.removeAttribute('aria-haspopup');
        head.setAttribute('aria-expanded', String(card.classList.contains('is-open')));
      }
    });
  }

  function bindDisplayButtons(root = document) {
    root.querySelectorAll('.display-toggle button').forEach(btn => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => setDisplay(btn.dataset.display));
    });
  }

  /* ===== POPUP ===== */
  const dlg = document.querySelector('dialog.result');
  const pop = { seq: null, i: 0, origin: null };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function openPopup(seq, index, origin) {
    if (dlg.open) return;
    pop.seq = seq; pop.i = index; pop.origin = origin;
    fillPopup();
    dlg.showModal();
    void dlg.offsetWidth;            // commit the start state so the transition runs
    dlg.classList.add('is-in');
  }

  function fillPopup() {
    const { verse, mod } = pop.seq[pop.i];
    dlg.querySelector('.result-card').style.setProperty('--accent', mod.color);
    dlg.querySelector('.result-eyebrow').textContent =
      `Module ${String(mod.id).padStart(2, '0')} · ${mod.name}`;
    dlg.querySelector('.result-ref').textContent = verse.ref;
    dlg.querySelector('.pop-pos').textContent = `${pop.i + 1} of ${pop.seq.length}`;
    dlg.querySelector('[data-step="-1"]').disabled = pop.i === 0;
    dlg.querySelector('[data-step="1"]').disabled = pop.i === pop.seq.length - 1;
    fillPopupText();
  }

  function fillPopupText() {
    if (!pop.seq) return;
    const hint = dlg.querySelector('.hint');
    const open = state.reveal !== 'none';
    if (open) {
      const text = pop.seq[pop.i].verse.text[state.translation];
      dlg.querySelector('.hint-label').textContent =
        state.reveal === 'hint' ? 'First five words' : `Full verse · ${state.translation}`;
      dlg.querySelector('.hint-text').textContent =
        state.reveal === 'hint' ? firstWords(text, HINT_WORDS) : text;
    }
    hint.classList.toggle('is-open', open);
    hint.classList.toggle('is-verse', state.reveal === 'verse');
    hint.inert = !open;
  }

  function stepPopup(d) {
    const next = pop.i + d;
    if (!dlg.open || next < 0 || next >= pop.seq.length) return;
    pop.i = next;
    pop.origin = null;               // the original card is no longer the one to refocus
    fillPopup();
  }

  function closePopup() {
    if (!dlg.open) return;
    dlg.classList.remove('is-in');
    const origin = pop.origin;
    const done = () => {
      if (dlg.open) dlg.close();
      if (origin && origin.isConnected) origin.focus({ preventScroll: true });
    };
    if (reduced.matches) done(); else setTimeout(done, 240);
  }

  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) closePopup();
    const step = e.target.closest('[data-step]');
    if (step) stepPopup(Number(step.dataset.step));
    if (e.target.closest('[data-act="close"]')) closePopup();
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closePopup(); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') stepPopup(-1);
    else if (e.key === 'ArrowRight') stepPopup(1);
  });
  dlg.querySelectorAll('.hint-btn').forEach(btn => btn.addEventListener('click',
    () => setReveal(state.reveal === btn.dataset.reveal ? 'none' : btn.dataset.reveal)));

  /* ===== TRANSLATION TOGGLE ===== */
  function setTranslation(tr) {
    state.translation = tr;
    document.body.dataset.translation = tr;
    try { localStorage.setItem('clc-translation', tr); } catch (e) { /* ignore */ }

    document.querySelectorAll('.translation-toggle button').forEach(btn => {
      const active = btn.dataset.tr === tr;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    fillPopupText();
    const attr = document.querySelector('[data-attribution]');
    if (attr) attr.textContent = data.attributions[tr];
  }

  /* Idempotent — won't double-bind if called repeatedly on the same root. */
  function bindTranslationButtons(root = document) {
    root.querySelectorAll('.translation-toggle button').forEach(btn => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => setTranslation(btn.dataset.tr));
    });
  }

  function initTranslationToggle() {
    bindTranslationButtons();
    setTranslation(state.translation);
  }

  /* ===== INIT ===== */
  document.addEventListener('DOMContentLoaded', () => {
    /* Same key the Verse Wheel page uses, so the choice follows you between pages. */
    try {
      const saved = localStorage.getItem('clc-translation');
      if (saved === 'NIV' || saved === 'ESV') state.translation = saved;
    } catch (e) { /* ignore */ }
    try {
      const d = localStorage.getItem('clc-display');
      if (d === 'inline' || d === 'popup') state.display = d;
    } catch (e) { /* ignore */ }
    renderGrid();
    initTranslationToggle();
    bindDisplayButtons();
    setDisplay(state.display);
    syncReveal();
    initViewToggle();
  });
})();
