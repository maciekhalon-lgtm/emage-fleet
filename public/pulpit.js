/* Emage FLEET — pulpit: ekran startowy kierowników. Kierownik floty widzi całość, kierownik serwisu – naprawy, usterki i terminy. */
'use strict';
const sumOf = list => list.reduce((s, c) => s + Number(c.amount || 0), 0);
const pct = (a, b) => b ? Math.max(0, Math.min(100, a / b * 100)) : 0;

function kpi({label, icon, cls, value, small = '', bar = [], foot = '', go = '', dl = ''}){
  return `<button type="button" class="kpi" ${go ? `data-go="${go}"` : 'data-noop="1"'} ${dl ? `data-dl="${dl}"` : ''}>
    <span class="k-h">${label}<span class="k-ic ${cls}">${ic(icon)}</span></span>
    <b class="num">${value}${small ? `<small>${small}</small>` : ''}</b>
    <span class="kbar">${bar.map(([w, c]) => `<i class="${c}" style="width:${w.toFixed(1)}%"></i>`).join('')}</span>
    <span class="k-f">${foot}</span></button>`;
}
const attRow = (cls, vehId, title, sub, act = '') => `<div class="att-row">
  <i class="stripe ${cls}"></i>${vehId ? vPlate(vehId) : `<span class="att-ic ${cls}">${ic('alert')}</span>`}
  <div class="att-t"><b>${title}</b><span class="sub">${sub}</span></div><div class="att-act">${act}</div></div>`;
const card = (title, side, body, cls = '') => `<div class="panel dcard ${cls}"><div class="card-h"><h3>${title}</h3><span class="muted small">${side}</span></div>${body}</div>`;

