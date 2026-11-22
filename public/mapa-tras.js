/* Emage FLEET — Grafik → Mapa tras: klienci (punkty ze współrzędnymi) i plany tras na mapie.
   Plan = start → przystanki (klienci) → koniec + punkty przejazdowe; przejazd po drogach z OSRM, adresy z Photon,
   mapa OpenStreetMap (Leaflet). Plan można przypiąć do trasy z zakładki Trasy (albo utworzyć nową) – wtedy jego
   przystanki stają się przystankami tej trasy (route_stops), które kierowca widzi w telefonie.
   Dane w bazie (migracje 059–061), zmienia kierownik floty.
   Mapa jest jedna i żyje poza render() – przenosimy ją do strony po każdym odświeżeniu, żeby nie migała. */
'use strict';
const MT_COLORS = ['#245dcc', '#137e64', '#9d3bb5', '#b65616', '#c0263d', '#0f7d8c', '#6b5b00', '#4b3fb0'];
let mtSub = 'trasa';
let plMode = 'mapa';   // tryb planera: mapa / koszty / wycena
const plCfg = () => { const s = (S.settings || []).find(x => x.id==='planner') || {}; return {drvMult: Number(s.drvMult) > 0 ? Number(s.drvMult) : 1.6, margin: s.margin!=null && s.margin!=='' ? Number(s.margin) : 20}; };
let mtBases = null, plBase = 'map', plPanel = true, plQ = '', plPrev = 'pulpit', plMe = null, plTmp = null;
try { plBase = localStorage.getItem('ef-pl-base')==='sat' ? 'sat' : 'map'; } catch(_){}   // zakładka w szczegółach planu: trasa / koszty / czas
let mtLineDrag = null, mtDragEnd = 0, mtMovePin = null;
let mtTab = 'routes', mtActive = null, mtFilter = '', mtPicking = null, mtMap = null, mtLayer = null, mtEl = null, mtLoad = null, mtFitted = false;
const mtCalc = new Map();
let mtHidden = new Set(); try { mtHidden = new Set(JSON.parse(localStorage.getItem('ef-mt-hidden') || '[]')); } catch(_){}
const mtSaveHidden = () => { try { localStorage.setItem('ef-mt-hidden', JSON.stringify([...mtHidden])); } catch(_){} };
const mtOn = () => !!P().manage && optOn('clients') && optOn('routePlans');
const mtClient = id => (S.clients || []).find(c => c.id===id);
const mtHasXY = c => c && c.lat!=null && c.lng!=null && c.lat!=='' && c.lng!=='';
const mtRoutes = () => (S.routePlans || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'pl'));   // plany tras
const mtPlan = id => (S.routePlans || []).find(p => p.id===id);
const mtColor = r => r.color || MT_COLORS[Math.max(0, mtRoutes().findIndex(x => x.id===r.id)) % MT_COLORS.length];
const mtStops = r => (r && Array.isArray(r.stops) ? r.stops : []).filter(s => s && s.clientId);
const mtLinked = r => r && r.routeId ? byId('routes', r.routeId) : null;
const mtRStops = rid => (S.routeStops || []).filter(s => s.routeId===rid).sort((a, b) => (a.pos || 0) - (b.pos || 0));
/* zapis planu; gdy plan jest przypięty do trasy, przystanki trasy (kierowca) idą za planem */
async function mtSavePlan(r, patch){
  await db.collection('routePlans').doc(r.id).update(patch);
  const np = {...r, ...patch};
  if (np.routeId && ('stops' in patch || ('routeId' in patch && (mtStops(np).length || np.startClientId)))) await mtSyncRoute(np);
}
async function mtSyncRoute(r){
  const rid = r.routeId; if (!rid) return;
  const rows = mtRStops(rid), used = new Set();
  const want = mtStops(r);
  for (let i = 0; i < want.length; i++){
    const c = mtClient(want[i].clientId); if (!c) continue;
    const ex = rows.find(x => !used.has(x.id) && x.clientId===c.id);
    if (ex){ used.add(ex.id);
      if (ex.pos!==i + 1 || ex.client!==c.name || (ex.address || null)!==(c.address || null)) await db.collection('routeStops').doc(ex.id).update({pos: i + 1, client: c.name, address: c.address || null}); }
    else await db.collection('routeStops').doc().set({routeId: rid, pos: i + 1, client: c.name, address: c.address || null, phone: c.phone || null, note: c.note || null, clientId: c.id});
  }
  for (const x of rows) if (!used.has(x.id)) await db.collection('routeStops').doc(x.id).delete();
}
/* punkty trasy na mapie: start, przystanki z klientem ze współrzędnymi, koniec */
/* punkty przejazdowe (via): [{lat, lng, after}] – after = 'start' albo id przystanku, za którym leży punkt */
const mtVia = r => Array.isArray(r.via) ? r.via : [];
function mtPoints(r){
  const pts = [], via = mtVia(r);
  const add = (c, lab, key) => { if (mtHasXY(c)) pts.push({c, lab, key, lat: Number(c.lat), lng: Number(c.lng)}); };
  const vias = key => via.forEach((v, vi) => { if (v.after===key && v.lat!=null && v.lng!=null) pts.push({via: true, vi, key, lat: Number(v.lat), lng: Number(v.lng)}); });
  add(mtClient(r.startClientId), 'S', 'start'); vias('start');
  mtStops(r).forEach((s, i) => { add(mtClient(s.clientId), String(i + 1), s.id); vias(s.id); });
  add(mtClient(r.endClientId), 'K', 'end');
  return pts;
}
/* odległość w km (do wyboru odcinka, na którym leży nowy punkt przejazdowy) */
const mtDist = (a, b) => { const R = 6371, t = Math.PI / 180, dl = (b.lat - a.lat) * t, dg = (b.lng - a.lng) * t;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
function mtViaInsert(r, ll){
  const pts = mtPoints(r), via = mtVia(r).slice(); if (pts.length < 2) return null;
  let best = 0, bd = Infinity;
  for (let i = 0; i < pts.length - 1; i++){ const d = mtDist(pts[i], ll) + mtDist(ll, pts[i + 1]) - mtDist(pts[i], pts[i + 1]); if (d < bd){ bd = d; best = i; } }
  const a = pts[best], nv = {lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6), after: a.key==='end' ? (pts[best - 1] || {}).key : a.key};
  let at = a.via ? a.vi + 1 : via.findIndex(v => v.after===a.key);
  if (at < 0) at = via.length;
  via.splice(at, 0, nv);
  return via;
}
const mtSaveVia = (r, via) => mtWrite(() => mtSavePlan(r, {via}));

/* ---------- biblioteka mapy (ładowana dopiero na tej stronie) ---------- */
function mtLib(){
  if (window.L) return Promise.resolve();
  if (mtLoad) return mtLoad;
  mtLoad = new Promise((ok, bad) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'; document.head.append(css);
    const js = document.createElement('script'); js.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'; js.onload = ok; js.onerror = () => { mtLoad = null; bad(); }; document.head.append(js);
  });
  return mtLoad;
}
function mtMount(){
  const slot = document.getElementById('mt-slot'); if (!slot) return;
  if (!mtEl){ mtEl = document.createElement('div'); mtEl.id = 'mt-map'; mtEl.setAttribute('aria-label', 'Mapa klientów i tras'); }
  slot.append(mtEl);
  mtLib().then(() => {
    if (!mtMap){
      mtMap = L.map(mtEl, {zoomControl: false}).setView([52.1, 19.4], 6);
      L.control.zoom({position: 'bottomright'}).addTo(mtMap);
      mtBases = {
        map: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · przejazd OSRM'}),
        sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom: 19, attribution: 'Zdjęcia &copy; Esri, Maxar, Earthstar · przejazd OSRM'})};
      mtBases[plBase].addTo(mtMap);
      mtLayer = L.layerGroup().addTo(mtMap);
      mtMap.on('click', ({latlng}) => {
        if (mtLineDrag || Date.now() - mtDragEnd < 400) return;
        if (!mtPicking){ mtMapMenu(latlng); return; }
        const d = mtPicking; mtPicking = null; mtNotice('');
        mtClientForm({...d, lat: latlng.lat.toFixed(6), lng: latlng.lng.toFixed(6)}, d._link, d._addTo);
      });
      mtMap.on('mousemove', e => { if (!mtLineDrag) return; mtLineDrag.m.setLatLng(e.latlng); });
      mtMap.on('mouseup', e => mtLineDrop(e.latlng));
      document.addEventListener('mouseup', () => { if (mtLineDrag) mtLineDrop(mtLineDrag.m.getLatLng()); });
      document.addEventListener('touchend', () => { if (mtLineDrag) mtLineDrop(mtLineDrag.m.getLatLng()); });
    }
    setTimeout(() => { mtMap.invalidateSize(); mtDraw(); if (!mtFitted){ mtFitted = true; mtFit(); } }, 30);
  }).catch(() => mtNotice('Nie udało się wczytać mapy. Sprawdź połączenie z internetem i odśwież stronę.'));
}
function mtFit(){
  if (!mtMap) return;
  const xs = (S.clients || []).filter(mtHasXY).map(c => [Number(c.lat), Number(c.lng)]);
  if (xs.length) mtMap.fitBounds(xs, {padding: [35, 35], maxZoom: 14});
}
/* komunikat na mapie z przyciskiem „Cofnij” (np. po przeciągnięciu pinezki) */
function mtNoticeUndo(t, undo){
  const n = document.getElementById('mt-notice'); if (!n) return;
  n.innerHTML = `${esc(t)} <button type="button" class="link" data-mt-undo>Cofnij</button>`; n.hidden = false;
  mtNoticeUndo.fn = undo; clearTimeout(mtNotice.t); mtNotice.t = setTimeout(() => { n.hidden = true; mtNoticeUndo.fn = null; }, 8000);
}
document.addEventListener('click', e => { if (!e.target.closest('[data-mt-undo]') || !mtNoticeUndo.fn) return; const f = mtNoticeUndo.fn; mtNoticeUndo.fn = null; mtNotice(''); f(); toast('Cofnięto'); });
function mtNotice(t){ const n = document.getElementById('mt-notice'); if (!n) return; n.textContent = t; n.hidden = !t; clearTimeout(mtNotice.t); if (t && !mtPicking) mtNotice.t = setTimeout(() => { n.hidden = true; }, 5000); }

/* ---------- przejazd po drogach (OSRM) ---------- */
function mtRoad(r){
  const pts = mtPoints(r), key = pts.map(p => p.lng.toFixed(5) + "," + p.lat.toFixed(5)).join(';');
  const prev = mtCalc.get(r.id);
  if (prev && prev.key===key) return prev;
  const res = {key, status: pts.length < 2 ? 'empty' : 'loading'};
  mtCalc.set(r.id, res);
  if (res.status==='loading'){
    fetch('https://routing.openstreetmap.de/routed-car/route/v1/driving/' + key + '?overview=full&geometries=geojson', {signal: AbortSignal.timeout(12000)})
      .then(x => { if (!x.ok) throw Error(); return x.json(); })
      .then(d => { if (d.code!=='Ok' || !d.routes || !d.routes[0]) throw Error(); Object.assign(res, {status: 'ready', data: d.routes[0]}); })
      .catch(() => { res.status = 'error'; })
      .finally(() => { if (mtCalc.get(r.id)===res){ document.querySelectorAll(`[data-mt-metric="${r.id}"]`).forEach(n => { n.innerHTML = mtMetric(r); }); mtDraw(); } });
  }
  return res;
}
function mtMetric(r){
  const x = mtRoad(r);
  if (x.status==='ready'){
    const mins = Math.round(x.data.duration / 60), kmR = x.data.distance / 1000;
    const rt = mtLinked(r), inv = rt && Number(rt.km) > 0 ? ` · do faktury ${new Intl.NumberFormat('pl-PL').format(rt.km)} km` : '';
    return `${kmR.toLocaleString('pl-PL', {maximumFractionDigits: 1})} km · ${mins >= 60 ? Math.floor(mins / 60) + ' godz. ' : ''}${mins % 60} min${inv}`;
  }
  return {empty: 'Ustaw co najmniej dwa punkty ze współrzędnymi', loading: 'Wyznaczanie przejazdu…', error: 'Przejazd niedostępny – linia poglądowa'}[x.status];
}

