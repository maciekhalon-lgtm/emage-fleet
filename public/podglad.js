/* Emage FLEET — „Podgląd jako kierowca” (tylko kierownik floty).
   Aplikacja pokazuje ekran wybranego kierowcy 1:1, ale wszystkie zapisy są zablokowane (baza.js: sb.from / sb.rpc / pliki).
   Nic nie trafia do bazy, kierowca nic nie widzi. Wyjście = przeładowanie strony z powrotem na własne konto. */
function viewAsStart(driverId){
  if (viewAs || !me || me.role!=='floty' || me.status!=='active') return;
  const d = byId('drivers', driverId); if (!d) return;
  const prof = (profiles || []).find(p => p.driver_id===driverId);
  viewAs = {driverId, name: d.name, me0: me, myId0: myId};
  me = {...me, role: 'kierowca', driver_id: driverId, full_name: d.name, email: prof ? prof.email || '' : ''};
  myId = prof ? prof.id : '00000000-0000-0000-0000-000000000000';
  if (typeof closeForm==='function') closeForm();
  document.body.classList.add('viewas');
  let bar = document.getElementById('viewas-bar');
  if (!bar){ bar = document.createElement('div'); bar.id = 'viewas-bar'; document.body.prepend(bar); }
  bar.innerHTML = `<span class="va-t">${ic('eye')} Podgląd: <b>${esc(d.name)}</b><em> – tylko do oglądania, zmiany są zablokowane</em></span><button type="button" data-viewas-exit>Wyjdź</button>`;
  document.documentElement.style.setProperty('--va-h', bar.offsetHeight + 'px');
  (typeof refreshFuelAll==='function' ? refreshFuelAll() : Promise.resolve()).catch(() => {}).then(() => { location.hash = 'moje'; render(); });
}
function viewAsExit(){
  try { sessionStorage.setItem('ef-after-viewas', '1'); } catch(_){}
  location.hash = 'kierowcy'; location.reload();
}
document.addEventListener('click', e => {
  const s = e.target.closest('[data-viewas]'); if (s){ viewAsStart(s.dataset.viewas); return; }
  if (e.target.closest('[data-viewas-exit]')) viewAsExit();
});