/* Sprawy wymagające reakcji – kolejność: pilne, ważne, informacyjne */
function attentionItems(serviceOnly){
  const out = [];
  const canDl = d => canEditDoc('deadlines', d);
  const canIs = P().issues==='rw' && canWrite;
  blockedVehicles().forEach(({v, bl}) => out.push({w: bl.override ? 3 : 0, html: attRow(bl.override ? 'warn' : 'bad', v.id, bl.override ? 'Zgoda na wyjazd dziś' : 'Auto zablokowane', esc(bl.reason) + (bl.override ? ' · „' + esc(bl.override.reason) + '”' : ''),
    (!bl.override && P().manage ? `<button class="small" data-override="${esc(v.id)}">Zezwól dziś</button>` : '')
    + S.deadlines.filter(d => d.vehicleId===v.id && BLOCK_TYPES.includes(d.type) && d.date < today() && canEditDoc('deadlines', d)).map(d => `<button class="small" data-renew="${esc(d.id)}">${d.type==='Ubezpieczenie OC' ? 'OC odnowione' : 'Przegląd zrobiony'}</button>`).join(''))}));
  const tr = tireReminder();
  if (tr) out.push({w: tr.urgent ? 1 : 3, html: attRow(tr.urgent ? 'bad' : 'warn', '', `${tr.list.length} ${isPlural(tr.list.length,'auto','auta','aut')} ${tr.txt}`, tr.list.slice(0, 8).map(v => esc(v.plate)).join(', ') + (tr.list.length > 8 ? '…' : ''), canCreate('serviceEntries') ? `<button class="small" data-new="serviceEntries">Wpis serwisowy</button>` : '')});
  S.deadlines.forEach(d => {
    const s = dlState(d);
    if (s.cls!=='bad' && s.cls!=='warn') return;
    if (BLOCK_TYPES.includes(d.type) && d.date < today()) return;   // pokazane wyżej jako blokada auta
    out.push({w: s.cls==='bad' ? 0 : 2, html: attRow(s.cls, d.vehicleId, esc(d.type), `${fdate(d.date)} · ${esc(s.txt.toLowerCase())}`,
      canDl(d) ? `<button class="small" data-renew="${esc(d.id)}">Wykonane</button>` : '')});
  });
  openIssues().forEach(i => {
    if (i.severity!=='stop') return;   // pozostałe usterki są w karcie „Usterki do obsługi”
    const stop = i.severity==='stop';
    out.push({w: stop ? 0 : 1, html: attRow(stop ? 'bad' : 'warn', i.vehicleId, (stop ? 'Niesprawne: ' : 'Usterka: ') + esc(i.title),
      `${i.status==='naprawa' ? 'w naprawie · ' : ''}zgłosił(a) ${esc(i.createdBy ? pName(i.createdBy) : '—')} · ${fdate(i.date)}`,
      canIs && i.status==='nowe' ? `<button class="small" data-issue-st="naprawa" data-id="${esc(i.id)}">Do naprawy</button>` : `<button class="small ghost" data-go="usterki">Szczegóły</button>`)});
  });
  if (!serviceOnly){
    S.bookings.forEach(b => {
      const st = bookingState(b);
      if (st.txt==='Nie zwrócono') out.push({w:1, html: attRow('warn', b.vehicleId, 'Nie zostało zdane', `${esc(crewName(b))} · przydział do ${fdate(b.to)}`, canEditDoc('bookings', b) ? `<button class="small" data-edit="bookings" data-id="${esc(b.id)}">Szczegóły</button>` : '')});
      else if (st.key===0 && st.cls==='warn') out.push({w:3, html: attRow('info', b.vehicleId, st.txt, esc(crewName(b)), '')});
    });
    if (P().manage){
      const od = openDisputes().length, pr = pendingRequests().length, pu = pendingUsers().length;
      if (od) out.push({w:1, html: attRow('info', '', `${od} ${isPlural(od,'sporny wpis','sporne wpisy','spornych wpisów')} w podwójnej obsadzie`, 'czeka na Twoją decyzję', `<button class="small" data-go="uzytkownicy">Rozstrzygnij</button>`)});
      if (pr) out.push({w:3, html: attRow('info', '', `${pr} ${isPlural(pr,'zmiana danych','zmiany danych','zmian danych')} do akceptacji`, 'np. nowy numer telefonu kierowcy', `<button class="small" data-go="uzytkownicy">Sprawdź</button>`)});
      if (pu) out.push({w:3, html: attRow('info', '', `${pu} ${isPlural(pu,'nowe konto','nowe konta','nowych kont')} do zatwierdzenia`, 'nadaj rolę w Użytkownikach', `<button class="small" data-go="uzytkownicy">Zatwierdź</button>`)});
    }
    if (P().manage) flaggedCosts().slice(0, 6).forEach(c => out.push({w: c.flagState==='explain' ? 3 : 1, html: flagRow(c, true)}));
    if (flaggedCosts().length > 6) out.push({w:3, html: attRow('warn', '', `i ${flaggedCosts().length - 6} innych tankowań do wyjaśnienia`, 'pełna lista w Koszty i paliwo', `<button class="small" data-go="koszty">Pokaż</button>`)});
    if (P().reports){
      const la = limitAlerts();
      if (la.fleet) out.push({w: la.fleet.over ? 1 : 3, html: attRow(la.fleet.over ? 'bad' : 'warn', '', la.fleet.over ? 'Budżet floty przekroczony' : 'Budżet floty blisko limitu', `${zl(la.fleet.sum)} z ${zl(la.fleet.lim)} w tym miesiącu`, `<button class="small ghost" data-go="raporty">Raporty</button>`)});
      la.vehicles.forEach(x => out.push({w: x.over ? 2 : 3, html: attRow(x.over ? 'bad' : 'warn', x.v.id, x.over ? 'Limit kosztów przekroczony' : 'Blisko limitu kosztów', `${zl(x.sum)} z ${zl(x.lim)} w tym miesiącu`, `<button class="small ghost" data-go="raporty">Raporty</button>`)}));
    }
  }
  return out.sort((a, b) => a.w - b.w).map(x => x.html);
}
function attentionCard(serviceOnly){
  const items = attentionItems(serviceOnly);
  const body = items.length ? `<div class="att">${items.slice(0, 12).join('')}</div>${items.length > 12 ? `<p class="muted small more">i ${items.length - 12} więcej – zobacz w zakładkach Terminy i Usterki.</p>` : ''}`
    : `<div class="all-ok">${ic('check')}<div><b>Wszystko pod kontrolą</b><span class="muted">Nic nie wymaga dziś Twojej reakcji.</span></div></div>`;
  return card('Wymaga uwagi', items.length ? items.length+' '+isPlural(items.length,'sprawa','sprawy','spraw') : 'dziś', body, 'att-card');
}

