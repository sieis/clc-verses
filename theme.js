/* Sets html[data-theme] before first paint. Light is the default. */
(function () {
  var KEY = 'reverse-theme';
  var META = { light: '#faf8f5', dark: '#14181c' };
  var root = document.documentElement;

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', META[theme]);
    var btn = document.querySelector('.theme-toggle');
    if (btn) btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
  root.setAttribute('data-theme', saved === 'dark' ? 'dark' : 'light');

  document.addEventListener('DOMContentLoaded', function () {
    apply(root.getAttribute('data-theme'));
    var btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
      window.dispatchEvent(new Event('themechange'));
    });
  });
})();
