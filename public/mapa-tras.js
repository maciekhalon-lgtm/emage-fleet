/* Emage FLEET — Grafik → Mapa tras: klienci (punkty ze współrzędnymi) i trasy na mapie.
   Trasa = punkt startu → przystanki (route_stops, kolejność) → punkt końca; przejazd po drogach z OSRM,
   adresy z Photon, mapa OpenStreetMap (Leaflet). Dane w bazie (migracja 059_mapa_tras.sql), zmienia kierownik floty.
   Mapa jest jedna i żyje poza render() – przenosimy ją do strony po każdym odświeżeniu, żeby nie migała. */
'use strict';
const MT_COLORS = ['#245dcc', '#137e64', '#9d3bb5', '#b65616', '#c0263d', '#0f7d8c', '#6b5b00', '#4b3fb0'];
let mtTab = 'routes', mtActive = null, mtFilter = '', mtPicking = null, mtMap = null, mtLayer = null, mtEl = null, mtLoad = null, mtFitted = false;
const mtCalc = new Map();
let mtHidden = new Set(); try { mtHidden = new Set(JSON.parse(localStorage.getItem('ef-mt-hidden') || '[]')); } catch(_){}
const mtSaveHidden = () => { try { localStorage.setItem('ef-mt-hidden', JSON.stringify([...mtHidden])); } catch(_){} };
const mtOn = () => !!P().manage && optOn('clients');
const mtClient = id => (S.clients || []).find(c => c.id===id);
const mtHasXY = c => c && c.lat!=null && c.lng!=null && c.lat!=='' && c.lng!=='';
const mtRoutes = () => S.routes.filter(r => r.active!==false).sort((a, b) => String(a.code).localeCompare(String(b.code), 'pl'));
const mtColor = r => r.color || MT_COLORS[Math.max(0, mtRoutes().findIndex(x => x.id===r.id)) % MT_COLORS.length];
const mtStops = rid => (S.routeStops || []).filter(s => s.routeId===rid).sort((a, b) => (a.pos || 0) - (b.pos || 0));
/* punkty trasy na mapie: start, przystanki z klientem ze współrzędnymi, koniec */
function mtPoints(r){
  const pts = [];
  const add = (c, lab) => { if (mtHasXY(c)) pts.push({c, lab}); };
  add(mtClient(r.startClientId), 'S');
  mtStops(r.id).forEach((s, i) => add(mtClient(s.clientId), String(i + 1)));
  add(mtClient(r.endClientId), 'K');
  return pts;
}

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
        if (!mtPicking) return;
        const d = mtPicking; mtPicking = null; mtNotice('');
        mtClientForm({...d, lat: latlng.lat.toFixed(6), lng: latlng.lng.toFixed(6)}, d._link);
      });
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
  const pts = mtPoints(r), key = pts.map(p => Number(p.c.lng).toFixed(5) + ',' + Number(p.c.lat).toFixed(5)).join(';');
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
    const inv = Number(r.km) > 0 ? ` · do faktury ${new Intl.NumberFormat('pl-PL').format(r.km)} km` : '';
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
    const coords = calc.data ? calc.data.geometry.coordinates.map(([lng, lat]) => [lat, lng]) : pts.map(p => [Number(p.c.lat), Number(p.c.lng)]);
    if (coords.length > 1) L.polyline(coords, {color: col, weight: r.id===mtActive ? 6 : 4, opacity: .88, dashArray: calc.data ? null : '6 8', interactive: false}).addTo(mtLayer);
    const lab = {};
    pts.forEach(p => { used.add(p.c.id); (lab[p.c.id] = lab[p.c.id] || []).push(p.lab); });
    Object.entries(lab).forEach(([cid, ls]) => mtMarker(mtClient(cid), col, ls.join('/'), r));
  });
  (S.clients || []).filter(c => mtHasXY(c) && !used.has(c.id)).forEach(c => mtMarker(c, '#516579', '•'));
}
function mtMarker(c, color, label, r){
  const pin = L.divIcon({className: '', html: `<span class="mt-pin" style="background:${esc(color)}">${esc(label)}</span>`, iconSize: [30, 30], iconAnchor: [15, 15]});
  const m = L.marker([Number(c.lat), Number(c.lng)], {icon: pin, title: c.name, alt: c.name}).addTo(mtLayer);
  const act = byId('routes', mtActive);
  m.bindPopup(`<div class="mt-pop"><b>${esc(c.name)}</b>${c.address ? `<br>${esc(c.address)}` : ''}${r ? `<br><span class="muted small">${esc(r.code)} ${esc(r.name)}</span>` : ''}
    <div class="mt-pop-a"><button type="button" class="small" data-mt-edit-client="${esc(c.id)}">Edytuj klienta</button>${act ? `<button type="button" class="small primary" data-mt-add-stop="${esc(c.id)}">Dodaj do ${esc(act.code)}</button>` : ''}</div></div>`);
  m.on('click', () => { if (mtPicking) mtMap.fire('click', {latlng: m.getLatLng()}); });
}

