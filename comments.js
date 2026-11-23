// FindID site comments (index.html #comments, jobs 20261123_site_comments_google.md, 20261123_comments_edit_delete_reply.md): sign in with
// Google, post, reply (one level), edit / delete your own comments, see a comment's edit history; list newest first, replies oldest first.
// Star ratings: ratings/{uid} = {stars 1-5, at, name, photo}, one per Google account (doc id = uid); clicking a star saves it at once (with or
// without a comment), "Remove rating" deletes it; average + count from a Firestore aggregation query (getAggregateFromServer: one read per
// 1000 ratings instead of reading every rating); each commenter's stars next to their name on top-level comments (ratings read by uid).
// Data + rules: site/firebase/firestore.rules (Firebase project on the free Spark plan). Text is always set with textContent, never as HTML.
// Firebase scripts load from www.gstatic.com only when the section comes near the screen (or right away after a sign-in redirect);
// Google's One Tap script (accounts.google.com/gsi/client) only after a click on the sign-in button.
// Until FIREBASE.apiKey is filled in, the box stays hidden and the section shows only the heading and the email line.
(function () {
  var FIREBASE = { apiKey: 'AIzaSyCER1doZ8KPsv4c1FxM8679aK_VhYFrg3o', authDomain: 'findid-comments.firebaseapp.com', projectId: 'findid-comments', appId: '1:363627540068:web:e0fe99c60ceaf67da0b971' }; // web app config from Firebase console > Project settings (public by design; access is set by firestore.rules)
  var ADMIN_EMAIL = 'findidapp@gmail.com'; // sees Delete on every comment; the rules allow it only for the admin uid
  var NOTIFY_URL = 'https://script.google.com/macros/s/AKfycbxr9AbzGknv6QrkjXBdf4V-nCrVOTqSjW3KclBIt5FZQirB7ZroH2Q9xDZbs7QE-i0zQQ/exec'; // Apps Script web app "FindID comment notice" (site/firebase/notify_apps_script.gs); '' = no mail notice
  var SDK = 'https://www.gstatic.com/firebasejs/13.2.0/';
  // Google One Tap (user 2026-11-23): Web client that Firebase made for the Google provider; its Authorized JavaScript origins must list the site.
  // gsi/client loads only when the visitor clicks the sign-in button (signIn below).
  // origins set 2026-11-23 in Google Cloud console > Google Auth Platform > Clients: findid.app, www.findid.app, localhost, localhost:8765; '' = One Tap off
  var ONE_TAP_CLIENT = '363627540068-4fb369hnkj7v0nt1304vgkca5jg9bs4e.apps.googleusercontent.com';
  var PAGE = 20, MAX = 1000, MAX_EDITS = 10; // MAX_EDITS: firestore.rules caps edits at 10 (rules access-call limit)
  var S = { // draft strings, to be approved
    load: ['Could not load comments. Try again later.', 'Không tải được bình luận. Thử lại sau.'],
    signin: ['Sign-in did not finish. Try again.', 'Chưa đăng nhập xong. Thử lại.'],
    empty: ['Write 1 to 1000 characters.', 'Viết từ 1 đến 1000 ký tự.'],
    post: ['Could not post. Try again.', 'Không gửi được. Thử lại.'],
    del: ['Could not delete. Try again.', 'Không xoá được. Thử lại.'],
    ask: ['Delete this comment?', 'Xoá bình luận này?'],
    none: ['No comments yet.', 'Chưa có bình luận nào.'],
    ph: ['Write a comment…', 'Viết bình luận…'],
    need: ['Sign in with Google to post.', 'Đăng nhập Google để gửi.'],
    rph: ['Write a reply…', 'Viết trả lời…'],
    send: ['Post', 'Gửi'],
    reply: ['Reply', 'Trả lời'],
    edit: ['Edit', 'Sửa'],
    remove: ['Delete', 'Xoá'],
    save: ['Save', 'Lưu'],
    cancel: ['Cancel', 'Huỷ'],
    edited: ['History', 'Lịch sử'], // user 2026-11-23: "ghi là lịch sử là dc rồi"
    hist: ['Edit history', 'Lịch sử sửa'],
    gone: ['Comment deleted', 'Bình luận đã xoá'],
    cap: ['A comment can be edited 10 times.', 'Mỗi bình luận chỉ sửa được 10 lần.'],
    nosave: ['Could not save. Try again.', 'Không lưu được. Thử lại.'],
    star: [['star', 'stars'], ['sao', 'sao']], // aria-label of the star buttons: "4 stars" / "4 sao"
    of5: [' of 5 stars', ' trên 5 sao'], // stars next to a name: "4 of 5 stars"
    ratings: [['rating', 'ratings'], ['đánh giá', 'đánh giá']], // "★ 4.6 (12 ratings)"
    norate: ['No ratings yet', 'Chưa có đánh giá'],
    noRateSave: ['Could not save your rating. Try again.', 'Không lưu được đánh giá. Thử lại.'],
    delRate: ['Delete rating', 'Xoá đánh giá'], // admin, under a comment whose author rated
    askRate: ['Delete this rating?', 'Xoá đánh giá này?']
  };
  var box = document.getElementById('cbox');
  if (!box || !FIREBASE.apiKey) return;
  box.hidden = false;
  var q = function (s) { return box.querySelector(s); };
  var list = q('.c-list'), more = q('.c-more'), err = q('.c-err'), need = q('.c-need');
  var ta = q('textarea'), count = q('.c-count'), postBtn = q('.c-post');
  var MAIN = { ta: ta, btn: postBtn, count: count, err: err, need: need, parent: '' }; // the top box; reply boxes are made by form()
  var fb = null, user = null, claims = null, last = null, started = false, lis = {};
  var avgEl = q('.c-avg'), stars = box.querySelectorAll('.c-star'), unrate = q('.c-unrate'), rates = {}, myRate = 0, pendingRate = 0; // rates: uid -> stars (0 = none)

  function vi() { return document.documentElement.getAttribute('data-lang') === 'vi' ? 1 : 0; }
  function two(el, pair) { // both languages, style.css shows the chosen one
    el.textContent = '';
    ['en', 'vi'].forEach(function (l, i) { var s = document.createElement('span'); s.lang = l; s.textContent = pair[i]; el.appendChild(s); });
  }
  function say(pair, el) { el = el || err; if (pair) two(el, pair); else el.textContent = ''; el.hidden = !pair; }
  function mk(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function btn(cls, pair, fn) { var b = mk('button', cls); b.type = 'button'; two(b, pair); b.addEventListener('click', fn); return b; }
  function when(ts) { return ts && ts.toDate ? ts.toDate() : new Date(); } // a comment just posted has no server time yet
  function mine(d) { return !!(user && d.uid === user.uid); }
  function isAdmin() { return !!(user && user.email === ADMIN_EMAIL && user.emailVerified); }
  function kids(li) { return li.querySelector(':scope > .c-replies'); }

  // li._d = the comment's data; head, text and action row are rebuilt from it by render(); the replies list and open boxes stay
  function item(id, d) {
    var li = mk('li', 'c-item');
    li.setAttribute('data-id', id); li._d = d; li._t = when(d.created); lis[id] = li;
    if (!d.parent) li.appendChild(mk('ol', 'c-replies'));
    render(li);
    return li;
  }
  function render(li) {
    var d = li._d;
    Array.prototype.forEach.call(li.querySelectorAll(':scope > .c-head, :scope > .c-text, :scope > .c-acts, :scope > .c-hist, :scope > .c-ierr'), function (e) { e.remove(); });
    var top = li.firstChild, p = mk('p', 'c-text');
    if (d.deleted) { p.className = 'c-text c-gone'; two(p, S.gone); }
    else {
      var head = mk('div', 'c-head');
      if (d.photo) {
        var img = document.createElement('img');
        img.src = d.photo; img.width = 28; img.height = 28; img.alt = ''; img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer'; img.setAttribute('referrerpolicy', 'no-referrer');
        head.appendChild(img);
      } else {
        var ini = mk('span', 'c-ini'); ini.textContent = (d.name || '?').charAt(0).toUpperCase(); head.appendChild(ini);
      }
      var nm = mk('b'); nm.textContent = d.name || '?'; head.appendChild(nm);
      if (!d.parent && rates[d.uid]) head.appendChild(starsOf(rates[d.uid]));
      var t = li._t, tm = mk('time'); tm.dateTime = t.toISOString();
      two(tm, [t.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }), t.toLocaleDateString('vi-VN')]);
      head.appendChild(tm);
      if (d.edited) { // "(edited)" opens the older versions
        var e = btn('c-edited', S.edited, function () { history(li, e); });
        e.setAttribute('aria-expanded', 'false'); head.appendChild(e);
      }
      li.insertBefore(head, top);
      p.textContent = d.text;
    }
    li.insertBefore(p, top);
    var a = acts(li);
    if (a) li.insertBefore(a, top);
  }
  function acts(li) { // Reply on top-level comments; Edit on your own; Delete on your own (admin: all); a deleted comment keeps only Delete, once its replies are gone
    var d = li._d, a = mk('div', 'c-acts');
    if (!d.deleted && !d.parent) a.appendChild(btn('c-reply', S.reply, function () { replyBox(li); }));
    if (!d.deleted && mine(d)) a.appendChild(btn('c-edit', S.edit, function () { editBox(li); }));
    if ((mine(d) || isAdmin()) && !(d.deleted && kids(li) && kids(li).children.length)) a.appendChild(btn('c-del', S.remove, function () { remove(li); }));
    if (isAdmin() && !d.parent && rates[d.uid]) a.appendChild(btn('c-delrate', S.delRate, function () { unrateOf(d.uid); }));
    return a.children.length ? a : null;
  }
  function refresh(uid) { // after sign-in / out (or a rating change of uid): buttons and stars follow; an open history stays open
    Array.prototype.forEach.call(list.querySelectorAll('.c-item'), function (li) {
      var d = li._d, h = li.querySelector(':scope > .c-head');
      if (uid && d.uid !== uid) return;
      if (h && !d.parent) {
        var o = h.querySelector('.c-stars'), n = rates[d.uid] ? starsOf(rates[d.uid]) : null;
        if (o) o.remove();
        if (n) h.insertBefore(n, h.querySelector('b').nextSibling);
      }
      if (li.querySelector(':scope > .c-ebox')) return;
      var old = li.querySelector(':scope > .c-acts'), a = acts(li), at = li.querySelector(':scope > .c-hist') || li.querySelector(':scope > .c-text');
      if (old) old.remove();
      if (a) li.insertBefore(a, at.nextSibling);
    });
  }
  function starsOf(n) { // "★★★★☆" next to a name, read as "4 of 5 stars"
    var e = mk('span', 'c-stars');
    e.setAttribute('role', 'img'); e.setAttribute('data-n', n); e.setAttribute('aria-label', n + S.of5[vi()]);
    e.textContent = '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
    return e;
  }
  function ierr(li) { // an error line under one comment
    var e = li.querySelector(':scope > .c-ierr');
    if (!e) { e = mk('p', 'c-err c-ierr'); e.setAttribute('role', 'alert'); li.insertBefore(e, kids(li)); }
    return e;
  }

  function page() {
    var f = fb.fs, c = f.collection(fb.db, 'comments'), qs = [c, f.where('parent', '==', ''), f.orderBy('created', 'desc')];
    if (last) qs.push(f.startAfter(last));
    qs.push(f.limit(PAGE));
    more.disabled = true;
    return f.getDocs(f.query.apply(null, qs)).then(function (snap) {
      if (!last) { list.textContent = ''; lis = {}; }
      var ids = [];
      snap.forEach(function (ds) { list.appendChild(item(ds.id, ds.data())); ids.push(ds.id); });
      if (snap.docs.length) last = snap.docs[snap.docs.length - 1];
      more.hidden = snap.docs.length < PAGE;
      if (!ids.length) return;
      var uids = ids.map(function (id) { return lis[id]._d.uid; }).filter(function (u, i, a) { return u && a.indexOf(u) === i && !(u in rates); });
      if (uids.length) f.getDocs(f.query(f.collection(fb.db, 'ratings'), f.where(f.documentId(), 'in', uids))).then(function (rs) { // <= 20 uids
        uids.forEach(function (u) { rates[u] = 0; });
        rs.forEach(function (ds) { rates[ds.id] = ds.data().stars; });
        uids.forEach(function (u) { if (rates[u]) refresh(u); });
      }).catch(function () { /* stars next to names are optional */ });
      return f.getDocs(f.query(c, f.where('parent', 'in', ids), f.orderBy('created', 'asc'))).then(function (rs) { // PAGE <= 30, the 'in' limit
        rs.forEach(function (ds) { var d = ds.data(), up = lis[d.parent]; if (up) kids(up).appendChild(item(ds.id, d)); });
        ids.forEach(function (id) { if (lis[id]._d.deleted) render(lis[id]); });
      });
    }).then(function () {
      more.disabled = false; list.removeAttribute('aria-busy'); empty();
    }).catch(function () { list.removeAttribute('aria-busy'); list.textContent = ''; more.disabled = false; say(S.load); });
  }
  function empty() {
    var e = q('.c-none');
    if (!list.children.length) { if (!e) { e = mk('p', 'c-none fine'); two(e, S.none); list.after(e); } }
    else if (e) e.remove();
  }

  function show() {
    var me = q('.c-me');
    me.textContent = user ? (user.displayName || '') : '';
    me.hidden = !user; q('.c-signout').hidden = !user;
    if (user) Array.prototype.forEach.call(box.querySelectorAll('.c-need'), function (n) { n.hidden = true; });
  }
  function placeholder() {
    ta.placeholder = S.ph[vi()]; ta.setAttribute('aria-label', S.ph[vi()]);
    Array.prototype.forEach.call(stars, function (b, i) { b.setAttribute('aria-label', (i + 1) + ' ' + S.star[vi()][i ? 1 : 0]); });
    Array.prototype.forEach.call(box.querySelectorAll('.c-stars'), function (e) { e.setAttribute('aria-label', e.getAttribute('data-n') + S.of5[vi()]); });
    Array.prototype.forEach.call(box.querySelectorAll('.c-rform textarea'), function (t) { t.placeholder = S.rph[vi()]; t.setAttribute('aria-label', S.rph[vi()]); });
  }

  // Sign-in on click only (user 2026-11-23: the "Continue as" box shows after clicking, not on page open). One Tap first (FedCM
  // "Continue as ..."); if Google does not show it, or the visitor closes it, the Firebase popup opens instead (redirect if the popup is
  // blocked). The popup starts only after One Tap has ended, so one click shows one account chooser at a time.
  // signing / pending = the box (top box or a reply box) that started the sign-in / whose Post waits for it.
  var gsi = null, tapOff = !ONE_TAP_CLIENT, signing = null, pending = null;
  function signIn(fm) {
    if (user || signing || !fb) return;
    signing = fm || MAIN; signing.need.hidden = true; say(null, signing.err);
    if (tapOff) return popup();
    loadGsi(function (id) {
      if (!id || user) { if (!user) popup(); else signing = null; return; }
      id.prompt(function (n) {
        var dismissed = n.isDismissedMoment && n.isDismissedMoment();
        if (dismissed && n.getDismissedReason() === 'credential_returned') return; // signed in by One Tap
        if (dismissed || (n.isSkippedMoment && n.isSkippedMoment())) { // FedCM reports a prompt that was not shown as skipped
          tapOff = true; // later clicks in this page view go straight to the popup
          if (!user) popup();
        }
      });
    });
  }
  function loadGsi(done) {
    if (gsi) return done(gsi);
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onerror = function () { tapOff = true; done(null); };
    s.onload = function () {
      gsi = window.google && google.accounts && google.accounts.id;
      if (!gsi) { tapOff = true; return done(null); }
      gsi.initialize({
        client_id: ONE_TAP_CLIENT, auto_select: false, cancel_on_tap_outside: true, context: 'signin', itp_support: true, use_fedcm_for_prompt: true,
        callback: function (r) {
          fb.auth.signInWithCredential(fb.au, fb.auth.GoogleAuthProvider.credential(r.credential)).catch(function () { say(S.signin, signing && signing.err); failed(); });
        }
      });
      done(gsi);
    };
    document.head.appendChild(s);
  }
  function popup() {
    var a = fb.auth, p = new a.GoogleAuthProvider();
    a.signInWithPopup(fb.au, p).catch(function (e) {
      var c = e && e.code || '';
      if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment') {
        try { // the page reloads: keep the typed text, which box it was in and a pending Post for the way back
          var fm = signing || MAIN;
          sessionStorage.setItem('findid.c.redirect', '1');
          sessionStorage.setItem('findid.c.draft', JSON.stringify({ text: fm.ta.value, post: pending === fm, parent: fm.parent, rate: pendingRate || undefined }));
        } catch (x) { /* storage blocked: redirect still works, the text is lost */ }
        return a.signInWithRedirect(fb.au, p);
      }
      if (c !== 'auth/popup-closed-by-user' && c !== 'auth/cancelled-popup-request') say(S.signin, signing && signing.err);
      failed();
    });
  }
  function failed() { var fm = signing || MAIN; signing = null; pending = null; pendingRate = 0; if (!user) fm.need.hidden = false; } // every sign-in UI closed: the next click in the box tries again
  function count1(fm) { fm = fm || MAIN; fm.count.textContent = fm.ta.value.trim().length + '/' + MAX; }
  function ping(id) { if (NOTIFY_URL) fetch(NOTIFY_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ id: id }) }).catch(function () { /* notice is optional */ }); }
  function post(fm) {
    fm = fm || MAIN;
    var text = fm.ta.value.trim();
    say(null, fm.err);
    if (!text || text.length > MAX) return say(S.empty, fm.err);
    if (!user) { pending = fm; return signIn(fm); } // posts by itself once sign-in succeeds
    var f = fb.fs, ref = f.doc(f.collection(fb.db, 'comments')), b = f.writeBatch(fb.db);
    var d = { uid: user.uid, name: claims.name || '', photo: claims.picture || '', text: text, created: f.serverTimestamp(), lang: vi() ? 'vi' : 'en', parent: fm.parent };
    b.set(ref, d);
    fm.btn.disabled = true;
    b.commit().then(function () {
      fm.ta.value = ''; count1(fm);
      d.created = null;
      if (fm.li) { kids(fm.li).appendChild(item(ref.id, d)); fm.el.hidden = true; }
      else { list.insertBefore(item(ref.id, d), list.firstChild); empty(); }
      ping(ref.id);
    }).catch(function () {
      say(S.post, fm.err);
    }).then(function () { fm.btn.disabled = false; });
  }

  function form(li) { // reply box under a top-level comment: same sign-in on click as the top box
    var el = mk('div', 'c-rform'), t = mk('textarea'), row = mk('div', 'c-row'), c = mk('span', 'c-count fine'), n = mk('p', 'fine c-need'), e = mk('p', 'c-err');
    var fm = { el: el, ta: t, count: c, err: e, need: n, parent: li.getAttribute('data-id'), li: li };
    t.rows = 3; t.maxLength = MAX; t.placeholder = S.rph[vi()]; t.setAttribute('aria-label', S.rph[vi()]);
    fm.btn = btn('btn c-post', S.send, function () { post(fm); });
    row.appendChild(c); row.appendChild(btn('c-cancel', S.cancel, function () { el.hidden = true; say(null, e); })); row.appendChild(fm.btn);
    two(n, S.need); n.hidden = true; e.setAttribute('role', 'alert'); e.hidden = true;
    el.appendChild(t); el.appendChild(row); el.appendChild(n); el.appendChild(e);
    t.addEventListener('focus', function () { signIn(fm); });
    t.addEventListener('click', function () { signIn(fm); });
    t.addEventListener('input', function () { count1(fm); });
    count1(fm);
    return fm;
  }
  function replyBox(li) {
    var fm = li._rf;
    if (!fm) { fm = li._rf = form(li); li.insertBefore(fm.el, kids(li)); }
    fm.el.hidden = false; fm.ta.focus();
    return fm;
  }

  function editBox(li) {
    var d = li._d;
    if (li.querySelector(':scope > .c-ebox')) return;
    if ((d.edited || 0) >= MAX_EDITS) return say(S.cap, ierr(li));
    say(null, ierr(li));
    var el = mk('div', 'c-ebox'), t = mk('textarea'), row = mk('div', 'c-row'), c = mk('span', 'c-count fine'), e = mk('p', 'c-err');
    var fm = { ta: t, count: c, err: e };
    t.rows = 3; t.maxLength = MAX; t.value = d.text; t.setAttribute('aria-label', S.edit[vi()]);
    fm.btn = btn('btn c-save', S.save, function () { save(li, fm); });
    row.appendChild(c); row.appendChild(btn('c-cancel', S.cancel, function () { close(li); })); row.appendChild(fm.btn);
    e.setAttribute('role', 'alert'); e.hidden = true;
    el.appendChild(t); el.appendChild(row); el.appendChild(e);
    t.addEventListener('input', function () { count1(fm); });
    count1(fm);
    li.querySelector(':scope > .c-text').hidden = true;
    var a = li.querySelector(':scope > .c-acts'); if (a) a.hidden = true;
    li.insertBefore(el, li.querySelector(':scope > .c-text').nextSibling);
    t.focus();
  }
  function close(li) { var el = li.querySelector(':scope > .c-ebox'); if (el) el.remove(); render(li); }
  function save(li, fm) { // one batch: old text into edits/{n}, the new text on the comment
    var d = li._d, id = li.getAttribute('data-id'), text = fm.ta.value.trim(), n = d.edited || 0;
    say(null, fm.err);
    if (!text || text.length > MAX) return say(S.empty, fm.err);
    if (text === d.text) return close(li);
    if (n >= MAX_EDITS) return say(S.cap, fm.err);
    var f = fb.fs, b = f.writeBatch(fb.db);
    b.set(f.doc(fb.db, 'comments', id, 'edits', String(n)), { text: d.text, at: f.serverTimestamp() });
    b.update(f.doc(fb.db, 'comments', id), { text: text, edited: n + 1, editedAt: f.serverTimestamp() });
    fm.btn.disabled = true;
    b.commit().then(function () {
      d.text = text; d.edited = n + 1; close(li);
    }).catch(function () {
      fm.btn.disabled = false;
      say(S.nosave, fm.err);
    });
  }

  function history(li, b) { // older versions, newest first; each with the time it was written (loaded on click)
    var h = li.querySelector(':scope > .c-hist');
    if (h) { h.remove(); b.setAttribute('aria-expanded', 'false'); return; }
    var f = fb.fs, id = li.getAttribute('data-id');
    b.disabled = true;
    f.getDocs(f.collection(fb.db, 'comments', id, 'edits')).then(function (snap) {
      var rows = [];
      snap.forEach(function (ds) { rows.push({ n: Number(ds.id), d: ds.data() }); });
      rows.sort(function (x, y) { return x.n - y.n; });
      h = mk('div', 'c-hist');
      var hd = mk('p', 'c-hist-h'), ol = mk('ol');
      two(hd, S.hist); h.appendChild(hd); h.appendChild(ol);
      for (var i = rows.length - 1; i >= 0; i--) {
        var r = mk('li'), tm = mk('time'), p = mk('p'), t = i ? when(rows[i - 1].d.at) : li._t, o = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
        tm.dateTime = t.toISOString();
        two(tm, [t.toLocaleString('en-US', o), t.toLocaleString('vi-VN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })]);
        p.textContent = rows[i].d.text;
        r.appendChild(tm); r.appendChild(p); ol.appendChild(r);
      }
      li.insertBefore(h, li.querySelector(':scope > .c-text').nextSibling);
      b.setAttribute('aria-expanded', 'true');
    }).catch(function () { say(S.load, ierr(li)); }).then(function () { b.disabled = false; });
  }

  // Delete: no replies -> the comment and its edits go in one batch; with replies -> it stays as "Comment deleted" (text '', deleted true)
  // so the replies keep their place; its edits go. The tombstone can be deleted once its replies are gone.
  function remove(li) {
    if (!window.confirm(S.ask[vi()])) return;
    var f = fb.fs, id = li.getAttribute('data-id'), d = li._d, ref = f.doc(fb.db, 'comments', id);
    var n = d.parent ? Promise.resolve(0) : f.getDocs(f.query(f.collection(fb.db, 'comments'), f.where('parent', '==', id), f.limit(1))).then(function (s) { return s.docs.length; });
    Promise.all([n, f.getDocs(f.collection(fb.db, 'comments', id, 'edits'))]).then(function (r) {
      var b = f.writeBatch(fb.db);
      r[1].forEach(function (ds) { b.delete(f.doc(fb.db, 'comments', id, 'edits', ds.id)); });
      if (r[0]) b.update(ref, { text: '', deleted: true }); else b.delete(ref);
      return b.commit().then(function () {
        if (r[0]) { d.text = ''; d.deleted = true; render(li); return; }
        var up = li.parentNode.closest('.c-item');
        li.remove(); delete lis[id];
        if (up) render(up); // a deleted parent shows its Delete once its last reply is gone
        empty();
      });
    }).catch(function () { say(S.del, ierr(li)); });
  }

  // Star ratings
  function paint() { // the 5 buttons in the top box show the signed-in account's rating
    Array.prototype.forEach.call(stars, function (b, i) { b.setAttribute('aria-checked', String(i + 1 === myRate)); b.classList.toggle('on', i < myRate); });
    unrate.hidden = !myRate;
  }
  function summary() { // average + count of all ratings, one aggregation query
    var f = fb.fs;
    return f.getAggregateFromServer(f.collection(fb.db, 'ratings'), { avg: f.average('stars'), n: f.count() }).then(function (r) {
      var a = r.data().avg, n = r.data().n;
      if (!n) return two(avgEl, S.norate);
      var o = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
      two(avgEl, ['★ ' + a.toLocaleString('en-US', o) + ' (' + n + ' ' + S.ratings[0][n === 1 ? 0 : 1] + ')', '★ ' + a.toLocaleString('vi-VN', o) + ' (' + n + ' ' + S.ratings[1][1] + ')']);
    }).catch(function () { avgEl.textContent = ''; });
  }
  function rate(n) { // n 1-5 saves the account's rating, 0 removes it; signed out: sign in first, then save
    say(null);
    if (!user) { pendingRate = n; return signIn(MAIN); }
    var f = fb.fs, ref = f.doc(fb.db, 'ratings', user.uid), was = myRate;
    myRate = n; paint();
    (n ? f.setDoc(ref, { stars: n, at: f.serverTimestamp(), name: claims.name || '', photo: claims.picture || '' }) : f.deleteDoc(ref)).then(function () {
      rates[user.uid] = n; refresh(user.uid); summary();
    }).catch(function () { myRate = was; paint(); say(S.noRateSave); });
  }
  function unrateOf(uid) { // admin removes someone's rating
    if (!window.confirm(S.askRate[vi()])) return;
    var f = fb.fs;
    f.deleteDoc(f.doc(fb.db, 'ratings', uid)).then(function () {
      rates[uid] = 0; if (user && uid === user.uid) { myRate = 0; paint(); }
      refresh(uid); summary();
    }).catch(function () { say(S.del); });
  }
  function mineRate() { // the signed-in account's own rating into the 5 buttons
    if (!user) { myRate = 0; paint(); return Promise.resolve(); }
    var f = fb.fs, uid = user.uid;
    return f.getDoc(f.doc(fb.db, 'ratings', uid)).then(function (ds) {
      if (!user || user.uid !== uid) return;
      myRate = ds.exists() ? ds.data().stars : 0; rates[uid] = myRate; paint(); refresh(uid);
    }).catch(function () { /* buttons stay empty */ });
  }

  function start() {
    if (started) return; started = true;
    Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]).then(function (m) {
      var app = m[0].initializeApp(FIREBASE);
      fb = { auth: m[1], fs: m[2], au: m[1].getAuth(app), db: m[2].getFirestore(app) };
      m[1].getRedirectResult(fb.au).catch(function () { say(S.signin); });
      var draft = null;
      try {
        draft = JSON.parse(sessionStorage.getItem('findid.c.draft') || 'null');
        sessionStorage.removeItem('findid.c.redirect'); sessionStorage.removeItem('findid.c.draft');
      } catch (x) { /* nothing stored */ }
      function restore() { // back from a sign-in redirect: the text goes back into its box (a reply box only if its comment is listed)
        if (!draft) return;
        var fm = draft.parent ? (lis[draft.parent] && replyBox(lis[draft.parent])) : MAIN;
        if (!fm) return;
        fm.ta.value = draft.text || ''; count1(fm); signing = fm; pending = draft.post ? fm : null; pendingRate = draft.rate || 0;
      }
      var first = true;
      m[1].onAuthStateChanged(fb.au, function (u) {
        user = u; claims = null; show();
        var ready = u ? u.getIdTokenResult().then(function (t) { claims = t.claims; }) : Promise.resolve();
        ready.then(function () {
          var wasFirst = first, listed;
          if (first) { first = false; listed = page().then(restore); summary(); } else { refresh(); listed = Promise.resolve(); }
          listed = listed.then(mineRate);
          listed.then(function () {
            if (u && pendingRate) { var r = pendingRate; pendingRate = 0; rate(r); } // the star clicked before signing in
            if (u && signing) { var fm = signing; signing = null; fm.ta.focus(); if (pending) { var p = pending; pending = null; post(p); } }
            else if (!u && signing && wasFirst && draft) failed(); // came back from the redirect without signing in
          });
        });
      });
    }).catch(function () { list.removeAttribute('aria-busy'); list.textContent = ''; say(S.load); });
  }

  ta.addEventListener('focus', function () { signIn(MAIN); }); // signed out: a click in the box starts Google sign-in; typed text stays
  ta.addEventListener('click', function () { signIn(MAIN); });
  q('.c-signout').addEventListener('click', function () { if (fb) fb.auth.signOut(fb.au); });
  postBtn.addEventListener('click', function () { post(MAIN); });
  ta.addEventListener('input', function () { count1(MAIN); });
  more.addEventListener('click', page);
  Array.prototype.forEach.call(stars, function (b, i) { b.addEventListener('click', function () { if (i + 1 !== myRate) rate(i + 1); }); });
  unrate.addEventListener('click', function () { rate(0); });
  count1(MAIN); placeholder();
  new MutationObserver(placeholder).observe(document.documentElement, { attributes: true, attributeFilter: ['data-lang'] });
  var redirected = false;
  try { redirected = sessionStorage.getItem('findid.c.redirect') === '1'; } catch (x) { /* treat as no redirect */ }
  if (redirected || !('IntersectionObserver' in window)) return start();
  var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: '1500px 0px' });
  io.observe(document.getElementById('comments'));
})();
