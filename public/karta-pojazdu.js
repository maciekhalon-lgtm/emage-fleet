/* Emage FLEET — karta pojazdu: pełna historia i dokumenty jednego auta */
'use strict';
let cardId = null, cardTab = 'dane';
const DOC_KINDS = ['Dowód rejestracyjny','Polisa OC','Polisa AC','Umowa leasingu','Faktura','Protokół przeglądu','Instrukcja','Inne'];
const DOC_TYPES = ['application/pdf','image/png','image/jpeg','image/webp','image/gif'];

function viewCard(){
  const v = byId('vehicles', cardId);
  if (!v){ cardId = null; return viewVehicles(); }
  const st = vehicleState(v);
  const t = today(), yr = t.slice(0,4);
  const VC = visibleCosts().filter(c => c.vehicleId===v.id);
  const yearCost = VC.filter(c => (c.date||'').startsWith(yr)).reduce((s,c) => s+Number(c.amount||0), 0);
  const cons = consumption(v.id);
  const add = (col, label) => canCreate(col) ? `<button class="small" data-new="${col}" data-veh="${esc(v.id)}">${label}</button>` : '';

  // dane auta w grupach: użycie, auto, opony i wyposażenie, ubezpieczenie i umowy
  const gpsLast = (S.gpsOdometer || []).filter(x => x.vehicleId===v.id).sort((a, b) => a.day < b.day ? 1 : -1)[0];
  const use30 = gpsLast && typeof utStats==='function' ? utStats(30).rows.find(r => r.v.id===v.id) : null;
  const F = (l, val, wide) => ({l, val, wide});
  const groups = [
    ['Przebieg i użycie', [F('Przebieg', km(v.km)),
      ...(gpsLast ? [F('Przebieg GPS', `<b>${km(Math.round(Number(gpsLast.km)))}</b> <span class="muted small">${fdate(gpsLast.day)}</span>`)] : []),
      ...(use30 ? [F('Ostatnie 30 dni', `<b>${new Intl.NumberFormat('pl-PL').format(Math.round(use30.km))} km</b> <span class="muted small">${use30.drive} ${isPlural(use30.drive,'dzień','dni','dni')} jazdy</span>`),
        F('Postój', use30.streak >= 3 ? `<span class="pill ${use30.streak >= 7 ? 'bad' : 'warn'}">stoi ${use30.streak} dni</span>` : '<span class="muted">jeździ</span>')] : []),
      F('Odpowiedzialni', (respOf(v).length?esc(respNames(v)):'<span class="muted">nikt</span>') + (typeof canResp==='function' && canResp() ? ` <button class="small ghost" data-resp="${esc(v.id)}">${respOf(v).length ? 'Zmień' : 'Przypisz'}</button>` : ''), true)]],
    ['Auto', [F('Rok', esc(v.year||'—')), F('Napęd', esc(v.fuel||'—')), F('Bak', (v.tankL || 90) + ' l'), F('Tachograf', v.hasTacho ? 'tak' : 'nie'),
      F('VIN', `<span class="num">${esc(v.vin||'—')}</span>`, true), ...(typeof warrantyFact==='function' && warrantyFact(v) ? [F('Gwarancja', warrantyFact(v), true)] : [])]],
    ['Opony i wyposażenie', [F('Opony', (typeof tiresFact==='function' && tiresFact(v)) || (v.tires ? TIRES[v.tires] : '—'), typeof tiresOn==='function' && tiresOn() && tiresOf(v.id).length),
      ...(tireSizeOn() ? [F('Rozmiar opon', v.tireSize ? `<b>${esc(v.tireSize)}</b>` : '<span class="muted">nie wpisano</span>')] : []),
      ...(typeof eqOn==='function' && eqOn() ? [F('Wyposażenie', equipmentFact(v), true)] : [])]],
    ['Ubezpieczenie i umowy', [F('Polisa', policyHtml(v), true), ...(typeof contractsOn==='function' && contractFact(v) ? [F('Umowa', contractFact(v), true)] : [])]],
  ];
  const facts = groups.map(([h, fs]) => `<section class="vf-group"><h4>${h}</h4><div class="facts vfacts">${fs.map(f => `<div class="${f.wide ? 'wide' : ''}"><span class="label">${f.l}</span><span class="fv">${f.val}</span></div>`).join('')}</div></section>`).join('');

  const dls = S.deadlines.filter(d => d.vehicleId===v.id).sort((a,b) => String(a.date||'9999').localeCompare(String(b.date||'9999')));
  const dlHtml = dls.map(d => { const s = dlState(d); return `<div class="mini ${canEditDoc('deadlines',d)?'click':''}" ${canEditDoc('deadlines',d)?`data-edit="deadlines" data-id="${esc(d.id)}"`:''}><span class="num">${d.date ? fdate(d.date) : d.kmDue ? km(d.kmDue) : '—'}</span><span>${esc(d.type)}${d.lastDoneKm ? `<span class="sub">ostatnio przy ${km(d.lastDoneKm)}</span>` : ''}</span><span class="pill ${s.cls}">${esc(s.txt)}</span></div>`; }).join('');

  const iss = S.issues.filter(i => i.vehicleId===v.id).sort((a,b) => (a.status==='naprawione') - (b.status==='naprawione') || (a.date<b.date?1:-1)).slice(0,6);

  const bks = S.bookings.filter(b => b.vehicleId===v.id).map(b => ({b, s:bookingState(b)}))
    .sort((x,y) => x.s.key-y.s.key || (x.s.key===2 ? (x.b.from<y.b.from?1:-1) : (x.b.from<y.b.from?-1:1)));
  const bkShow = bks.filter(x => x.s.key<2).concat(bks.filter(x => x.s.key===2).slice(0,3));
  const bkHtml = bkShow.map(({b,s}) => `<div class="mini ${canEditDoc('bookings',b)?'click':''}" ${canEditDoc('bookings',b)?`data-edit="bookings" data-id="${esc(b.id)}"`:''}><span class="num">${fdate(b.from)}${b.to!==b.from?'–'+fdate(b.to).slice(0,5):''}</span><span>${esc(dName(b.driverId))}${b.routeId?' · '+esc(rLabel(b.routeId)):''}${b.purpose?' · '+esc(b.purpose):''}</span><span class="mini-r"><span class="pill ${s.cls}">${s.txt}</span>${handoverBtn(b)}</span>${b.pickup?`<span class="mini-full">${handoverInfo(b)}</span>`:''}</div>`).join('');

  const docs = S.docs.filter(d => d.vehicleId===v.id).sort((a,b) => String(a.kind).localeCompare(b.kind,'pl'));
  const docHtml = docs.map(d => {
    const exp = d.validUntil ? diffDays(t, d.validUntil) : null;
    const pill = exp===null ? '' : exp<0 ? '<span class="pill bad">Nieważny</span>' : exp<=30 ? `<span class="pill warn">do ${fdate(d.validUntil)}</span>` : `<span class="pill off">do ${fdate(d.validUntil)}</span>`;
    return `<div class="mini doc"><span class="doc-ico" aria-hidden="true">${d.contentType==='application/pdf'?'PDF':'IMG'}</span>
      <span style="min-width:0"><b>${esc(d.kind)}</b><span class="sub">${esc(d.name||d.fileName||'')}</span></span>
      <span class="doc-act">${pill}${d.assetId?`<a class="btn small" data-file="${esc(d.assetId)}" href="#" target="_blank" rel="noopener">Otwórz</a>`:''}${canEditDoc('docs',d)?`<button class="small ghost" data-edit="docs" data-id="${esc(d.id)}" aria-label="Edytuj dokument">Edytuj</button>`:''}</span></div>`;
  }).join('');
  const canUpload = canCreate('docs');

  const hist = [];
  VC.filter(c => !c.virtual).forEach(c => hist.push({d:c.date, kind:c.category, cls:'soon', txt:esc(c.note||''), amt:zl2(c.amount), extra:c.liters?String(c.liters).replace('.',',')+(c.category==='Ładowanie'?' kWh':' l'):''}));
  S.issues.filter(i => i.vehicleId===v.id).forEach(i => {
    hist.push({d:i.date, kind:'Usterka', cls:'bad', txt:esc(i.title)});
    if (i.resolvedAt) hist.push({d:i.resolvedAt, kind:'Naprawa', cls:'ok', txt:esc(i.title)+(i.repairNote?' · '+esc(i.repairNote):'')});
  });
  S.bookings.filter(b => b.vehicleId===v.id && b.from<=t).forEach(b => hist.push({d:b.from, kind:'Przydział', cls:'info', txt:esc(dName(b.driverId))+(b.purpose?' · '+esc(b.purpose):'')}));
  const histHtml = hist.filter(h => h.d).sort((a,b) => a.d<b.d?1:a.d>b.d?-1:0).slice(0,40).map(h =>
    `<div class="tl"><span class="num muted">${fdate(h.d)}</span><span class="pill ${h.cls}">${esc(h.kind)}</span><span class="tl-txt">${h.txt}${h.extra?` <span class="muted">${h.extra}</span>`:''}</span><span class="num tl-amt">${h.amt||''}</span></div>`).join('');

  const svc = S.serviceEntries.filter(x => x.vehicleId===v.id).sort((a,b) => a.date<b.date?1:a.date>b.date?-1:0);
  const svcHtml = svc.map(x => `<div class="mini svc ${canEditDoc('serviceEntries',x)?'click':''}" ${canEditDoc('serviceEntries',x)?`data-edit="serviceEntries" data-id="${esc(x.id)}"`:''}>
      <span class="num">${fdate(x.date)}${x.km ? `<span class="sub">${km(x.km)}</span>` : ''}</span>
      <span style="min-width:0"><b>${esc(x.description)}</b><span class="sub">${[x.workshop, x.note].filter(Boolean).map(esc).join(' · ')}</span>
        <span class="svc-tags">${x.oilChange ? '<span class="pill soon">olej</span>' : ''}${x.timingChange ? '<span class="pill soon">rozrząd</span>' : ''}${(x.issueIds||[]).length ? `<span class="pill ok">usterki: ${x.issueIds.length}</span>` : ''}${x.deadlineId && byId('deadlines', x.deadlineId) ? `<span class="pill info">${esc(byId('deadlines', x.deadlineId).type)}</span>` : ''}</span></span>
      <span class="mini-r">${x.cost ? `<b class="num">${zl2(x.cost)}</b>` : ''}${x.assetId ? `<a class="btn small" data-file="${esc(x.assetId)}" href="#" target="_blank" rel="noopener">Faktura</a>` : ''}</span></div>`).join('');
  const sec = (title, btn, body, empty) => `<div class="panel"><div class="sec-head"><h3>${title}</h3>${btn||''}</div>${body || `<p class="muted sec-empty">${empty}</p>`}</div>`;

  // paliwo: tankowania z kart i wpisy kierowców, spalanie z całej historii
  const fc = fleetConsumptionFull(v.id);
  const cardFills = (S.fuelCardRows || []).filter(r => r.vehicleId===v.id && r.kind!=='other').sort((a, b) => (b.txDate + (b.txTime || '')).localeCompare(a.txDate + (a.txTime || ''))).slice(0, 30);
  const fuelHtml = cardFills.map(r => `<div class="mini"><span class="num">${fdate(r.txDate)}${r.txTime ? `<span class="sub">${esc(r.txTime)}</span>` : ''}</span>
      <span>${fl(r.liters)} · ${fm(r.amount, r.currency)}<span class="sub">${r.odometer ? km(r.odometer) : 'bez licznika'}${r.station ? ' · ' + esc(r.station) : ''}</span></span><span class="mini-r muted small">${r.gpsOk===false ? `<span class="pill bad" title="bus był ${esc(r.gpsPlace || '')}">GPS: ${r.gpsDistKm!=null ? Math.round(r.gpsDistKm) + ' km od stacji' : 'daleko'}</span>` : r.gpsOk===true ? '<span class="pill ok">GPS: przy stacji</span>' : 'karta'}</span></div>`).join('');
  const costRows = VC.filter(c => !c.virtual).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 40).map(c => `<div class="mini ${canEditDoc('costs', c) ? 'click' : ''}" ${canEditDoc('costs', c) ? `data-edit="costs" data-id="${esc(c.id)}"` : ''}>
      <span class="num">${fdate(c.date)}</span><span><b>${esc(c.category)}</b> <span class="muted small">${[c.liters ? String(c.liters).replace('.', ',') + ' l' : '', c.odometer ? km(c.odometer) : '', c.note].filter(Boolean).map(esc).join(' · ')}</span></span><span class="mini-r num"><b>${zl2(c.amount)}</b></span></div>`).join('');
  const openIss = iss.filter(i => i.status!=='naprawione').length, urgentDl = dls.filter(d => ['bad','warn'].includes(dlState(d).cls)).length;
  const tabs = [['dane','Dane', 0], ['serwis','Terminy i serwis', openIss + urgentDl], ['paliwo','Paliwo i koszty', 0], ['historia','Historia', 0]];
  const tabNav = `<nav class="subtabs card-tabs" aria-label="Karta pojazdu">${tabs.map(([k, l, n]) => `<a href="#" data-ctab="${k}" ${cardTab===k ? 'aria-current="page"' : ''}>${l}${n ? ` <span class="count bad">${n}</span>` : ''}</a>`).join('')}</nav>`;
  let body = '';
  const stdMiss = canCreate('deadlines') ? STD_DL.filter(t => !S.deadlines.some(d => d.vehicleId===v.id && d.type===t)) : [];
  const woBtn = (P().service || P().manage) && typeof woOn==='function' && woOn() ? `<div class="wo-bar"><button class="small" data-wo-veh="${esc(v.id)}">${ic('clip')}Zlecenie dla warsztatu</button><button class="small ghost" data-svc-info="${esc(v.id)}">${ic('plus')}Informacja serwisowa</button></div>` : P().service || P().manage ? `<div class="wo-bar"><button class="small" data-workorder="${esc(v.id)}">${ic('clip')}Zlecenie dla warsztatu (druk)</button></div>` : '';
  if (cardTab==='serwis') body = woBtn + (stdMiss.length ? `<div class="notice"><span>Brakuje podstawowych terminów: <b>${stdMiss.join(', ')}</b> – bez nich system nie przypomni o nich ani nie zablokuje auta po terminie.</span><button class="small" data-std-dl="${esc(v.id)}">Uzupełnij</button></div>` : '') + `<div class="grid2"><div class="section">
      ${typeof warrantyPanel==='function' ? warrantyPanel(v) : ''}${sec('Terminy', add('deadlines','+ Termin'), dlHtml, 'Brak zapisanych terminów.')}
      ${sec('Usterki', add('issues','+ Zgłoś'), iss.length ? `<div class="dl">${iss.map(i => issueRow(i, false)).join('')}</div>` : '', 'Brak zgłoszonych usterek.')}</div>
    <div class="section">${P().service ? sec('Historia napraw', add('serviceEntries','+ Wpis serwisowy'), svcHtml, 'Brak wpisów – zapisuj tu naprawy i wymiany: co zrobiono, przy jakim przebiegu, gdzie i za ile.') : ''}</div></div>`;
  else if (cardTab==='paliwo') body = (fc && fc.rate!=null && !fc.unsure && fc.rate > theftOf(v.id) ? `<div class="notice err"><span><b>Podejrzane spalanie: ${fc.rate.toFixed(1).replace('.', ',')} l/100 km</b> – powyżej ${String(theftOf(v.id)).replace('.', ',')} l/100 km dla tego auta to możliwa kradzież paliwa (albo tankowanie kartą innego auta). Sprawdź odcinki z najwyższym spalaniem poniżej.</span></div>` : '') + `<div class="facts">
      <div><span class="label">Średnie spalanie</span><span class="fv">${fc && fc.rate!=null ? `<b>${fc.rate.toFixed(1).replace('.', ',')} l/100 km</b> ${fc.unsure ? '<span class="pill off">niepewne</span>' : levelPill(levelFor(v.id, fc.rate))}` : '—'}</span></div>
      <div><span class="label">Policzone km</span><span class="fv">${fc && fc.km ? new Intl.NumberFormat('pl-PL').format(fc.km) + ' km' : '—'}</span></div>
      <div><span class="label">Źródło</span><span class="fv">${fc && fc.src ? 'wpisy kierowców (do pełna – do pełna)' : '—'}</span></div>
      <div><span class="label">${P().costs==='own' ? 'Moje koszty ' + yr : 'Koszty ' + yr}</span><span class="fv">${zl(yearCost)}</span></div></div>
    ${P().manage || P().reports ? sec('Koszt utrzymania – ostatnie 12 miesięcy', '', tcoHtml(v, VC), '') : ''}
    ${P().manage && typeof vehMonthsHtml==='function' ? sec('Km i koszty miesięcznie', `<a class="btn small ghost" href="#rozliczenie">Rozliczenie floty</a>`, vehMonthsHtml(v), '') : ''}
    ${P().manage && fc && fc.parts && fc.parts.length ? sec('Odcinki z najwyższym spalaniem', '', topLegsHtml(fc, v.id), '') : ''}
    ${P().manage && typeof fcSuspicious==='function' ? (sp => sp.length ? sec(`Niemożliwe tankowania z kart (${sp.length})`, `<button class="small" data-go="karty">Wszystkie</button>`, sp.slice(0, 8).map(({row: r, why}) => `<div class="mini"><span class="num">${fdate(r.txDate)}${r.txTime ? ' ' + esc(r.txTime) : ''}</span><span>${fl(r.liters)} · ${fm(r.amount, r.currency)}<span class="sub">${esc(fcDriver(r, null) || 'kierowca nieustalony')}${r.station ? ' · ' + esc(r.station) : ''}</span></span><span class="mini-r">${why.map(w => `<span class="pill warn">${esc(w)}</span>`).join(' ')}</span></div>`).join(''), '') : '')(fcSuspicious().filter(x => x.row.vehicleId===v.id && x.lvl==='bad' && !fcCheckedIds().has(x.row.id))) : ''}
    <div class="grid2"><div class="section">${P().manage ? sec('Tankowania z kart (ostatnie 30)', '', fuelHtml, 'Brak tankowań z kart paliwowych.') : ''}</div>
    <div class="section">${sec('Koszty (ostatnie 40)', add('costs','+ Koszt'), costRows, 'Brak kosztów.')}</div></div>`;
  else if (cardTab==='historia') body = (typeof vehOdoWhoHtml==='function' ? vehOdoWhoHtml(v.id) : '') + sec('Historia', '', histHtml ? `<div class="tlist">${histHtml}</div>` : '', 'Brak wpisów – tu pojawią się koszty, usterki, naprawy i wyjazdy tego auta.');
  else body = `<div class="vf-groups">${facts}</div><div class="grid2">
      <div class="section">${serviceOnly() ? '' : sec('Grafik', add('bookings','+ Przydział'), bkHtml, 'Brak przydziałów.')}${P().manage || P().service ? whoDroveHtml(v.id) : ''}</div>
      <div class="section">${sec('Dokumenty', canUpload ? `<button class="small" data-new="docs" data-veh="${esc(v.id)}">+ Dodaj plik</button>` : '', docHtml,
          'Brak dokumentów – dodaj skan dowodu rejestracyjnego, polisy lub umowy (PDF albo zdjęcie).')}</div></div>`;
  return `<div class="section">
    <div class="bar"><button class="ghost" data-back="1">← Wszystkie pojazdy</button>
      <div class="tools">${(P().manage || P().service) && canCreate('issues') ? `<button class="primary" data-new="issues" data-veh="${esc(v.id)}">${ic('alert')}Zgłoś usterkę</button>` : ''}${canEditDoc('vehicles',v)?`<button data-edit="vehicles" data-id="${esc(v.id)}">Edytuj dane</button>`:''}</div></div>
    <div class="card-head">${plate(v.plate)}<div><h2>${esc(v.make)} ${esc(v.model)}</h2><span class="muted">${km(v.km)}${v.notes ? ' · ' + esc(v.notes) : ''}</span></div><span class="pill ${st.cls}">${esc(st.txt)}</span></div>
    ${blockBanner(v)}
    ${(b => { if (!b) return ''; const ph = crewOf(b).map(id => [id, (byId('drivers', id) || {}).phone]);
      return `<div class="now-drv">${ic('key')}<span>Teraz jedzie: ${ph.map(([id, p]) => `<b>${esc(dName(id))}</b>${p ? ` <a class="btn small" href="tel:${esc(String(p).replace(/[^\d+]/g, ''))}" aria-label="Zadzwoń do ${esc(dName(id))}">${ic('phone')}${esc(p)}</a>` : ''}`).join(' · ')}${b.routeId ? ` · trasa ${esc(rLabel(b.routeId))}` : ''}${b.pickup && b.pickup.at ? ` · od ${fdate(b.pickup.at.slice(0, 10))}` : ''}</span></div>`; })(S.bookings.find(x => x.vehicleId===v.id && holds(x)))}
    ${tabNav}
    ${body}
  </div>`;
}
document.addEventListener('click', e => { const t = e.target.closest('[data-ctab]'); if (!t) return; e.preventDefault(); cardTab = t.dataset.ctab; render(); });
/* Spalanie auta z całej historii (także „niepewne”, żeby pokazać je w karcie) */
function fleetConsumptionFull(vid){ return typeof consRange==='function' ? consRange(vid, ALL_FROM, today()) : null; }

