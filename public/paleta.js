/* Emage FLEET — szybkie wyszukiwanie (Ctrl+K albo „/”, ikona lupy w menu).
   Jedno pole: auta (karta), kierowcy (karta kierowcy), trasy, zakładki i najczęstsze czynności. Strzałki + Enter. */

let palOpen = false, palSel = 0, palItems = [];
const palNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/\s+/g, '');

function palActions(){
  const a = [];
  const act = myActive && myDriverId() ? myActive() : null;
  if (act && !act.returned) a.push({ic:'fuel', t:'Zatankuj', s:'tankowanie auta, którym jedziesz', run: () => document.querySelector(`[data-fuel="${act.vehicleId}"]`)?.click() || openForm('costs', null, {vehicleId: act.vehicleId, category:'Paliwo'})});
  if (canCreate('issues')) a.push({ic:'wrench', t:'Zgłoś usterkę', s:'nowe zgłoszenie', run: () => openForm('issues', null, act ? {vehicleId: act.vehicleId} : undefined)});
  if (act && !act.returned && typeof openAccident==='function') a.push({ic:'alert', t:'Kolizja lub szkoda', s:'zgłoszenie krok po kroku', run: () => openAccident(act.vehicleId)});
  if (act && !act.returned && typeof openMyDocs==='function') a.push({ic:'clip', t:'Dokumenty auta', s:'dowód, OC, przegląd – do kontroli', run: () => openMyDocs(act.vehicleId)});
  if (canCreate('bookings') && P().bookings==='rw') a.push({ic:'cal', t:'Nowy przydział', s:'kierowca + auto + trasa', run: () => openForm('bookings')});
  if (P().manage && typeof openAnnounce==='function') a.push({ic:'bell', t:'Komunikat do kierowców', s:'wiadomość na ekranie każdego kierowcy', run: () => openAnnounce()});
  if (P().manage && typeof openDayPlan==='function'){
    a.push({ic:'route', t:'Plan dnia – dziś', s:'grafik do skopiowania / wysłania', run: () => openDayPlan(today())});
    a.push({ic:'route', t:'Plan dnia – jutro', s:'grafik do skopiowania / wysłania', run: () => openDayPlan(addDays(today(), 1))});
  }
  if (canCreate('costs') && P().manage) a.push({ic:'coins', t:'Dodaj koszt', s:'paliwo, serwis, opłaty…', run: () => openForm('costs')});
  if (canCreate('serviceEntries') && P().service) a.push({ic:'clip', t:'Wpis serwisowy', s:'do książki serwisowej', run: () => openForm('serviceEntries')});
  if (canCreate('deadlines')) a.push({ic:'cal', t:'Dodaj termin', s:'przegląd, OC, serwis…', run: () => openForm('deadlines')});
  if (canCreate('vehicles')) a.push({ic:'truck', t:'Dodaj pojazd', s:'nowe auto we flocie', run: () => openForm('vehicles')});
  if (P().manage) a.push({ic:'fuel', t:'Import z karty paliwowej', s:'Paliwo → Karty paliwowe', run: () => { location.hash = 'karty'; setTimeout(() => document.querySelector('#view [data-action="fc-import"]')?.click(), 150); }});
  return a;
}
function palTabs(){
  const out = [];
  const add = (k, l, ic_) => out.push({ic: ic_, t: l, s: 'przejdź do zakładki', run: () => { location.hash = k; }});
  if (P().mycar && myDriverId()){ add('moje', 'Moje auto', 'key'); add('moje-dane', 'Moje dane', 'user'); }
  if (!P().mycar || P().manage || P().service){ add('pulpit', 'Pulpit', 'home'); add('pojazdy', 'Pojazdy', 'truck'); }
  const icons = {rezerwacje:'cal', serwis:'wrench', paliwo:'fuel', koszty:'coins', ludzie:'users', ustawienia:'cog'};
  Object.entries(GROUPS).forEach(([g, subs]) => subs.forEach(([k, l, ok]) => { try { if (ok()) add(k, l, icons[g] || 'chev'); } catch(_){} }));
  return out;
}
function palSearch(qs){
  const n = palNorm(qs), res = [];
  const m = (...xs) => !n || xs.some(x => palNorm(x).includes(n));
  if (n){
    S.vehicles.filter(v => m(v.plate, v.make, v.model, v.vin)).slice(0, 6).forEach(v => res.push({ic:'truck', t: v.plate, s: `${v.make || ''} ${v.model || ''} · ${vehicleState(v).txt}`, run: () => { pendingCard = v.id; if (location.hash==='#pojazdy') route(); else location.hash = 'pojazdy'; }}));
    if (P().manage || P().service) S.drivers.filter(d => m(d.name, d.phone)).slice(0, 5).forEach(d => res.push({ic:'user', t: d.name, s: d.phone || 'kierowca', run: () => { if (P().manage && typeof openDriverCard==='function'){ location.hash = 'kierowcy'; setTimeout(() => openDriverCard(d.id), 80); } else location.hash = 'kierowcy'; }}));
    S.routes.filter(r => m(r.code, r.name)).slice(0, 4).forEach(r => res.push({ic:'route', t: `${r.code} · ${r.name}`, s: 'trasa', run: () => { location.hash = P().manage ? 'trasy' : 'przydzial'; }}));
    (S.routeStops || []).filter(s => m(s.client, s.address)).slice(0, 4).forEach(s => res.push({ic:'box', t: s.client, s: `przystanek trasy ${rCode(s.routeId)}${s.address ? ' · ' + s.address : ''}`, run: () => { location.hash = P().manage ? 'trasy' : 'moje'; }}));
  }
  palActions().filter(a => m(a.t, a.s)).forEach(a => res.push({...a, grp:'Czynności'}));
  palTabs().filter(a => m(a.t)).forEach(a => res.push({...a, grp:'Zakładki'}));
  return res.slice(0, 14);
}
function palRender(){
  const box = $('#pal-list'); if (!box) return;
  palItems = palSearch($('#pal-q').value);
  if (palSel >= palItems.length) palSel = Math.max(0, palItems.length - 1);
  let last = '';
  box.innerHTML = palItems.map((x, i) => { const g = x.grp || 'Wyniki'; const h = g!==last ? `<div class="pal-g">${g}</div>` : ''; last = g;
    return `${h}<button type="button" class="pal-it ${i===palSel ? 'on' : ''}" data-pal="${i}" role="option" aria-selected="${i===palSel}">${ic(x.ic)}<span><b>${esc(x.t)}</b><em>${esc(x.s || '')}</em></span></button>`; }).join('')
    || '<p class="muted pal-none">Nic nie znaleziono. Wpisz rejestrację, nazwisko, trasę albo czynność.</p>';
  box.querySelector('.pal-it.on')?.scrollIntoView({block:'nearest'});
}
function openPalette(){
  if (palOpen || !$('#scrim').hidden) return;
  palOpen = true; palSel = 0;
  const el = document.createElement('div'); el.id = 'pal'; el.className = 'pal-scrim';
  el.innerHTML = `<div class="pal" role="dialog" aria-modal="true" aria-label="Szukaj"><div class="pal-in">${ic('search')}<input id="pal-q" placeholder="Szukaj: rejestracja, kierowca, trasa, klient albo czynność…" autocomplete="off" role="combobox" aria-controls="pal-list" aria-expanded="true"><kbd>Esc</kbd></div><div id="pal-list" role="listbox"></div></div>`;
  document.body.appendChild(el);
  $('#pal-q').focus(); palRender();
}
function closePalette(){ palOpen = false; $('#pal')?.remove(); }
function palRun(i){ const x = palItems[i]; if (!x) return; closePalette(); try { x.run(); } catch(err){ console.error(err); } }
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName) || (e.target || {}).isContentEditable;
  if ((e.key==='k' || e.key==='K') && (e.ctrlKey || e.metaKey)){ e.preventDefault(); palOpen ? closePalette() : openPalette(); return; }
  if (e.key==='/' && !typing && !palOpen && !$('#app').hidden){ e.preventDefault(); openPalette(); return; }
  if (!palOpen) return;
  if (e.key==='Escape'){ e.preventDefault(); closePalette(); }
  else if (e.key==='ArrowDown'){ e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); palRender(); }
  else if (e.key==='ArrowUp'){ e.preventDefault(); palSel = Math.max(0, palSel - 1); palRender(); }
  else if (e.key==='Enter'){ e.preventDefault(); palRun(palSel); }
});
document.addEventListener('input', e => { if (e.target.id==='pal-q'){ palSel = 0; palRender(); } });
document.addEventListener('click', e => {
  if (e.target.closest('[data-action="palette"]')){ e.preventDefault(); openPalette(); return; }
  if (!palOpen) return;
  const it = e.target.closest('[data-pal]'); if (it){ palRun(+it.dataset.pal); return; }
  if (e.target.id==='pal') closePalette();
});