/* ---------- rysowanie ---------- */
function mtDraw(){
  if (!mtMap || !mtLayer || mtPicking) return;
  mtLayer.clearLayers();
  const used = new Set();
  const shown = mtRoutes().filter(r => !mtHidden.has(r.id)).sort((a, b) => Number(a.id===mtActive) - Number(b.id===mtActive));
  shown.forEach(r => {
    const pts = mtPoints(r), calc = mtRoad(r), col = mtColor(r);
    const coords = calc.data ? calc.data.geometry.coordinates.map(([lng, lat]) => [lat, lng]) : pts.map(p => [p.lat, p.lng]);
    const act = r.id===mtActive;
    if (coords.length > 1){
      const line = L.polyline(coords, {color: col, weight: act ? 6 : 4, opacity: .88, dashArray: calc.data ? null : '6 8', interactive: act}).addTo(mtLayer);
      if (act){
        // wybrana trasa: złap linię i przeciągnij – powstaje punkt przejazdowy (trasa pojedzie przez to miejsce)
        L.polyline(coords, {color: col, weight: 22, opacity: 0, interactive: true, className: 'mt-grab'}).addTo(mtLayer)
          .on('mousedown', e => mtLineStart(r, e)).on('click', e => { L.DomEvent.stopPropagation(e); if (Date.now() - mtDragEnd < 400) return; const v = mtViaInsert(r, e.latlng); if (v) mtSaveVia(r, v); });
      }
    }
    if (act) pts.filter(p => p.via).forEach(p => mtViaMarker(r, p));
    const lab = {};
    pts.filter(p => !p.via).forEach(p => { used.add(p.c.id); (lab[p.c.id] = lab[p.c.id] || []).push(p.lab); });
    Object.entries(lab).forEach(([cid, ls]) => mtMarker(mtClient(cid), col, ls.join('/'), r));
  });
  (S.clients || []).filter(c => mtHasXY(c) && !used.has(c.id)).forEach(c => mtMarker(c, '#516579', '•'));
}
function mtMarker(c, color, label, r){
  const pin = L.divIcon({className: '', html: `<span class="mt-pin" style="background:${esc(color)}">${esc(label)}</span>`, iconSize: [30, 30], iconAnchor: [15, 15]});
  // pinezkę klienta łapiesz myszką (albo palcem) i przeciągasz – jak w Mapach Google; zapis od razu, z możliwością cofnięcia
  const m = L.marker([Number(c.lat), Number(c.lng)], {icon: pin, title: c.name, alt: c.name, draggable: !mtPicking, autoPan: true}).addTo(mtLayer);
  const act = mtPlan(mtActive);
  m.on('dragstart', () => { mtMap.closePopup(); });
  m.on('dragend', () => { const ll = m.getLatLng(), prev = {lat: Number(c.lat), lng: Number(c.lng)};
    mtDragEnd = Date.now();
    mtWrite(() => db.collection('clients').doc(c.id).update({lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6)}))
      .then(() => mtNoticeUndo(`Przesunięto „${c.name}”.`, () => mtWrite(() => db.collection('clients').doc(c.id).update(prev)))); });
  m.bindPopup(`<div class="mt-pop"><b>${esc(c.name)}</b>${c.address ? `<br>${esc(c.address)}` : ''}${r ? `<br><span class="muted small">${esc(r.name)}</span>` : ''}
    <div class="mt-pop-a"><button type="button" class="small" data-mt-edit-client="${esc(c.id)}">Edytuj klienta</button>${act ? `<button type="button" class="small primary" data-mt-add-stop="${esc(c.id)}">Dodaj do „${esc(act.name)}”</button>` : ''}</div></div>`);
  m.on('click', () => { if (mtPicking) mtMap.fire('click', {latlng: m.getLatLng()}); });
}
/* punkt przejazdowy wybranej trasy: przeciągnij albo usuń */
function mtViaMarker(r, p){
  const ic_ = L.divIcon({className: '', html: '<span class="mt-via"></span>', iconSize: [18, 18], iconAnchor: [9, 9]});
  const m = L.marker([p.lat, p.lng], {icon: ic_, draggable: true, title: 'Punkt przejazdowy', alt: 'Punkt przejazdowy', zIndexOffset: 500}).addTo(mtLayer);
  m.on('dragend', () => { const ll = m.getLatLng(), via = mtVia(r).slice(); via[p.vi] = {...via[p.vi], lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6)}; mtDragEnd = Date.now(); mtSaveVia(r, via); });
  m.bindPopup(`<div class="mt-pop"><b>Punkt przejazdowy</b><br><span class="muted small">Trasa „${esc(r.name)}” jedzie przez to miejsce – tu się nie zatrzymuje. Przeciągnij, żeby zmienić drogę.</span>
    <div class="mt-pop-a"><button type="button" class="small" data-mt-via-del="${esc(r.id)}|${p.vi}">Usuń punkt przejazdowy</button></div></div>`);
}
/* przeciąganie linii trasy */
function mtLineStart(r, e){
  if (mtPicking || !e.latlng) return;
  L.DomEvent.stop(e); mtMap.dragging.disable();
  const ic_ = L.divIcon({className: '', html: '<span class="mt-via drag"></span>', iconSize: [18, 18], iconAnchor: [9, 9]});
  mtLineDrag = {r, from: e.latlng, m: L.marker(e.latlng, {icon: ic_, interactive: false}).addTo(mtLayer)};
}
function mtLineDrop(ll){
  const d = mtLineDrag; if (!d) return;
  mtLineDrag = null; mtMap.dragging.enable();
  const moved = mtMap.latLngToContainerPoint(ll).distanceTo(mtMap.latLngToContainerPoint(d.from));
  if (moved < 6){ d.m.remove(); return; }   // to było kliknięcie, nie przeciągnięcie
  mtDragEnd = Date.now();
  const via = mtViaInsert(d.r, d.from); if (!via) return;
  const i = via.findIndex(v => v.lat===+d.from.lat.toFixed(6) && v.lng===+d.from.lng.toFixed(6));
  if (i >= 0) via[i] = {...via[i], lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6)};
  mtSaveVia(d.r, via);
}
/* klik w puste miejsce na mapie: nowy klient albo przystanek w tym miejscu */
function mtMapMenu(ll, label){
  const act = mtPlan(mtActive);
  L.popup().setLatLng(ll).setContent(`<div class="mt-pop"><b>${label ? esc(label) : 'To miejsce'}</b><br><span class="muted small" id="mt-rev">${label ? '' : `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`}</span>
    <div class="mt-pop-a"><button type="button" class="small" data-mt-here="${ll.lat.toFixed(6)},${ll.lng.toFixed(6)}">Dodaj klienta tutaj</button>${act ? `<button type="button" class="small primary" data-mt-here="${ll.lat.toFixed(6)},${ll.lng.toFixed(6)}" data-mt-here-route="${esc(act.id)}">Dodaj jako przystanek do „${esc(act.name)}”</button>` : ''}</div></div>`).openOn(mtMap);
  if (!label) mtReverse(ll.lat, ll.lng).then(a => { const el = document.getElementById('mt-rev'); if (el && a) el.textContent = a; });
}
async function mtReverse(lat, lng){
  try {
    const x = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`, {signal: AbortSignal.timeout(8000)});
    if (!x.ok) return '';
    const f = ((await x.json()).features || [])[0]; if (!f) return '';
    const p = f.properties || {};
    return [p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : p.name, p.postcode, p.city || p.town || p.village, p.country].filter(Boolean).join(', ');
  } catch(_){ return ''; }
}

/* ---------- strona ---------- */
function viewRouteMap(){
  if (!mtOn()) return `<div class="bar"><h2>Planer tras</h2></div><div class="panel empty"><p>${P().manage ? 'Planer tras wymaga jednorazowego uruchomienia migracji <b>059–062</b> w Supabase.' : 'Planer tras widzi kierownik floty.'}</p></div>`;
  if (!mtActive || !mtPlan(mtActive)) mtActive = (mtRoutes()[0] || {}).id || null;
  setTimeout(mtMount, 0);
  const nC = (S.clients || []).length, nR = mtRoutes().length;
  return `<div class="pl">
    <div class="pl-map"><div id="mt-slot"></div></div>
    <div class="pl-top">
      <button type="button" class="pl-back" data-pl-back title="Wróć do aplikacji">${ic('back')}<span>Emage FLEET</span></button>
      <div class="pl-search">${ic('search')}<input id="pl-q" type="search" autocomplete="off" placeholder="Szukaj adresu, miejscowości albo klienta" value="${esc(plQ)}" aria-label="Szukaj na mapie"><div class="pl-res" id="pl-res" data-morph-keep hidden></div></div>
    </div>
    <aside class="pl-panel ${plPanel ? '' : 'shut'} ${plMode!=='mapa' ? 'wide' : ''}" id="mt-panel">
      <button type="button" class="pl-fold" data-pl-fold aria-label="${plPanel ? 'Zwiń panel' : 'Rozwiń panel'}" title="${plPanel ? 'Zwiń panel' : 'Rozwiń panel'}"><span class="pl-handle"></span>${ic('chev')}</button>
      <div class="pl-body">
        <div class="seg pl-modes">${[['mapa', 'Mapa'], ['koszty', 'Koszty'], ['wycena', 'Wycena']].map(([k, l]) => `<button type="button" class="${plMode===k ? 'on' : ''}" data-pl-mode="${k}">${l}</button>`).join('')}</div>
        ${plMode==='koszty' ? plCostsMode() : plMode==='wycena' ? plQuoteMode() : `<div class="seg mt-tabs"><button type="button" class="${mtTab==='routes' ? 'on' : ''}" data-mt-tab="routes">Trasy · ${nR}</button><button type="button" class="${mtTab==='clients' ? 'on' : ''}" data-mt-tab="clients">Klienci · ${nC}</button></div>
        ${mtTab==='routes' ? mtRoutesPanel() : mtClientsPanel()}`}
      </div>
    </aside>
    <div class="pl-tools">
      <button type="button" class="pl-tb" data-pl-base title="${plBase==='sat' ? 'Pokaż mapę' : 'Pokaż zdjęcia satelitarne'}">${plBase==='sat' ? 'Mapa' : 'Satelita'}</button>
      <button type="button" class="pl-tb" data-pl-me title="Moja lokalizacja" aria-label="Moja lokalizacja">${ic('pin')}</button>
      <button type="button" class="pl-tb" data-mt-fit title="Pokaż wszystkie punkty" aria-label="Pokaż wszystkie punkty">${ic('expand')}</button>
    </div>
    <div id="mt-notice" class="mt-notice pl-notice" role="status" data-morph-keep hidden></div>
  </div>`;
}
/* wyszukiwarka na mapie: najpierw klienci z kartoteki (od razu), potem adresy (po chwili albo Enter) */
let plTimer = null, plSeq = 0;
function plShowRes(html){ const box = document.getElementById('pl-res'); if (!box) return; box.innerHTML = html; box.hidden = !html; }
function plLocal(q){
  const t = q.trim().toLocaleLowerCase('pl'); if (t.length < 2) return [];
  return (S.clients || []).filter(c => (c.name + ' ' + (c.address || '')).toLocaleLowerCase('pl').includes(t)).slice(0, 5);
}
function plRender(q, addr, busy){
  const cs = plLocal(q);
  const h = cs.map(c => `<button type="button" class="pl-ri" data-pl-client="${esc(c.id)}">${ic('user')}<span><b>${esc(c.name)}</b><span class="sub">${esc(c.address || 'klient')}${mtHasXY(c) ? '' : ' · bez punktu'}</span></span></button>`).join('')
    + (addr || []).map(r => `<button type="button" class="pl-ri" data-pl-addr="${r.lat},${r.lng}" data-pl-label="${esc(r.label)}">${ic('pin')}<span>${esc(r.label)}</span></button>`).join('')
    + (busy ? '<div class="pl-rm muted small">Szukam adresu…</div>' : (!cs.length && addr && !addr.length ? '<div class="pl-rm muted small">Nie znaleziono. Sprawdź pisownię albo kliknij miejsce na mapie.</div>' : ''));
  plShowRes(h);
}
async function plSearch(q){
  const my = ++plSeq;
  if (q.trim().length < 3){ plRender(q); return; }
  plRender(q, null, true);
  const {res} = await mtGeocode(q.trim());
  if (my===plSeq) plRender(q, res.slice(0, 5));
}
document.addEventListener('input', e => {
  if (e.target.id!=='pl-q') return;
  plQ = e.target.value; clearTimeout(plTimer); plSeq++;
  plRender(plQ);
  if (plQ.trim().length >= 4) plTimer = setTimeout(() => plSearch(plQ), 700);
});
document.addEventListener('keydown', e => {
  if (e.target.id==='pl-q' && e.key==='Enter'){ e.preventDefault(); clearTimeout(plTimer); plSearch(plQ); }
  if (e.target.id==='pl-q' && e.key==='Escape'){ plShowRes(''); e.target.blur(); }
});
document.addEventListener('click', e => {
  if (!e.target.closest('.pl-search')) plShowRes('');
  const t = e.target.closest('[data-pl-client],[data-pl-addr],[data-pl-back],[data-pl-fold],[data-pl-base],[data-pl-me]'); if (!t) return;
  const d = t.dataset;
  if (d.plClient){ const c = mtClient(d.plClient); plShowRes(''); if (!c) return;
    if (mtHasXY(c) && mtMap){ mtMap.setView([Number(c.lat), Number(c.lng)], 16); mtNotice(c.name + (c.address ? ' · ' + c.address : '')); } else mtClientForm(c); return; }
  if (d.plAddr){ const [lat, lng] = d.plAddr.split(',').map(Number); plShowRes(''); if (!mtMap) return;
    mtMap.setView([lat, lng], 17); if (plTmp) plTmp.remove();
    plTmp = L.circleMarker([lat, lng], {radius: 9, color: '#c0263d', weight: 3, fillColor: '#fff', fillOpacity: 1}).addTo(mtMap);
    setTimeout(() => mtMapMenu({lat, lng}, d.plLabel), 50); return; }
  if ('plBack' in d){ location.hash = plPrev && plPrev!=='mapa-tras' ? plPrev : 'pulpit'; return; }
  if ('plFold' in d){ plPanel = !plPanel; render(); setTimeout(() => mtMap && mtMap.invalidateSize(), 260); return; }
  if ('plBase' in d){ if (!mtMap || !mtBases) return; mtMap.removeLayer(mtBases[plBase]); plBase = plBase==='sat' ? 'map' : 'sat'; mtBases[plBase].addTo(mtMap); try { localStorage.setItem('ef-pl-base', plBase); } catch(_){} render(); return; }
  if ('plMe' in d){
    if (!navigator.geolocation){ mtNotice('Ta przeglądarka nie udostępnia lokalizacji.'); return; }
    mtNotice('Sprawdzam lokalizację…');
    navigator.geolocation.getCurrentPosition(pos => { const ll = [pos.coords.latitude, pos.coords.longitude];
      if (plMe) plMe.remove(); plMe = L.circleMarker(ll, {radius: 8, color: '#fff', weight: 3, fillColor: '#2260d5', fillOpacity: 1}).addTo(mtMap);
      mtMap.setView(ll, 14); mtNotice(''); }, () => mtNotice('Brak zgody na lokalizację albo nie udało się jej ustalić.'), {timeout: 10000}); }
});

function mtRoutesPanel(){
  const R = mtRoutes(), sel = mtPlan(mtActive);
  const head = `<div class="mt-row"><h4>Zaplanowane trasy</h4><button type="button" class="small primary" data-mt-new-plan>${ic('plus')}Nowa trasa</button></div>`;
  if (!R.length) return head + `<p class="muted">Nie ma jeszcze zaplanowanych tras. Kliknij „Nowa trasa”, nazwij ją, a potem dodawaj przystanki z listy klientów albo klikając w mapę.</p>`;
  const list = R.map(r => { const rt = mtLinked(r);
    return `<div class="mt-card ${r.id===mtActive ? 'sel' : ''}"><input type="checkbox" data-mt-show="${esc(r.id)}" aria-label="Pokaż ${esc(r.name)} na mapie" ${mtHidden.has(r.id) ? '' : 'checked'}>
      <span class="mt-dot" style="background:${esc(mtColor(r))}"></span><button type="button" class="mt-plain" data-mt-sel="${esc(r.id)}"><b>${esc(r.name)}</b>${rt ? ` <span class="pill info">${esc(rt.code)}</span>` : ' <span class="pill off">szkic</span>'}<span class="sub" data-mt-metric="${esc(r.id)}">${mtMetric(r)}</span></button></div>`; }).join('');
  if (!sel) return head + list;
  const st = mtStops(sel), cs = (S.clients || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'pl')), rt = mtLinked(sel);
  const opt = v => `<option value="">— nie ustawiony —</option>${cs.map(c => `<option value="${esc(c.id)}" ${c.id===v ? 'selected' : ''}>${esc(c.name)}${c.address ? ' · ' + esc(c.address) : ''}</option>`).join('')}`;
  if (mtSub==='koszty') mtSub = 'trasa';
  if (mtSub!=='trasa') return head + list + `<section class="mt-detail"><div class="mt-row"><b>${esc(sel.name)}</b><button type="button" class="small" data-mt-plan-edit="${esc(sel.id)}">Ustawienia</button></div>
    <div class="seg mt-sub">${[['trasa', 'Trasa'], ['czas', 'Czas i godziny']].map(([k, l]) => `<button type="button" class="${mtSub===k ? 'on' : ''}" data-mt-sub="${k}">${l}</button>`).join('')}</div>
    ${mtTimePanel(sel)}</section>`;
  return head + list + `<section class="mt-detail"><div class="mt-row"><b>${esc(sel.name)}</b><span><input type="color" class="mt-color" data-mt-color="${esc(sel.id)}" value="${esc(mtColor(sel))}" aria-label="Kolor trasy na mapie"> <button type="button" class="small" data-mt-plan-edit="${esc(sel.id)}">Ustawienia</button></span></div>
    <div class="seg mt-sub">${[['trasa', 'Trasa'], ['czas', 'Czas i godziny']].map(([k, l]) => `<button type="button" class="${mtSub===k ? 'on' : ''}" data-mt-sub="${k}">${l}</button>`).join('')}</div>
    <div class="mt-assign">${rt ? `Przypisana do trasy <b>${esc(rt.code)} ${esc(rt.name)}</b>. Przystanki z planu widzi kierowca tej trasy.` : 'Szkic – nieprzypisany do trasy. <button type="button" class="link" data-mt-plan-edit="' + esc(sel.id) + '">Przypisz albo utwórz trasę</button>'}</div>
    <label class="mt-lbl">Start<select data-mt-start="${esc(sel.id)}">${opt(sel.startClientId)}</select></label>
    <label class="mt-lbl">Koniec<select data-mt-end="${esc(sel.id)}">${opt(sel.endClientId)}</select></label>
    <div class="mt-row"><h4>Przystanki</h4><span class="muted small">${st.length}</span></div>
    ${st.map((s, i) => { const c = mtClient(s.clientId), ok = mtHasXY(c);
      return `<div class="mt-stop" draggable="true" data-mt-drag="${esc(s.id)}" title="Złap i przeciągnij, żeby zmienić kolejność"><span class="mt-grip" aria-hidden="true">⋮⋮</span><span class="mt-n">${i + 1}</span><span class="mt-lab"><b>${esc(c ? c.name : '?')}</b>${!ok ? `<span class="sub warn-t">bez punktu na mapie – <button type="button" class="link" data-mt-edit-client="${esc(s.clientId)}">ustaw</button></span>` : ''}</span>
        <button type="button" class="small ghost icon" data-mt-up="${esc(s.id)}" aria-label="W górę" ${i ? '' : 'disabled'}>↑</button><button type="button" class="small ghost icon" data-mt-down="${esc(s.id)}" aria-label="W dół" ${i < st.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="small ghost icon" data-mt-del="${esc(s.id)}" aria-label="Usuń przystanek">✕</button></div>`; }).join('') || '<p class="muted small">Dodaj przystanek z listy, kliknij klienta na mapie albo kliknij w puste miejsce mapy.</p>'}
    <div class="mt-add"><select id="mt-add-sel" aria-label="Klient do dodania"><option value="">Dodaj przystanek…</option>${cs.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select><button type="button" class="small" data-mt-add>${ic('plus')}Dodaj</button></div>
    <p class="muted small">Kliknij w mapę, żeby dodać klienta albo przystanek w tym miejscu. Pinezkę klienta złap i przeciągnij, żeby poprawić miejsce. Złap linię wybranej trasy i przeciągnij, żeby poprowadzić ją inną drogą${mtVia(sel).length ? ` (punkty przejazdowe: ${mtVia(sel).length} – <button type="button" class="link" data-mt-via-clear="${esc(sel.id)}">usuń wszystkie</button>)` : ''}.${rt ? ' Godzinę, telefon i uwagi przystanku zmienisz w Trasy → Przystanki.' : ''}</p>
    <div class="mt-row"><button type="button" class="small" data-mt-retry="${esc(sel.id)}">Przelicz przejazd</button><button type="button" class="small ghost" data-mt-plan-copy="${esc(sel.id)}">Kopiuj</button>${rt ? `<button type="button" class="small ghost" data-stops="${esc(rt.id)}">Przystanki – szczegóły</button>` : ''}</div></section>`;
}
/* ustawienia planu: nazwa, kolor, przypisanie do trasy (istniejąca / nowa / szkic), usuń */
function mtPlanForm(r = {}){
  const free = S.routes.filter(x => x.active!==false && !(S.routePlans || []).some(p => p.routeId===x.id && p.id!==r.id)).sort((a, b) => String(a.code).localeCompare(String(b.code), 'pl'));
  const mode = r.routeId ? 'route' : 'none';
  editing = {col: 'mt-plan', id: r.id || null, base: {}, special: () => mtSavePlanForm(r), mtPlanR: r};
  $('#dlg-title').textContent = r.id ? 'Ustawienia trasy' : 'Nowa trasa na mapie';
  $('#dlg-body').innerHTML = `<div class="field full"><label for="mt-p-name">Nazwa *</label><input id="mt-p-name" maxlength="80" value="${esc(r.name || '')}" placeholder="np. Czechy – poniedziałek"></div>
    <div class="field"><label for="mt-p-color">Kolor na mapie</label><input id="mt-p-color" type="color" value="${esc(r.color || MT_COLORS[(S.routePlans || []).length % MT_COLORS.length])}"></div>
    <div class="field full"><span class="label">Przypisanie</span>
      <div class="seg mt-mode">${[['none', 'Szkic (bez trasy)'], ['route', 'Istniejąca trasa'], ['new', 'Nowa trasa']].map(([k, l]) => `<button type="button" class="${mode===k ? 'on' : ''}" data-mt-mode="${k}">${l}</button>`).join('')}</div>
      <input type="hidden" id="mt-p-mode" value="${mode}"></div>
    <div class="field full mt-m mt-m-route" ${mode==='route' ? '' : 'hidden'}><label for="mt-p-route">Trasa z zakładki Trasy</label><select id="mt-p-route"><option value="">— wybierz —</option>${free.map(x => `<option value="${esc(x.id)}" ${x.id===r.routeId ? 'selected' : ''}>${esc(x.code)} ${esc(x.name)}${mtRStops(x.id).length ? ` (ma ${mtRStops(x.id).length} przyst.)` : ''}</option>`).join('')}</select></div>
    <div class="field mt-m mt-m-new" hidden><label for="mt-p-code">Kod nowej trasy *</label><input id="mt-p-code" maxlength="20" placeholder="np. 260K"></div>
    <div class="field mt-m mt-m-new" hidden><label for="mt-p-km">Km do faktury</label><input id="mt-p-km" type="number" min="0" step="1" inputmode="numeric"></div>
    <div class="field full"><span class="muted small">Po przypisaniu przystanki z mapy stają się przystankami tej trasy – kierowca z tą trasą w grafiku zobaczy je w telefonie z nawigacją. Nowa trasa pojawi się też w zakładce Trasy i w grafiku. Usunięcie planu nie usuwa trasy ani grafiku.</span></div>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = r.id ? 'Zapisz' : 'Utwórz';
  $('#dlg-del').hidden = !r.id;
  $('#scrim').hidden = false;
  setTimeout(() => $('#mt-p-name')?.focus(), 30);
}
async function mtSavePlanForm(r){
  const w = $('#dlg-warn'), warn = t => { w.textContent = t; w.hidden = false; };
  const name = $('#mt-p-name').value.trim(), color = $('#mt-p-color').value, mode = $('#mt-p-mode').value;
  if (!name){ $('#mt-p-name').focus(); return warn('Wpisz nazwę trasy.'); }
  let routeId = null;
  if (mode==='route'){ routeId = $('#mt-p-route').value || null; if (!routeId) return warn('Wybierz trasę z listy albo zmień na „Szkic”.'); }
  if (mode==='new'){
    const code = $('#mt-p-code').value.trim(); if (!code){ $('#mt-p-code').focus(); return warn('Wpisz kod nowej trasy, np. 260K.'); }
    if (S.routes.some(x => String(x.code).trim().toUpperCase()===code.toUpperCase())) return warn(`Trasa o kodzie ${code} już jest – wybierz „Istniejąca trasa”.`);
  }
  // przypięcie do trasy, która ma już przystanki spoza planu – potwierdź zastąpienie
  if (routeId && routeId!==r.routeId){
    const ex = mtRStops(routeId), mine = new Set(mtStops(r).map(s => s.clientId));
    const other = ex.filter(x => !x.clientId || !mine.has(x.clientId));
    if (other.length && editing.mtConfirm!==routeId){ editing.mtConfirm = routeId; return warn(`Trasa ${byId('routes', routeId).code} ma już ${ex.length} ${isPlural(ex.length, 'przystanek', 'przystanki', 'przystanków')} (np. ${other.slice(0, 3).map(x => x.client).join(', ')}). Zostaną zastąpione przystankami z tego planu. Kliknij „Zapisz” jeszcze raz, żeby potwierdzić.`); }
  }
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    if (mode==='new'){
      const ref = db.collection('routes').doc(), km = $('#mt-p-km').value;
      await ref.set({code: $('#mt-p-code').value.trim(), name, km: km==='' ? null : Number(km), active: true, loading: false, tacho: false});
      routeId = ref.id;
    }
    const patch = {name, color, routeId};
    if (r.id) await mtSavePlan(r, patch);
    else { const ref = db.collection('routePlans').doc(); await ref.set({...patch, stops: [], via: []}); mtActive = ref.id; mtTab = 'routes'; }
    closeForm(); toast(r.id ? 'Zapisano trasę' : 'Utworzono trasę – dodaj przystanki');
    render();
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}
async function mtDelPlan(r){
  if (editing.mtDelArmed!==r.id){ editing.mtDelArmed = r.id; const w = $('#dlg-warn'); w.textContent = `Usunąć plan „${r.name}” z mapy?${mtLinked(r) ? ` Trasa ${mtLinked(r).code}, jej przystanki i grafik zostaną bez zmian.` : ''} Kliknij „Usuń” jeszcze raz.`; w.hidden = false; return; }
  try { await db.collection('routePlans').doc(r.id).delete(); mtCalc.delete(r.id); if (mtActive===r.id) mtActive = null; closeForm(); toast('Usunięto plan trasy'); render(); } catch(err){ handleWriteErr(err); }
}
document.addEventListener('click', e => {
  if (!editing || editing.col!=='mt-plan') return;
  if (e.target.closest('#dlg-del') && editing.mtPlanR && editing.mtPlanR.id){ e.preventDefault(); e.stopImmediatePropagation(); mtDelPlan(editing.mtPlanR); return; }
  const m = e.target.closest('[data-mt-mode]'); if (!m) return;
  $('#mt-p-mode').value = m.dataset.mtMode;
  document.querySelectorAll('[data-mt-mode]').forEach(b => b.classList.toggle('on', b===m));
  document.querySelectorAll('.mt-m').forEach(x => { x.hidden = !x.classList.contains('mt-m-' + m.dataset.mtMode); });
  $('#dlg-warn').hidden = true; editing.mtConfirm = null;
}, true);
function mtClientsPanel(){
  const q = mtFilter.trim().toLocaleLowerCase('pl');
  const xs = (S.clients || []).filter(c => (c.name + ' ' + (c.address || '')).toLocaleLowerCase('pl').includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return `<div class="mt-row"><input type="search" id="mt-filter" placeholder="Szukaj nazwy lub adresu" value="${esc(mtFilter)}" aria-label="Szukaj klientów"><button type="button" class="small primary" data-mt-new-client>${ic('plus')}Klient</button></div>
    ${xs.map(c => `<div class="mt-card"><button type="button" class="mt-plain" data-mt-locate="${esc(c.id)}"><b>${esc(c.name)}</b><span class="sub">${esc(c.address || '')}${mtHasXY(c) ? '' : ' · <span class="warn-t">bez punktu na mapie</span>'}</span></button><button type="button" class="small ghost" data-mt-edit-client="${esc(c.id)}">Edytuj</button></div>`).join('')
      || `<p class="muted">${(S.clients || []).length ? 'Brak pasujących klientów.' : 'Dodaj pierwszego klienta albo magazyn – potem ustawisz go jako start, koniec albo przystanek trasy.'}</p>`}`;
}

/* ---------- klient: formularz (okno aplikacji) ---------- */
function mtClientForm(c = {}, linkStop, addTo){
  editing = {col: 'mt-client', id: c.id || null, base: {}, special: () => mtSaveClient(c, linkStop, addTo)};
  $('#dlg-title').textContent = c.id ? 'Edytuj klienta' : 'Dodaj klienta';
  $('#dlg-body').innerHTML = `<div class="field full"><label for="mt-c-name">Nazwa *</label><input id="mt-c-name" maxlength="100" value="${esc(c.name || '')}" required></div>
    <div class="field full"><label for="mt-c-addr">Adres</label><input id="mt-c-addr" maxlength="200" value="${esc(c.address || '')}" placeholder="ulica, numer, miasto"></div>
    <div class="field full mt-row"><button type="button" class="small" data-mt-lookup>Szukaj adresu</button><button type="button" class="small" data-mt-pick>Wskaż na mapie</button></div>
    <div class="field full mt-results" id="mt-results" aria-live="polite"></div>
    <div class="field"><label for="mt-c-lat">Szerokość</label><input id="mt-c-lat" type="number" step="any" min="-90" max="90" value="${esc(c.lat ?? '')}"></div>
    <div class="field"><label for="mt-c-lng">Długość</label><input id="mt-c-lng" type="number" step="any" min="-180" max="180" value="${esc(c.lng ?? '')}"></div>
    <div class="field"><label for="mt-c-phone">Telefon</label><input id="mt-c-phone" type="tel" value="${esc(c.phone || '')}"></div>
    <div class="field"><label for="mt-c-note">Uwagi</label><input id="mt-c-note" value="${esc(c.note || '')}" placeholder="np. rampa od tyłu"></div>
    <div class="field full"><span class="muted small">Adres szuka wyszukiwarka Photon (OpenStreetMap). Wybranie wyniku albo kliknięcie na mapie ustawia współrzędne.</span></div>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zapisz klienta';
  $('#dlg-del').hidden = !c.id;
  $('#scrim').hidden = false;
  editing.mtDel = c.id ? () => mtDelClient(c) : null;
  editing.mtDraft = c; editing.mtLink = linkStop; editing.mtAddTo = addTo;
  if (addTo && mtPlan(addTo)) $('#dlg-title').textContent = `Nowy przystanek · ${mtPlan(addTo).name}`;
  setTimeout(() => $('#mt-c-name')?.focus(), 30);
}
const mtFormData = () => ({name: $('#mt-c-name').value.trim(), address: $('#mt-c-addr').value.trim(), lat: $('#mt-c-lat').value, lng: $('#mt-c-lng').value, phone: $('#mt-c-phone').value.trim(), note: $('#mt-c-note').value.trim()});
async function mtSaveClient(c, linkStop, addTo){
  const d = mtFormData(), w = $('#dlg-warn'), warn = t => { w.textContent = t; w.hidden = false; };
  if (!d.name){ $('#mt-c-name').focus(); return warn('Wpisz nazwę klienta.'); }
  const lat = d.lat==='' ? null : Number(d.lat), lng = d.lng==='' ? null : Number(d.lng);
  if ((lat==null) !== (lng==null) || (lat!=null && (!(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)))) return warn('Uzupełnij obie współrzędne albo wybierz adres z wyszukiwarki.');
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    const ref = c.id ? db.collection('clients').doc(c.id) : db.collection('clients').doc();
    await ref.set({name: d.name, address: d.address || null, lat, lng, phone: d.phone || null, note: d.note || null});
    if (addTo && mtPlan(addTo)){ const r = mtPlan(addTo); await mtSavePlan(r, {stops: [...mtStops(r), {id: newId(), clientId: ref.id}]}); }
    else if (c.id) for (const r of mtRoutes().filter(r => r.routeId && mtStops(r).some(s => s.clientId===c.id))) await mtSyncRoute(mtPlan(r.id));   // nowa nazwa/adres → przystanki trasy
    closeForm(); toast(c.id ? 'Zapisano klienta' : 'Dodano klienta');
    if (mtMap && lat!=null) mtMap.setView([lat, lng], Math.max(mtMap.getZoom(), 13));
    render();
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}
async function mtDelClient(c){
  const used = mtRoutes().filter(r => r.startClientId===c.id || r.endClientId===c.id || mtStops(r).some(s => s.clientId===c.id));
  if (!mtDelClient.armed || mtDelClient.armed!==c.id){ mtDelClient.armed = c.id; const w = $('#dlg-warn'); w.textContent = used.length ? `Klient jest na trasach: ${used.map(r => r.name).join(', ')} – zniknie z nich. Kliknij „Usuń” jeszcze raz.` : 'Kliknij „Usuń” jeszcze raz, żeby usunąć klienta.'; w.hidden = false; return; }
  mtDelClient.armed = null;
  try {
    for (const r of used){ const patch = {stops: mtStops(r).filter(s => s.clientId!==c.id)}; patch.via = mtVia(r).filter(v => v.after==='start' || patch.stops.some(s => s.id===v.after)); await mtSavePlan(r, patch); }
    await db.collection('clients').doc(c.id).delete(); closeForm(); toast('Usunięto klienta'); render(); } catch(err){ handleWriteErr(err); }
}
document.addEventListener('click', e => {
  if (!editing || editing.col!=='mt-client') return;
  if (e.target.closest('#dlg-del') && editing.mtDel){ e.preventDefault(); e.stopImmediatePropagation(); editing.mtDel(); return; }
  if (e.target.closest('[data-mt-pick]')){
    if (!mtMap){ toast('Mapa jeszcze się wczytuje'); return; }
    const fd = mtFormData();
    mtPicking = {...editing.mtDraft, ...fd, id: editing.mtDraft.id, _link: editing.mtLink, _addTo: editing.mtAddTo}; closeForm();
    mtNotice('Kliknij na mapie miejsce wjazdu lub rozładunku. Esc – anuluj.');
    // pokaż od razu okolicę: wpisane współrzędne albo znaleziony adres
    if (fd.lat!=='' && fd.lng!==''){ mtMap.setView([Number(fd.lat), Number(fd.lng)], 17); return; }
    if (fd.address.length >= 3){ mtNotice('Szukam adresu na mapie…');
      mtGeocode(fd.address).then(({res, approx}) => { if (!mtPicking) return;
        if (res.length){ mtMap.setView([res[0].lat, res[0].lng], approx ? 15 : 17); mtNotice(`${approx ? 'Okolica adresu' : 'Adres'}: ${res[0].label}. Kliknij dokładne miejsce wjazdu lub rozładunku. Esc – anuluj.`); }
        else mtNotice('Nie znalazłem adresu – przybliż mapę i kliknij miejsce ręcznie. Esc – anuluj.'); }); }
    return;
  }
  if (e.target.closest('[data-mt-lookup]')) mtLookup();
  const ch = e.target.closest('[data-mt-res]');
  if (ch){ const [lng, lat] = ch.dataset.mtRes.split(','); $('#mt-c-addr').value = ch.textContent; $('#mt-c-lat').value = lat; $('#mt-c-lng').value = lng; $('#mt-results').textContent = 'Adres wybrany.'; }
}, true);
/* Wyszukiwanie adresu: Photon, a gdy nic nie znajdzie albo nie odpowiada – Nominatim (OpenStreetMap).
   Najpierw pełny adres, potem bez „ul./al.” i kodu pocztowego, potem sama ulica z miejscowością – wynik przybliżony. */
const mtClean = q => q.replace(/\b(ul|al|os|pl|aleja|ulica|osiedle)\.?\s+/gi, '').replace(/\b\d{2}-\d{3}\b/g, '').replace(/\s*,\s*,/g, ',').replace(/\s{2,}/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '');
const mtNoNum = q => q.replace(/\s\d+[a-zA-Z]?(\/\d+)?(?=\s*,|\s*$)/g, '').replace(/\s{2,}/g, ' ').trim();
async function mtPhoton(q){
  const x = await fetch('https://photon.komoot.io/api/?limit=5&q=' + encodeURIComponent(q), {signal: AbortSignal.timeout(8000)});
  if (!x.ok) throw Error('photon');
  return ((await x.json()).features || []).filter(f => f.geometry && f.geometry.type==='Point').map(({properties: p, geometry: g}) => ({
    lat: g.coordinates[1], lng: g.coordinates[0],
    label: [p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : p.name, p.postcode, p.city || p.town || p.village, p.country].filter(Boolean).join(', ')})).filter(r => r.label);
}
async function mtNominatim(q){
  const x = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&accept-language=pl&q=' + encodeURIComponent(q), {signal: AbortSignal.timeout(8000)});
  if (!x.ok) throw Error('nominatim');
  return (await x.json()).map(f => { const a = f.address || {};
    return {lat: Number(f.lat), lng: Number(f.lon), label: [a.road ? [a.road, a.house_number].filter(Boolean).join(' ') : f.name, a.postcode, a.city || a.town || a.village || a.municipality, a.country].filter(Boolean).join(', ') || f.display_name}; });
}
async function mtGeocode(q){
  const vs = [...new Set([q, mtClean(q), mtNoNum(mtClean(q))])].filter(v => v.length >= 3);
  for (let i = 0; i < vs.length; i++){
    let res = [];
    try { res = await mtPhoton(vs[i]); } catch(_){}
    if (!res.length) try { res = await mtNominatim(vs[i]); } catch(_){}
    if (res.length) return {res, approx: i===vs.length - 1 && i > 0 && vs[i]!==mtClean(q)};
  }
  return {res: [], approx: false};
}
async function mtLookup(){
  const q = $('#mt-c-addr').value.trim(), out = $('#mt-results');
  if (q.length < 3){ out.textContent = 'Wpisz ulicę z numerem i miejscowość, np. Żmigrodzka 251, Wrocław.'; return; }
  out.textContent = 'Wyszukiwanie…';
  const {res, approx} = await mtGeocode(q);
  if (!res.length){ out.innerHTML = 'Nie znaleziono tego adresu. Sprawdź pisownię albo kliknij „Wskaż na mapie” i zaznacz miejsce ręcznie.'; return; }
  out.innerHTML = (approx ? '<span class="muted small">Nie ma dokładnie tego numeru – to najbliższe wyniki. Po zapisie złap pinezkę na mapie i przeciągnij ją w dokładne miejsce.</span>' : '')
    + res.map(r => `<button type="button" class="small mt-res" data-mt-res="${r.lng},${r.lat}">${esc(r.label)}</button>`).join('');
  if (res.length===1 && !approx) out.querySelector('[data-mt-res]').click();   // jeden pewny wynik – od razu ustaw współrzędne
}
document.addEventListener('keydown', e => { if (e.key==='Enter' && e.target.id==='mt-c-addr'){ e.preventDefault(); mtLookup(); } });

/* ---------- akcje na stronie ---------- */
async function mtWrite(fn){ try { await fn(); render(); } catch(err){ handleWriteErr(err); } }
async function mtAddStop(cid){
  const r = mtPlan(mtActive), c = mtClient(cid); if (!r || !c) return;
  await mtWrite(() => mtSavePlan(r, {stops: [...mtStops(r), {id: newId(), clientId: c.id}]}));
  mtHidden.delete(r.id); mtSaveHidden(); mtTab = 'routes';
  if (mtMap) mtMap.closePopup();
  toast(`Dodano przystanek do „${r.name}”`);
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-mt-sub],[data-mt-new-plan],[data-mt-plan-edit],[data-mt-plan-copy],[data-mt-via-clear],[data-mt-here],[data-mt-move-pin],[data-mt-via-del],[data-mt-tab],[data-mt-sel],[data-mt-fit],[data-mt-new-client],[data-mt-edit-client],[data-mt-locate],[data-mt-add],[data-mt-add-stop],[data-mt-up],[data-mt-down],[data-mt-del],[data-mt-retry],[data-mt-fix]');
  if (!t || t.closest('#dialog')) return;
  const d = t.dataset;
  if (d.mtSub){ mtSub = d.mtSub; render(); return; }
  if ('mtNewPlan' in d){ mtPlanForm(); return; }
  if (d.mtPlanEdit){ const r = mtPlan(d.mtPlanEdit); if (r) mtPlanForm(r); return; }
  if (d.mtPlanCopy){ const r = mtPlan(d.mtPlanCopy); if (!r) return; const ref = db.collection('routePlans').doc();
    mtWrite(() => ref.set({name: r.name + ' – kopia', color: r.color || null, startClientId: r.startClientId || null, endClientId: r.endClientId || null, stops: mtStops(r), via: mtVia(r), routeId: null})).then(() => { mtActive = ref.id; render(); toast('Skopiowano – kopia jest szkicem bez przypisania'); }); return; }
  if (d.mtHere){ const [lat, lng] = d.mtHere.split(','); if (mtMap) mtMap.closePopup();
    mtClientForm({lat, lng}, null, d.mtHereRoute || null);
    mtReverse(lat, lng).then(a => { const el = $('#mt-c-addr'); if (el && !el.value && a) el.value = a; }); return; }
  if (d.mtMovePin){ mtMovePin = d.mtMovePin; if (mtMap) mtMap.closePopup(); mtDraw(); mtNotice('Przeciągnij pinezkę w dokładne miejsce. Esc – anuluj.'); return; }
  if (d.mtViaDel){ const [rid, vi] = d.mtViaDel.split('|'), r = mtPlan(rid); if (!r) return; if (mtMap) mtMap.closePopup(); mtSaveVia(r, mtVia(r).filter((_, i) => i!==Number(vi))); return; }
  if (d.mtTab){ mtTab = d.mtTab; render(); return; }
  if (d.mtSel){ mtActive = d.mtSel; render(); const pts = mtPoints(mtPlan(mtActive) || {}); if (mtMap && pts.length) mtMap.fitBounds(pts.map(p => [p.lat, p.lng]), {padding: [40, 40], maxZoom: 14}); return; }
  if ('mtFit' in d){ mtFit(); return; }
  if ('mtNewClient' in d){ mtClientForm(); return; }
  if (d.mtEditClient){ const c = mtClient(d.mtEditClient); if (c){ if (mtMap) mtMap.closePopup(); mtClientForm(c); } return; }
  if (d.mtLocate){ const c = mtClient(d.mtLocate); if (!c) return; if (mtHasXY(c) && mtMap){ mtMap.setView([Number(c.lat), Number(c.lng)], 15); mtNotice(c.name + (c.address ? ' · ' + c.address : '')); } else mtClientForm(c); return; }
  if ('mtAdd' in d){ const v = $('#mt-add-sel') && $('#mt-add-sel').value; if (!v){ $('#mt-add-sel').focus(); return; } mtAddStop(v); return; }
  if (d.mtAddStop){ mtAddStop(d.mtAddStop); return; }
  if (d.mtViaClear){ const r = mtPlan(d.mtViaClear); if (r) mtSaveVia(r, []); return; }
  if (d.mtRetry){ mtCalc.delete(d.mtRetry); render(); return; }
  const id = d.mtUp || d.mtDown || d.mtDel; if (!id) return;
  const r = mtPlan(mtActive); if (!r) return;
  const list = mtStops(r).slice(), i = list.findIndex(x => x.id===id); if (i < 0) return;
  if (d.mtDel) return mtWrite(() => mtSavePlan(r, {stops: list.filter(x => x.id!==id), via: mtVia(r).filter(v => v.after!==id)}));
  const j = d.mtUp ? i - 1 : i + 1; if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  mtWrite(() => mtSavePlan(r, {stops: list}));
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.mtCalc){ const r = mtPlan(mtActive); if (!r) return; const calc = {...(r.calc || {})}, k = t.dataset.mtCalc;
    const v = t.type==='number' || t.inputMode==='decimal' ? rtNum(t.value) : t.value;
    if (v==null || v==='') delete calc[k]; else calc[k] = v;
    return mtWrite(() => mtSavePlan(r, {calc})); }
  if (t.dataset.mtShow){ if (t.checked) mtHidden.delete(t.dataset.mtShow); else mtHidden.add(t.dataset.mtShow); mtSaveHidden(); mtDraw(); return; }
  const r = mtPlan(t.dataset.mtStart || t.dataset.mtEnd || t.dataset.mtColor); if (!r) return;
  if (t.dataset.mtStart) return mtWrite(() => mtSavePlan(r, {startClientId: t.value || null}));
  if (t.dataset.mtEnd) return mtWrite(() => mtSavePlan(r, {endClientId: t.value || null}));
  if (t.dataset.mtColor) return mtWrite(() => mtSavePlan(r, {color: t.value}));
});
document.addEventListener('input', e => {
  if (e.target.id!=='mt-filter') return;
  mtFilter = e.target.value;
  const pos = e.target.selectionStart; render();
  const f = $('#mt-filter'); if (f){ f.focus(); try { f.setSelectionRange(pos, pos); } catch(_){} }
});
document.addEventListener('keydown', e => {
  if (e.key==='Escape' && mtPicking){ const d = mtPicking; mtPicking = null; mtNotice(''); mtDraw(); mtClientForm(d, d._link, d._addTo); }
  if (e.key==='Escape' && mtMovePin){ mtMovePin = null; mtNotice(''); mtDraw(); }
});

/* ---------- koszty i zysk kursu ---------- */
/* domyślne wartości z danych systemu – każde pole można nadpisać (zapis w planie: calc) */
function mtCalcData(r){
  const c = r.calc || {}, rt = mtLinked(r), rc = rt ? (rtCfg().routes[rt.id] || {}) : {};
  const road = mtRoad(r), kmMap = road.status==='ready' ? road.data.distance / 1000 : null, hDrive = road.status==='ready' ? road.data.duration / 3600 : null;
  const mk = today() + '|' + S.costs.length + '|' + (S.fuelCardRows || []).length + '|' + (S.gpsOdometer || []).length;
  if (mtCalcData.kk!==mk){ mtCalcData.kk = mk; try { mtCalcData.kc = rtKmCost(today().slice(0, 7)); } catch(_){ mtCalcData.kc = null; } }
  const kc = mtCalcData.kc;
  let clsRate = {}; try { if (mtCalcData.k!==S.costs.length + '|' + S.bookings.length){ mtCalcData.k = S.costs.length + '|' + S.bookings.length; mtCalcData.cr = rkData().clsRate; } clsRate = mtCalcData.cr || {}; } catch(_){}
  const cls = c.cls || 'pow25';
  const def = {
    lp100: clsRate[cls] ?? (kc ? kc.lp100 : 11), price: kc ? kc.price : 5.3, otherKm: kc ? kc.otherKm : 0,
    km: kmMap, invKm: rt && Number(rt.km) > 0 ? Number(rt.km) : kmMap, revMode: rc.mode==='km' ? 'km' : 'kurs', revRate: Number(rc.rate) || null,
    drvMode: 'kurs', drvRate: Number(rc.driver) ? Math.round(Number(rc.driver) / plCfg().drvMult) : null, drivers: 1, tolls: Number(rc.cost) || null, extraKm: Number(rc.extraKm) || 0,
    trips: rt ? rtGrafikTrips(rt.id, prevMonth(today().slice(0, 7))) : null, stopMin: 30, dep: '06:00'
  };
  const v = k => c[k]!=null && c[k]!=='' ? c[k] : def[k];
  const km = Number(v('km')) || 0, extraKm = Number(v('extraKm')) || 0, kmAll = km + extraKm;
  const t = mtTimes(r, v('dep'), Number(v('stopMin')) || 0);
  const hours = t ? t.total / 60 : hDrive;
  const fuel = kmAll * (Number(v('lp100')) || 0) / 100 * (Number(v('price')) || 0);
  const car = kmAll * (Number(v('otherKm')) || 0);
  const drvRate = Number(v('drvRate')) || 0, drivers = Number(v('drivers')) || 1, mode = v('drvMode');
  const days = hours ? Math.max(1, Math.ceil((hours - 2) / 24)) : 1;
  const mult = plCfg().drvMult, drvNet = drivers * (mode==='godz' ? drvRate * (hours || 0) : mode==='dzien' ? drvRate * days : drvRate), drv = drvNet * mult;
  const tolls = Number(v('tolls')) || 0, other = Number(v('other')) || 0;
  const cost = fuel + car + drv + tolls + other;
  const rev = v('revRate') ? (v('revMode')==='km' ? (Number(v('invKm')) || 0) * Number(v('revRate')) : Number(v('revRate'))) : null;
  const profit = rev!=null ? rev - cost : null, trips = Number(v('trips')) || 0;
  // wycena: cena z marży (od ceny) albo z zysku na kurs
  const qMargin = c.qProfit!=null && c.qProfit!=='' ? null : (c.margin!=null && c.margin!=='' ? Number(c.margin) : plCfg().margin);
  const qPrice = cost > 0 ? (qMargin==null ? cost + Number(c.qProfit) : (qMargin < 100 ? cost / (1 - qMargin / 100) : null)) : null;
  const invKm = Number(v('invKm')) || km || 0;
  return {c, def, v, rt, kc, km, kmAll, hours, fuel, car, drv, drvNet, mult, tolls, other, cost, rev, profit, trips, invKm, qMargin, qPrice,
    qPerKm: qPrice!=null && invKm ? qPrice / invKm : null, perKm: kmAll ? cost / kmAll : null, margin: rev ? profit / rev : null};
}
function mtCostPanel(r){
  const x = mtCalcData(r), nf = n => n==null ? '—' : new Intl.NumberFormat('pl-PL', {maximumFractionDigits: 2}).format(n);
  const inp = (k, label, unit, ph, step = 'any') => { const own = x.c[k]!=null && x.c[k]!==''; const d = x.def[k];
    return `<label class="mt-f"><span>${label}${own ? ' <button type="button" class="link" data-mt-calc-reset="' + k + '">domyślne</button>' : ''}</span><span class="mt-fi"><input type="text" inputmode="decimal" data-mt-calc="${k}" value="${own ? esc(rtShow(x.c[k])) : ''}" placeholder="${d==null || d==='' ? ph || '' : esc(nf(d))}"><em>${unit}</em></span></label>`; };
  const sel = (k, label, opts) => `<label class="mt-f"><span>${label}</span><select data-mt-calc="${k}">${opts.map(([val, l]) => `<option value="${val}" ${String(x.v(k))===val ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  const row = (l, n, cls = '') => `<div class="mt-cr ${cls}"><span>${l}</span><b>${n==null ? '—' : zl(Math.round(n))}</b></div>`;
  return `<p class="muted small">Szare liczby w polach to wartości z danych systemu (spalanie klasy z rankingu, cena litra z kart paliwowych netto, koszty aut na km z 3 ostatnich miesięcy${x.rt ? ', stawki z Koszty → Rentowność tras' : ''}). Wpisz własne, żeby je zastąpić – puste pole wraca do domyślnych.</p>
    <h5 class="mt-h">Auto i paliwo</h5>
    ${sel('cls', 'Klasa auta', WCLS.map(([k, l]) => [k, l]))}
    ${inp('km', 'Km kursu', 'km', 'wpisz')}${inp('extraKm', 'Dodatkowe km (np. dojazd do domu)', 'km', '0')}
    ${inp('lp100', 'Spalanie', 'l/100', '')}${inp('price', 'Cena paliwa netto', 'zł/l', '')}${inp('otherKm', 'Pozostałe koszty auta (leasing, OC, serwis)', 'zł/km', '')}
    <h5 class="mt-h">Kierowca i opłaty</h5>
    ${sel('drvMode', 'Kierowcy płacę', [['kurs', 'za kurs'], ['dzien', 'za dzień'], ['godz', 'za godzinę']])}
    ${inp('drvRate', 'Kierowca dostaje na rękę', x.v('drvMode')==='godz' ? 'zł/h' : x.v('drvMode')==='dzien' ? 'zł/dzień' : 'zł/kurs', 'wpisz')}
    <label class="mt-f"><span>Przelicznik kosztów pracodawcy <span class="muted small">(dla wszystkich tras)</span></span><span class="mt-fi"><input type="text" inputmode="decimal" data-pl-cfg="drvMult" value="${esc(rtShow(plCfg().drvMult))}"><em>×</em></span></label>${sel('drivers', 'Obsada', [['1', '1 kierowca'], ['2', '2 kierowców']])}
    ${inp('tolls', 'Opłaty drogowe, winiety, parkingi', 'zł/kurs', '0')}${inp('other', 'Inne koszty kursu', 'zł/kurs', '0')}
    <h5 class="mt-h">Przychód</h5>
    ${sel('revMode', 'Fakturuję', [['km', 'za km'], ['kurs', 'za kurs']])}
    ${x.v('revMode')==='km' ? inp('invKm', 'Km do faktury', 'km', '') : ''}${inp('revRate', 'Stawka', x.v('revMode')==='km' ? 'zł/km' : 'zł/kurs', 'wpisz')}
    ${inp('trips', 'Kursów w miesiącu', 'kursów', x.rt ? 'z grafiku' : 'wpisz')}
    <div class="mt-calc" id="mt-calc-res">${mtCostResults(x)}</div>`;
}
function mtCostResults(x){
  const nf = n => n==null ? '—' : new Intl.NumberFormat('pl-PL', {maximumFractionDigits: 2}).format(n);
  const row = (l, n, cls = '') => `<div class="mt-cr ${cls}"><span>${l}</span><b>${n==null ? '—' : zl(Math.round(n))}</b></div>`;
  return `
      ${row(`Paliwo (${nf(x.kmAll)} km)`, x.fuel)}${row('Auto – pozostałe koszty', x.car)}${row(`Kierowca – na rękę${x.hours ? ` (${nf(Math.round(x.hours * 10) / 10)} h)` : ''}`, x.drvNet, 'sub')}${row(`Kierowca – koszt łączny (× ${nf(x.mult)})`, x.drv)}${row('Opłaty i inne', x.tolls + x.other)}
      ${row('Koszt kursu', x.cost, 'sum')}<div class="mt-cr"><span>Koszt na km</span><b>${x.perKm!=null ? nf(Math.round(x.perKm * 100) / 100) + ' zł' : '—'}</b></div>
      ${row('Przychód z kursu', x.rev)}
      ${x.profit!=null ? `${row('Zysk z kursu', x.profit, x.profit >= 0 ? 'ok' : 'bad')}<div class="mt-cr"><span>Marża</span><b>${Math.round(x.margin * 100)}%</b></div>` : '<p class="muted small">Wpisz stawkę w „Przychód”, żeby zobaczyć zysk.</p>'}
      ${x.trips && x.profit!=null ? row(`Zysk w miesiącu (${x.trips} ${isPlural(x.trips, 'kurs', 'kursy', 'kursów')})`, x.profit * x.trips, x.profit >= 0 ? 'ok sum' : 'bad sum') : ''}`;
}

/* ---------- czas kursu i godziny przyjazdu ---------- */
/* odcinki z OSRM (między kolejnymi punktami), postój na przystanku, przerwa 45 min po 4,5 h jazdy */
function mtTimes(r, dep, stopMin){
  const road = mtRoad(r); if (road.status!=='ready' || !road.data.legs) return null;
  const pts = mtPoints(r), legs = road.data.legs;
  const [hh, mm] = String(dep || '06:00').split(':').map(Number);
  let t = (hh || 0) * 60 + (mm || 0), drive = 0, sinceBreak = 0, breaks = 0;
  const out = [{p: pts[0], at: t, km: 0}];
  let km = 0;
  legs.forEach((lg, i) => {
    let d = lg.duration / 60;
    while (sinceBreak + d > 270){ const part = 270 - sinceBreak; t += part; d -= part; drive += part; t += 45; breaks++; sinceBreak = 0; }
    t += d; drive += d; sinceBreak += d; km += lg.distance / 1000;
    const p = pts[i + 1]; if (!p) return;
    if (!p.via){ out.push({p, at: t, km}); if (p.lab!=='K') t += stopMin; }
  });
  return {rows: out, total: t - ((hh || 0) * 60 + (mm || 0)), drive, breaks, end: t};
}
function mtTimePanel(r){
  const x = mtCalcData(r), t = mtTimes(r, x.v('dep'), Number(x.v('stopMin')) || 0);
  const hm = m => { const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = Math.round(m % 60); return `${String(h).padStart(2, '0')}:${String(mi===60 ? 0 : mi).padStart(2, '0')}${d ? ` <span class="muted small">+${d} d</span>` : ''}`; };
  const dur = m => `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
  const own = k => x.c[k]!=null && x.c[k]!=='';
  return `<label class="mt-f"><span>Wyjazd</span><span class="mt-fi"><input type="time" data-mt-calc="dep" value="${esc(x.v('dep'))}"><em></em></span></label>
    <label class="mt-f"><span>Postój na przystanku${own('stopMin') ? ' <button type="button" class="link" data-mt-calc-reset="stopMin">domyślne</button>' : ''}</span><span class="mt-fi"><input type="text" inputmode="decimal" data-mt-calc="stopMin" value="${own('stopMin') ? esc(x.c.stopMin) : ''}" placeholder="30"><em>min</em></span></label>
    <div id="mt-time-res">${mtTimeResults(r, x)}</div>`;
}
function mtTimeResults(r, x){
  const t = mtTimes(r, x.v('dep'), Number(x.v('stopMin')) || 0);
  const hm = m => { const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = Math.round(m % 60); return `${String(h).padStart(2, '0')}:${String(mi===60 ? 0 : mi).padStart(2, '0')}${d ? ` <span class="muted small">+${d} d</span>` : ''}`; };
  const dur = m => `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
  return `${!t ? '<p class="muted small">Ustaw start, koniec albo przystanki – godziny policzę, gdy będzie wyznaczony przejazd.</p>' : `
    <div class="mt-times">${t.rows.map(o => `<div class="mt-tr"><span class="mt-n">${esc(o.p.lab)}</span><span class="mt-lab"><b>${esc(o.p.c ? o.p.c.name : '')}</b><span class="sub">${new Intl.NumberFormat('pl-PL', {maximumFractionDigits: 0}).format(o.km)} km</span></span><b>${hm(o.at)}</b></div>`).join('')}</div>
    <div class="mt-calc"><div class="mt-cr"><span>Jazda</span><b>${dur(t.drive)}</b></div><div class="mt-cr"><span>Przerwy (45 min po 4,5 h)</span><b>${t.breaks}</b></div><div class="mt-cr sum"><span>Cały kurs</span><b>${dur(t.total)}</b></div><div class="mt-cr"><span>Powrót / koniec</span><b>${hm(t.end)}</b></div></div>
    <p class="muted small">Czas jazdy jak dla auta osobowego z mapy (OSRM) – bus zwykle jedzie wolniej, licz zapas.</p>`}`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-mt-calc-reset]'); if (!b) return;
  const r = mtPlan(mtActive); if (!r) return; const calc = {...(r.calc || {})}; delete calc[b.dataset.mtCalcReset];
  mtWrite(() => mtSavePlan(r, {calc}));
});

/* wynik od razu przy wpisywaniu – zapis dopiero po wyjściu z pola (change) */
document.addEventListener('input', e => {
  const t = e.target; if (!t.dataset || !t.dataset.mtCalc) return;
  const r = mtPlan(mtActive); if (!r) return;
  const calc = {...(r.calc || {})}, k = t.dataset.mtCalc;
  const v = t.type==='time' ? t.value : rtNum(t.value);
  if (v==null || v==='' || (typeof v==='number' && isNaN(v))) delete calc[k]; else calc[k] = v;
  const tmp = {...r, calc}, x = mtCalcData(tmp);
  const c = document.getElementById('mt-calc-res'); if (c) c.innerHTML = mtCostResults(x);
  const tr = document.getElementById('mt-time-res'); if (tr) tr.innerHTML = mtTimeResults(tmp, x);
  const qr = document.getElementById('pl-quote-res'); if (qr) qr.innerHTML = plQuoteResults(x);
});

/* kolejność przystanków: złap wiersz myszką i upuść w nowym miejscu (strzałki zostają – np. na telefonie) */
let mtDragId = null;
document.addEventListener('dragstart', e => { const row = e.target.closest && e.target.closest('[data-mt-drag]'); if (!row) return;
  mtDragId = row.dataset.mtDrag; row.classList.add('dragging'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', mtDragId); } catch(_){} });
document.addEventListener('dragover', e => { if (!mtDragId) return; const row = e.target.closest && e.target.closest('[data-mt-drag]'); if (!row) return;
  e.preventDefault(); const r = row.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
  document.querySelectorAll('.mt-stop.drop-before, .mt-stop.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
  if (row.dataset.mtDrag!==mtDragId) row.classList.add(after ? 'drop-after' : 'drop-before'); });
document.addEventListener('drop', e => { if (!mtDragId) return; const row = e.target.closest && e.target.closest('[data-mt-drag]'); if (!row) return;
  e.preventDefault(); const r = mtPlan(mtActive); const from = mtDragId; mtDragId = null;
  const after = row.classList.contains('drop-after'), to = row.dataset.mtDrag;
  document.querySelectorAll('.mt-stop').forEach(x => x.classList.remove('drop-before', 'drop-after', 'dragging'));
  if (!r || from===to) return;
  const list = mtStops(r).slice(), item = list.find(x => x.id===from); if (!item) return;
  const rest = list.filter(x => x.id!==from); let j = rest.findIndex(x => x.id===to); if (j < 0) return; if (after) j++;
  rest.splice(j, 0, item);
  if (rest.map(x => x.id).join()===list.map(x => x.id).join()) return;
  mtWrite(() => mtSavePlan(r, {stops: rest})); });
document.addEventListener('dragend', () => { mtDragId = null; document.querySelectorAll('.mt-stop').forEach(x => x.classList.remove('drop-before', 'drop-after', 'dragging')); });

/* ---------- tryby planera: Koszty i Wycena ---------- */
const plFmt = n => n==null || isNaN(n) ? '—' : new Intl.NumberFormat('pl-PL', {maximumFractionDigits: 2}).format(n);
const QSTAT = [['szkic', 'Szkic', 'off'], ['wyslana', 'Wysłana', 'info'], ['przyjeta', 'Przyjęta', 'ok'], ['odrzucona', 'Odrzucona', 'bad']];
function plPicker(newBtn){
  const R = mtRoutes(), sel = mtPlan(mtActive);
  return `<div class="mt-row"><label class="mt-lbl pl-pick">Trasa<select data-pl-pick>${R.map(r => `<option value="${esc(r.id)}" ${sel && r.id===sel.id ? 'selected' : ''}>${esc(r.name)}${mtLinked(r) ? ' · ' + esc(mtLinked(r).code) : ''}</option>`).join('') || '<option value="">— brak tras —</option>'}</select></label>
    ${newBtn || ''}</div>`;
}
function plCostsMode(){
  const R = mtRoutes(), sel = mtPlan(mtActive);
  if (!R.length) return `<p class="muted">Nie ma jeszcze tras. Zaplanuj trasę w trybie „Mapa” albo dodaj wycenę bez mapy w trybie „Wycena”.</p>`;
  const rows = R.map(r => ({r, x: mtCalcData(r)}));
  return plPicker() + (sel ? mtCostPanel(sel) : '') + `
    <h5 class="mt-h">Porównanie tras</h5>
    <div class="tablewrap"><table class="pl-cmp"><thead><tr><th>Trasa</th><th class="r">Km</th><th class="r">Koszt kursu</th><th class="r">zł/km</th><th class="r">Przychód</th><th class="r">Marża</th></tr></thead><tbody>
    ${rows.map(({r, x}) => `<tr class="click ${r.id===mtActive ? 'sel' : ''}" data-pl-row="${esc(r.id)}"><td><b>${esc(r.name)}</b>${mtLinked(r) ? ` <span class="pill info">${esc(mtLinked(r).code)}</span>` : ''}</td><td class="r num">${plFmt(Math.round(x.kmAll))}</td><td class="r num">${x.cost ? zl(Math.round(x.cost)) : '—'}</td><td class="r num">${x.perKm!=null ? plFmt(Math.round(x.perKm * 100) / 100) : '—'}</td><td class="r num">${x.rev!=null ? zl(Math.round(x.rev)) : '—'}</td><td class="r">${x.margin!=null ? `<span class="pill ${x.margin < 0 ? 'bad' : x.margin < 0.1 ? 'warn' : 'ok'}">${Math.round(x.margin * 100)}%</span>` : '—'}</td></tr>`).join('')}</tbody></table></div>`;
}
function plQuoteMode(){
  const sel = mtPlan(mtActive), nb = `<button type="button" class="small primary" data-pl-new-quote>${ic('plus')}Wycena bez mapy</button>`;
  if (!sel) return plPicker(nb) + `<p class="muted">Wybierz trasę albo dodaj wycenę bez mapy – wpiszesz same km.</p>`;
  const x = mtCalcData(sel), c = sel.calc || {}, st = QSTAT.find(q => q[0]===(c.qStatus || 'szkic')) || QSTAT[0];
  const own = k => c[k]!=null && c[k]!=='';
  const inp = (k, label, unit, ph) => `<label class="mt-f"><span>${label}${own(k) ? ' <button type="button" class="link" data-mt-calc-reset="' + k + '">domyślne</button>' : ''}</span><span class="mt-fi"><input type="text" inputmode="decimal" data-mt-calc="${k}" value="${own(k) ? esc(rtShow(c[k])) : ''}" placeholder="${esc(ph)}"><em>${unit}</em></span></label>`;
  return plPicker(nb) + `
    <div class="mt-assign">${x.rt ? `Przypisana do trasy <b>${esc(x.rt.code)} ${esc(x.rt.name)}</b>.` : 'Nieprzypisana do trasy.'} Koszty liczą się jak w trybie „Koszty” – tam zmienisz paliwo, kierowcę i opłaty.</div>
    <label class="mt-f"><span>Klient</span><span class="mt-fi wide"><input type="text" data-mt-calc="qClient" value="${esc(c.qClient || '')}" placeholder="np. firma, dla której liczysz"><em></em></span></label>
    <label class="mt-f"><span>Status</span><select data-mt-calc="qStatus">${QSTAT.map(([k, l]) => `<option value="${k}" ${k===st[0] ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="mt-f"><span>Data wyceny</span><span class="mt-fi"><input type="date" data-mt-calc="qDate" value="${esc(c.qDate || today())}"><em></em></span></label>
    ${!mtPoints(sel).length || own('km') ? inp('km', 'Km kursu', 'km', x.def.km ? plFmt(Math.round(x.def.km)) : 'wpisz') : ''}
    ${inp('invKm', 'Km do faktury', 'km', x.invKm ? plFmt(Math.round(x.invKm)) : 'jak km kursu')}
    ${inp('trips', 'Kursów w miesiącu', 'kursów', x.def.trips ? String(x.def.trips) : 'wpisz')}
    <h5 class="mt-h">Ile wziąć za kurs (netto)</h5>
    ${inp('margin', 'Marża', '%', String(plCfg().margin))}
    ${inp('qProfit', 'albo zysk na kurs', 'zł', 'zamiast marży')}
    <div class="mt-calc" id="pl-quote-res">${plQuoteResults(x)}</div>
    <div class="mt-row"><button type="button" class="small" data-pl-set-rate ${x.qPrice ? '' : 'disabled'}>Ustaw jako stawkę</button><button type="button" class="small primary" data-pl-assign ${x.cost ? '' : 'disabled'}>Przypisz do trasy…</button></div>
    <p class="muted small">„Ustaw jako stawkę” wpisuje cenę z wyceny jako przychód tej trasy w planerze. „Przypisz do trasy” przenosi km do faktury, stawkę, koszt kierowcy i opłaty do trasy z zakładki Trasy (np. 167K Drezno) – rentowność trasy liczy się wtedy z tych danych.</p>`;
}
function plQuoteResults(x){
  const row = (l, n, cls = '') => `<div class="mt-cr ${cls}"><span>${l}</span><b>${n==null || isNaN(n) ? '—' : zl(Math.round(n))}</b></div>`;
  if (!x.cost) return '<p class="muted small">Wpisz km kursu albo ustaw punkty trasy na mapie – wtedy policzę koszt i cenę.</p>';
  return `${row('Koszt kursu = cena minimalna', x.cost)}
    ${row(`Cena za kurs${x.qMargin!=null ? ` (marża ${plFmt(x.qMargin)}%)` : ''}`, x.qPrice, 'sum ok')}
    <div class="mt-cr"><span>Cena za km${x.invKm ? ` (${plFmt(Math.round(x.invKm))} km do faktury)` : ''}</span><b>${x.qPerKm!=null ? plFmt(Math.round(x.qPerKm * 100) / 100) + ' zł' : '—'}</b></div>
    ${row('Zysk na kursie', x.qPrice!=null ? x.qPrice - x.cost : null)}
    ${x.trips ? row(`Przychód w miesiącu (${x.trips} ${isPlural(x.trips, 'kurs', 'kursy', 'kursów')})`, x.qPrice!=null ? x.qPrice * x.trips : null) + row('Zysk w miesiącu', x.qPrice!=null ? (x.qPrice - x.cost) * x.trips : null) : ''}
    ${x.rev!=null ? `<div class="mt-cr"><span>Obecna stawka</span><b>${zl(Math.round(x.rev))} · marża ${Math.round(x.margin * 100)}%</b></div>` : ''}`;
}
/* przypisanie wyliczeń do trasy z zakładki Trasy – z podglądem „było / będzie” */
function plAssignForm(r){
  const x = mtCalcData(r), price = x.qPrice!=null ? x.qPrice : x.rev;
  const free = S.routes.filter(t => t.active!==false && !(S.routePlans || []).some(p => p.routeId===t.id && p.id!==r.id)).sort((a, b) => String(a.code).localeCompare(String(b.code), 'pl', {numeric: true}));
  editing = {col: 'pl-assign', id: r.id, base: {}, special: () => plAssignSave(r)};
  $('#dlg-title').textContent = 'Przypisz wyliczenia do trasy';
  $('#dlg-body').innerHTML = `<div class="field full"><label for="pl-a-route">Trasa</label><select id="pl-a-route"><option value="">— wybierz —</option>${free.map(t => `<option value="${esc(t.id)}" ${t.id===r.routeId ? 'selected' : ''}>${esc(t.code)} ${esc(t.name)}</option>`).join('')}</select></div>
    <div class="field full"><span class="label">Co trafi do trasy</span><label class="check small"><input type="radio" name="pl-a-mode" value="kurs" checked> Stawka za kurs: <b>${price!=null ? zl(Math.round(price)) : '—'}</b></label>
      <label class="check small"><input type="radio" name="pl-a-mode" value="km"> Stawka za km: <b>${price!=null && x.invKm ? plFmt(Math.round(price / x.invKm * 100) / 100) + ' zł' : '—'}</b> (${plFmt(Math.round(x.invKm))} km do faktury)</label>
      ${mtStops(r).length ? `<label class="check small"><input type="checkbox" id="pl-a-stops" checked> Przenieś też przystanki z mapy (${mtStops(r).length}) – kierowca zobaczy je w telefonie</label>` : ''}</div>
    <div class="field full" id="pl-a-diff"></div><div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Przypisz'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
  editing.plX = x; editing.plPrice = price; plAssignDiff();
}
function plAssignVals(){
  const x = editing.plX, mode = (document.querySelector('[name="pl-a-mode"]:checked') || {}).value || 'kurs';
  const rate = editing.plPrice==null ? null : mode==='km' ? (x.invKm ? Math.round(editing.plPrice / x.invKm * 100) / 100 : null) : Math.round(editing.plPrice);
  return {km: x.invKm ? Math.round(x.invKm) : null, mode, rate, driver: Math.round(x.drv), cost: Math.round(x.tolls + x.other), extraKm: Number(x.v('extraKm')) || 0};
}
function plAssignDiff(){
  const rid = $('#pl-a-route') && $('#pl-a-route').value, box = $('#pl-a-diff'); if (!box) return;
  if (!rid){ box.innerHTML = '<span class="muted small">Wybierz trasę, żeby zobaczyć, co się zmieni.</span>'; return; }
  const t = byId('routes', rid), rc = rtCfg().routes[rid] || {}, n = plAssignVals();
  const mm = m => m==='km' ? 'zł/km' : 'zł/kurs';
  const line = (l, a, b) => `<tr${String(a)!==String(b) ? ' class="chg"' : ''}><td>${l}</td><td class="r">${a ?? '—'}</td><td class="r"><b>${b ?? '—'}</b></td></tr>`;
  box.innerHTML = `<table class="pl-diff"><thead><tr><th></th><th class="r">Było</th><th class="r">Będzie</th></tr></thead><tbody>
    ${line('Km do faktury', t.km ? plFmt(t.km) : null, n.km!=null ? plFmt(n.km) : null)}
    ${line('Stawka', rc.rate ? plFmt(rc.rate) + ' ' + mm(rc.mode) : null, n.rate!=null ? plFmt(n.rate) + ' ' + mm(n.mode) : null)}
    ${line('Koszt kierowcy na kurs (łącznie)', rc.driver ? plFmt(rc.driver) + ' zł' : null, plFmt(n.driver) + ' zł')}
    ${line('Opłaty i inne na kurs', rc.cost ? plFmt(rc.cost) + ' zł' : null, plFmt(n.cost) + ' zł')}
    ${line('Dodatkowe km na kurs', rc.extraKm ? plFmt(rc.extraKm) : null, n.extraKm ? plFmt(n.extraKm) : null)}</tbody></table>`;
}
document.addEventListener('change', e => { if (editing && editing.col==='pl-assign' && (e.target.id==='pl-a-route' || e.target.name==='pl-a-mode')) plAssignDiff(); });
async function plAssignSave(r){
  const rid = $('#pl-a-route').value, w = $('#dlg-warn');
  if (!rid){ w.textContent = 'Wybierz trasę.'; w.hidden = false; return; }
  const n = plAssignVals(), cfg = rtCfg(), stops = $('#pl-a-stops') ? $('#pl-a-stops').checked : false;
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    if (n.km) await db.collection('routes').doc(rid).update({km: n.km});
    const routes = {...cfg.routes, [rid]: {...(cfg.routes[rid] || {}), mode: n.mode, ...(n.rate!=null ? {rate: n.rate} : {}), driver: n.driver, cost: n.cost, extraKm: n.extraKm}};
    await db.collection('settings').doc('route_fin').set({routes, months: cfg.months});
    // plan przypięty do trasy (przystanki – tylko gdy zaznaczone)
    await db.collection('routePlans').doc(r.id).update({routeId: rid});
    if (stops) await mtSyncRoute({...r, routeId: rid});
    closeForm(); toast(`Przypisano wyliczenia do trasy ${byId('routes', rid).code}`); render();
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}
/* nowa wycena bez mapy */
function plNewQuote(){
  editing = {col: 'pl-newq', id: null, base: {}, special: plNewQuoteSave};
  $('#dlg-title').textContent = 'Nowa wycena (bez mapy)';
  $('#dlg-body').innerHTML = `<div class="field full"><label for="pl-q-name">Nazwa *</label><input id="pl-q-name" maxlength="80" placeholder="np. Wrocław – Praga dla firmy X"></div>
    <div class="field"><label for="pl-q-km">Km kursu *</label><input id="pl-q-km" type="text" inputmode="decimal" placeholder="np. 640"></div>
    <div class="field"><label for="pl-q-client">Klient</label><input id="pl-q-client" maxlength="100"></div>
    <div class="field full"><span class="muted small">Pozostałe dane (kierowca, opłaty, liczba kursów, marża) wpiszesz w wycenie. Punkty na mapie możesz dodać później w trybie „Mapa”.</span></div><div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Utwórz'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
  setTimeout(() => $('#pl-q-name')?.focus(), 30);
}
async function plNewQuoteSave(){
  const name = $('#pl-q-name').value.trim(), km = rtNum($('#pl-q-km').value), w = $('#dlg-warn');
  if (!name){ w.textContent = 'Wpisz nazwę.'; w.hidden = false; return; }
  if (!(km > 0)){ w.textContent = 'Wpisz km kursu.'; w.hidden = false; return; }
  const ref = db.collection('routePlans').doc();
  try { await ref.set({name, color: MT_COLORS[(S.routePlans || []).length % MT_COLORS.length], stops: [], via: [], routeId: null, calc: {km, qClient: $('#pl-q-client').value.trim() || undefined, qStatus: 'szkic', qDate: today()}});
    mtActive = ref.id; plMode = 'wycena'; closeForm(); toast('Utworzono wycenę'); render(); } catch(err){ handleWriteErr(err); }
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-pl-mode],[data-pl-row],[data-pl-new-quote],[data-pl-set-rate],[data-pl-assign]'); if (!t) return;
  const d = t.dataset;
  if (d.plMode){ plMode = d.plMode; render(); setTimeout(() => mtMap && mtMap.invalidateSize(), 260); return; }
  if (d.plRow){ mtActive = d.plRow; render(); return; }
  if ('plNewQuote' in d){ plNewQuote(); return; }
  const r = mtPlan(mtActive); if (!r) return;
  if ('plSetRate' in d){ const x = mtCalcData(r); if (x.qPrice==null) return; mtWrite(() => mtSavePlan(r, {calc: {...(r.calc || {}), revMode: 'kurs', revRate: Math.round(x.qPrice)}})).then(() => toast('Ustawiono stawkę ' + zl(Math.round(x.qPrice)) + ' za kurs')); return; }
  if ('plAssign' in d){ plAssignForm(r); return; }
});
document.addEventListener('change', e => {
  if (e.target.dataset && 'plPick' in e.target.dataset){ mtActive = e.target.value; render(); return; }
  if (e.target.dataset && e.target.dataset.plCfg){ const k = e.target.dataset.plCfg, n = rtNum(e.target.value); const cur = plCfg();
    if (n==null || isNaN(n) || n <= 0){ toast('Wpisz liczbę większą od zera, np. 1,6'); e.target.value = rtShow(cur[k]); return; }
    mtWrite(() => db.collection('settings').doc('planner').set({...cur, [k]: n})).then(() => toast('Zapisano przelicznik ' + rtShow(n))); }
});