async function uploadDocFile(file){
  if (!assetsNS) throw {code:'no_assets'};
  if (!DOC_TYPES.includes(file.type)) throw {code:'bad_type'};
  if (file.size > 20*1024*1024) throw {code:'too_big'};
  return assetsNS.upload(file, {type: file.type});
}

/* Polisa: towarzystwo, numer, ważna do; assistance z przyciskiem „Zadzwoń” (tylko kierownicy) */
function policyHtml(v){
  const t = today(), parts = [v.insurer, v.policyNo].filter(Boolean).map(esc).join(' · ');
  let until = '';
  if (v.policyUntil){ const x = diffDays(t, v.policyUntil); until = `<div class="muted small" style="margin-top:2px">ważna do ${fdate(v.policyUntil)}${x < 0 ? ' <span class="pill bad">po terminie</span>' : x <= 30 ? ' <span class="pill warn">kończy się</span>' : ''}</div>`; }
  const tel = String(v.assistancePhone || '').replace(/[^\d+]/g, '');
  const call = (P().manage || P().service) && tel ? `<div class="muted small" style="margin-top:2px">assistance: <span class="num">${esc(v.assistancePhone)}</span></div><a class="btn small call" href="tel:${esc(tel)}">${ic('phone')}Zadzwoń</a>` : '';
  return (parts || (until ? '' : '—')) + until + call;
}