function fleetNowCard(){
  const list = S.bookings.filter(holds).sort((a, b) => (b.pickup.at || '') < (a.pickup.at || '') ? -1 : 1);
  const rows = list.slice(0, 8).map(b => {
    const st = bookingState(b), v = byId('vehicles', b.vehicleId) || {};
    const since = v.km && b.pickup.km ? v.km - b.pickup.km : 0;
    return `<div class="fl-row" data-card-go="${esc(b.vehicleId)}" tabindex="0">${vPlate(b.vehicleId)}<div class="att-t"><b>${esc(crewName(b))}</b><span class="sub">${b.routeId ? esc(rLabel(b.routeId)) + ' · ' : ''}od ${fdate(b.pickup.at)}${since > 0 ? ' · ' + km(since) : ''}</span></div><span class="pill ${st.cls}" title="${esc(st.txt)}">${st.cls==='warn' ? 'Do potwierdzenia' : st.cls==='bad' ? 'Nie zdane' : b.coDriverId ? 'Obsada' : 'W trasie'}</span></div>`;
  }).join('');
  return card('Flota teraz', list.length ? list.length + ' w trasie' : 'w trasie',
    rows ? `<div class="fl">${rows}</div>${list.length > 8 ? `<p class="muted small more">i ${list.length - 8} więcej – zobacz Grafik.</p>` : ''}` : '<p class="muted sec-empty">Żadne auto nie jest teraz w trasie.</p>');
}



/* Kierownik serwisu: lista otwartych usterek z szybką zmianą statusu */
function issuesCard(){
  const sevO = {stop:0, istotna:1, drobna:2}, stO = {nowe:0, naprawa:1};
  const list = openIssues().sort((a, b) => (sevO[a.severity] - sevO[b.severity]) || (stO[a.status] - stO[b.status]) || (a.date < b.date ? 1 : -1));
  return card('Usterki do obsługi', list.length ? list.length + ' otwartych' : '',
    list.length ? `<div class="panel-in dl">${list.slice(0, 10).map(i => issueRow(i)).join('')}</div>${list.length > 10 ? `<p class="muted small more"><button class="link" data-go="usterki">Wszystkie usterki (${list.length})</button></p>` : ''}`
      : `<div class="all-ok">${ic('check')}<div><b>Brak otwartych usterek</b><span class="muted">Wszystkie zgłoszenia są naprawione.</span></div></div>`, 'flush');
}
function serviceCarsCard(){
  const list = S.vehicles.filter(v => v.status!=='wycofany' && (v.status==='serwis' || stopIssue(v.id)));
  return card('Auta w serwisie i niesprawne', list.length ? String(list.length) : '',
    list.length ? `<div class="fl">${list.map(v => { const st = vehicleState(v), si = stopIssue(v.id);
      return `<div class="fl-row" data-card-go="${esc(v.id)}" tabindex="0">${plate(v.plate)}<div class="att-t"><b>${esc(v.make)} ${esc(v.model)}</b><span class="sub">${si ? esc(si.title) : 'status: w serwisie'}</span></div><span class="pill ${st.cls}">${esc(st.txt.split(' – ')[0])}</span></div>`; }).join('')}</div>`
      : '<p class="muted sec-empty">Wszystkie auta są sprawne.</p>');
}
function deadlinesCard(){
  const list = S.deadlines.map(d => ({d, s: dlState(d)})).filter(x => x.s.d <= 30).sort((a, b) => a.s.d - b.s.d).slice(0, 8);
  return card('Terminy – 30 dni', '', list.length ? `<div class="fl">${list.map(({d, s}) => `<div class="fl-row" ${canEditDoc('deadlines', d) ? `data-edit="deadlines" data-id="${esc(d.id)}" tabindex="0"` : ''}>${vPlate(d.vehicleId)}<div class="att-t"><b>${esc(d.type)}</b><span class="sub">${fdate(d.date)}</span></div><span class="pill ${s.cls}">${esc(s.txt)}</span></div>`).join('')}</div>
    <p class="muted small more"><button class="link" data-go="terminy">Wszystkie terminy</button></p>` : '<p class="muted sec-empty">Brak terminów w najbliższych 30 dniach.</p>');
}