/* ---------- strona ---------- */
function viewRouteMap(){
  if (!mtOn()) return `<div class="bar"><h2>Mapa tras</h2></div><div class="panel empty"><p>${P().manage ? 'Mapa tras wymaga jednorazowego uruchomienia migracji <b>059_mapa_tras.sql</b> w Supabase.' : 'Mapę tras widzi kierownik floty.'}</p></div>`;
  if (!mtActive || !byId('routes', mtActive)) mtActive = (mtRoutes()[0] || {}).id || null;
  setTimeout(mtMount, 0);
  const nC = (S.clients || []).length, nR = mtRoutes().length;
  return `<div class="mt-wrap"><aside class="mt-panel" id="mt-panel">
      <div class="seg mt-tabs"><button type="button" class="${mtTab==='routes' ? 'on' : ''}" data-mt-tab="routes">Trasy · ${nR}</button><button type="button" class="${mtTab==='clients' ? 'on' : ''}" data-mt-tab="clients">Klienci · ${nC}</button></div>
      ${mtTab==='routes' ? mtRoutesPanel() : mtClientsPanel()}
    </aside><div class="mt-mapwrap"><div id="mt-slot"></div><div class="mt-tools"><button type="button" class="small" data-mt-fit>Pokaż wszystkie punkty</button></div><div id="mt-notice" class="mt-notice" role="status" hidden></div></div></div>`;
}
function mtRoutesPanel(){
  const R = mtRoutes(), sel = byId('routes', mtActive);
  if (!R.length) return `<p class="muted">Nie ma jeszcze tras. Dodaj trasę w zakładce <a href="#trasy">Trasy</a>.</p>`;
  const list = R.map(r => `<div class="mt-card ${r.id===mtActive ? 'sel' : ''}"><input type="checkbox" data-mt-show="${esc(r.id)}" aria-label="Pokaż ${esc(r.name)} na mapie" ${mtHidden.has(r.id) ? '' : 'checked'}>
      <span class="mt-dot" style="background:${esc(mtColor(r))}"></span><button type="button" class="mt-plain" data-mt-sel="${esc(r.id)}"><b>${esc(r.code)}</b> ${esc(r.name)}<span class="sub" data-mt-metric="${esc(r.id)}">${mtMetric(r)}</span></button></div>`).join('');
  if (!sel) return list;
  const st = mtStops(sel.id), cs = (S.clients || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const opt = v => `<option value="">— nie ustawiony —</option>${cs.map(c => `<option value="${esc(c.id)}" ${c.id===v ? 'selected' : ''}>${esc(c.name)}${c.address ? ' · ' + esc(c.address) : ''}</option>`).join('')}`;
  return list + `<section class="mt-detail"><div class="mt-row"><b>${esc(sel.code)} ${esc(sel.name)}</b><input type="color" class="mt-color" data-mt-color="${esc(sel.id)}" value="${esc(mtColor(sel))}" aria-label="Kolor trasy na mapie"></div>
    <label class="mt-lbl">Start<select data-mt-start="${esc(sel.id)}">${opt(sel.startClientId)}</select></label>
    <label class="mt-lbl">Koniec<select data-mt-end="${esc(sel.id)}">${opt(sel.endClientId)}</select></label>
    <div class="mt-row"><h4>Przystanki</h4><span class="muted small">${st.length}</span></div>
    ${st.map((s, i) => { const c = mtClient(s.clientId), ok = mtHasXY(c);
      return `<div class="mt-stop"><span class="mt-n">${i + 1}</span><span class="mt-lab"><b>${esc(c ? c.name : s.client)}</b>${s.timeFrom ? ` <span class="pill soon">${esc(s.timeFrom)}</span>` : ''}${!ok ? `<span class="sub warn-t">nie ma go na mapie – <button type="button" class="link" data-mt-fix="${esc(s.id)}">wskaż klienta</button></span>` : ''}</span>
        <button type="button" class="small ghost icon" data-mt-up="${esc(s.id)}" aria-label="W górę" ${i ? '' : 'disabled'}>↑</button><button type="button" class="small ghost icon" data-mt-down="${esc(s.id)}" aria-label="W dół" ${i < st.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="small ghost icon" data-mt-del="${esc(s.id)}" aria-label="Usuń przystanek">✕</button></div>`; }).join('') || '<p class="muted small">Dodaj przystanek z listy albo kliknij klienta na mapie.</p>'}
    <div class="mt-add"><select id="mt-add-sel" aria-label="Klient do dodania"><option value="">Dodaj przystanek…</option>${cs.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select><button type="button" class="small" data-mt-add>${ic('plus')}Dodaj</button></div>
    <p class="muted small">Godzinę, telefon i uwagi przystanku zmienisz w Trasy → Przystanki. Kierowca widzi przystanki swojej trasy z nawigacją.</p>
    <div class="mt-row"><button type="button" class="small" data-mt-retry="${esc(sel.id)}">Przelicz przejazd</button><button type="button" class="small ghost" data-stops="${esc(sel.id)}">Przystanki – szczegóły</button></div></section>`;
}
function mtClientsPanel(){
  const q = mtFilter.trim().toLocaleLowerCase('pl');
  const xs = (S.clients || []).filter(c => (c.name + ' ' + (c.address || '')).toLocaleLowerCase('pl').includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return `<div class="mt-row"><input type="search" id="mt-filter" placeholder="Szukaj nazwy lub adresu" value="${esc(mtFilter)}" aria-label="Szukaj klientów"><button type="button" class="small primary" data-mt-new-client>${ic('plus')}Klient</button></div>
    ${xs.map(c => `<div class="mt-card"><button type="button" class="mt-plain" data-mt-locate="${esc(c.id)}"><b>${esc(c.name)}</b><span class="sub">${esc(c.address || '')}${mtHasXY(c) ? '' : ' · <span class="warn-t">bez punktu na mapie</span>'}</span></button><button type="button" class="small ghost" data-mt-edit-client="${esc(c.id)}">Edytuj</button></div>`).join('')
      || `<p class="muted">${(S.clients || []).length ? 'Brak pasujących klientów.' : 'Dodaj pierwszego klienta albo magazyn – potem ustawisz go jako start, koniec albo przystanek trasy.'}</p>`}`;
}

/* ---------- klient: formularz (okno aplikacji) ---------- */
function mtClientForm(c = {}, linkStop){
  editing = {col: 'mt-client', id: c.id || null, base: {}, special: () => mtSaveClient(c, linkStop)};
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
  editing.mtDraft = c; editing.mtLink = linkStop;
}
const mtFormData = () => ({name: $('#mt-c-name').value.trim(), address: $('#mt-c-addr').value.trim(), lat: $('#mt-c-lat').value, lng: $('#mt-c-lng').value, phone: $('#mt-c-phone').value.trim(), note: $('#mt-c-note').value.trim()});
async function mtSaveClient(c, linkStop){
  const d = mtFormData(), w = $('#dlg-warn'), warn = t => { w.textContent = t; w.hidden = false; };
  if (!d.name){ $('#mt-c-name').focus(); return warn('Wpisz nazwę klienta.'); }
  const lat = d.lat==='' ? null : Number(d.lat), lng = d.lng==='' ? null : Number(d.lng);
  if ((lat==null) !== (lng==null) || (lat!=null && (!(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)))) return warn('Uzupełnij obie współrzędne albo wybierz adres z wyszukiwarki.');
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    const ref = c.id ? db.collection('clients').doc(c.id) : db.collection('clients').doc();
    await ref.set({name: d.name, address: d.address || null, lat, lng, phone: d.phone || null, note: d.note || null});
    if (linkStop) await db.collection('routeStops').doc(linkStop).update({clientId: ref.id, client: d.name, address: d.address || null});
    closeForm(); toast(c.id ? 'Zapisano klienta' : 'Dodano klienta');
    if (mtMap && lat!=null) mtMap.setView([lat, lng], Math.max(mtMap.getZoom(), 13));
    render();
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}
async function mtDelClient(c){
  const used = mtRoutes().filter(r => r.startClientId===c.id || r.endClientId===c.id || mtStops(r.id).some(s => s.clientId===c.id));
  if (!mtDelClient.armed || mtDelClient.armed!==c.id){ mtDelClient.armed = c.id; const w = $('#dlg-warn'); w.textContent = used.length ? `Klient jest na trasach: ${used.map(r => r.code).join(', ')}. Przystanki zostaną bez punktu na mapie. Kliknij „Usuń” jeszcze raz.` : 'Kliknij „Usuń” jeszcze raz, żeby usunąć klienta.'; w.hidden = false; return; }
  mtDelClient.armed = null;
  try { await db.collection('clients').doc(c.id).delete(); closeForm(); toast('Usunięto klienta'); render(); } catch(err){ handleWriteErr(err); }
}
document.addEventListener('click', e => {
  if (!editing || editing.col!=='mt-client') return;
  if (e.target.closest('#dlg-del') && editing.mtDel){ e.preventDefault(); e.stopImmediatePropagation(); editing.mtDel(); return; }
  if (e.target.closest('[data-mt-pick]')){
    if (!mtMap){ toast('Mapa jeszcze się wczytuje'); return; }
    mtPicking = {...editing.mtDraft, ...mtFormData(), id: editing.mtDraft.id, _link: editing.mtLink}; closeForm();
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
async function mtReorder(rid, list){ for (let i = 0; i < list.length; i++) if (list[i].pos!==i + 1) await db.collection('routeStops').doc(list[i].id).update({pos: i + 1}); }
async function mtAddStop(cid){
  const r = byId('routes', mtActive), c = mtClient(cid); if (!r || !c) return;
  const st = mtStops(r.id);
  await mtWrite(() => db.collection('routeStops').doc().set({routeId: r.id, pos: st.length + 1, client: c.name, address: c.address || null, phone: c.phone || null, note: c.note || null, clientId: c.id}));
  mtHidden.delete(r.id); mtSaveHidden(); mtTab = 'routes';
  if (mtMap) mtMap.closePopup();
  toast(`Dodano przystanek do ${r.code}`);
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-mt-tab],[data-mt-sel],[data-mt-fit],[data-mt-new-client],[data-mt-edit-client],[data-mt-locate],[data-mt-add],[data-mt-add-stop],[data-mt-up],[data-mt-down],[data-mt-del],[data-mt-retry],[data-mt-fix]');
  if (!t || t.closest('#dialog')) return;
  const d = t.dataset;
  if (d.mtTab){ mtTab = d.mtTab; render(); return; }
  if (d.mtSel){ mtActive = d.mtSel; render(); const pts = mtPoints(byId('routes', mtActive) || {}); if (mtMap && pts.length) mtMap.fitBounds(pts.map(p => [Number(p.c.lat), Number(p.c.lng)]), {padding: [40, 40], maxZoom: 14}); return; }
  if ('mtFit' in d){ mtFit(); return; }
  if ('mtNewClient' in d){ mtClientForm(); return; }
  if (d.mtEditClient){ const c = mtClient(d.mtEditClient); if (c){ if (mtMap) mtMap.closePopup(); mtClientForm(c); } return; }
  if (d.mtLocate){ const c = mtClient(d.mtLocate); if (!c) return; if (mtHasXY(c) && mtMap){ mtMap.setView([Number(c.lat), Number(c.lng)], 15); mtNotice(c.name + (c.address ? ' · ' + c.address : '')); } else mtClientForm(c); return; }
  if ('mtAdd' in d){ const v = $('#mt-add-sel') && $('#mt-add-sel').value; if (!v){ $('#mt-add-sel').focus(); return; } mtAddStop(v); return; }
  if (d.mtAddStop){ mtAddStop(d.mtAddStop); return; }
  if (d.mtRetry){ mtCalc.delete(d.mtRetry); render(); return; }
  if (d.mtFix){ const s = (S.routeStops || []).find(x => x.id===d.mtFix); if (s) mtClientForm({name: s.client, address: s.address, phone: s.phone, note: s.note}, s.id); return; }
  const id = d.mtUp || d.mtDown || d.mtDel; if (!id) return;
  const s = (S.routeStops || []).find(x => x.id===id); if (!s) return;
  const list = mtStops(s.routeId), i = list.findIndex(x => x.id===id);
  if (d.mtDel) return mtWrite(async () => { await db.collection('routeStops').doc(id).delete(); await mtReorder(s.routeId, mtStops(s.routeId)); });
  const j = d.mtUp ? i - 1 : i + 1; if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  mtWrite(() => mtReorder(s.routeId, list));
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.mtShow){ if (t.checked) mtHidden.delete(t.dataset.mtShow); else mtHidden.add(t.dataset.mtShow); mtSaveHidden(); mtDraw(); return; }
  if (t.dataset.mtStart) return mtWrite(() => db.collection('routes').doc(t.dataset.mtStart).update({startClientId: t.value || null}));
  if (t.dataset.mtEnd) return mtWrite(() => db.collection('routes').doc(t.dataset.mtEnd).update({endClientId: t.value || null}));
  if (t.dataset.mtColor) return mtWrite(() => db.collection('routes').doc(t.dataset.mtColor).update({color: t.value}));
});
document.addEventListener('input', e => {
  if (e.target.id!=='mt-filter') return;
  mtFilter = e.target.value;
  const pos = e.target.selectionStart; render();
  const f = $('#mt-filter'); if (f){ f.focus(); try { f.setSelectionRange(pos, pos); } catch(_){} }
});
document.addEventListener('keydown', e => {
  if (e.key==='Escape' && mtPicking){ const d = mtPicking; mtPicking = null; mtNotice(''); mtDraw(); mtClientForm(d, d._link); }
});
