/* Emage FLEET — praca bez zasięgu: kolejka wpisów kierowcy (tankowanie, zdanie auta) i dane z ostatniej synchronizacji */
'use strict';
const OFF_DB = 'ef-offline', OFF_STORE = 'q', OFF_FAIL = 'ef-offline-fail', SNAP = 'ef-snap';
let offlineCount = 0, offlineBusy = false;

function offDb(){
  return new Promise((res, rej) => {
    const r = indexedDB.open(OFF_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(OFF_STORE, {keyPath:'id', autoIncrement:true});
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function offTx(mode, fn){
  const d = await offDb();
  return new Promise((res, rej) => { const tx = d.transaction(OFF_STORE, mode); const out = fn(tx.objectStore(OFF_STORE)); tx.oncomplete = () => res(out && out.result); tx.onerror = () => rej(tx.error); });
}
const offAll = () => offTx('readonly', s => s.getAll());
const offDel = id => offTx('readwrite', s => s.delete(id));
async function refreshOfflineCount(){ try { offlineCount = (await offAll()).length; } catch(_){ offlineCount = 0; } }

/* Pliki zdjęć z pola formularza (Blob da się zapisać w IndexedDB) */
function filesOf(prefix){ const el = $('#' + prefix + '-photos'); return el && el.files ? [...el.files].slice(0, MAX_PHOTOS) : []; }
const isNetErr = err => !navigator.onLine || /fetch|network|load failed|timeout|offline/i.test(String((err && (err.message || err.code)) || err));

async function queueOffline(kind, payload, files){
  try { await offTx('readwrite', s => s.add({kind, payload, files: files || [], at: new Date().toISOString(), user: myId})); }
  catch(_){ toast('Nie udało się zapisać wpisu w telefonie'); return; }
  await refreshOfflineCount(); render();
}

const failList = () => { try { return JSON.parse(localStorage.getItem(OFF_FAIL) || '[]'); } catch(_){ return []; } };
function addFail(msg){ try { const l = failList(); l.push({at: new Date().toISOString(), msg}); localStorage.setItem(OFF_FAIL, JSON.stringify(l.slice(-10))); } catch(_){} }

/* Wysyłka kolejki po odzyskaniu sieci */
async function processQueue(){
  if (offlineBusy || !navigator.onLine || !db || !myId) return;
  offlineBusy = true;
  let sent = 0;
  try {
    for (const it of await offAll()){
      if (it.user && it.user!==myId) continue;
      try {
        const photos = [];
        for (const f of it.files || []){ const up = await assetsNS.upload(f, {type: f.type}); photos.push(up.id); }
        if (it.kind==='cost'){
          await db.collection('costs').doc().set({...it.payload.data, photos: [...(it.payload.data.photos || []), ...photos]});
        } else if (it.kind==='return'){
          const p = it.payload;
          await db.collection('bookings').doc(p.bookingId).update({returned: {...p.rec, photos}});
          if (p.issue) await db.collection('issues').doc().set({vehicleId: p.vehicleId, status:'nowe', date: p.rec.at, km: p.rec.km, ...p.issue, photos});
        }
        await offDel(it.id); sent++;
      } catch(err){
        if (isNetErr(err)) break;                     // nadal brak sieci – spróbujemy później
        addFail(`${it.kind==='cost' ? 'Tankowanie' : 'Zdanie auta'} z ${fdate((it.at || '').slice(0, 10))}: ${err && err.message || 'błąd zapisu'}`);
        await offDel(it.id);
      }
    }
  } finally { offlineBusy = false; }
  await refreshOfflineCount();
  if (sent){ toast(`Wysłano zapisane bez zasięgu: ${sent}`); ['costs','bookings','vehicles','issues'].forEach(c => refresh(c)); }
  else render();
}
window.addEventListener('online', () => { processQueue(); if (dbState==='offline' && sessionUser) startSession(sessionUser, true); });
window.addEventListener('offline', () => render());

/* Komunikat na ekranie kierowcy */
function offlineNote(){
  const fails = failList();
  return (offlineCount ? `<div class="notice"><span>${navigator.onLine ? 'Wysyłanie' : 'Brak zasięgu'} – <b>${offlineCount}</b> ${isPlural(offlineCount,'wpis czeka','wpisy czekają','wpisów czeka')} na wysłanie. Zapiszą się same, gdy telefon złapie sieć.</span>${navigator.onLine ? '<button class="small" data-action="sync-now">Wyślij teraz</button>' : ''}</div>` : '')
    + (!offlineCount && !navigator.onLine ? `<div class="notice"><span>Brak zasięgu. Tankowanie i zdanie auta możesz zapisać – wyślą się same po odzyskaniu sieci.</span></div>` : '')
    + (fails.length ? `<div class="notice err"><span>Nie udało się zapisać wpisów zrobionych bez zasięgu: ${fails.map(f => esc(f.msg)).join('; ')}. Dodaj je ponownie.</span><button class="small" data-action="clear-fails">OK</button></div>` : '');
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-action="sync-now"],[data-action="clear-fails"]'); if (!t) return;
  if (t.dataset.action==='sync-now') processQueue();
  else { try { localStorage.removeItem(OFF_FAIL); } catch(_){} render(); }
});

/* Dane z ostatniej synchronizacji (kierowca) – aplikacja otworzy się bez zasięgu */
const SNAP_COLS = ['vehicles','drivers','bookings','routes','routeStops','settings','costs','cleanings','blockOverrides','deadlines','issues'];
function saveSnapshot(){
  if (!me || !P().mycar) return;
  try { localStorage.setItem(SNAP, JSON.stringify({uid: myId, at: new Date().toISOString(), me, names, S: Object.fromEntries(SNAP_COLS.map(c => [c, S[c]]))})); } catch(_){}
}
function loadSnapshot(uid){
  try { const s = JSON.parse(localStorage.getItem(SNAP) || 'null'); return s && s.uid===uid ? s : null; } catch(_){ return null; }
}
refreshOfflineCount();
