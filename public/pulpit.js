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
  // najbliższy (3 dni) nieprzejęty przydział auta – dopisujemy go do wiersza blokady / niesprawności zamiast osobnego wiersza
  const plan = !serviceOnly && P().bookings==='rw';
  const soonB = vid => plan ? S.bookings.filter(b => b.vehicleId===vid && !b.returned && !b.pickup && b.to >= today() && b.from <= addDays(today(), 3)).sort((a, b) => a.from < b.from ? -1 : 1)[0] : null;
  const whenB = b => b.from <= today() ? 'dziś' : b.from===addDays(today(), 1) ? 'jutro' : fdate(b.from).slice(0, 5);
  const bkTxt = b => b ? ` · <b class="neg">w grafiku ${whenB(b)}: ${esc(crewName(b))}</b>` : '';
  const bkBtn = b => b && canEditDoc('bookings', b) ? `<button class="small" data-edit="bookings" data-id="${esc(b.id)}">Zmień auto</button>` : '';
  const blockedIds = new Set();
  blockedVehicles().forEach(({v, bl}) => { if (!bl.override) blockedIds.add(v.id); const b = bl.override ? null : soonB(v.id);
    out.push({w: bl.override ? 3 : 0, html: attRow(bl.override ? 'warn' : 'bad', v.id, bl.override ? 'Zgoda na wyjazd dziś' : 'Auto zablokowane', esc(bl.reason) + (bl.override ? ' · „' + esc(bl.override.reason) + '”' : '') + bkTxt(b),
    bkBtn(b) + (!bl.override && P().manage ? `<button class="small" data-override="${esc(v.id)}">Zezwól dziś</button>` : '')
    + S.deadlines.filter(d => d.vehicleId===v.id && BLOCK_TYPES.includes(d.type) && d.date < today() && canEditDoc('deadlines', d)).map(d => `<button class="small" data-renew="${esc(d.id)}">${d.type==='Ubezpieczenie OC' ? 'OC odnowione' : 'Przegląd zrobiony'}</button>`).join(''))}); });
  if (P().manage && got.vehicles && got.drivers && typeof dqChecks==='function'){ const q = dqChecks();
    if (q.total && q.pct < 70) out.push({w: 2.5, html: attRow('warn', '', `Dane floty uzupełnione w ${q.pct}%`, 'brakuje m.in.: ' + esc(q.checks.slice(0, 3).map(c => c[1]==='VIN' ? c[1] : c[1][0].toLowerCase() + c[1].slice(1)).join(', ')) + ' – bez nich część alarmów nie działa', `<a class="btn small" href="#ustawienia" data-dq-open>Uzupełnij</a>`)}); }
  // auto w serwisie (bez usterki „stop”, ta ma własny wiersz niżej), a w grafiku na najbliższe 3 dni
  S.vehicles.filter(v => v.status==='serwis' && !stopIssue(v.id) && !blockedIds.has(v.id)).forEach(v => { const b = soonB(v.id); if (!b) return;
    out.push({w: b.from <= addDays(today(), 1) ? 0 : 1, html: attRow('bad', v.id, `Auto w serwisie, a w grafiku ${whenB(b)}: ${esc(crewName(b))}`, 'zmień auto w przydziale albo zakończ serwis', bkBtn(b))}); });
  // jutro (i dziś) w grafiku przydział z nieważnym przeglądem / OC albo dokumentami kierowcy
  if ((P().manage || P().bookings==='rw') && typeof bookingDayIssue==='function') [today(), addDays(today(), 1)].forEach((d, k) => S.bookings.filter(b => !b.returned && !b.pickup && b.from<=d && b.to>=d).forEach(b => {
    const iss = bookingDayIssue(b, d).filter(x => !(blockedIds.has(b.vehicleId) && x.includes(' auta '))); if (!iss.length) return;   // blokada auta jest już wyżej
    out.push({w: k ? 1 : 0, html: attRow('bad', b.vehicleId, `${k ? 'Jutro' : 'Dziś'} w grafiku: ${esc(crewName(b))}`, esc(iss.join(' · ')), canEditDoc('bookings', b) ? `<button class="small" data-edit="bookings" data-id="${esc(b.id)}">Zmień przydział</button>` : '')}); }));
  const tr = tireReminder();
  if (tr) out.push({w: tr.urgent ? 1 : 3, html: attRow(tr.urgent ? 'bad' : 'warn', '', `${tr.list.length} ${isPlural(tr.list.length,'auto','auta','aut')} ${tr.txt}`, tr.list.slice(0, 8).map(v => esc(v.plate)).join(', ') + (tr.list.length > 8 ? '…' : ''), canCreate('serviceEntries') ? `<button class="small" data-new="serviceEntries">Wpis serwisowy</button>` : '')});
  // nowe moduły (027–029): zużyte / stare opony na aucie, gaśnica po terminie lub brak, koniec umowy i limit km
  if (typeof tiresOn==='function' && tiresOn()) tireProblems().filter(x => x.t.location==='na_aucie' && x.v).forEach(({t, v, w}) => {
    const bad = w.some(([c]) => c==='bad');
    out.push({w: bad ? 1 : 3, html: attRow(bad ? 'bad' : 'warn', v.id, `Opony: ${esc(w.map(x => x[1]).join(', '))}`, esc(tireLabel(t)) + (t.brand ? ' · ' + esc(t.brand) : ''), `<button class="small ghost" data-go="opony">Opony</button>`)}); });
  if (typeof eqOn==='function' && eqOn()){ const byV = {};
    eqProblems().forEach(x => (byV[x.v.id] = byV[x.v.id] || []).push(x));
    Object.values(byV).forEach(xs => { const bad = xs.some(x => x.s.cls==='bad'), fire = xs.find(x => x.e.item==='Gaśnica');
      out.push({w: bad ? 1 : 3, html: attRow(bad ? 'bad' : 'warn', xs[0].v.id, fire && xs.length===1 ? `Gaśnica: ${esc(fire.s.txt)}` : `Wyposażenie: ${esc(xs.map(x => x.e.item).join(', '))}`, esc(xs.map(x => x.e.item + ' – ' + x.s.txt).join(' · ')),
        canEq() ? `<button class="small" data-eq="${esc(xs[0].v.id)}" data-item="${esc(xs[0].e.item)}">${xs[0].e.item==='Gaśnica' ? 'Nowa data' : 'Popraw'}</button>` : '')}); }); }
  if (!serviceOnly && typeof contractsOn==='function' && contractsOn()) contractProblems().forEach(({c, i}) => { const bad = i.warn.some(([cl]) => cl==='bad');
    out.push({w: bad ? 1 : 3, html: attRow(bad ? 'bad' : 'warn', c.vehicleId, `${esc(CONTRACT_KINDS[c.kind] || 'Umowa')}: ${esc(i.warn.map(x => x[1]).join(', '))}`, esc([c.provider, c.contractNo].filter(Boolean).join(' · ')) + (c.endDate ? ' · do ' + fdate(c.endDate) : ''), `<button class="small ghost" data-go="umowy">Umowy</button>`)}); });
  if (typeof planOn==='function' && planOn()) S.visits.filter(x => x.status==='zaplanowana' && (x.date < today() || (x.date <= addDays(today(), 3) && visitClash(x).length))).forEach(x => {
    const cl = visitClash(x), late = x.date < today();
    out.push({w: late ? 2 : 1, html: attRow(late ? 'warn' : 'bad', x.vehicleId, late ? `Wizyta w warsztacie minęła: ${esc(x.reason)}` : `Wizyta w warsztacie ${x.date===today() ? 'dziś' : fdate(x.date).slice(0, 5)}, a auto w grafiku`, late ? `${fdate(x.date)} – oznacz „w warsztacie”, zakończ albo przełóż` : `${esc(x.reason)} · w grafiku: ${esc(cl.map(crewName).join(', '))}`,
      (!late && cl[0] && canEditDoc('bookings', cl[0]) ? `<button class="small" data-edit="bookings" data-id="${esc(cl[0].id)}">Zmień auto</button>` : '') + `<button class="small ghost" data-go="plan">Plan serwisu</button>`)}); });
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
    const b = soonB(i.vehicleId);
    out.push({w: stop ? 0 : 1, html: attRow(stop ? 'bad' : 'warn', i.vehicleId, (stop ? 'Niesprawne: ' : 'Usterka: ') + esc(i.title),
      `${i.status==='naprawa' ? 'w naprawie · ' : ''}zgłosił(a) ${esc(i.createdBy ? pName(i.createdBy) : '—')} · ${fdate(i.date)}` + bkTxt(b),
      bkBtn(b) + (canIs && i.status==='nowe' ? `<button class="small" data-issue-st="naprawa" data-id="${esc(i.id)}">Do naprawy</button>` : `<button class="small ghost" data-go="usterki">Szczegóły</button>`))});
  });
  if (!serviceOnly && P().manage){
    theftVehicles().forEach(({v, c}) => out.push({w: 1, html: attRow('bad', v.id, `Podejrzane spalanie: ${c.rate.toFixed(1).replace('.', ',')} l/100 km`, `powyżej ${THEFT_RATE} l/100 km – możliwa kradzież paliwa · ${new Intl.NumberFormat('pl-PL').format(Math.round(c.km))} km`, `<button class="small" data-card-go="${esc(v.id)}" data-ctab-go="paliwo">Sprawdź</button>`)}));
    const noStd = S.deadlines.length || S.vehicles.length ? S.vehicles.filter(v => v.status!=='wycofany' && STD_DL.some(t => !S.deadlines.some(d => d.vehicleId===v.id && d.type===t))) : [];
    if (noStd.length && got.deadlines) out.push({w: 3, html: attRow('warn', noStd.length===1 ? noStd[0].id : '', `${noStd.length} ${isPlural(noStd.length,'auto bez','auta bez','aut bez')} podstawowych terminów`, noStd.length===1 ? 'przegląd, OC albo serwis olejowy – uzupełnij w karcie auta' : esc(noStd.slice(0, 6).map(v => v.plate).join(', ')) + (noStd.length > 6 ? '…' : '') + ' – przegląd, OC albo olej', noStd.length===1 ? `<button class="small" data-std-dl="${esc(noStd[0].id)}">Uzupełnij</button>` : `<button class="small" data-action="std-bulk">Uzupełnij wszystkie</button>`)});
    // przypomnienie o imporcie kart: dostawca, którego ostatnie zestawienie kończy się ponad 20 dni temu
    (typeof fcImportDue==='function' ? fcImportDue() : []).forEach(x => out.push({w: 2, html: attRow('warn', '', `Brak zestawienia kart ${esc(x.provider)} od ${fdate(x.from)}`, `ostatnie zaimportowane kończy się ${fdate(x.last)} – bez importu nie liczą się spalanie, średnie i alarmy tankowań`, `<button class="small" data-go="karty">Importuj</button>`)}));
    const spN = typeof suspTodoCount==='function' ? suspTodoCount() : 0; if (spN) out.push({w: 1, html: attRow('bad', '', `${spN} ${isPlural(spN,'niemożliwe tankowanie','niemożliwe tankowania','niemożliwych tankowań')} z kart`, 'więcej niż bak albo więcej, niż mogło wejść po poprzednim tankowaniu – sprawdź, kto miał kartę', `<button class="small" data-go="karty">Pokaż</button>`)});
    const odoN = odoTodoCount(); if (odoN) out.push({w: 2, html: attRow('warn', '', `${odoN} ${isPlural(odoN,'licznik','liczniki','liczników')} z czapy do sprawdzenia`, 'zmyślone albo niepasujące liczniki z kart i tankowań', `<button class="small" data-go="liczniki">Pokaż</button>`)});
  }
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
    if (flaggedCosts().length > 6) out.push({w:3, html: attRow('warn', '', `i ${flaggedCosts().length - 6} innych tankowań do wyjaśnienia`, 'pełna lista w zakładce Koszty', `<button class="small" data-go="koszty">Pokaż</button>`)});
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
  const t = today();
  const wait = S.bookings.filter(b => b.from<=t && b.to>=t && !b.pickup && !b.returned).sort((a, b) => crewName(a).localeCompare(crewName(b), 'pl'));
  const phoneOf = b => (byId('drivers', b.driverId) || {}).phone;
  const waitRows = wait.slice(0, 10).map(b => `<div class="fl-row">${vPlate(b.vehicleId)}<div class="att-t"><b>${esc(crewName(b))}</b><span class="sub">${b.routeId ? esc(rLabel(b.routeId)) : 'bez trasy'}${b.purpose ? ' · ' + esc(b.purpose) : ''}</span></div>
    ${phoneOf(b) ? `<a class="btn small" href="tel:${esc(String(phoneOf(b)).replace(/[^\d+]/g, ''))}" aria-label="Zadzwoń">${ic('phone')}</a>` : '<span class="pill soon">czeka</span>'}</div>`).join('');
  return card('Flota teraz', list.length ? list.length + ' w trasie' : 'w trasie',
    (rows ? `<div class="fl">${rows}</div>${list.length > 8 ? `<p class="muted small more">i ${list.length - 8} więcej – zobacz Grafik.</p>` : ''}` : '<p class="muted sec-empty">Żadne auto nie jest teraz w trasie.</p>')
    + (wait.length ? `<div class="fl-sub"><span class="label">Dziś w grafiku – jeszcze nie przejęte (${wait.length})</span></div><div class="fl">${waitRows}</div>` : ''));
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
      return `<div class="fl-row" data-card-go="${esc(v.id)}" tabindex="0">${plate(v.plate)}<div class="att-t"><b>${esc(v.make)} ${esc(v.model)}</b><span class="sub">${si ? esc(si.title) : 'status: w serwisie'}${si && si.date ? ` · od ${(n => n <= 0 ? 'dziś' : n + ' ' + isPlural(n,'dnia','dni','dni'))(diffDays(si.date, today()))}` : ''}${(b => b ? ` · <b class="neg">w grafiku ${b.from <= today() ? 'dziś' : fdate(b.from).slice(0, 5)}: ${esc(crewName(b))}</b>` : '')(S.bookings.filter(b => b.vehicleId===v.id && !b.returned && b.to >= today() && b.from <= addDays(today(), 3)).sort((a, b) => a.from < b.from ? -1 : 1)[0])}</span></div><span class="pill ${st.cls}">${esc(st.txt.split(' – ')[0])}</span></div>`; }).join('')}</div>`
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
  const m = today().slice(0, 7), inM = visibleCosts().filter(c => (c.date || '').startsWith(m));
  const isRepair = c => c.category==='Serwis i naprawy' || c.category==='Opony';
  const d = new Date(), dateTxt = d.toLocaleDateString('pl-PL', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const head = `<div class="bar dash-head"><div><h1>Pulpit</h1><span class="muted">${esc(dateTxt)}${dbState==='live' ? ' · dane na żywo' : ''}</span></div>
    <div class="tools">${service
      ? (canCreate('serviceEntries') ? `<button data-new="serviceEntries">${ic('plus')}Wpis serwisowy</button>` : '') + (canCreate('issues') ? `<button class="primary" data-new="issues">${ic('plus')}Zgłoś usterkę</button>` : '')
      : (P().manage ? `<button data-action="announce">${ic('bell')}Komunikat${annActive().length ? ` <span class="count">${annActive().length}</span>` : ''}</button>` : '') + (canCreate('bookings') ? `<button data-new="costs">${ic('plus')}Koszt</button><button class="primary" data-new="bookings">${ic('plus')}Przydział</button>` : '')}</div></div>`;
  const dlKpi = kpi({label:'Terminy 30 dni', icon:'clip', cls:'bad', value: soon30, bar:[[pct(over, Math.max(soon30, 1)), 'bad'], [pct(soon30 - over, Math.max(soon30, 1)), 'warn']], foot: over ? `${over} po terminie lub dziś` : 'wszystko na czas', go:'terminy', dl:'soon'});
  const svcKpi = kpi({label:'W serwisie', icon:'wrench', cls:'warn', value: svc + stop, bar:[[pct(svc + stop, n), 'warn']], foot: stop ? `${stop} ${isPlural(stop,'niesprawne','niesprawne','niesprawnych')} – usterka` : 'brak niesprawnych', go:'usterki'});

  if (service){
    const oi = openIssues(), nw = oi.filter(i => i.status==='nowe').length, rep = sumOf(inM.filter(isRepair));
    const kp = [
      kpi({label:'Otwarte usterki', icon:'alert', cls:'bad', value: oi.length, bar:[[pct(nw, Math.max(oi.length, 1)), 'bad'], [pct(oi.length - nw, Math.max(oi.length, 1)), 'warn']], foot: `${nw} ${isPlural(nw,'nowa','nowe','nowych')} · ${oi.length - nw} w naprawie`, go:'usterki'}),
      svcKpi, dlKpi,
      kpi({label:'Naprawy – ' + MONTHS_FULL[Number(m.slice(5)) - 1], icon:'coins', cls:'acc', value: zl(rep).replace(/\s?zł/, ''), small:' zł', bar:[], foot:'serwis, naprawy i opony', go:'koszty'}),
    ].join('');
    return `<div class="section dash">${head}${sinceLastVisit()}<div class="kpis k4">${kp}</div>
      <div class="dgrid"><div class="dcol">${attentionCard(true)}${issuesCard()}</div><div class="dcol">${serviceCarsCard()}${deadlinesCard()}</div></div></div>`;
  }
  const mc = sumOf(inM), fb = Number(budget().monthly) || 0;
  const att = attentionItems(false).length;
  const kp = [
    kpi({label:'W trasie', icon:'truck', cls:'info', value: inUse, small: '/' + active.length, bar:[[pct(inUse, n), 'info']], foot: `${free} wolnych · ${svc + stop} w serwisie`, go:'przydzial'}),
    kpi({label:'Wymaga uwagi', icon:'alert', cls: att ? 'bad' : 'ok', value: att, bar:[], foot: att ? 'blokady, terminy, usterki, tankowania' : 'wszystko w porządku', go:'pulpit'}),
    kpi({label:'Koszty – ' + MONTHS_FULL[Number(m.slice(5)) - 1], icon:'fuel', cls:'acc', value: zl(mc).replace(/\s?zł/, ''), small:' zł', bar: fb ? [[pct(mc, fb), mc > fb ? 'bad' : 'acc']] : [], foot: fb ? `${Math.round(mc / fb * 100)}% budżetu ${zl(fb)}` : 'brutto, wszystkie auta', go:'koszty'}),
  ].join('');
  const myCar = canDrive() && typeof myActive==='function' ? myActive() : null;
  const myCarTile = myCar ? `<a class="tile" href="#moje"><span class="t-ic">${ic('key')}</span><span class="t-txt"><b>Prowadzisz ${esc(byId('vehicles', myCar.vehicleId)?.plate || '')}</b><span>Przejęte ${fdate(myCar.pickup.at)} · zatankuj albo zdaj pojazd w „Moje auto”</span></span>${ic('chev','chev')}</a>` : '';
  return `<div class="section dash">${head}${sinceLastVisit()}${myCarTile}<div class="kpis k3">${kp}</div>
    <div class="dgrid"><div class="dcol">${attentionCard(false)}</div>
    <div class="dcol">${fleetNowCard()}</div></div></div>`;
}

/* „Od Twojej ostatniej wizyty” – krótkie podsumowanie nowości dla kierowników (pamiętane w tej przeglądarce) */
let sinceTs = null;
function sinceLastVisit(){
  if (!P().manage && !P().service) return '';
  if (sinceTs===null){ try { sinceTs = localStorage.getItem('ef-last-visit') || ''; localStorage.setItem('ef-last-visit', new Date().toISOString()); } catch(_){ sinceTs = ''; } }
  if (!sinceTs) return '';
  const after = x => (x.createdAt || '') > sinceTs;
  const iss = S.issues.filter(after), acc = iss.filter(i => /^Szkoda:/.test(i.title || ''));
  const fuel = S.costs.filter(c => after(c) && (c.category==='Paliwo' || c.category==='Ładowanie'));
  const ret = S.bookings.filter(b => b.returned && (b.returned.at || '') > sinceTs.slice(0, 10) && (b.updatedAt || '') > sinceTs);
  const items = [
    acc.length && [`${acc.length} ${isPlural(acc.length,'szkoda','szkody','szkód')}`, 'usterki', 'bad'],
    iss.length - acc.length > 0 && [`${iss.length - acc.length} ${isPlural(iss.length - acc.length,'nowa usterka','nowe usterki','nowych usterek')}`, 'usterki', 'warn'],
    fuel.length && [`${fuel.length} ${isPlural(fuel.length,'tankowanie','tankowania','tankowań')}`, 'koszty', ''],
    ret.length && [`${ret.length} ${isPlural(ret.length,'zdane auto','zdane auta','zdanych aut')}`, 'przydzial', ''],
  ].filter(Boolean);
  if (!items.length) return '';
  const d = new Date(sinceTs);
  return `<div class="since"><span class="muted small">Od ostatniej wizyty (${d.toLocaleDateString('pl-PL', {day:'numeric', month:'short'})} ${d.toLocaleTimeString('pl-PL', {hour:'2-digit', minute:'2-digit'})}):</span>${items.map(([t, go, cls]) => `<button class="small ${cls ? 'since-' + cls : ''}" data-go="${go}">${t}</button>`).join('')}</div>`;
}