function viewDashboard(){
  if (!got.vehicles && db) return `<div class="panel empty"><p>Wczytywanie danych…</p></div>`;
  const service = !P().manage;   // kierownik serwisu
  const active = S.vehicles.filter(v => v.status!=='wycofany');
  const n = active.length || 1;
  const st = active.map(v => vehicleState(v).cls);
  const inUse = st.filter(c => c==='info').length + active.filter(v => vehicleState(v).txt.startsWith('Zdawanie')).length;
  const free = st.filter(c => c==='ok').length;
  const svc = active.filter(v => v.status==='serwis').length, stop = active.filter(v => v.status!=='serwis' && stopIssue(v.id)).length;
  const dls = S.deadlines.map(dlState);
  const over = dls.filter(s => s.d <= 0).length, soon30 = dls.filter(s => s.d <= 30).length;
  const crews = S.bookings.filter(b => holds(b) && b.coDriverId).length;
  const m = today().slice(0, 7), inM = S.costs.filter(c => (c.date || '').startsWith(m));
  const isRepair = c => c.category==='Serwis i naprawy' || c.category==='Opony';
  const d = new Date(), dateTxt = d.toLocaleDateString('pl-PL', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const head = `<div class="bar dash-head"><div><h1>Pulpit</h1><span class="muted">${esc(dateTxt)}${dbState==='live' ? ' · dane na żywo' : ''}</span></div>
    <div class="tools">${service
      ? (canCreate('serviceEntries') ? `<button data-new="serviceEntries">${ic('plus')}Wpis serwisowy</button>` : '') + (canCreate('issues') ? `<button class="primary" data-new="issues">${ic('plus')}Zgłoś usterkę</button>` : '')
      : (canCreate('bookings') ? `<button data-new="costs">${ic('plus')}Koszt</button><button class="primary" data-new="bookings">${ic('plus')}Przydział</button>` : '')}</div></div>`;
  const dlKpi = kpi({label:'Terminy 30 dni', icon:'clip', cls:'bad', value: soon30, bar:[[pct(over, Math.max(soon30, 1)), 'bad'], [pct(soon30 - over, Math.max(soon30, 1)), 'warn']], foot: over ? `${over} po terminie lub dziś` : 'wszystko na czas', go:'terminy', dl:'soon'});
  const svcKpi = kpi({label:'W serwisie', icon:'wrench', cls:'warn', value: svc + stop, bar:[[pct(svc + stop, n), 'warn']], foot: stop ? `${stop} ${isPlural(stop,'niesprawne','niesprawne','niesprawnych')} – usterka` : 'brak niesprawnych', go:'usterki'});

  if (service){
    const oi = openIssues(), nw = oi.filter(i => i.status==='nowe').length, rep = sumOf(inM.filter(isRepair));
    const kp = [
      kpi({label:'Otwarte usterki', icon:'alert', cls:'bad', value: oi.length, bar:[[pct(nw, Math.max(oi.length, 1)), 'bad'], [pct(oi.length - nw, Math.max(oi.length, 1)), 'warn']], foot: `${nw} ${isPlural(nw,'nowa','nowe','nowych')} · ${oi.length - nw} w naprawie`, go:'usterki'}),
      svcKpi, dlKpi,
      kpi({label:'Naprawy – ' + MONTHS_FULL[Number(m.slice(5)) - 1], icon:'coins', cls:'acc', value: zl(rep).replace(/\s?zł/, ''), small:' zł', bar:[], foot:'serwis, naprawy i opony', go:'koszty'}),
    ].join('');
    return `<div class="section dash">${head}<div class="kpis k4">${kp}</div>
      <div class="dgrid"><div class="dcol">${attentionCard(true)}${issuesCard()}</div><div class="dcol">${serviceCarsCard()}${deadlinesCard()}</div></div></div>`;
  }
  const mc = sumOf(inM), fb = Number(budget().monthly) || 0;
  const kp = [
    kpi({label:'W trasie', icon:'truck', cls:'info', value: inUse, small: '/' + active.length, bar:[[pct(inUse, n), 'info']], foot: crews ? `${crews} w podwójnej obsadzie` : 'bez podwójnej obsady', go:'przydzial'}),
    kpi({label:'Wolne', icon:'key', cls:'ok', value: free, bar:[[pct(free, n), 'ok']], foot:'gotowe do wydania', go:'pojazdy'}),
    svcKpi, dlKpi,
    kpi({label:'Koszty – ' + MONTHS_FULL[Number(m.slice(5)) - 1], icon:'fuel', cls:'acc', value: zl(mc).replace(/\s?zł/, ''), small:' zł', bar: fb ? [[pct(mc, fb), mc > fb ? 'bad' : 'acc']] : [], foot: fb ? `${Math.round(mc / fb * 100)}% budżetu ${zl(fb)}` : 'brutto, wszystkie auta', go:'koszty'}),
  ].join('');
  const myCar = canDrive() && typeof myActive==='function' ? myActive() : null;
  const myCarTile = myCar ? `<a class="tile" href="#moje"><span class="t-ic">${ic('key')}</span><span class="t-txt"><b>Prowadzisz ${esc(byId('vehicles', myCar.vehicleId)?.plate || '')}</b><span>Przejęte ${fdate(myCar.pickup.at)} · zatankuj albo zdaj pojazd w „Moje auto”</span></span>${ic('chev','chev')}</a>` : '';
  return `<div class="section dash">${head}${myCarTile}<div class="kpis">${kp}</div>
    <div class="dgrid"><div class="dcol">${attentionCard(false)}</div>
    <div class="dcol">${fleetNowCard()}</div></div></div>`;
}
