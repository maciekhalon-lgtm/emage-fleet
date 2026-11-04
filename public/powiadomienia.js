/* Emage FLEET — powiadomienia: włączanie push na urządzeniu, test, konfiguracja kluczy (kierownik floty) */
'use strict';
const pushKey = () => ((S.settings.find(s => s.id==='push') || {}).vapidPublicKey) || '';
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function b64uToBytes(s){ const p = '='.repeat((4 - s.length % 4) % 4); const b = atob((s + p).replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from(b, c => c.charCodeAt(0)); }

async function currentSub(){
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/* Okno „Powiadomienia” otwierane z nagłówka */
async function openPushDialog(){
  editing = {col:'push', id:null, base:{}, special: () => closeForm()};
  $('#dlg-title').textContent = 'Powiadomienia';
  $('#dlg-del').hidden = true; $('#dlg-save').textContent = 'Zamknij';
  $('#dlg-body').innerHTML = '<div class="field full"><span class="muted">Sprawdzanie…</span></div>';
  $('#scrim').hidden = false;
  renderPushDialog();
}
async function renderPushDialog(){
  const box = $('#dlg-body'); if (!box || !editing || editing.col!=='push') return;
  let state, actions = '';
  const sub = await currentSub().catch(() => null);
  if (!pushSupported()){
    state = isIOS() && !isStandalone()
      ? 'Na iPhonie powiadomienia działają tylko w aplikacji dodanej do ekranu: w Safari stuknij <b>Udostępnij → Do ekranu początkowego</b>, otwórz Emage FLEET z ikony i wróć tutaj.'
      : 'Ta przeglądarka nie obsługuje powiadomień. Użyj Chrome, Edge, Firefox albo Safari na iPhonie z aplikacją dodaną do ekranu.';
  } else if (!pushKey()){
    state = 'Powiadomienia nie są jeszcze skonfigurowane. ' + (P().manage ? 'Konfigurację znajdziesz w zakładce <b>Użytkownicy</b>.' : 'Kierownik floty musi je włączyć.');
  } else if (Notification.permission === 'denied'){
    state = 'Powiadomienia są zablokowane w ustawieniach przeglądarki dla tej strony. Zezwól na nie w ustawieniach witryny i wróć tutaj.';
  } else if (sub){
    state = '<span class="pill ok">Włączone na tym urządzeniu</span> Codziennie rano dostaniesz podsumowanie spraw na dziś – tylko gdy coś wymaga uwagi.';
    actions = '<button type="button" class="small" data-push="test">Wyślij testowe</button><button type="button" class="small danger" data-push="off">Wyłącz na tym urządzeniu</button>';
  } else {
    state = 'Powiadomienia są wyłączone na tym urządzeniu.';
    actions = '<button type="button" class="primary" data-push="on">Włącz powiadomienia</button>';
  }
  const what = P().mycar
    ? 'odbiór i zwrot auta, ważność prawa jazdy i badań'
    : P().manage ? 'terminy i przebiegi, niesprawne i niezwrócone auta, nowe konta, limity kosztów, konflikty w grafiku'
    : 'terminy i przebiegi, niesprawne i niezwrócone auta, nowe usterki';
  box.innerHTML = `<div class="field full"><p style="margin:0">${state}</p></div>
    ${actions ? `<div class="field full"><div class="row-act" style="justify-content:flex-start">${actions}</div></div>` : ''}
    <div class="field full"><span class="muted small">Co obejmuje Twoje podsumowanie: ${what}.</span></div>
    <div class="warnline" id="dlg-warn" hidden></div>`;
}

async function pushOn(){
  const w = $('#dlg-warn');
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted'){ renderPushDialog(); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey: b64uToBytes(pushKey())});
    const j = sub.toJSON();
    const {error} = await sb.from('push_subscriptions').upsert({endpoint:j.endpoint, p256dh:j.keys.p256dh, auth:j.keys.auth, user_agent:(navigator.userAgent||'').slice(0,200)}, {onConflict:'endpoint'});
    if (error) throw error;
    toast('Włączono powiadomienia'); renderPushDialog();
  } catch(err){ if (w){ w.textContent = 'Nie udało się włączyć powiadomień: ' + (err && err.message || 'spróbuj ponownie'); w.hidden = false; } }
}
async function pushOff(){
  const sub = await currentSub().catch(() => null);
  if (sub){ await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe().catch(() => {}); }
  toast('Wyłączono powiadomienia na tym urządzeniu'); renderPushDialog();
}
async function pushTest(){
  const w = $('#dlg-warn');
  const {data, error} = await sb.functions.invoke('powiadomienia', {body:{test:true}});
  if (error || !data){ if (w){ w.textContent = 'Funkcja wysyłająca nie odpowiada. Sprawdź, czy jest wdrożona w Supabase (Edge Functions → powiadomienia).'; w.hidden = false; } return; }
  toast(data.sent ? 'Wysłano – powiadomienie powinno pojawić się za chwilę' : 'Nie znaleziono tego urządzenia – wyłącz i włącz powiadomienia ponownie');
}
$('#dialog').addEventListener('click', e => {
  const b = e.target.closest('[data-push]'); if (!b) return;
  if (b.dataset.push==='on') pushOn(); else if (b.dataset.push==='off') pushOff(); else pushTest();
});

/* ---------- konfiguracja (kierownik floty, zakładka Użytkownicy) ---------- */
let generatedKeys = null;
function pushSetupPanel(){
  if (!P().manage) return '';
  const ref = (CONFIG.supabaseUrl.match(/https:\/\/([^.]+)\./) || [,'TWOJ_PROJEKT'])[1];
  if (pushKey() && !generatedKeys) return `<div class="panel"><div class="sec-head"><h3>Powiadomienia</h3><span class="pill ok">Skonfigurowane</span></div>
    <p class="muted sec-empty">Każda osoba włącza je u siebie przyciskiem <b>Powiadomienia</b> w nagłówku. Instrukcja: <code>POWIADOMIENIA.md</code> w repozytorium. <button class="small ghost" data-action="push-regen">Wygeneruj nowe klucze</button></p></div>`;
  if (!generatedKeys) return `<div class="panel"><div class="sec-head"><h3>Powiadomienia – konfiguracja</h3><span class="pill warn">Do zrobienia</span></div>
    <p class="muted sec-empty">Pierwszy krok: wygeneruj klucze. Powstają w Twojej przeglądarce i nie są nigdzie wysyłane – klucz publiczny zapiszemy w bazie, prywatny wkleisz w sekretach funkcji w Supabase.
    <br><button class="primary small" style="margin-top:10px" data-action="push-gen">Wygeneruj klucze</button></p></div>`;
  const k = generatedKeys;
  const sql = `select cron.schedule('emage-fleet-powiadomienia', '30 6 * * *', $$ select net.http_post(url := 'https://${ref}.supabase.co/functions/v1/powiadomienia', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','${k.cron}'), body := '{}'::jsonb, timeout_milliseconds := 60000) $$);`;
  const row = (label, val, id) => `<div class="keyrow"><span class="label">${label}</span><code id="${id}">${esc(val)}</code><button class="small" data-copy="${id}">Kopiuj</button></div>`;
  return `<div class="panel"><div class="sec-head"><h3>Powiadomienia – klucze</h3><span class="pill warn">Skopiuj teraz – nie pokażemy ich ponownie</span></div>
    <div class="keys">
      ${row('VAPID_PUBLIC_KEY', k.pub, 'k-pub')}
      ${row('VAPID_PRIVATE_KEY', k.priv, 'k-priv')}
      ${row('CRON_SECRET', k.cron, 'k-cron')}
      ${row('VAPID_SUBJECT', 'mailto:' + (me.email || 'flota@firma.pl'), 'k-sub')}
      <p class="muted small" style="margin:0">Te cztery wartości wklej w Supabase → <b>Edge Functions → Secrets</b>. Klucz publiczny jest już zapisany w bazie. Potem uruchom w SQL Editor harmonogram (codziennie ok. 7:30, a w czasie letnim 8:30):</p>
      ${row('Harmonogram (SQL)', sql, 'k-sql')}
      <button class="small" data-action="push-done">Gotowe – ukryj klucze</button>
    </div></div>`;
}
async function generatePushKeys(){
  try {
    const kp = await crypto.subtle.generateKey({name:'ECDSA', namedCurve:'P-256'}, true, ['sign','verify']);
    const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
    const priv = (await crypto.subtle.exportKey('jwk', kp.privateKey)).d;
    const cron = b64u(crypto.getRandomValues(new Uint8Array(24)));
    await db.collection('settings').doc('push').set({vapidPublicKey: pub});
    generatedKeys = {pub, priv, cron};
    toast('Wygenerowano klucze'); render();
  } catch(err){ handleWriteErr(err); }
}
document.addEventListener('click', async e => {
  const c = e.target.closest('[data-copy]');
  if (c){ const t = ($('#'+c.dataset.copy) || {}).textContent || ''; try { await navigator.clipboard.writeText(t); toast('Skopiowano'); } catch(_){ toast('Zaznacz tekst i skopiuj ręcznie'); } return; }
  const a = e.target.closest('[data-action]'); if (!a) return;
  if (a.dataset.action==='push-gen') generatePushKeys();
  else if (a.dataset.action==='push-regen'){ generatedKeys = null; S.settings = S.settings.filter(s => s.id!=='push'); render(); }
  else if (a.dataset.action==='push-done'){ generatedKeys = null; render(); }
  else if (a.dataset.action==='push-open') openPushDialog();
});