/* 10 odcinków (między tankowaniami) z najwyższym spalaniem – kto zatankował na końcu odcinka */
function topLegsHtml(fc, vid){
  const legs = fc.parts.filter(p => p.km >= 100).map(p => ({...p, r: p.l / p.km * 100})).sort((a, b) => b.r - a.r).slice(0, 10);
  return legs.map(p => `<div class="mini"><span class="num">${fdate(p.d0)} – ${fdate(p.d1)}</span>
    <span>${new Intl.NumberFormat('pl-PL').format(p.km)} km · ${fl(p.l)}<span class="sub">${esc(p.drv ? dName(p.drv) : 'kierowca nieustalony')}</span></span>
    <span class="mini-r"><b class="${p.r > (vid ? theftOf(vid) : THEFT_RATE) ? 'neg' : ''}">${p.r.toFixed(1).replace('.', ',')} l/100</b></span></div>`).join('');
}

/* Koszt utrzymania auta: 12 miesięcy w słupkach (paliwo / serwis / reszta), suma, koszt na km */
function tcoHtml(v, VC){
  const t = today(), months = [];
  const y0 = +t.slice(0, 4), m0 = +t.slice(5, 7) - 1;
  for (let i = 11; i >= 0; i--){ const k = y0 * 12 + m0 - i; months.push(`${Math.floor(k / 12)}-${String(k % 12 + 1).padStart(2, '0')}`); }
  const from = months[0] + '-01';
  const grp = c => c.category==='Paliwo' || c.category==='Ładowanie' ? 'fuel' : c.category==='Serwis i naprawy' || c.category==='Opony' ? 'svc' : 'oth';
  const per = months.map(m => { const xs = VC.filter(c => (c.date || '').startsWith(m)); const o = {m, fuel:0, svc:0, oth:0};
    xs.forEach(c => { o[grp(c)] += Number(c.amount || 0); }); o.sum = o.fuel + o.svc + o.oth; return o; });
  const total = per.reduce((s, x) => s + x.sum, 0), max = Math.max(1, ...per.map(x => x.sum));
  if (!total) return '<p class="muted sec-empty">Brak kosztów w ostatnich 12 miesiącach.</p>';
  const kmR = typeof odoRange==='function' ? (odoRange(v.id, from, t).km || 0) : 0;
  const sumOf = k => per.reduce((s, x) => s + x[k], 0);
  const MN = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];
  return `<div class="tco-f"><div><span class="label">Razem</span><b class="num">${zl(total)}</b></div><div><span class="label">Paliwo</span><b class="num">${zl(sumOf('fuel'))}</b></div><div><span class="label">Serwis i opony</span><b class="num">${zl(sumOf('svc'))}</b></div><div><span class="label">Pozostałe</span><b class="num">${zl(sumOf('oth'))}</b></div>
      <div><span class="label">Koszt na km</span><b class="num">${kmR > 500 ? (total / kmR).toFixed(2).replace('.', ',') + ' zł' : '—'}</b>${kmR > 500 ? `<span class="sub">${new Intl.NumberFormat('pl-PL').format(Math.round(kmR))} km</span>` : ''}</div></div>
    <div class="tco-ch" role="img" aria-label="Koszty w kolejnych miesiącach">${per.map(x => `<div class="tco-c" title="${x.m}: ${zl(x.sum)}"><div class="tco-b" style="height:${Math.round(x.sum / max * 100)}%">${['oth','svc','fuel'].map(k => x[k] ? `<i class="tco-${k}" style="flex:${x[k]}"></i>` : '').join('')}</div><span>${MN[+x.m.slice(5) - 1]}</span></div>`).join('')}</div>
    <div class="tco-lg"><span><i class="tco-fuel"></i>paliwo</span><span><i class="tco-svc"></i>serwis i opony</span><span><i class="tco-oth"></i>pozostałe</span></div>`;
}

