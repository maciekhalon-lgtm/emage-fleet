/* Emage FLEET — logowanie: logowanie, rejestracja, reset hasła i start sesji */
'use strict';
let authMode = 'login';
let sessionUser = null;

function showAuth(mode, msg = '', isErr = false){
  authMode = mode;
  $('#app').hidden = true; $('#auth').hidden = false;
  const box = $('#auth-form');
  const f = (id, label, type = 'text', ac = '') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" autocomplete="${ac}" required></div>`;
  const forms = {
    login: {title:'Zaloguj się', btn:'Zaloguj się', body: f('a-email','E-mail','email','email') + f('a-pass','Hasło','password','current-password'),
      links: `<button type="button" class="link" data-auth="register">Załóż konto</button><button type="button" class="link" data-auth="reset">Nie pamiętasz hasła?</button>`},
    register: {title:'Załóż konto', btn:'Załóż konto', body: `<div class="auth-row">${f('a-first','Imię *','text','given-name')}${f('a-last','Nazwisko *','text','family-name')}</div>` + f('a-email','E-mail służbowy *','email','email') + f('a-pass','Hasło * (min. 10 znaków)','password','new-password') + f('a-pass2','Powtórz hasło *','password','new-password')
      + `<p class="muted small">Po potwierdzeniu adresu e-mail konto musi zatwierdzić kierownik floty – wtedy nada Ci rolę.</p>`,
      links: `<button type="button" class="link" data-auth="login">Mam już konto – zaloguj się</button>`},
    reset: {title:'Reset hasła', btn:'Wyślij link', body: f('a-email','E-mail','email','email') + `<p class="muted small">Wyślemy link do ustawienia nowego hasła.</p>`,
      links: `<button type="button" class="link" data-auth="login">Wróć do logowania</button>`},
    newpass: {title:'Ustaw nowe hasło', btn:'Zapisz hasło', body: f('a-pass','Nowe hasło (min. 10 znaków)','password','new-password') + f('a-pass2','Powtórz hasło','password','new-password'), links: ''},
  };
  const c = forms[mode];
  // przy błędzie w tym samym formularzu zostawiamy to, co już wpisano (bez haseł)
  const keep = mode===box.dataset.mode && isErr ? Object.fromEntries([...box.querySelectorAll('input:not([type=password])')].map(i => [i.id, i.value])) : {};
  box.dataset.mode = mode;
  box.innerHTML = `<h2>${c.title}</h2>${msg ? `<div class="auth-msg ${isErr ? 'err' : ''}" role="status">${esc(msg)}</div>` : ''}${c.body}
    <button type="submit" class="primary auth-btn" id="auth-btn">${c.btn}</button><div class="auth-links">${c.links}</div>`;
  Object.entries(keep).forEach(([id, val]) => { const i = document.getElementById(id); if (i) i.value = val; });
  setTimeout(() => (box.querySelector('input:invalid, input[value=""]') || [...box.querySelectorAll('input')].find(i => !i.value) || box.querySelector('input'))?.focus(), 30);
}

const AUTH_ERR = [
  [/invalid login credentials/i, 'Nieprawidłowy e-mail lub hasło.'],
  [/email not confirmed/i, 'Najpierw potwierdź adres e-mail – kliknij link w wiadomości od nas.'],
  [/already registered|already been registered|user already exists/i, 'Konto z tym adresem już istnieje. Zaloguj się albo zresetuj hasło.'],
  [/password should be|weak password|at least/i, 'Hasło jest za krótkie lub za proste – użyj co najmniej 10 znaków.'],
  [/rate limit|too many/i, 'Za dużo prób. Odczekaj chwilę i spróbuj ponownie.'],
  [/invalid email|unable to validate email/i, 'Ten adres e-mail jest nieprawidłowy.'],
];
const authErr = e => (AUTH_ERR.find(([re]) => re.test(e && e.message || '')) || [, 'Coś poszło nie tak: ' + (e && e.message || 'spróbuj ponownie.')])[1];

document.addEventListener('click', e => {
  const a = e.target.closest('[data-auth]'); if (a){ showAuth(a.dataset.auth); return; }
  if (e.target.closest('[data-action="logout"]')) logout();
});

