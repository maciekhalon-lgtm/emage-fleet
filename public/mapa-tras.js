/* Emage FLEET — Grafik → Mapa tras: klienci (punkty ze współrzędnymi) i plany tras na mapie.
   Plan = start → przystanki (klienci) → koniec + punkty przejazdowe; przejazd po drogach z OSRM, adresy z Photon,
   mapa OpenStreetMap (Leaflet). Plan można przypiąć do trasy z zakładki Trasy (albo utworzyć nową) – wtedy jego
   przystanki stają się przystankami tej trasy (route_stops), które kierowca widzi w telefonie.
   Dane w bazie (migracje 059–061), zmienia kierownik floty.
   Mapa jest jedna i żyje poza render() – przenosimy ją do strony po każdym odświeżeniu, żeby nie migała. */
'use strict';
const MT_COLORS = ['#245dcc', '#137e64', '#9d3bb5', '#b65616', '#c0263d', '#0f7d8c', '#6b5b00', '#4b3fb0'];
let mtSub = 'trasa';   // zakładka w szczegółach planu: trasa / koszty / czas
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
  if (np.routeId && ('stops' in patch || 'routeId' in patch)) await mtSyncRoute(np);
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
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · przejazd OSRM'}).addTo(mtMap);
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
  const mv = mtMovePin===c.id;
  const m = L.marker([Number(c.lat), Number(c.lng)], {icon: pin, title: c.name, alt: c.name, draggable: mv, zIndexOffset: mv ? 1000 : 0}).addTo(mtLayer);
  const act = mtPlan(mtActive);
  if (mv){
    m.on('dragend', () => { const ll = m.getLatLng(); mtMovePin = null; mtNotice('');
      mtWrite(() => db.collection('clients').doc(c.id).update({lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6)})).then(() => toast('Zapisano nowe miejsce pinezki')); });
    return;
  }
  m.bindPopup(`<div class="mt-pop"><b>${esc(c.name)}</b>${c.address ? `<br>${esc(c.address)}` : ''}${r ? `<br><span class="muted small">${esc(r.name)}</span>` : ''}
    <div class="mt-pop-a"><button type="button" class="small" data-mt-edit-client="${esc(c.id)}">Edytuj klienta</button><button type="button" class="small" data-mt-move-pin="${esc(c.id)}">Przesuń pinezkę</button>${act ? `<button type="button" class="small primary" data-mt-add-stop="${esc(c.id)}">Dodaj do „${esc(act.name)}”</button>` : ''}</div></div>`);
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
function mtMapMenu(ll){
  const act = mtPlan(mtActive);
  L.popup().setLatLng(ll).setContent(`<div class="mt-pop"><b>To miejsce</b><br><span class="muted small" id="mt-rev">${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}</span>
    <div class="mt-pop-a"><button type="button" class="small" data-mt-here="${ll.lat.toFixed(6)},${ll.lng.toFixed(6)}">Dodaj klienta tutaj</button>${act ? `<button type="button" class="small primary" data-mt-here="${ll.lat.toFixed(6)},${ll.lng.toFixed(6)}" data-mt-here-route="${esc(act.id)}">Dodaj jako przystanek do „${esc(act.name)}”</button>` : ''}</div></div>`).openOn(mtMap);
  mtReverse(ll.lat, ll.lng).then(a => { const el = document.getElementById('mt-rev'); if (el && a) el.textContent = a; });
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
  if (!mtOn()) return `<div class="bar"><h2>Mapa tras</h2></div><div class="panel empty"><p>${P().manage ? 'Mapa tras wymaga jednorazowego uruchomienia migracji <b>059–061</b> w Supabase.' : 'Mapę tras widzi kierownik floty.'}</p></div>`;
  if (!mtActive || !mtPlan(mtActive)) mtActive = (mtRoutes()[0] || {}).id || null;
  setTimeout(mtMount, 0);
  const nC = (S.clients || []).length, nR = mtRoutes().length;
  return `<div class="mt-wrap"><aside class="mt-panel" id="mt-panel">
      <div class="seg mt-tabs"><button type="button" class="${mtTab==='routes' ? 'on' : ''}" data-mt-tab="routes">Trasy · ${nR}</button><button type="button" class="${mtTab==='clients' ? 'on' : ''}" data-mt-tab="clients">Klienci · ${nC}</button></div>
      ${mtTab==='routes' ? mtRoutesPanel() : mtClientsPanel()}
    </aside><div class="mt-mapwrap"><div id="mt-slot"></div><div class="mt-tools"><button type="button" class="small" data-mt-fit>Pokaż wszystkie punkty</button></div><div id="mt-notice" class="mt-notice" role="status" hidden></div></div></div>`;
}
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
  if (mtSub!=='trasa') return head + list + `<section class="mt-detail"><div class="mt-row"><b>${esc(sel.name)}</b><button type="button" class="small" data-mt-plan-edit="${esc(sel.id)}">Ustawienia</button></div>
    <div class="seg mt-sub">${[['trasa', 'Trasa'], ['koszty', 'Koszty i zysk'], ['czas', 'Czas i godziny']].map(([k, l]) => `<button type="button" class="${mtSub===k ? 'on' : ''}" data-mt-sub="${k}">${l}</button>`).join('')}</div>
    ${mtSub==='koszty' ? mtCostPanel(sel) : mtTimePanel(sel)}</section>`;
  return head + list + `<section class="mt-detail"><div class="mt-row"><b>${esc(sel.name)}</b><span><input type="color" class="mt-color" data-mt-color="${esc(sel.id)}" value="${esc(mtColor(sel))}" aria-label="Kolor trasy na mapie"> <button type="button" class="small" data-mt-plan-edit="${esc(sel.id)}">Ustawienia</button></span></div>
    <div class="seg mt-sub">${[['trasa', 'Trasa'], ['koszty', 'Koszty i zysk'], ['czas', 'Czas i godziny']].map(([k, l]) => `<button type="button" class="${mtSub===k ? 'on' : ''}" data-mt-sub="${k}">${l}</button>`).join('')}</div>
    <div class="mt-assign">${rt ? `Przypisana do trasy <b>${esc(rt.code)} ${esc(rt.name)}</b>. Przystanki z planu widzi kierowca tej trasy.` : 'Szkic – nieprzypisany do trasy. <button type="button" class="link" data-mt-plan-edit="' + esc(sel.id) + '">Przypisz albo utwórz trasę</button>'}</div>
    <label class="mt-lbl">Start<select data-mt-start="${esc(sel.id)}">${opt(sel.startClientId)}</select></label>
    <label class="mt-lbl">Koniec<select data-mt-end="${esc(sel.id)}">${opt(sel.endClientId)}</select></label>
    <div class="mt-row"><h4>Przystanki</h4><span class="muted small">${st.length}</span></div>
    ${st.map((s, i) => { const c = mtClient(s.clientId), ok = mtHasXY(c);
      return `<div class="mt-stop"><span class="mt-n">${i + 1}</span><span class="mt-lab"><b>${esc(c ? c.name : '?')}</b>${!ok ? `<span class="sub warn-t">bez punktu na mapie – <button type="button" class="link" data-mt-edit-client="${esc(s.clientId)}">ustaw</button></span>` : ''}</span>
        <button type="button" class="small ghost icon" data-mt-up="${esc(s.id)}" aria-label="W górę" ${i ? '' : 'disabled'}>↑</button><button type="button" class="small ghost icon" data-mt-down="${esc(s.id)}" aria-label="W dół" ${i < st.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="small ghost icon" data-mt-del="${esc(s.id)}" aria-label="Usuń przystanek">✕</button></div>`; }).join('') || '<p class="muted small">Dodaj przystanek z listy, kliknij klienta na mapie albo kliknij w puste miejsce mapy.</p>'}
    <div class="mt-add"><select id="mt-add-sel" aria-label="Klient do dodania"><option value="">Dodaj przystanek…</option>${cs.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select><button type="button" class="small" data-mt-add>${ic('plus')}Dodaj</button></div>
    <p class="muted small">Kliknij w mapę, żeby dodać klienta albo przystanek w tym miejscu. Złap linię wybranej trasy i przeciągnij, żeby poprowadzić ją inną drogą${mtVia(sel).length ? ` (punkty przejazdowe: ${mtVia(sel).length} – <button type="button" class="link" data-mt-via-clear="${esc(sel.id)}">usuń wszystkie</button>)` : ''}.${rt ? ' Godzinę, telefon i uwagi przystanku zmienisz w Trasy → Przystanki.' : ''}</p>
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
    mtPicking = {...editing.mtDraft, ...mtFormData(), id: editing.mtDraft.id, _link: editing.mtLink, _addTo: editing.mtAddTo}; closeForm();
    mtNotice('Kliknij na mapie miejsce wjazdu lub rozładunku. Esc – anuluj.'); return;
  }
  if (e.target.closest('[data-mt-lookup]')) mtLookup();
  const ch = e.target.closest('[data-mt-res]');
  if (ch){ const [lng, lat] = ch.dataset.mtRes.split(','); $('#mt-c-addr').value = ch.textContent; $('#mt-c-lat').value = lat; $('#mt-c-lng').value = lng; $('#mt-results').textContent = 'Adres wybrany.'; }
}, true);
async function mtLookup(){
  const q = $('#mt-c-addr').value.trim(), out = $('#mt-results');
  if (q.length < 3){ out.textContent = 'Wpisz ulicę i miejscowość.'; return; }
  out.textContent = 'Wyszukiwanie…';
  try {
    const x = await fetch('https://photon.komoot.io/api/?limit=5&q=' + encodeURIComponent(q), {signal: AbortSignal.timeout(10000)});
    if (!x.ok) throw Error();
    const {features} = await x.json();
    const items = (features || []).filter(f => f.geometry && f.geometry.type==='Point').map(({properties: p, geometry: g}) => {
      const label = [p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : p.name, p.postcode, p.city || p.town || p.village, p.country].filter(Boolean).join(', ');
      return label ? `<button type="button" class="small mt-res" data-mt-res="${g.coordinates[0]},${g.coordinates[1]}">${esc(label)}</button>` : '';
    }).join('');
    out.innerHTML = items || 'Brak wyników. Doprecyzuj adres albo wskaż punkt na mapie.';
  } catch(_){ out.textContent = 'Wyszukiwarka niedostępna. Wskaż punkt na mapie albo wpisz współrzędne.'; }
}

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
  let kc = null; try { kc = rtKmCost(today().slice(0, 7)); } catch(_){}
  let clsRate = {}; try { if (mtCalcData.k!==S.costs.length + '|' + S.bookings.length){ mtCalcData.k = S.costs.length + '|' + S.bookings.length; mtCalcData.cr = rkData().clsRate; } clsRate = mtCalcData.cr || {}; } catch(_){}
  const cls = c.cls || 'pow25';
  const def = {
    lp100: clsRate[cls] ?? (kc ? kc.lp100 : 11), price: kc ? kc.price : 5.3, otherKm: kc ? kc.otherKm : 0,
    km: kmMap, invKm: rt && Number(rt.km) > 0 ? Number(rt.km) : kmMap, revMode: rc.mode==='km' ? 'km' : 'kurs', revRate: Number(rc.rate) || null,
    drvMode: 'kurs', drvRate: Number(rc.driver) || null, drivers: 1, tolls: Number(rc.cost) || null, extraKm: Number(rc.extraKm) || 0,
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
  const drv = drivers * (mode==='godz' ? drvRate * (hours || 0) : mode==='dzien' ? drvRate * days : drvRate);
  const tolls = Number(v('tolls')) || 0, other = Number(v('other')) || 0;
  const cost = fuel + car + drv + tolls + other;
  const rev = v('revRate') ? (v('revMode')==='km' ? (Number(v('invKm')) || 0) * Number(v('revRate')) : Number(v('revRate'))) : null;
  const profit = rev!=null ? rev - cost : null, trips = Number(v('trips')) || 0;
  return {c, def, v, rt, kc, km, kmAll, hours, fuel, car, drv, tolls, other, cost, rev, profit, trips, perKm: kmAll ? cost / kmAll : null, margin: rev ? profit / rev : null};
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
    ${inp('km', 'Km kursu', 'km', 'z mapy')}${inp('extraKm', 'Dodatkowe km (np. dojazd do domu)', 'km', '0')}
    ${inp('lp100', 'Spalanie', 'l/100', '')}${inp('price', 'Cena paliwa netto', 'zł/l', '')}${inp('otherKm', 'Pozostałe koszty auta (leasing, OC, serwis)', 'zł/km', '')}
    <h5 class="mt-h">Kierowca i opłaty</h5>
    ${sel('drvMode', 'Kierowcy płacę', [['kurs', 'za kurs'], ['dzien', 'za dzień'], ['godz', 'za godzinę']])}
    ${inp('drvRate', 'Stawka kierowcy', x.v('drvMode')==='godz' ? 'zł/h' : x.v('drvMode')==='dzien' ? 'zł/dzień' : 'zł/kurs', 'wpisz')}${sel('drivers', 'Obsada', [['1', '1 kierowca'], ['2', '2 kierowców']])}
    ${inp('tolls', 'Opłaty drogowe, winiety, parkingi', 'zł/kurs', '0')}${inp('other', 'Inne koszty kursu', 'zł/kurs', '0')}
    <h5 class="mt-h">Przychód</h5>
    ${sel('revMode', 'Fakturuję', [['km', 'za km'], ['kurs', 'za kurs']])}
    ${x.v('revMode')==='km' ? inp('invKm', 'Km do faktury', 'km', '') : ''}${inp('revRate', 'Stawka', x.v('revMode')==='km' ? 'zł/km' : 'zł/kurs', 'wpisz')}
    ${inp('trips', 'Kursów w miesiącu', 'kursów', x.rt ? 'z grafiku' : 'wpisz')}
    <div class="mt-calc">
      ${row(`Paliwo (${nf(x.kmAll)} km)`, x.fuel)}${row('Auto – pozostałe koszty', x.car)}${row(`Kierowca${x.hours ? ` (${nf(Math.round(x.hours * 10) / 10)} h)` : ''}`, x.drv)}${row('Opłaty i inne', x.tolls + x.other)}
      ${row('Koszt kursu', x.cost, 'sum')}<div class="mt-cr"><span>Koszt na km</span><b>${x.perKm!=null ? nf(Math.round(x.perKm * 100) / 100) + ' zł' : '—'}</b></div>
      ${row('Przychód z kursu', x.rev)}
      ${x.profit!=null ? `${row('Zysk z kursu', x.profit, x.profit >= 0 ? 'ok' : 'bad')}<div class="mt-cr"><span>Marża</span><b>${Math.round(x.margin * 100)}%</b></div>` : '<p class="muted small">Wpisz stawkę w „Przychód”, żeby zobaczyć zysk.</p>'}
      ${x.trips && x.profit!=null ? row(`Zysk w miesiącu (${x.trips} ${isPlural(x.trips, 'kurs', 'kursy', 'kursów')})`, x.profit * x.trips, x.profit >= 0 ? 'ok sum' : 'bad sum') : ''}
    </div>`;
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
    ${!t ? '<p class="muted small">Ustaw start, koniec albo przystanki – godziny policzę, gdy będzie wyznaczony przejazd.</p>' : `
    <div class="mt-times">${t.rows.map(o => `<div class="mt-tr"><span class="mt-n">${esc(o.p.lab)}</span><span class="mt-lab"><b>${esc(o.p.c ? o.p.c.name : '')}</b><span class="sub">${new Intl.NumberFormat('pl-PL', {maximumFractionDigits: 0}).format(o.km)} km</span></span><b>${hm(o.at)}</b></div>`).join('')}</div>
    <div class="mt-calc"><div class="mt-cr"><span>Jazda</span><b>${dur(t.drive)}</b></div><div class="mt-cr"><span>Przerwy (45 min po 4,5 h)</span><b>${t.breaks}</b></div><div class="mt-cr sum"><span>Cały kurs</span><b>${dur(t.total)}</b></div><div class="mt-cr"><span>Powrót / koniec</span><b>${hm(t.end)}</b></div></div>
    <p class="muted small">Czas jazdy jak dla auta osobowego z mapy (OSRM) – bus zwykle jedzie wolniej, licz zapas.</p>`}`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-mt-calc-reset]'); if (!b) return;
  const r = mtPlan(mtActive); if (!r) return; const calc = {...(r.calc || {})}; delete calc[b.dataset.mtCalcReset];
  mtWrite(() => mtSavePlan(r, {calc}));
});
