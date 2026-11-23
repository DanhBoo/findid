// FindID site language switch (English / Tieng Viet). Order: ?lang= in the URL, then the viewer's last choice, then the browser language.
// Without this script both languages stay visible (style.css hides one only when <html data-lang> is set).
(function () {
  var root = document.documentElement, pick = null;
  var q = /[?&]lang=(en|vi)\b/.exec(location.search);
  if (q) pick = q[1];
  if (!pick) { try { pick = localStorage.getItem('findid.lang'); } catch (e) { /* storage blocked: fall through */ } }
  if (pick !== 'en' && pick !== 'vi') pick = /^vi\b/i.test(navigator.language || '') ? 'vi' : 'en';
  function set(l) {
    root.setAttribute('data-lang', l);
    root.setAttribute('lang', l);
    try { localStorage.setItem('findid.lang', l); } catch (e) { /* not saved: choice lasts for this page only */ }
    label();
  }
  // Theme button (2026-11-23). The inline script in <head> already set data-theme (stored choice, else the system). A click flips it and stores it.
  // Panel pictures: <source media="(prefers-color-scheme: dark)"> follows the system only, so its media is rewritten to follow data-theme.
  var T = { // draft strings, to be approved: label = the theme a click switches to
    light: { en: 'Light theme', vi: 'Giao diện sáng' },
    dark: { en: 'Dark theme', vi: 'Giao diện tối' }
  };
  function theme() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function label() {
    var b = document.getElementById('theme-btn');
    if (!b) return;
    var t = T[theme() === 'dark' ? 'light' : 'dark'][root.getAttribute('data-lang') === 'vi' ? 'vi' : 'en'];
    b.setAttribute('aria-label', t); b.setAttribute('title', t);
  }
  function pics() {
    var ss = document.querySelectorAll('picture source[media]');
    for (var i = 0; i < ss.length; i++) ss[i].setAttribute('media', theme() === 'dark' ? 'all' : 'not all');
  }
  function setTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('findid.theme', t); } catch (e) { /* not saved: choice lasts for this page view only */ }
    pics(); label();
  }
  set(pick);
  document.addEventListener('DOMContentLoaded', function () {
    var bs = document.querySelectorAll('.langs button[data-set]');
    for (var i = 0; i < bs.length; i++) bs[i].addEventListener('click', function () { set(this.getAttribute('data-set')); });
    var tb = document.getElementById('theme-btn');
    if (tb) tb.addEventListener('click', function () { setTheme(theme() === 'dark' ? 'light' : 'dark'); });
    pics(); label();
  });
})();
