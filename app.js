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
    const container = document.querySelector('.panel-container');
    container.innerHTML = '';

    const panel = el('section', {
      class: 'panel',
      style: { '--accent': mod.color }
    }, [
      el('div', { class: 'panel-toolbar' }, [
        el('button', {
          class: 'back-link',
          type: 'button',
          onclick: closeModule
        }, '← All Modules'),
        el('div', { class: 'translation-toggle', role: 'group', 'aria-label': 'Bible translation' }, [
          el('button', { type: 'button', dataset: { tr: 'NIV' } }, 'NIV'),
          el('div', { class: 'divider' }),
          el('button', { type: 'button', dataset: { tr: 'ESV' } }, 'ESV')
        ])
      ]),
      el('div', { class: 'panel-header' }, [
        el('div', { class: 'panel-eyebrow', style: { color: mod.color } },
          `Module ${String(mod.id).padStart(2, '0')}`),
        el('h2', { class: 'panel-title' }, mod.name)
      ]),
      el('div', { class: 'verse-grid' },
        mod.verses.map(v => renderVerseCard(v))
      )
    ]);

    container.appendChild(panel);
    bindTranslationButtons(panel);
    setTranslation(state.translation);
    return panel;
  }

  function renderVerseCard(verse, opts = {}) {
    const attrs = {
      class: 'verse-card',
      type: 'button',
      'aria-expanded': 'false'
    };
    if (opts.accent) attrs.style = { '--accent': opts.accent };

    const refChildren = opts.moduleLabel
      ? [
          el('div', { class: 'verse-card-module' }, opts.moduleLabel),
          el('div', {}, verse.ref)
        ]
      : verse.ref;

    const card = el('button', attrs, [
      el('div', { class: 'verse-top' }),
      el('div', { class: 'verse-ref' }, refChildren),
      el('div', { class: 'verse-text-inner' }, [
        el('div', { class: 'verse-text' }, [
          el('span', { class: 'niv' }, verse.text.NIV),
          el('span', { class: 'esv' }, verse.text.ESV)
        ])
      ])
    ]);
    card.addEventListener('click', () => toggleVerse(card));
    return card;
  }

  function renderAllVerses() {
    const grid = document.querySelector('.all-verses-grid');
    if (!grid) return;
    grid.innerHTML = '';
    data.modules.forEach((mod) => {
      const moduleLabel = `Module ${String(mod.id).padStart(2, '0')}`;
      mod.verses.forEach((v) => {
        grid.appendChild(renderVerseCard(v, { accent: mod.color, moduleLabel }));
      });
    });
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
    card.setAttribute('aria-expanded', 'true');
  }

  function closeVerseCard(card) {
    card.classList.remove('is-open');
    card.setAttribute('aria-expanded', 'false');
  }

  /* ===== TRANSLATION TOGGLE ===== */
  function setTranslation(tr) {
    state.translation = tr;
    document.body.dataset.translation = tr;

    document.querySelectorAll('.translation-toggle button').forEach(btn => {
      const active = btn.dataset.tr === tr;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

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
    renderGrid();
    initTranslationToggle();
    initViewToggle();
  });
})();
