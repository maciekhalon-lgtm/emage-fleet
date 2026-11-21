/* Emage FLEET — dzwonek kierownika: lista zdarzeń od kierowców (migracja 040, tabela events)
   Kierownik floty: zdania aut (na bazę / pod domem), tankowania wpisane przez kierowców, zgłoszone usterki.
   Kierownik serwisu: tylko usterki. „Przeczytane do” jest zapisane na koncie (event_reads) – wspólne dla telefonu i komputera.
   Na telefon (push) od razu: „Auto niesprawne” i podejrzane tankowanie – wysyła baza (private.push).
   Tu też: historia kierowcy (tankowania, przejęcia, zdania, usterki) – otwierana z karty kierowcy. */
'use strict';
let notifSeen = null, notifFilter = 'all', notifSeenLoaded = false;
const notifOn = () => !!(P().manage || P().service) && typeof optOn==='function' && optOn('events');
const NOTIF_KIND = {zdanie: ['Zdanie auta', 'truck'], tankowanie: ['Tankowanie', 'fuel'], usterka: ['Usterka', 'alert'], karta: ['Kontrola karty paliwowej', 'fuel'], zmiana: ['Zmiana auta', 'truck'], bak: ['Bak do wyjaśnienia', 'fuel']};
/* „Tankowanie z karty bez wpisu kierowcy” z jednego dnia → jeden wiersz (po imporcie bywa ich kilkadziesiąt) */
const NT_NOFILL = 'Tankowanie z karty bez wpisu';
function notifGroup(xs){
  const out = [], grp = new Map();
  xs.forEach(e => {
    if (e.kind!=='karta' || !String(e.title || '').startsWith(NT_NOFILL)){ out.push(e); return; }
    const day = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Warsaw'}).format(new Date(e.at));
    let g = grp.get(day);
    if (!g){ g = {id: 'g-' + day, kind: 'karta', at: e.at, alert: false, group: [], plates: new Set()}; grp.set(day, g); out.push(g); }
    g.group.push(e); if (String(e.at) > String(g.at)) g.at = e.at; g.alert = g.alert || e.alert;
    const pl = (String(e.title).split(':')[1] || '').trim(); if (pl) g.plates.add(pl);
  });
  grp.forEach(g => { const n = g.group.length;
    g.title = n===1 ? g.group[0].title : `Karta paliwowa: ${n} ${isPlural(n, 'tankowanie', 'tankowania', 'tankowań')} bez wpisu kierowcy`;
    g.body = n===1 ? g.group[0].body : [...g.plates].slice(0, 8).join(', ') + (g.plates.size > 8 ? ` i ${g.plates.size - 8} więcej` : '');
    if (n===1) Object.assign(g, {vehicleId: g.group[0].vehicleId, refId: g.group[0].refId}); else g.go = 'karty'; });
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
const notifList = () => notifGroup((S.events || []).filter(e => P().manage || e.kind==='usterka'));
async function notifLoadSeen(){
  if (notifSeenLoaded || !sb || !myId) return; notifSeenLoaded = true;
  try { const {data} = await sb.from('event_reads').select('seen_at').eq('user_id', myId).maybeSingle(); const row = Array.isArray(data) ? data[0] : data; notifSeen = row && row.seen_at ? row.seen_at : '1970-01-01T00:00:00Z'; render(); } catch(_){ notifSeen = '1970-01-01T00:00:00Z'; }
}
const notifUnread = () => { if (!notifOn()) return 0; if (notifSeen==null){ notifLoadSeen(); return 0; } return notifList().filter(e => String(e.at) > String(notifSeen)).length; };
const notifBadge = () => { const n = notifUnread(); return n ? `<span class="bell-n">${n > 99 ? '99+' : n}</span>` : ''; };
async function notifMarkRead(){
  const at = new Date().toISOString(); notifSeen = at;
  try { await sb.from('event_reads').upsert({user_id: myId, seen_at: at}); } catch(_){}
}
function notifRowGo(e){
  if (e.go) return `data-go="${esc(e.go)}"`;
  if (e.kind==='usterka' && e.refId && byId('issues', e.refId)) return `data-edit="issues" data-id="${esc(e.refId)}"`;
  if (e.kind==='tankowanie' && e.refId && byId('costs', e.refId)) return `data-edit="costs" data-id="${esc(e.refId)}"`;
  return e.vehicleId ? `data-card-go="${esc(e.vehicleId)}"` : '';
}
function notifHtml(){
  const all = notifList(), seen = String(notifSeen || '');
  const xs = all.filter(e => notifFilter==='all' || e.kind===notifFilter);
  const kinds = P().manage ? [['all', 'Wszystkie'], ['zdanie', 'Zdania aut'], ['tankowanie', 'Tankowania'], ['karta', 'Karty paliwowe'], ['zmiana', 'Zmiany aut'], ['bak', 'Bak'], ['usterka', 'Usterki']] : [['usterka', 'Usterki']];
  const tm = ts => { const d = new Date(ts), day = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Warsaw'}).format(d);
    return (day===today() ? 'dziś' : day===addDays(today(), -1) ? 'wczoraj' : fdate(day)) + ' ' + d.toLocaleTimeString('pl-PL', {hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw'}); };
  return `<div class="field full nt-head"><div class="seg">${kinds.map(([k, l]) => `<button type="button" class="small ${notifFilter===k || kinds.length===1 ? 'on' : ''}" data-nt-f="${k}">${l}</button>`).join('')}</div>
      <button type="button" class="small ghost" data-action="push-open">${ic('bell')}Powiadomienia na telefon</button></div>
    <div class="field full nt-list">${xs.slice(0, 200).map(e => { const [l, i] = NOTIF_KIND[e.kind] || ['', 'bell'], nw = String(e.at) > seen;
      return `<div class="nt-row ${nw ? 'new' : ''} ${e.alert ? 'alert' : ''}" ${notifRowGo(e)} tabindex="0"><span class="nt-ic">${ic(i)}</span>
        <span class="nt-t"><b>${esc(e.title)}</b>${e.body ? `<span class="sub">${esc(e.body)}</span>` : ''}<span class="sub">${esc(l)} · ${tm(e.at)}</span></span>
        ${notifFuelBtns(e) || (e.alert ? '<span class="pill bad">uwaga</span>' : nw ? '<span class="pill info">nowe</span>' : '')}</div>`; }).join('') || '<p class="muted sec-empty">Brak powiadomień z ostatnich 60 dni.</p>'}</div>`;
}
/* przejęcie z „pełnym bakiem” do wyjaśnienia – kierownik rozstrzyga jednym kliknięciem */
function notifFuelBtns(e){
  if (e.kind!=='bak' || !e.refId) return '';
  const b = byId('bookings', e.refId);
  if (!b) return '';
  if (!b.pickupFuelDoubt) return `<span class="pill ok">wyjaśnione · bak ${fuelLabel(b.pickup && b.pickup.fuel)}</span>`;
  return `<span class="nt-act"><button type="button" class="small" data-fuel-res="${esc(b.id)}" data-full="1">Był pełny</button><button type="button" class="small" data-fuel-res="${esc(b.id)}" data-full="0">Był niepełny</button></span>`;
}
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-fuel-res]'); if (!t) return;
  e.preventDefault(); e.stopPropagation();
  if (!P().manage) return;
  t.disabled = true;
  try {
    const {error} = await sb.rpc('resolve_pickup_fuel', {p_booking: t.dataset.fuelRes, p_full: t.dataset.full==='1'});
    if (error) throw error;
    await refresh('bookings'); await refresh('costs');
    if (editing && editing.col==='notif') $('#dlg-body').innerHTML = notifHtml();
    render();
    toast(t.dataset.full==='1' ? 'Zapisano: bak był pełny – od przejęcia liczymy spalanie' : 'Zapisano: bak był niepełny – spalanie od następnego tankowania do pełna');
  } catch(err){ t.disabled = false; handleWriteErr(err); }
}, true);
function openNotif(){
  if (!P().manage) notifFilter = 'usterka';
  editing = {col: 'notif', base: {}, special: () => closeForm()};
  $('#dialog').classList.add('dlg-wide');
  $('#dlg-title').textContent = 'Powiadomienia';
  $('#dlg-body').innerHTML = notifHtml();
  $('#dlg-save').textContent = 'Zamknij'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
  notifMarkRead().then(() => render());
}

/* ---------- historia kierowcy ---------- */
let dhKind = 'all', dhDays = 90;
function drvHistory(id){
  const t = today(), from = dhDays ? addDays(t, -(dhDays - 1)) : '0000';
  const out = [], profOf = new Set((typeof profiles!=='undefined' ? profiles : []).filter(p => p.driver_id===id || p.driverId===id).map(p => p.id));
  S.bookings.forEach(b => { if (!crewOf(b).includes(id)) return;
    if (b.pickup && b.pickup.at && b.pickup.at >= from) out.push({d: b.pickup.at, k: 'auta', t: 'Przejęcie ' + ((byId('vehicles', b.vehicleId) || {}).plate || ''), s: [b.pickup.km ? km(b.pickup.km) : '', b.routeId ? rLabel(b.routeId) : '', b.coDriverId ? 'obsada: ' + crewName(b) : ''].filter(Boolean).join(' · '), vid: b.vehicleId});
    if (b.returned && b.returned.at && b.returned.at >= from) out.push({d: b.returned.at, k: 'auta', t: 'Zdanie ' + ((byId('vehicles', b.vehicleId) || {}).plate || '') + (b.returned.home ? ' – pod domem' : ' – na bazę'), s: [b.returned.km ? km(b.returned.km) : '', b.pickup && b.pickup.km && b.returned.km > b.pickup.km ? '+' + new Intl.NumberFormat('pl-PL').format(b.returned.km - b.pickup.km) + ' km' : '', b.returned.note || ''].filter(Boolean).join(' · '), vid: b.vehicleId, pill: b.returned.home ? ['info', 'pod domem'] : null}); });
  appFuel().filter(c => (fillDriver(c) || c.driverId)===id && c.date >= from).forEach(c => out.push({d: c.date, k: 'paliwo', t: 'Tankowanie ' + ((byId('vehicles', c.vehicleId) || {}).plate || ''),
    s: [c.liters ? fl(c.liters) : '', c.amount ? new Intl.NumberFormat('pl-PL', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(c.amount) + ' ' + (c.currency || 'PLN') : '', c.odometer ? 'licznik ' + km(c.odometer) : '', c.station || ''].filter(Boolean).join(' · '),
    vid: c.vehicleId, edit: ['costs', c.id], pill: (c.flags || []).length ? ['bad', 'podejrzane'] : null}));
  S.issues.filter(i => i.date >= from && profOf.has(i.createdBy)).forEach(i => out.push({d: i.date, k: 'usterki', t: 'Usterka ' + ((byId('vehicles', i.vehicleId) || {}).plate || '') + ': ' + i.title,
    s: [(ISSUE_SEV[i.severity] || {}).l, (ISSUE_ST[i.status] || {}).l].filter(Boolean).join(' · '), vid: i.vehicleId, edit: ['issues', i.id], pill: i.severity==='stop' ? ['bad', 'niesprawne'] : null}));
  return out.sort((a, b) => b.d.localeCompare(a.d));
}
function openDrvHistory(id){
  const d = byId('drivers', id); if (!d) return;
  const all = drvHistory(id), xs = all.filter(x => dhKind==='all' || x.k===dhKind);
  const cnt = k => all.filter(x => x.k===k).length;
  editing = {col: 'drv-hist', id, base: {}, special: () => { closeForm(); openDriverCard(id); }};
  $('#dialog').classList.add('dlg-wide');
  $('#dlg-title').textContent = 'Historia – ' + d.name;
  const byDay = {}; xs.forEach(x => (byDay[x.d] = byDay[x.d] || []).push(x));
  $('#dlg-body').innerHTML = `<div class="field full nt-head"><div class="seg">${[['all', `Wszystko (${all.length})`], ['paliwo', `Tankowania (${cnt('paliwo')})`], ['auta', `Przejęcia i zdania (${cnt('auta')})`], ['usterki', `Usterki (${cnt('usterki')})`]].map(([k, l]) => `<button type="button" class="small ${dhKind===k ? 'on' : ''}" data-dh-k="${k}" data-dh-id="${esc(id)}">${l}</button>`).join('')}</div>
      <div class="seg">${[[30, '30 dni'], [90, '90 dni'], [365, 'rok'], [0, 'wszystko']].map(([n, l]) => `<button type="button" class="small ${dhDays===n ? 'on' : ''}" data-dh-d="${n}" data-dh-id="${esc(id)}">${l}</button>`).join('')}</div></div>
    <div class="field full nt-list">${Object.keys(byDay).map(day => `<div class="dh-day">${fdate(day)}</div>${byDay[day].map(x => `<div class="nt-row" ${x.edit && canEditDoc(x.edit[0], byId(x.edit[0], x.edit[1])) ? `data-edit="${x.edit[0]}" data-id="${esc(x.edit[1])}"` : ''} tabindex="0">
        <span class="nt-ic">${ic(x.k==='paliwo' ? 'fuel' : x.k==='usterki' ? 'alert' : 'truck')}</span><span class="nt-t"><b>${esc(x.t)}</b>${x.s ? `<span class="sub">${esc(x.s)}</span>` : ''}</span>${x.pill ? `<span class="pill ${x.pill[0]}">${x.pill[1]}</span>` : ''}</div>`).join('')}`).join('') || '<p class="muted sec-empty">Brak wpisów w wybranym okresie.</p>'}</div>`;
  $('#dlg-save').textContent = 'Wróć do karty'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
}

document.addEventListener('click', e => {
  const a = e.target.closest('[data-action="notif-open"]'); if (a){ e.preventDefault(); return openNotif(); }
  const f = e.target.closest('[data-nt-f]'); if (f){ notifFilter = f.dataset.ntF; $('#dlg-body').innerHTML = notifHtml(); return; }
  const k = e.target.closest('[data-dh-k]'); if (k){ dhKind = k.dataset.dhK; return openDrvHistory(k.dataset.dhId); }
  const dd = e.target.closest('[data-dh-d]'); if (dd){ dhDays = Number(dd.dataset.dhD); return openDrvHistory(dd.dataset.dhId); }
  const h = e.target.closest('[data-drv-hist]'); if (h){ e.preventDefault(); dhKind = 'all'; return openDrvHistory(h.dataset.drvHist); }
  const r = e.target.closest('#dialog .nt-row'); if (r){
    if (r.dataset.edit){ const col = r.dataset.edit, id = r.dataset.id; closeForm(); return openForm(col, id); }
    if (r.dataset.go){ closeForm(); location.hash = r.dataset.go; return; }
    if (r.dataset.cardGo){ const v = r.dataset.cardGo; closeForm(); cardTab = 'dane'; if (location.hash==='#pojazdy'){ tab = 'pojazdy'; cardId = v; render(); } else { pendingCard = v; location.hash = 'pojazdy'; } }
  }
});
