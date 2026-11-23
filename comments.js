// FindID site comments (index.html #comments, job 20261123_site_comments_google.md): sign in with Google, post, list newest first.
// Data + rules: site/firebase/firestore.rules (Firebase project on the free Spark plan). Text is always set with textContent, never as HTML.
// Firebase scripts load from www.gstatic.com only when the section comes near the screen (or right away after a sign-in redirect).
// Until FIREBASE.apiKey is filled in, the box stays hidden and the section shows only the heading and the email line.
(function () {
  var FIREBASE = { apiKey: 'AIzaSyCER1doZ8KPsv4c1FxM8679aK_VhYFrg3o', authDomain: 'findid-comments.firebaseapp.com', projectId: 'findid-comments', appId: '1:363627540068:web:e0fe99c60ceaf67da0b971' }; // web app config from Firebase console > Project settings (public by design; access is set by firestore.rules)
  var ADMIN_EMAIL = 'findidapp@gmail.com'; // sees Delete; the rules allow delete only for the admin uid
  var NOTIFY_URL = 'https://script.google.com/macros/s/AKfycbxr9AbzGknv6QrkjXBdf4V-nCrVOTqSjW3KclBIt5FZQirB7ZroH2Q9xDZbs7QE-i0zQQ/exec'; // Apps Script web app "FindID comment notice" (site/firebase/notify_apps_script.gs); '' = no mail notice
  var SDK = 'https://www.gstatic.com/firebasejs/13.2.0/';
  // Google One Tap (user 2026-11-23): Web client that Firebase made for the Google provider; its Authorized JavaScript origins must list the site.
  // gsi/client loads at the same trigger as the SDK, only for a signed-out visitor, and prompts once per page view.
  // origins set 2026-11-23 in Google Cloud console > Google Auth Platform > Clients: findid.app, www.findid.app, localhost, localhost:8765; '' = One Tap off
  var ONE_TAP_CLIENT = '363627540068-4fb369hnkj7v0nt1304vgkca5jg9bs4e.apps.googleusercontent.com';
  var PAGE = 20, MAX = 1000, GAP_MS = 30000;
  var S = { // draft strings, to be approved
    load: ['Could not load comments. Try again later.', 'Không tải được bình luận. Thử lại sau.'],
    signin: ['Sign-in did not finish. Try again.', 'Chưa đăng nhập xong. Thử lại.'],
    empty: ['Write 1 to 1000 characters.', 'Viết từ 1 đến 1000 ký tự.'],
    wait: ['Please wait 30 seconds between comments.', 'Vui lòng chờ 30 giây giữa hai bình luận.'],
    post: ['Could not post. Try again.', 'Không gửi được. Thử lại.'],
    del: ['Could not delete. Try again.', 'Không xoá được. Thử lại.'],
    ask: ['Delete this comment?', 'Xoá bình luận này?'],
    none: ['No comments yet.', 'Chưa có bình luận nào.']
  };
  var box = document.getElementById('cbox');
  if (!box || !FIREBASE.apiKey) return;
  box.hidden = false;
  var q = function (s) { return box.querySelector(s); };
  var list = q('.c-list'), more = q('.c-more'), err = q('.c-err'), out = q('.c-out'), form = q('.c-form');
  var ta = q('textarea'), count = q('.c-count'), postBtn = q('.c-post');
  var fb = null, user = null, claims = null, last = null, lastPost = 0, started = false;

  function vi() { return document.documentElement.getAttribute('data-lang') === 'vi' ? 1 : 0; }
  function two(el, pair) { // both languages, style.css shows the chosen one
    el.textContent = '';
    ['en', 'vi'].forEach(function (l, i) { var s = document.createElement('span'); s.lang = l; s.textContent = pair[i]; el.appendChild(s); });
  }
  function say(pair) { if (pair) two(err, pair); else err.textContent = ''; err.hidden = !pair; }

  function item(id, d) {
    var li = document.createElement('li'), head = document.createElement('div'), p = document.createElement('p');
    li.className = 'c-item'; li.setAttribute('data-id', id); head.className = 'c-head';
    if (d.photo) {
      var img = document.createElement('img');
      img.src = d.photo; img.width = 28; img.height = 28; img.alt = ''; img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer'; img.setAttribute('referrerpolicy', 'no-referrer');
      head.appendChild(img);
    } else {
      var ini = document.createElement('span'); ini.className = 'c-ini'; ini.textContent = (d.name || '?').charAt(0).toUpperCase(); head.appendChild(ini);
    }
    var nm = document.createElement('b'); nm.textContent = d.name || '?'; head.appendChild(nm);
    var t = d.created && d.created.toDate ? d.created.toDate() : new Date();
    var tm = document.createElement('time'); tm.dateTime = t.toISOString();
    two(tm, [t.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }), t.toLocaleDateString('vi-VN')]);
    head.appendChild(tm);
    if (isAdmin()) {
      var x = document.createElement('button'); x.type = 'button'; x.className = 'c-del'; two(x, ['Delete', 'Xoá']);
      x.addEventListener('click', function () { remove(id, li); });
      head.appendChild(x);
    }
    p.textContent = d.text;
    li.appendChild(head); li.appendChild(p);
    return li;
  }
  function isAdmin() { return !!(user && user.email === ADMIN_EMAIL && user.emailVerified); }

  function page() {
    var f = fb.fs, qs = [f.collection(fb.db, 'comments'), f.orderBy('created', 'desc')];
    if (last) qs.push(f.startAfter(last));
    qs.push(f.limit(PAGE));
    more.disabled = true;
    return f.getDocs(f.query.apply(null, qs)).then(function (snap) {
      if (!last) list.textContent = '';
      snap.forEach(function (ds) { list.appendChild(item(ds.id, ds.data())); });
      if (snap.docs.length) last = snap.docs[snap.docs.length - 1];
      more.hidden = snap.docs.length < PAGE; more.disabled = false;
      list.removeAttribute('aria-busy');
      empty();
    }).catch(function () { list.removeAttribute('aria-busy'); list.textContent = ''; more.disabled = false; say(S.load); });
  }
  function empty() {
    var e = q('.c-none');
    if (!list.children.length) { if (!e) { e = document.createElement('p'); e.className = 'c-none fine'; two(e, S.none); list.after(e); } }
    else if (e) e.remove();
  }
  function relist() { last = null; list.textContent = ''; return page(); } // after sign-in / out: Delete buttons follow the account

  function show() {
    out.hidden = !!user; form.hidden = !user;
    q('.c-me').textContent = user ? (user.displayName || '') : '';
  }
  function signIn() {
    say(null);
    var a = fb.auth, p = new a.GoogleAuthProvider();
    a.signInWithPopup(fb.au, p).catch(function (e) {
      var c = e && e.code || '';
      if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment') {
        try { sessionStorage.setItem('findid.c.redirect', '1'); } catch (x) { /* redirect still works, the SDK just loads on scroll */ }
        return a.signInWithRedirect(fb.au, p);
      }
      if (c !== 'auth/popup-closed-by-user' && c !== 'auth/cancelled-popup-request') say(S.signin);
    });
  }
  var tapped = false;
  function oneTap() {
    if (tapped || !ONE_TAP_CLIENT) return;
    tapped = true; // once per page view: a closed prompt is not shown again (Google also applies its own cooldown)
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = function () {
      var id = window.google && google.accounts && google.accounts.id;
      if (!id || user) return;
      id.initialize({
        client_id: ONE_TAP_CLIENT, auto_select: false, cancel_on_tap_outside: true, context: 'signin', itp_support: true, use_fedcm_for_prompt: true,
        callback: function (r) {
          fb.auth.signInWithCredential(fb.au, fb.auth.GoogleAuthProvider.credential(r.credential)).catch(function () { say(S.signin); });
        }
      });
      id.prompt();
    };
    document.head.appendChild(s);
  }
  function count1() { count.textContent = ta.value.trim().length + '/' + MAX; }
  function post() {
    var text = ta.value.trim();
    say(null);
    if (!text || text.length > MAX) return say(S.empty);
    if (Date.now() - lastPost < GAP_MS) return say(S.wait);
    var f = fb.fs, ref = f.doc(f.collection(fb.db, 'comments')), b = f.writeBatch(fb.db);
    var d = { uid: user.uid, name: claims.name || '', photo: claims.picture || '', text: text, created: f.serverTimestamp(), lang: vi() ? 'vi' : 'en' };
    b.set(ref, d);
    b.set(f.doc(fb.db, 'users', user.uid), { last: f.serverTimestamp() });
    postBtn.disabled = true;
    b.commit().then(function () {
      lastPost = Date.now(); ta.value = ''; count1();
      d.created = null; list.insertBefore(item(ref.id, d), list.firstChild); empty();
      if (NOTIFY_URL) fetch(NOTIFY_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ id: ref.id }) }).catch(function () { /* notice is optional */ });
    }).catch(function (e) {
      say(e && e.code === 'permission-denied' ? S.wait : S.post); // text is checked above, so a refusal here is the 30 s limit (also after a reload)
    }).then(function () { postBtn.disabled = false; });
  }
  function remove(id, li) {
    if (!window.confirm(S.ask[vi()])) return;
    var f = fb.fs;
    f.deleteDoc(f.doc(fb.db, 'comments', id)).then(function () { li.remove(); empty(); }).catch(function () { say(S.del); });
  }

  function start() {
    if (started) return; started = true;
    Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]).then(function (m) {
      var app = m[0].initializeApp(FIREBASE);
      fb = { auth: m[1], fs: m[2], au: m[1].getAuth(app), db: m[2].getFirestore(app) };
      m[1].getRedirectResult(fb.au).catch(function () { say(S.signin); });
      try { sessionStorage.removeItem('findid.c.redirect'); } catch (x) { /* nothing stored */ }
      var first = true;
      m[1].onAuthStateChanged(fb.au, function (u) {
        user = u; claims = null; show();
        if (first && !u) oneTap();
        if (u && window.google && google.accounts && google.accounts.id) google.accounts.id.cancel(); // signed in by the button: close One Tap
        var ready = u ? u.getIdTokenResult().then(function (t) { claims = t.claims; }) : Promise.resolve();
        ready.then(function () { if (first) { first = false; page(); } else relist(); });
      });
    }).catch(function () { list.removeAttribute('aria-busy'); list.textContent = ''; say(S.load); });
  }

  q('.c-in').addEventListener('click', signIn);
  q('.c-signout').addEventListener('click', function () { if (fb) fb.auth.signOut(fb.au); });
  postBtn.addEventListener('click', post);
  ta.addEventListener('input', count1);
  more.addEventListener('click', page);
  count1();
  var redirected = false;
  try { redirected = sessionStorage.getItem('findid.c.redirect') === '1'; } catch (x) { /* treat as no redirect */ }
  if (redirected || !('IntersectionObserver' in window)) return start();
  var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: '1500px 0px' });
  io.observe(document.getElementById('comments'));
})();
