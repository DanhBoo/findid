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
  }
  set(pick);
  document.addEventListener('DOMContentLoaded', function () {
    var bs = document.querySelectorAll('.langs button[data-set]');
    for (var i = 0; i < bs.length; i++) bs[i].addEventListener('click', function () { set(this.getAttribute('data-set')); });
  });
})();