async function onAuthSubmit(e){
  e.preventDefault();
  const v = id => ($('#'+id) || {}).value || '';
  const btn = $('#auth-btn'); btn.disabled = true;
  try {
    if (authMode==='login'){
      const {error} = await sb.auth.signInWithPassword({email: v('a-email').trim(), password: v('a-pass')});
      if (error) return showAuth('login', authErr(error), true);
    } else if (authMode==='register'){
      // imię i nazwisko osobno, oba obowiązkowe; wielka litera na początku (także przy nazwiskach z myślnikiem)
      const cap = x => x.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl').replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('pl'));
      const first = cap(v('a-first')), last = cap(v('a-last'));
      if (first.length < 2) return showAuth('register', 'Wpisz imię.', true);
      if (last.length < 2) return showAuth('register', 'Wpisz nazwisko.', true);
      if (!/^[\p{L}' -]+$/u.test(first + last)) return showAuth('register', 'Imię i nazwisko mogą zawierać tylko litery.', true);
      const name = first + ' ' + last;
      if (v('a-pass').length < 10) return showAuth('register', 'Hasło musi mieć co najmniej 10 znaków.', true);
      if (v('a-pass') !== v('a-pass2')) return showAuth('register', 'Hasła się różnią.', true);
      const {data, error} = await sb.auth.signUp({email: v('a-email').trim(), password: v('a-pass'), options: {data: {full_name: name, first_name: first, last_name: last}, emailRedirectTo: location.origin + location.pathname}});
      if (error) return showAuth('register', authErr(error), true);
      if (data && data.session) return;   // potwierdzanie e-maili wyłączone – od razu zalogowany
      return showAuth('login', 'Sprawdź skrzynkę: wysłaliśmy link potwierdzający adres e-mail. Po kliknięciu wróć tu i zaloguj się.');
    } else if (authMode==='reset'){
      const {error} = await sb.auth.resetPasswordForEmail(v('a-email').trim(), {redirectTo: location.origin + location.pathname});
      if (error) return showAuth('reset', authErr(error), true);
      return showAuth('login', 'Jeśli konto istnieje, wysłaliśmy na ten adres link do ustawienia nowego hasła.');
    } else if (authMode==='newpass'){
      if (v('a-pass').length < 10) return showAuth('newpass', 'Hasło musi mieć co najmniej 10 znaków.', true);
      if (v('a-pass') !== v('a-pass2')) return showAuth('newpass', 'Hasła się różnią.', true);
      const {error} = await sb.auth.updateUser({password: v('a-pass')});
      if (error) return showAuth('newpass', authErr(error), true);
      history.replaceState(null, '', location.pathname);
      toast('Zapisano nowe hasło');
      const {data} = await sb.auth.getSession();
      if (data.session) startSession(data.session.user, true);
    }
  } finally { const b = $('#auth-btn'); if (b) b.disabled = false; }
}

async function reloadMe(){
  const {data} = await sb.from('profiles').select('*').eq('id', myId).maybeSingle();
  const before = me ? me.status+':'+me.role+':'+me.driver_id : '';
  me = data;
  const after = me ? me.status+':'+me.role+':'+me.driver_id : '';
  if (before && before !== after){ await loadAll(); route(); }
  else schedule();
}

async function startSession(user, force = false){
  if (!force && sessionUser && sessionUser.id===user.id) return;
  sessionUser = user; myId = user.id;
  $('#auth').hidden = true; $('#app').hidden = false;
  setSync('', 'Logowanie…');
  const {data, error} = await sb.from('profiles').select('*').eq('id', myId).maybeSingle();
  const snap = error && typeof loadSnapshot==='function' ? loadSnapshot(myId) : null;
  if (snap){
    // brak zasięgu: dane z ostatniej synchronizacji, wpisy idą do kolejki
    me = snap.me; Object.assign(names, snap.names || {});
    Object.entries(snap.S || {}).forEach(([c, v]) => { S[c] = v; got[c] = true; });
    db = dbApi; assetsNS = storageApi; dbState = 'offline';
    setSync('err', 'Brak zasięgu – dane z ' + new Date(snap.at).toLocaleString('pl-PL', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}));
    route(); return;
  }
  if (error || !data){ me = {id:myId, email:user.email, full_name:'', status:'pending'}; }
  else me = data;
  assetsNS = storageApi;
  if (roleOf()) await loadAll();
  else {
    setSync('', me.status==='blocked' ? 'Konto zablokowane' : 'Oczekuje na zatwierdzenie');
    // nasłuch na zatwierdzenie konta przez kierownika floty
    if (channel) sb.removeChannel(channel);
    channel = sb.channel('moj-profil').on('postgres_changes', {event:'UPDATE', schema:'public', table:'profiles', filter:'id=eq.'+myId}, () => reloadMe()).subscribe();
  }
  route();
}

async function logout(){
  await sb.auth.signOut();
  location.hash = ''; location.reload();
}

$('#auth-form').addEventListener('submit', onAuthSubmit);
sb.auth.onAuthStateChange((event, session) => {
  // wywołania bazy poza tym callbackiem (zalecenie Supabase)
  setTimeout(() => {
    if (event==='PASSWORD_RECOVERY') return showAuth('newpass');
    if (session && session.user){ if (authMode!=='newpass') startSession(session.user); }
    else if (event==='SIGNED_OUT' || event==='INITIAL_SESSION'){ sessionUser = null; showAuth('login'); }
  }, 0);
});

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