/* Podstawowe terminy auta – szybkie uzupełnienie w jednym oknie */
const STD_DL = ['Przegląd techniczny','Ubezpieczenie OC','Serwis olejowy'];
function openStdDeadlines(vid){
  const v = byId('vehicles', vid) || {};
  const miss = STD_DL.filter(t => !S.deadlines.some(d => d.vehicleId===vid && d.type===t));
  editing = {col:'std-dl', id: vid, base:{}, special: saveStdDeadlines};
  $('#dlg-title').textContent = `Podstawowe terminy · ${v.plate || ''}`;
  $('#dlg-body').innerHTML = `<div class="field full"><span class="muted small">Wpisz daty z dowodu rejestracyjnego, polisy i ostatniej książki serwisowej. Puste pola pominiemy. Kolejne terminy po „Wykonane” ustawią się same (przegląd i OC co 12 mies., olej co 12 000 km – tylko według przebiegu).</span></div>
    ${miss.map((t, i) => t==='Serwis olejowy'
      ? `<div class="field"><label for="std-km">Serwis olejowy – przy przebiegu (km)</label><input id="std-km" type="number" inputmode="numeric" placeholder="${v.km ? 'np. ' + (Math.ceil((Number(v.km) + 12000) / 1000) * 1000) : ''}"></div><div class="field"></div>`
      : `<div class="field"><label for="std-${i}">${t} – do kiedy</label><input id="std-${i}" type="date" data-std-type="${esc(t)}" ${t==='Ubezpieczenie OC' && v.policyUntil ? `value="${v.policyUntil}"` : ''}></div><div class="field"></div>`).join('')}
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zapisz terminy'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
}
async function saveStdDeadlines(){
  const vid = editing.id, items = [...document.querySelectorAll('[data-std-type]')].filter(i => i.value).map(i => ({type: i.dataset.stdType, date: i.value}));
  const kmDue = Number(($('#std-km') || {}).value) || null;
  if (kmDue) items.push({type: 'Serwis olejowy', date: null});
  if (!items.length){ const w = $('#dlg-warn'); w.textContent = 'Wpisz co najmniej jedną datę albo przebieg oleju.'; w.hidden = false; return; }
  try {
    for (const it of items){ const def = DL_INTERVALS[it.type] || [12, null], oil = it.type==='Serwis olejowy';
      await db.collection('deadlines').doc().set({vehicleId: vid, type: it.type, date: oil ? null : it.date, intervalMonths: oil ? null : def[0], intervalKm: oil ? def[1] : null, kmDue: oil ? kmDue : null, remindKm: oil ? 2000 : null}); }
    closeForm(); toast(`Dodano ${items.length} ${isPlural(items.length,'termin','terminy','terminów')}`);
  } catch(err){ handleWriteErr(err); }
}
document.addEventListener('click', e => { const t = e.target.closest('[data-std-dl]'); if (!t) return; e.preventDefault(); openStdDeadlines(t.dataset.stdDl); });

/* Terminy całej floty w jednej tabeli: przegląd, OC (daty), olej i rozrząd (przy km) – wszystkie auta, wpisywanie hurtem
   albo wklejenie z Excela (kolumny: rejestracja, przegląd, OC, olej km, rozrząd km). Istniejące terminy można poprawić. */
const BULK_DL = ['Przegląd techniczny', 'Ubezpieczenie OC', 'Serwis olejowy', 'Wymiana rozrządu'];
const BULK_KM = t => t==='Serwis olejowy' || t==='Wymiana rozrządu';
const stdMissing = () => S.vehicles.filter(v => v.status!=='wycofany').map(v => ({v, miss: STD_DL.filter(t => !S.deadlines.some(d => d.vehicleId===v.id && d.type===t))})).filter(x => x.miss.length)
  .sort((a, b) => String(a.v.plate).localeCompare(b.v.plate));
const bulkMissing = () => S.vehicles.filter(v => v.status!=='wycofany' && BULK_DL.some(t => !S.deadlines.some(d => d.vehicleId===v.id && d.type===t)));
function openStdBulk(){
  const vs = S.vehicles.filter(v => v.status!=='wycofany');
  if (!vs.length) return toast('Brak aut');
  const has = (v, t) => S.deadlines.filter(d => d.vehicleId===v.id && d.type===t).sort((a, b) => (BULK_KM(t) ? (Number(a.kmDue) || 1e12) - (Number(b.kmDue) || 1e12) : String(a.date || '9').localeCompare(String(b.date || '9'))))[0];
  const miss = v => BULK_DL.filter(t => !has(v, t)).length;
  const list = vs.slice().sort((a, b) => (miss(b) > 0) - (miss(a) > 0) || String(a.plate).localeCompare(b.plate));
  editing = {col:'std-bulk', id: null, base:{}, special: saveStdBulk};
  const cell = (v, t) => { const d = has(v, t), val = d ? (BULK_KM(t) ? (d.kmDue || '') : (d.date || '')) : (t==='Ubezpieczenie OC' && v.policyUntil ? v.policyUntil : '');
    const attrs = `data-sb-veh="${esc(v.id)}" data-sb-type="${esc(t)}" data-sb-id="${d ? esc(d.id) : ''}" data-sb-orig="${d ? esc(String(val)) : ''}" aria-label="${esc(v.plate)} – ${esc(t)}"`;
    return `<td class="${d ? '' : 'sb-miss'}">${BULK_KM(t)
      ? `<input type="number" inputmode="numeric" ${attrs} value="${esc(String(val))}" placeholder="${v.km ? Math.ceil((Number(v.km) + (DL_INTERVALS[t] || [])[1]) / 1000) * 1000 : 'km'}" style="width:110px">`
      : `<input type="date" ${attrs} value="${esc(String(val))}">`}</td>`; };
  const nMiss = list.filter(v => miss(v) > 0).length;
  $('#dlg-title').textContent = `Terminy floty · ${vs.length} aut${nMiss ? ` · ${nMiss} z brakami` : ''}`;
  $('#dlg-body').innerHTML = `<p class="muted small field full" style="margin:0">Daty z dowodów rejestracyjnych i polis, olej i rozrząd – przebieg następnej wymiany. Na żółto brakujące. Puste pola pomijamy, wpisane już terminy możesz poprawić. Kolejne terminy po „Wykonane” ustawią się same (przegląd i OC co 12 mies., olej co ${new Intl.NumberFormat('pl-PL').format(DL_INTERVALS['Serwis olejowy'][1])} km, rozrząd co ${new Intl.NumberFormat('pl-PL').format(DL_INTERVALS['Wymiana rozrządu'][1])} km).</p>
    <details class="field full sb-paste"><summary>Wklej z Excela</summary>
      <p class="muted small" style="margin:6px 0">Skopiuj z Excela kolumny w tej kolejności: <b>rejestracja · przegląd do · OC do · olej przy km · rozrząd przy km</b> (puste komórki pomijamy). Wklej i kliknij „Wstaw do tabeli” – sprawdzisz przed zapisem.</p>
      <textarea id="sb-paste" rows="4" placeholder="DW 4VS52	15.03.2027	10.05.2027	125000	550000"></textarea>
      <button type="button" class="small" data-sb-fill>Wstaw do tabeli</button> <span class="muted small" id="sb-fill-msg"></span></details>
    <div class="field full tablewrap sb-wrap"><table class="sb-tbl"><thead><tr><th>Auto</th><th>Przegląd techniczny</th><th>Ubezpieczenie OC</th><th>Olej – przy km</th><th>Rozrząd – przy km</th></tr></thead><tbody>
    ${list.map(v => `<tr><td>${plate(v.plate)}<span class="sub">${esc([v.make, v.model].filter(Boolean).join(' '))}${v.km ? ' · ' + km(v.km) : ''}</span></td>${BULK_DL.map(t => cell(v, t)).join('')}</tr>`).join('')}
    </tbody></table></div><div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zapisz terminy'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
  $('#dialog')?.classList.add('dlg-wide');
}
/* wklejka z Excela → pola tabeli (bez zapisu) */
function sbParseDate(x){
  x = String(x || '').trim(); if (!x) return '';
  let m = x.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = x.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/); if (m) return `${m[3].length===2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{5}$/.test(x)){ const d = new Date(Math.round((Number(x) - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
  return null;
}
function sbFill(){
  const txt = ($('#sb-paste') || {}).value || '', np = p => String(p || '').toUpperCase().replace(/[\s-]+/g, '');
  let ok = 0; const bad = [];
  txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => {
    const c = l.split(/\t|;/).map(x => x.trim()), v = S.vehicles.find(x => np(x.plate)===np(c[0]));
    if (!v){ bad.push(c[0]); return; }
    BULK_DL.forEach((t, i) => { const raw = c[i + 1]; if (raw==null || raw==='') return;
      const inp = document.querySelector(`[data-sb-veh="${v.id}"][data-sb-type="${t}"]`); if (!inp) return;
      const val = BULK_KM(t) ? String(Math.round(Number(String(raw).replace(/[\s\u00a0]/g, '').replace(/km$/i, '').replace(',', '.'))) || '') : sbParseDate(raw);
      if (val){ inp.value = val; inp.closest('td').classList.add('sb-new'); } });
    ok++;
  });
  $('#sb-fill-msg').textContent = `Wstawiono ${ok} ${isPlural(ok, 'auto', 'auta', 'aut')}` + (bad.length ? ` · nie znaleziono: ${bad.join(', ')}` : '') + ' – sprawdź i kliknij „Zapisz terminy”.';
}
async function saveStdBulk(){
  const ins = [...document.querySelectorAll('[data-sb-type]')].filter(i => String(i.value).trim()!=='' && String(i.value).trim()!==i.dataset.sbOrig);
  if (!ins.length){ const w = $('#dlg-warn'); w.textContent = 'Nic się nie zmieniło – wpisz datę albo przebieg.'; w.hidden = false; return; }
  const btn = $('#dlg-save'); btn.disabled = true; let n = 0;
  try {
    for (const i of ins){ const t = i.dataset.sbType, vid = i.dataset.sbVeh, kmT = BULK_KM(t), val = kmT ? Number(i.value) || null : i.value, def = DL_INTERVALS[t] || [12, null];
      if (i.dataset.sbId) await db.collection('deadlines').doc(i.dataset.sbId).update(kmT ? {kmDue: val} : {date: val});
      else await db.collection('deadlines').doc().set({vehicleId: vid, type: t, date: kmT ? null : val, intervalMonths: kmT ? null : def[0], intervalKm: kmT ? def[1] : null, kmDue: kmT ? val : null,
        remindKm: t==='Serwis olejowy' ? 2000 : t==='Wymiana rozrządu' ? 5000 : null});
      n++; }
    closeForm(); toast(`Zapisano ${n} ${isPlural(n,'termin','terminy','terminów')}`);
  } catch(err){ handleWriteErr(err); if (n) toast(`Zapisano ${n} z ${ins.length} – reszta nie przeszła`); }
  finally { btn.disabled = false; }
}
document.addEventListener('click', e => { if (e.target.closest('[data-sb-fill]')){ e.preventDefault(); sbFill(); } });
document.addEventListener('click', e => { if (e.target.closest('[data-action="std-bulk"]')){ e.preventDefault(); openStdBulk(); } });

/* Kto jeździł tym autem w ostatnich 90 dniach (dni z grafiku) */
function whoDroveHtml(vid){
  const t = today(), from = addDays(t, -89), cnt = {};
  S.bookings.filter(b => b.vehicleId===vid && b.to>=from && b.from<=t).forEach(b => {
    bkDays(b, from, t).forEach(() => crewOf(b).forEach(x => { cnt[x] = (cnt[x] || 0) + 1; })); });
  const xs = Object.entries(cnt).sort((a, b) => b[1] - a[1]); if (!xs.length) return '';
  const max = xs[0][1];
  return `<div class="panel"><div class="sec-head"><h3>Kto jeździł – 90 dni</h3></div>${xs.slice(0, 8).map(([id, n]) => `<div class="mini"><span>${esc(dName(id))}</span><span class="wd-bar"><i style="width:${Math.round(n / max * 100)}%"></i></span><span class="mini-r num">${n} ${isPlural(n,'dzień','dni','dni')}</span></div>`).join('')}</div>`;
}

/* Zlecenie dla warsztatu: auto, otwarte usterki, terminy do zrobienia, miejsce na uwagi warsztatu i podpisy */
async function printWorkOrder(vid){
  const v = byId('vehicles', vid) || {}, t = today();
  const iss = S.issues.filter(i => i.vehicleId===vid && i.status!=='naprawione');
  const dls = S.deadlines.filter(d => d.vehicleId===vid).map(d => ({d, s: dlState(d)})).filter(x => x.s.d <= 45).sort((a, b) => a.s.d - b.s.d);
  let el = $('#print-area'); if (!el){ el = document.createElement('div'); el.id = 'print-area'; document.body.appendChild(el); }
  const box = '<span class="wo-box"></span>';
  el.innerHTML = `<div class="pa">
    <div class="pa-h"><div><b>Emage Group</b><span>Zlecenie dla warsztatu</span></div><div class="pa-r">${fdate(t)}</div></div>
    <h1>${esc(v.plate || '')} · ${esc([v.make, v.model].filter(Boolean).join(' '))}</h1>
    <table class="pa-t">
      <tr><th>VIN</th><td>${esc(v.vin || '')}</td></tr><tr><th>Rok / paliwo</th><td>${esc([v.year, v.fuel].filter(Boolean).join(' · '))}</td></tr>
      <tr><th>Przebieg przy oddaniu</th><td>${v.km ? km(v.km) : ''} &nbsp; (sprawdź: ______________ km)</td></tr>
      <tr><th>Opony</th><td>${v.tires ? esc(TIRES[v.tires] || '') : ''}</td></tr>
    </table>
    <h2>Do zrobienia</h2>
    <table class="pa-t wo-t"><tr><th style="width:24px"></th><th>Zakres</th><th style="width:30%">Uwagi warsztatu</th></tr>
      ${iss.map(i => `<tr><td>${box}</td><td><b>${esc(i.title)}</b>${i.description ? `<br><span class="pa-s">${esc(i.description).replace(/\n/g, '<br>')}</span>` : ''}</td><td></td></tr>`).join('')}
      ${dls.map(({d, s}) => `<tr><td>${box}</td><td><b>${esc(d.type)}</b><br><span class="pa-s">${esc(s.txt)}${d.kmDue ? ' · do ' + km(d.kmDue) : ''}</span></td><td></td></tr>`).join('')}
      ${[1, 2, 3].map(() => `<tr><td>${box}</td><td>&nbsp;</td><td></td></tr>`).join('')}
    </table>
    <h2>Koszt i części</h2><div class="pa-desc" style="min-height:90px"></div>
    <div class="pa-sign"><div>Zlecający (Emage)</div><div>Warsztat – przyjęcie</div><div>Odbiór auta</div></div>
    <p class="pa-f">Emage FLEET · po naprawie dodaj wpis w książce serwisowej – usterki i terminy zamkną się same.</p></div>`;
  document.documentElement.classList.add('print-doc');
  setTimeout(() => { window.print(); document.documentElement.classList.remove('print-doc'); }, 60);
}
document.addEventListener('click', e => { const t = e.target.closest('[data-workorder]'); if (!t) return; e.preventDefault(); printWorkOrder(t.dataset.workorder); });
