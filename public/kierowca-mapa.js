/* Emage FLEET — mapa tras dla kierowcy: tylko podgląd.
   Wszystkie trasy z Planera tras (linia przejazdu, przystanki) i klienci z adresem i telefonem, „Nawiguj” do telefonu.
   Bez zmian, bez kosztów (koszty planów są w osobnej tabeli, której kierowca nie czyta). */
let dmMap = null, dmEl = null, dmLayer = null, dmBases = null, dmBase = 'map', dmQ = '', dmOpen = true, dmFitted = false, dmMe = null, dmAll = false;

const dmOn = () => typeof mtRoutes==='function' && optOn('routePlans') && optOn('clients');
const dmNav = c => `https://www.google.com/maps/dir/?api=1&destination=${Number(c.lat).toFixed(6)},${Number(c.lng).toFixed(6)}`;
const dmTel = p => String(p || '').replace(/[^\d+]/g, '');
/* trasa, którą kierowca jedzie dziś (z grafiku albo przejętego auta) → plan przypięty do tej trasy */
function dmMyPlan(){
  const me_ = myDriverId(), t = today();
  const b = S.bookings.find(x => crewOf(x).includes(me_) && holds(x) && x.routeId) || S.bookings.find(x => crewOf(x).includes(me_) && x.from<=t && x.to>=t && x.routeId);
  return b ? mtRoutes().find(p => p.routeId===b.routeId) || null : null;
}
function dmPoints(r){   // start, przystanki, koniec – z klientem
  const out = [], add = (c, lab) => { if (c) out.push({c, lab}); };
  add(mtClient(r.startClientId), 'S'); mtActStops(r).forEach((s, i) => add(mtClient(s.clientId), String(i + 1))); add(mtClient(r.endClientId), 'K');
  return out;
}
function dmClientRow(c, lab, col){
  return `<li class="dm-stop">${lab ? `<span class="mt-pin" style="background:${esc(col)}">${esc(lab)}</span>` : `<span class="dm-dot">${ic('pin')}</span>`}
    <span class="dm-stop-t"><b>${esc(c.name)}</b>${c.address ? `<span class="sub">${esc(c.address)}</span>` : ''}${c.note ? `<span class="sub">${esc(c.note)}</span>` : ''}</span>
    <span class="dm-acts">${c.phone ? `<a class="btn small ghost" href="tel:${esc(dmTel(c.phone))}" aria-label="Zadzwoń">${ic('phone')}</a>` : ''}${mtHasXY(c) ? `<a class="btn small" href="${dmNav(c)}" target="_blank" rel="noopener">Nawiguj</a>` : ''}${mtHasXY(c) ? `<button type="button" class="btn small ghost" data-dm-show="${esc(c.id)}" aria-label="Pokaż na mapie">${ic('pin')}</button>` : ''}</span></li>`;
}
/* zaznaczone trasy – zapamiętane w telefonie; na start trasa z dzisiejszego grafiku */
function dmChecked(){
  if (!dmChecked.set){
    let ids = null; try { ids = JSON.parse(localStorage.getItem('ef-dm-checked') || 'null'); } catch(_){}
    const mine = dmMyPlan();
    dmChecked.set = new Set(Array.isArray(ids) ? ids : mine ? [mine.id] : []);
  }
  return dmChecked.set;
}
const dmCheckedN = () => mtRoutes().filter(p => dmChecked().has(p.id)).length;   // tylko trasy, które nadal są
function dmSaveChecked(){ try { localStorage.setItem('ef-dm-checked', JSON.stringify([...dmChecked()])); } catch(_){} }
function viewDriverMap(){
  if (!dmOn()) return `<div class="section driver">${backBtn()}<div class="panel empty"><p>Mapa tras nie jest jeszcze dostępna.</p></div>${driverBar()}</div>`;
  setTimeout(dmMount, 0);
  const plans = mtRoutes(), mine = dmMyPlan(), ch = dmChecked(), q = dmQ.trim().toLowerCase();
  let body;
  if (q){
    const cl = (S.clients || []).filter(c => [c.name, c.address].some(x => String(x || '').toLowerCase().includes(q))).slice(0, 40);
    const pl = plans.filter(p => String(p.name).toLowerCase().includes(q));
    body = `${pl.length ? `<h5 class="mt-h">Trasy</h5><ul class="dm-list">${pl.map(p => dmRouteRow(p, ch, mine)).join('')}</ul>` : ''}
      <h5 class="mt-h">Klienci</h5>${cl.length ? `<ul class="dm-stops">${cl.map(c => dmClientRow(c)).join('')}</ul>` : '<p class="muted small">Nic nie znaleziono.</p>'}`;
  } else if (dmAll){
    const cl = (S.clients || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'pl'));
    body = `<div class="dm-seg"><button type="button" data-dm-all="0">Trasy i punkty</button><button type="button" class="on" data-dm-all="1">Wszyscy klienci (${cl.length})</button></div>
      ${cl.length ? `<ul class="dm-stops">${cl.map(c => dmClientRow(c)).join('')}</ul>` : '<p class="muted small">Brak klientów.</p>'}`;
  } else {
    const sel = plans.filter(p => ch.has(p.id));
    body = `<div class="dm-seg"><button type="button" class="on" data-dm-all="0">Trasy i punkty</button><button type="button" data-dm-all="1">Wszyscy klienci (${(S.clients || []).length})</button></div>
      ${plans.length ? `<div class="dm-sub"><h5 class="mt-h">Trasy</h5><span><button type="button" class="link" data-dm-check-all>Zaznacz wszystkie</button>${sel.length ? ` · <button type="button" class="link" data-dm-clear>Wyczyść</button>` : ''}</span></div>
      <ul class="dm-list">${plans.map(p => dmRouteRow(p, ch, mine)).join('')}</ul>
      <h5 class="mt-h">Punkty${sel.length ? ` <span class="muted small">(${sel.reduce((a, p) => a + dmPoints(p).length, 0)})</span>` : ''}</h5>
      ${sel.length ? sel.map(p => { const pts = dmPoints(p), col = mtColor(p), rt = mtLinked(p);
          return `<div class="dm-group"><div class="dm-head"><i style="background:${esc(col)}"></i><div><b>${esc(p.name)}</b>${rt ? `<span class="sub">${esc(rt.code || '')} ${esc(rt.name || '')}</span>` : ''}<span class="sub" data-dm-metric="${esc(p.id)}">${esc(dmMetric(p))}</span>${p.note ? `<span class="sub">${esc(p.note)}</span>` : ''}</div></div>
            ${pts.length ? `<ul class="dm-stops">${pts.map(x => dmClientRow(x.c, x.lab, col)).join('')}</ul>` : '<p class="muted small">Ta trasa nie ma jeszcze przystanków.</p>'}</div>`; }).join('')
        : '<p class="muted small">Zaznacz trasę powyżej – tu pojawią się jej punkty po kolei, z adresem i nawigacją.</p>'}`
      : '<p class="muted small">Kierownik nie zaplanował jeszcze tras na mapie.</p>'}`;
  }
  return `<div class="dmap">
    <div id="dm-slot" class="dm-slot" data-morph-keep></div>
    <div class="dm-top">
      <a class="pl-back" href="#moje" aria-label="Wróć">${ic('back')}</a>
      <label class="pl-search">${ic('search')}<input type="search" id="dm-q" placeholder="Szukaj klienta, adresu albo trasy" value="${esc(dmQ)}" autocomplete="off"></label>
    </div>
    <div class="dm-tools">
      <button type="button" class="pl-tb" data-dm-base>${dmBase==='map' ? 'Satelita' : 'Mapa'}</button>
      <button type="button" class="pl-tb" data-dm-me aria-label="Moja lokalizacja">${ic('pin')}</button>
    </div>
    <section class="dm-sheet ${dmOpen ? '' : 'closed'}">
      <button type="button" class="dm-grip" data-dm-toggle aria-label="${dmOpen ? 'Zwiń listę' : 'Rozwiń listę'}"><span></span><b>${dmCheckedN() ? `Zaznaczone trasy: ${dmCheckedN()}` : 'Trasy i punkty'}</b></button>
      <div class="dm-body">${body}</div>
    </section>
  </div>`;
}
function dmRouteRow(p, ch, mine){
  const n = dmPoints(p).length;
  return `<li><label class="dm-route ${ch.has(p.id) ? 'on' : ''}"><input type="checkbox" data-dm-check="${esc(p.id)}" ${ch.has(p.id) ? 'checked' : ''}><i style="background:${esc(mtColor(p))}"></i><b>${esc(p.name)}</b>${mine && mine.id===p.id ? '<span class="pill soon">dziś jedziesz</span>' : ''}<span class="sub">${n} ${isPlural(n, 'punkt', 'punkty', 'punktów')}</span></label></li>`;
}
function dmMetric(r){
  const x = mtRoad(r);
  if (x.status==='ready'){ const mins = Math.round(x.data.duration / 60); return `${Math.round(x.data.distance / 1000).toLocaleString('pl-PL')} km · ${mins >= 60 ? Math.floor(mins / 60) + ' godz. ' : ''}${mins % 60} min jazdy`; }
  return x.status==='loading' ? 'Wyznaczanie przejazdu…' : '';
}
function dmMount(){
  const slot = document.getElementById('dm-slot'); if (!slot) return;
  if (!dmEl){ dmEl = document.createElement('div'); dmEl.id = 'dm-map'; dmEl.setAttribute('aria-label', 'Mapa tras'); }
  if (dmEl.parentNode!==slot) slot.append(dmEl);
  mtLib().then(() => {
    if (!dmMap){
      dmMap = L.map(dmEl, {zoomControl: false}).setView([52.1, 19.4], 6);
      L.control.zoom({position: 'topright'}).addTo(dmMap);
      dmBases = {
        map: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}),
        sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom: 19, attribution: 'Zdjęcia &copy; Esri'})};
      dmBases[dmBase].addTo(dmMap);
      dmLayer = L.layerGroup().addTo(dmMap);
    }
    setTimeout(() => { dmMap.invalidateSize(); dmDraw(); if (!dmFitted){ dmFitted = true; dmFit(); } }, 30);
  }).catch(() => toast('Nie udało się wczytać mapy. Sprawdź internet.'));
}
function dmFit(){
  if (!dmMap) return;
  const ch = dmChecked(), sel = mtRoutes().filter(p => ch.has(p.id));
  const xs = (sel.length ? sel.flatMap(p => dmPoints(p).map(x => x.c)) : (S.clients || [])).filter(mtHasXY).map(c => [Number(c.lat), Number(c.lng)]);
  if (xs.length) dmMap.fitBounds(xs, {padding: [40, 40], maxZoom: 14});
}
function dmPopup(c){
  return `<b>${esc(c.name)}</b>${c.address ? `<br>${esc(c.address)}` : ''}${c.phone ? `<br><a href="tel:${esc(dmTel(c.phone))}">${esc(c.phone)}</a>` : ''}<br><a href="${dmNav(c)}" target="_blank" rel="noopener">Nawiguj</a>`;
}
function dmDraw(){
  if (!dmMap || !dmLayer || !document.getElementById('dm-slot')) return;
  dmLayer.clearLayers();
  const used = new Set(), ch = dmChecked();
  // zaznaczone trasy – tylko one; nic nie zaznaczono – wszystkie trasy cienką linią, bez numerów
  const any = dmCheckedN() > 0;
  mtRoutes().filter(r => !any || ch.has(r.id)).forEach(r => {
    const on = ch.has(r.id), col = mtColor(r), road = mtRoad(r), pts = dmPoints(r).filter(p => mtHasXY(p.c));
    const coords = road.data ? road.data.geometry.coordinates.map(([lng, lat]) => [lat, lng]) : pts.map(p => [Number(p.c.lat), Number(p.c.lng)]);
    if (coords.length > 1) L.polyline(coords, {color: col, weight: on ? 5 : 3, opacity: on ? .9 : .45, dashArray: road.data ? null : '6 8'}).addTo(dmLayer).on('click', () => { ch.add(r.id); dmSaveChecked(); dmAll = false; dmOpen = true; render(); dmDraw(); });
    if (!on) return;
    pts.forEach(p => { used.add(p.c.id);
      L.marker([Number(p.c.lat), Number(p.c.lng)], {icon: L.divIcon({className: '', html: `<span class="mt-pin" style="background:${esc(col)}">${esc(p.lab)}</span>`, iconSize: [30, 30], iconAnchor: [15, 15]})}).bindPopup(dmPopup(p.c)).addTo(dmLayer); });
  });
  (S.clients || []).filter(c => mtHasXY(c) && !used.has(c.id)).forEach(c =>
    L.circleMarker([Number(c.lat), Number(c.lng)], {radius: 6, color: '#fff', weight: 2, fillColor: '#5d6878', fillOpacity: .9}).bindPopup(dmPopup(c)).addTo(dmLayer));
  if (dmMe) L.circleMarker(dmMe, {radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1}).addTo(dmLayer);
  document.querySelectorAll('[data-dm-metric]').forEach(n => { const r = mtPlan(n.dataset.dmMetric); if (r) n.textContent = dmMetric(r); });
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-dm-toggle],[data-dm-base],[data-dm-me],[data-dm-show],[data-dm-all],[data-dm-check-all],[data-dm-clear]'); if (!t) return;
  const d = t.dataset;
  if ('dmAll' in d){ dmAll = d.dmAll==='1'; render(); return; }
  if ('dmCheckAll' in d){ const ch = dmChecked(); mtRoutes().forEach(p => ch.add(p.id)); dmSaveChecked(); render(); dmDraw(); dmFit(); return; }
  if ('dmClear' in d){ dmChecked().clear(); dmSaveChecked(); render(); dmDraw(); return; }
  if ('dmToggle' in d){ dmOpen = !dmOpen; render(); return; }
  if ('dmBase' in d){ if (!dmMap) return; dmMap.removeLayer(dmBases[dmBase]); dmBase = dmBase==='map' ? 'sat' : 'map'; dmBases[dmBase].addTo(dmMap); render(); return; }
  if ('dmMe' in d){ if (!navigator.geolocation) return toast('Telefon nie udostępnia lokalizacji');
    navigator.geolocation.getCurrentPosition(p => { dmMe = [p.coords.latitude, p.coords.longitude]; if (dmMap){ dmMap.setView(dmMe, 13); dmDraw(); } }, () => toast('Brak zgody na lokalizację – włącz ją w ustawieniach telefonu'), {enableHighAccuracy: true, timeout: 10000}); return; }
  if ('dmShow' in d){ const c = mtClient(d.dmShow); if (!c || !dmMap) return; if (innerWidth < 760){ dmOpen = false; render(); }
    setTimeout(() => { dmMap.setView([Number(c.lat), Number(c.lng)], 15); dmLayer.eachLayer(l => { if (l.getLatLng && l.getLatLng().equals([Number(c.lat), Number(c.lng)]) && l.openPopup) l.openPopup(); }); }, 60); return; }
});
document.addEventListener('input', e => { if (e.target.id!=='dm-q') return; dmQ = e.target.value; dmOpen = true; render(); });
document.addEventListener('change', e => { const id = e.target.dataset && e.target.dataset.dmCheck; if (!id) return;
  const ch = dmChecked(); if (e.target.checked) ch.add(id); else ch.delete(id); dmSaveChecked(); render(); dmDraw(); if (e.target.checked) dmFit(); });
