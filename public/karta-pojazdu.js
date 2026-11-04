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

  const facts = [
    ['Przebieg', km(v.km)], ['Rok', esc(v.year||'—')], ['Napęd', esc(v.fuel||'—')], ['Odpowiedzialni', respOf(v).length?esc(respNames(v)):'—'],
    ['VIN', `<span class="num">${esc(v.vin||'—')}</span>`], ['Polisa', policyHtml(v)], ['Tachograf', v.hasTacho ? 'tak' : 'nie'], ['Opony', v.tires ? TIRES[v.tires] : '—'], ['Bak', (v.tankL || 90) + ' l'], 
  ].map(([l,val]) => `<div><span class="label">${l}</span><span class="fv">${val}</span></div>`).join('');

  const dls = S.deadlines.filter(d => d.vehicleId===v.id).sort((a,b) => a.date<b.date?-1:1);
  const dlHtml = dls.map(d => { const s = dlState(d); return `<div class="mini ${canEditDoc('deadlines',d)?'click':''}" ${canEditDoc('deadlines',d)?`data-edit="deadlines" data-id="${esc(d.id)}"`:''}><span class="num">${fdate(d.date)}</span><span>${esc(d.type)}</span><span class="pill ${s.cls}">${esc(s.txt)}</span></div>`; }).join('');

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
  VC.forEach(c => hist.push({d:c.date, kind:c.category, cls:'soon', txt:esc(c.note||''), amt:zl2(c.amount), extra:c.liters?String(c.liters).replace('.',',')+(c.category==='Ładowanie'?' kWh':' l'):''}));
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
      <span>${fl(r.liters)} · ${fm(r.amount, r.currency)}<span class="sub">${r.odometer ? km(r.odometer) : 'bez licznika'}${r.station ? ' · ' + esc(r.station) : ''}</span></span><span class="mini-r muted small">karta</span></div>`).join('');
  const costRows = VC.slice().sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 40).map(c => `<div class="mini ${canEditDoc('costs', c) ? 'click' : ''}" ${canEditDoc('costs', c) ? `data-edit="costs" data-id="${esc(c.id)}"` : ''}>
      <span class="num">${fdate(c.date)}</span><span><b>${esc(c.category)}</b> <span class="muted small">${[c.liters ? String(c.liters).replace('.', ',') + ' l' : '', c.odometer ? km(c.odometer) : '', c.note].filter(Boolean).map(esc).join(' · ')}</span></span><span class="mini-r num"><b>${zl2(c.amount)}</b></span></div>`).join('');
  const openIss = iss.filter(i => i.status!=='naprawione').length, urgentDl = dls.filter(d => ['bad','warn'].includes(dlState(d).cls)).length;
  const tabs = [['dane','Dane', 0], ['serwis','Terminy i serwis', openIss + urgentDl], ['paliwo','Paliwo i koszty', 0], ['historia','Historia', 0]];
  const tabNav = `<nav class="subtabs card-tabs" aria-label="Karta pojazdu">${tabs.map(([k, l, n]) => `<a href="#" data-ctab="${k}" ${cardTab===k ? 'aria-current="page"' : ''}>${l}${n ? ` <span class="count bad">${n}</span>` : ''}</a>`).join('')}</nav>`;
  let body = '';
  if (cardTab==='serwis') body = `<div class="grid2"><div class="section">
      ${sec('Terminy', add('deadlines','+ Termin'), dlHtml, 'Brak zapisanych terminów.')}
      ${sec('Usterki', add('issues','+ Zgłoś'), iss.length ? `<div class="dl">${iss.map(i => issueRow(i, false)).join('')}</div>` : '', 'Brak zgłoszonych usterek.')}</div>
    <div class="section">${P().service ? sec('Książka serwisowa', add('serviceEntries','+ Wpis serwisowy'), svcHtml, 'Brak wpisów – zapisuj tu naprawy i wymiany: co zrobiono, przy jakim przebiegu, gdzie i za ile.') : ''}</div></div>`;
  else if (cardTab==='paliwo') body = `<div class="facts">
      <div><span class="label">Średnie spalanie</span><span class="fv">${fc && fc.rate!=null ? `<b>${fc.rate.toFixed(1).replace('.', ',')} l/100 km</b> ${fc.unsure ? '<span class="pill off">niepewne</span>' : levelPill(levelFor(v.id, fc.rate))}` : '—'}</span></div>
      <div><span class="label">Policzone km</span><span class="fv">${fc && fc.km ? new Intl.NumberFormat('pl-PL').format(fc.km) + ' km' : '—'}</span></div>
      <div><span class="label">Źródło</span><span class="fv">${fc && fc.src ? (fc.src==='karta' ? 'karty paliwowe' : 'wpisy kierowców') : '—'}</span></div>
      <div><span class="label">${P().costs==='own' ? 'Moje koszty ' + yr : 'Koszty ' + yr}</span><span class="fv">${zl(yearCost)}</span></div></div>
    <div class="grid2"><div class="section">${P().manage ? sec('Tankowania z kart (ostatnie 30)', '', fuelHtml, 'Brak tankowań z kart paliwowych.') : ''}</div>
    <div class="section">${sec('Koszty (ostatnie 40)', add('costs','+ Koszt'), costRows, 'Brak kosztów.')}</div></div>`;
  else if (cardTab==='historia') body = sec('Historia', '', histHtml ? `<div class="tlist">${histHtml}</div>` : '', 'Brak wpisów – tu pojawią się koszty, usterki, naprawy i wyjazdy tego auta.');
  else body = `<div class="facts">${facts}</div><div class="grid2">
      <div class="section">${sec('Grafik', add('bookings','+ Przydział'), bkHtml, 'Brak przydziałów.')}</div>
      <div class="section">${sec('Dokumenty', canUpload ? `<button class="small" data-new="docs" data-veh="${esc(v.id)}">+ Dodaj plik</button>` : '', docHtml,
          'Brak dokumentów – dodaj skan dowodu rejestracyjnego, polisy lub umowy (PDF albo zdjęcie).')}</div></div>`;
  return `<div class="section">
    <div class="bar"><button class="ghost" data-back="1">← Wszystkie pojazdy</button>
      <div class="tools">${canEditDoc('vehicles',v)?`<button data-edit="vehicles" data-id="${esc(v.id)}">Edytuj dane</button>`:''}</div></div>
    <div class="card-head">${plate(v.plate)}<div><h2>${esc(v.make)} ${esc(v.model)}</h2><span class="muted">${km(v.km)}${v.notes ? ' · ' + esc(v.notes) : ''}</span></div><span class="pill ${st.cls}">${esc(st.txt)}</span></div>
    ${blockBanner(v)}
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
