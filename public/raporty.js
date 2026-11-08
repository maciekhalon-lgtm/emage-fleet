/* Emage FLEET — raporty: koszt na kilometr, porównanie aut, limity kosztów, eksport do Excela */
'use strict';
let repMode = 'month', repMonth = today().slice(0,7), repYear = today().slice(0,4);
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let xlsxPromise = null;
function loadXLSX(){
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromise) xlsxPromise = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = XLSX_URL;
    s.onload = () => window.XLSX ? res(window.XLSX) : rej(new Error('xlsx'));
    s.onerror = () => { xlsxPromise = null; rej(new Error('xlsx')); };
    document.head.appendChild(s);
  });
  return xlsxPromise;
}

const budget = () => (S.settings.find(s => s.id==='budget') || {});

/* Odczyty licznika z tankowań, wydań i zwrotów: [{d, km}] */
function readings(vehId){
  const r = [];
  S.costs.forEach(c => { if (c.vehicleId===vehId && c.odometer) r.push({d:c.date, km:Number(c.odometer)}); });
  S.bookings.forEach(b => { if (b.vehicleId!==vehId) return; if (b.pickup && b.pickup.km) r.push({d:b.pickup.at, km:Number(b.pickup.km)}); if (b.returned && b.returned.km) r.push({d:b.returned.at, km:Number(b.returned.km)}); });
  const v = byId('vehicles', vehId);
  if (v && v.km) r.push({d:today(), km:Number(v.km), current:true});
  return r.filter(x => x.d && x.km).sort((a,b) => a.d<b.d?-1:a.d>b.d?1:a.km-b.km);
}
function kmInPeriod(vehId, start, end){
  const r = readings(vehId);
  const before = r.filter(x => x.d < start), inP = r.filter(x => x.d >= start && x.d <= end && !(x.current && end < today()));
  if (!inP.length) return null;
  const from = before.length ? Math.max(...before.map(x => x.km)) : Math.min(...inP.map(x => x.km));
  const to = Math.max(...inP.map(x => x.km));
  const d = to - from;
  return d > 0 ? d : null;
}
function periodRange(){
  if (repMode==='year') return [repYear+'-01-01', repYear+'-12-31', 'rok '+repYear];
  const [y,m] = repMonth.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return [repMonth+'-01', repMonth+'-'+pad(last), MONTHS_FULL[m-1]+' '+y];
}
function reportRows(){
  const [a, b] = periodRange();
  const inP = visibleCosts().filter(c => c.date >= a && c.date <= b);
  return S.vehicles.filter(v => v.status!=='wycofany' || inP.some(c => c.vehicleId===v.id)).map(v => {
    const cs = inP.filter(c => c.vehicleId===v.id);
    const cost = cs.reduce((s,c) => s+Number(c.amount||0), 0);
    const fuel = cs.filter(c => c.category==='Paliwo'||c.category==='Ładowanie').reduce((s,c) => s+Number(c.amount||0), 0);
    const kmD = typeof odoRange==='function' ? (odoRange(v.id, a, b).km || null) : kmInPeriod(v.id, a, b);
    const cons = consumption(v.id);
    const limit = Number(v.monthlyLimit) || 0;
    return {v, cost, fuel, km:kmD, perKm: kmD ? cost/kmD : null, cons, limit, cats: Object.fromEntries(COST_CATS.map(k => [k, cs.filter(c => c.category===k).reduce((s,c) => s+Number(c.amount||0), 0)]))};
  });
}

/* Ostrzeżenia o limitach w bieżącym miesiącu – używane też w powiadomieniach na górze strony */
function limitAlerts(){
  const m = today().slice(0,7);
  const inM = visibleCosts().filter(c => (c.date||'').startsWith(m));
  const out = [];
  S.vehicles.forEach(v => {
    const lim = Number(v.monthlyLimit); if (!lim) return;
    const sum = inM.filter(c => c.vehicleId===v.id).reduce((s,c) => s+Number(c.amount||0), 0);
    if (sum >= lim*0.9) out.push({v, sum, lim, over: sum > lim});
  });
  const fb = Number(budget().monthly);
  const fleet = fb ? {sum: inM.reduce((s,c) => s+Number(c.amount||0), 0), lim: fb} : null;
  return {vehicles: out, fleet: fleet && fleet.sum >= fleet.lim*0.9 ? {...fleet, over: fleet.sum > fleet.lim} : null};
}

function limitBar(sum, lim){
  if (!lim) return '<span class="muted">—</span>';
  const pct = sum/lim*100, cls = pct>100?'bad':pct>=90?'warn':'ok';
  return `<div class="lim"><div class="track"><div class="fill ${cls}" style="width:${Math.min(100,pct).toFixed(0)}%"></div></div><span class="num ${cls==='ok'?'muted':cls}">${pct.toFixed(0)}% z ${zl(lim)}</span></div>`;
}

function viewReports(){
  const [a, b, label] = periodRange();
  const rows = reportRows().sort((x,y) => (y.perKm??-1) - (x.perKm??-1) || y.cost-x.cost);
  const tot = rows.reduce((s,r) => ({cost:s.cost+r.cost, fuel:s.fuel+r.fuel, km:s.km+(r.km||0)}), {cost:0, fuel:0, km:0});
  const maxPK = Math.max(0.01, ...rows.map(r => r.perKm||0));
  const fb = Number(budget().monthly)||0;
  const head = `<div class="bar"><h2>Raporty</h2><div class="tools">
    <div class="seg" role="group" aria-label="Okres"><button class="small ${repMode==='month'?'on':''}" data-rep="month">Miesiąc</button><button class="small ${repMode==='year'?'on':''}" data-rep="year">Rok</button></div>
    ${repMode==='month' ? `<input id="rep-month" type="month" value="${repMonth}" style="width:auto" aria-label="Miesiąc">` : `<select id="rep-year" style="width:auto" aria-label="Rok">${[0,1,2,3].map(i => String(Number(today().slice(0,4))-i)).map(y => `<option ${y===repYear?'selected':''}>${y}</option>`).join('')}</select>`}
    <button class="primary" data-action="export-xlsx">Pobierz raport (Excel)</button></div></div>`;
  if (!S.vehicles.length) return head + `<div class="panel empty"><p>Dodaj pojazdy i koszty, aby zobaczyć raporty.</p></div>`;
  const budgetBox = repMode==='month' && fb ? `<div class="panel budget"><div><span class="label">Budżet floty / miesiąc</span><b>${zl(fb)}</b></div><div style="flex:1;min-width:220px">${limitBar(tot.cost, fb)}</div></div>` : '';
  return head + `<div class="section">
    <div class="panel"><div class="totals">
      <div><span class="label">Koszty – ${label}</span><b>${zl(tot.cost)}</b></div>
      <div><span class="label">W tym paliwo i ładowanie</span><b>${zl(tot.fuel)}</b></div>
      <div><span class="label">Przejechane</span><b>${tot.km ? new Intl.NumberFormat('pl-PL').format(tot.km)+' km' : '—'}</b></div>
      <div><span class="label">Średni koszt / km</span><b>${tot.km ? zl2(tot.cost/tot.km).replace(/\s?zł/,'')+' zł' : '—'}</b></div>
    </div></div>
    ${budgetBox}
    ${fleetTrendSection()}
    ${utilSection()}
    ${fleetAgeSection()}
    <div class="panel tablewrap"><table><thead><tr><th>Pojazd</th><th class="r">Koszty</th><th class="r">Paliwo</th><th class="r">Przejechane</th><th>Koszt / km</th>${repMode==='month'?'<th>Limit miesięczny</th>':''}</tr></thead><tbody>
      ${rows.filter(r => r.cost > 0 || r.km || r.limit).map(r => `<tr class="click" data-card-go="${esc(r.v.id)}"><td>${plate(r.v.plate)}<span class="sub">${esc(r.v.make+' '+r.v.model)}</span></td>
        <td class="r num">${zl(r.cost)}</td><td class="r num">${zl(r.fuel)}</td><td class="r num">${r.km ? new Intl.NumberFormat('pl-PL').format(r.km)+' km' : '<span class="muted">—</span>'}</td>
        <td style="min-width:170px">${r.perKm ? `<div class="pk"><div class="track"><div class="fill" style="width:${(r.perKm/maxPK*100).toFixed(0)}%"></div></div><span class="num">${r.perKm.toFixed(2).replace('.',',')} zł</span></div>` : '<span class="muted">brak odczytów licznika</span>'}</td>
        ${repMode==='month' ? `<td style="min-width:170px">${limitBar(r.cost, r.limit)}</td>` : ''}</tr>`).join('')}
    </tbody></table>${rows.some(r => !(r.cost > 0 || r.km || r.limit)) ? `<p class="muted small sec-empty">Pominięto auta bez kosztów i przebiegu w tym okresie.${repMode==='month' && P().manage ? ' Pełne rozliczenie każdego auta (z kosztami ogólnymi floty): <a href="#rozliczenie">Rozliczenie aut</a>.' : ''}</p>` : ''}</div>
    ${routeReportSection()}
    <p class="muted" style="margin:0;font-size:13px;max-width:90ch">Przejechane kilometry liczymy ze wszystkich liczników (karty paliwowe, tankowania, przejęcie i zdanie auta) – złe liczniki są pomijane. Spalanie i porównanie kierowców – w menu Paliwo. Im częściej są wpisywane, tym dokładniejszy koszt na kilometr. Kliknij auto, aby otworzyć jego kartę.</p>
  </div>`;
}

async function saveBudget(){
  const v = Number($('#budget-in')?.value || 0);
  try {
    await db.collection('settings').doc('budget').set({monthly: v || null, updatedAt: new Date().toISOString(), updatedBy: myId || ''});
    toast('Zapisano budżet');
  } catch(err){ handleWriteErr(err); }
}

async function saveFile(filename, data){
  const blob = data instanceof Blob ? data : new Blob([data], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function exportXlsx(){
  let X;
  try { X = await loadXLSX(); } catch(_){ toast('Nie udało się wczytać modułu Excel – sprawdź połączenie'); return; }
  const [a, b, label] = periodRange();
  const rows = reportRows();
  const sum = rows.map(r => ({'Rejestracja': r.v.plate, 'Pojazd': r.v.make+' '+r.v.model, 'Koszty brutto (zł)': +r.cost.toFixed(2), 'W tym paliwo (zł)': +r.fuel.toFixed(2),
    'Przejechane km': r.km || '', 'Koszt na km (zł)': r.perKm ? +r.perKm.toFixed(2) : '', 'Śr. zużycie': r.cons ? +r.cons.val.toFixed(1) : '', 'Jednostka zużycia': r.cons ? r.cons.unit : '',
    'Limit miesięczny (zł)': r.limit || '', ...Object.fromEntries(COST_CATS.map(k => [k+' (zł)', +r.cats[k].toFixed(2)]))}));
  const entries = visibleCosts().filter(c => c.date >= a && c.date <= b).sort((x,y) => x.date<y.date?-1:1).map(c => ({
    'Data': fdate(c.date), 'Rejestracja': byId('vehicles', c.vehicleId)?.plate || '', 'Kategoria': c.category, 'Kwota brutto (zł)': Number(c.amount||0),
    'Ilość (l/kWh)': c.liters || '', 'Stan licznika (km)': c.odometer || '', 'Trasa': rLabel(c.routeId), 'Stacja': c.station || '', 'Waluta': c.currency || 'PLN', 'Kwota w walucie': c.currency && c.currency!=='PLN' ? Number(c.amountOrig||0) : '',
    'Kurs': c.fxRate ? Number(c.fxRate) : '', 'Data kursu': c.fxDate ? fdate(c.fxDate) : '', 'Tabela NBP': c.fxTable || '', 'Opis': c.note || '', 'Dodał(a)': c.createdBy ? pName(c.createdBy) : ''}));
  const wb = X.utils.book_new();
  const ws1 = X.utils.json_to_sheet(sum.length ? sum : [{'Informacja':'Brak danych w okresie'}]);
  ws1['!cols'] = Object.keys(sum[0]||{a:1}).map(k => ({wch: Math.max(12, k.length+2)}));
  X.utils.book_append_sheet(wb, ws1, 'Podsumowanie');
  const ws2 = X.utils.json_to_sheet(entries.length ? entries : [{'Informacja':'Brak kosztów w okresie'}]);
  ws2['!cols'] = [{wch:12},{wch:12},{wch:18},{wch:16},{wch:12},{wch:16},{wch:26},{wch:12},{wch:8},{wch:14},{wch:10},{wch:12},{wch:16},{wch:36},{wch:22}];
  X.utils.book_append_sheet(wb, ws2, 'Koszty');
  if (P().service){
    const se = S.serviceEntries.filter(x => x.date >= a && x.date <= b).sort((x,y) => x.date<y.date?-1:1).map(x => ({'Data': fdate(x.date), 'Rejestracja': byId('vehicles', x.vehicleId)?.plate || '',
      'Przebieg (km)': x.km || '', 'Warsztat': x.workshop || '', 'Co zrobiono': x.description || '', 'Koszt brutto (zł)': x.cost ? Number(x.cost) : '', 'Wymiana oleju': x.oilChange ? 'tak' : '', 'Wymiana rozrządu': x.timingChange ? 'tak' : '',
      'Naprawione usterki': (x.issueIds||[]).map(id => byId('issues', id)?.title || '').filter(Boolean).join('; '), 'Uwagi': x.note || ''}));
    const wsS = X.utils.json_to_sheet(se.length ? se : [{'Informacja':'Brak wpisów serwisowych w okresie'}]);
    wsS['!cols'] = [{wch:12},{wch:12},{wch:13},{wch:22},{wch:44},{wch:16},{wch:13},{wch:36},{wch:24}];
    X.utils.book_append_sheet(wb, wsS, 'Serwis');
  }
  if (S.routes.length){
    const rr = routeReportRows(a, b).map(x => ({'Kod trasy': x.r ? x.r.code : 'bez trasy', 'Nazwa': x.r ? x.r.name : '', 'Dni pracy': x.days, 'Przejechane km': x.km || '',
      'Koszty brutto (zł)': +x.cost.toFixed(2), 'Paliwo (zł)': +x.fuelCost.toFixed(2), 'Paliwo (l)': +x.liters.toFixed(1), 'Spalanie orient. (l/100 km)': x.cons ? +x.cons.toFixed(1) : '', 'Koszt na km (zł)': x.perKm ? +x.perKm.toFixed(2) : ''}));
    const wsR = X.utils.json_to_sheet(rr.length ? rr : [{'Informacja':'Brak danych tras w okresie'}]);
    wsR['!cols'] = [{wch:12},{wch:28},{wch:10},{wch:14},{wch:16},{wch:12},{wch:11},{wch:22},{wch:15}];
    X.utils.book_append_sheet(wb, wsR, 'Trasy');
  }
  if (P().manage){
    const pct = (r, k) => r.levelKm ? Math.round(r.lv[k] / r.levelKm * 100) : '';
    const ds = driverStats(a, b).map(r => ({...r, ex: driverExtras(r.driverId, a, b)}))
      .sort((x, y) => (y.km >= RANK_MIN_KM) - (x.km >= RANK_MIN_KM) || (y.score ?? -1) - (x.score ?? -1))
      .map(r => ({'Kierowca': dName(r.driverId), 'Przejechane km': Math.round(r.km)||'', 'Dni pracy': r.ex.days, 'Wynik (0–100)': r.score ?? '',
        'Km bardzo dobre (%)': pct(r,'vgood'), 'Km dobre (%)': pct(r,'good'), 'Km słabe (%)': pct(r,'weak'),
        'Spalanie vs średnia aut (%)': r.vs===null ? '' : Math.round(r.vs*100), 'Spóźnione zdania': r.ex.late, 'Uwagi w checkliście': r.ex.ck, 'Zgłoszone usterki': r.ex.iss,
        'Tankowania': r.fills, 'Koszt paliwa (zł)': +r.fuelCost.toFixed(2), 'W rankingu': r.km >= RANK_MIN_KM ? 'tak' : 'nie (< 300 km)',
        'Auta': r.vehicles.map(x => (byId('vehicles',x.vid)?.plate||'')+': '+(x.rate?x.rate.toFixed(1)+' '+x.unit:'—')+(x.level?' ('+LEVELS[x.level].l+')':'')).join('; ')}));
    const ws3 = X.utils.json_to_sheet(ds.length ? ds : [{'Informacja':'Brak danych kierowców w okresie'}]);
    ws3['!cols'] = [{wch:24},{wch:14},{wch:10},{wch:12},{wch:16},{wch:12},{wch:12},{wch:22},{wch:14},{wch:16},{wch:14},{wch:11},{wch:15},{wch:16},{wch:60}];
    X.utils.book_append_sheet(wb, ws3, 'Ranking kierowców');
    if (typeof fcSuspicious==='function'){
      const ch = fcCheckedIds();
      const sp = fcSuspicious().filter(x => x.row.txDate >= a && x.row.txDate <= b).map(({row: r, why}) => ({'Data': fdate(r.txDate), 'Godzina': r.txTime || '', 'Rejestracja': byId('vehicles', r.vehicleId)?.plate || r.plate || '',
        'Kierowca (z grafiku)': fcDriver(r, null) || '', 'Litry': Number(r.liters || 0), 'Kwota': Number(r.amount || 0), 'Waluta': r.currency || 'PLN', 'Stacja': r.station || '', 'Licznik': r.odometer || '',
        'Powód': why.join('; '), 'Sprawdzone': ch.has(r.id) ? 'tak' : 'nie'}));
      if (sp.length){ const ws4 = X.utils.json_to_sheet(sp); ws4['!cols'] = [{wch:12},{wch:8},{wch:12},{wch:24},{wch:8},{wch:10},{wch:7},{wch:18},{wch:10},{wch:60},{wch:11}]; X.utils.book_append_sheet(wb, ws4, 'Podejrzane tankowania'); }
    }
  }
  const data = X.write(wb, {type:'array', bookType:'xlsx'});
  const tag = repMode==='year' ? repYear : repMonth;
  await saveFile(`Emage-FLEET-raport-${tag}.xlsx`, new Uint8Array(data));
}

/* Koszty całej floty – 12 miesięcy (paliwo / serwis i opony / pozostałe), ten sam wykres co w karcie auta */
function fleetTrendSection(){
  if (!P().manage && !P().reports) return '';
  const cs = visibleCosts();
  if (cs.length < 5 || typeof tcoHtml!=='function') return '';
  const html = tcoHtml({id:'__fleet__'}, cs).replace(/<div><span class="label">Koszt na km<\/span>[\s\S]*?<\/div>(?=<\/div>)/, '');
  return `<div class="panel"><div class="sec-head"><h3>Koszty floty – ostatnie 12 miesięcy</h3></div>${html}</div>`;
}

/* Wykorzystanie aut – ostatnie 30 dni: ile dni roboczych auto było w grafiku i ile przejechało.
   Auta, które prawie stoją, to kandydaci do przesunięcia, wynajmu albo sprzedaży. */
function utilSection(){
  if (!P().manage || !S.bookings.length) return '';
  const t = today(), first = S.bookings.reduce((m, b) => !m || b.from < m ? b.from : m, ''), from = first > addDays(t, -29) ? first : addDays(t, -29);   // grafik prowadzony krócej niż 30 dni → liczymy od jego początku
  const days = []; for (let d = from; d <= t; d = addDays(d, 1)){ const w = parse(d).getDay(); if (w && w < 6) days.push(d); }
  const vs = S.vehicles.filter(v => v.status!=='wycofany');
  if (vs.length < 2 || days.length < 5) return '';   // za krótki grafik – procenty nic nie mówią
  const rows = vs.map(v => {
    const bs = S.bookings.filter(b => b.vehicleId===v.id && b.to >= from && b.from <= t);
    const used = days.filter(d => bs.some(b => b.from <= d && b.to >= d)).length;
    const r = typeof odoRange==='function' ? odoRange(v.id, from, t) : null;
    return {v, used, pct: Math.round(used / days.length * 100), km: r && r.km > 0 ? r.km : 0};
  }).sort((a, b) => a.pct - b.pct || a.km - b.km);
  const avg = Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length);
  const low = rows.filter(r => r.pct < 30);
  return `<details class="panel fold"><summary class="sec-head"><h3>Wykorzystanie aut – 30 dni</h3><span class="muted small">średnio ${avg}% dni roboczych${low.length ? ` · <b class="neg">${low.length} ${isPlural(low.length,'auto prawie stoi','auta prawie stoją','aut prawie stoi')}</b>` : ''}</span></summary>
    ${rows.map(r => `<div class="mini click ut-row" data-card-go="${esc(r.v.id)}"><span>${plate(r.v.plate)}</span>
      <span class="ut-bar"><i style="width:${r.pct}%" class="${r.pct < 30 ? 'lo' : r.pct >= 80 ? 'hi' : ''}"></i></span>
      <span class="mini-r num"><b>${r.pct}%</b><span class="sub">${r.used}/${days.length} dni${r.km ? ' · ' + km(r.km) : ''}</span></span></div>`).join('')}
    <p class="muted small sec-empty">Dni robocze z przydziałem w grafiku (pon–pt). Poniżej 30% – warto przesunąć auto na inną trasę albo rozważyć, czy jest potrzebne.</p></details>`;
}

/* Stan floty i wymiana aut: wiek, przebieg, tempo km, naprawy i koszt/km z 12 miesięcy → kto do wymiany */
function fleetAgeRows(){
  const t = today(), y1 = addDays(t, -365), d90 = addDays(t, -90), yr = Number(t.slice(0, 4));
  const vs = S.vehicles.filter(v => v.status!=='wycofany');
  const costs = visibleCosts().filter(c => (c.date || '') >= y1);
  const isRep = c => c.category==='Serwis i naprawy' || c.category==='Opony';
  const rows = vs.map(v => {
    const my = costs.filter(c => c.vehicleId===v.id), rep = sumOf(my.filter(isRep)), all = sumOf(my);
    // tempo i koszt/km tylko z wiarygodnych odczytów: co najmniej 30 dni między pierwszym a ostatnim licznikiem
    const rate = (from) => { if (typeof odoRange!=='function') return null; const o = odoRange(v.id, from, t); if (!o.km || !o.first || !o.last) return null;
      const span = diffDays(o.first.d.slice(0, 10), o.last.d.slice(0, 10)); return span >= 30 ? {km: o.km, perM: o.km / span * 30} : null; };
    const r90 = rate(d90), r365 = rate(y1);
    const perM = (r90 || r365 || {}).perM || null, k365 = r365 && r365.km >= 2000 ? r365.km : null;
    const age = v.year ? yr - Number(v.year) : null, kmNow = Number(v.km) || null;
    const to300 = kmNow && perM && kmNow < 300000 ? Math.ceil((300000 - kmNow) / perM) : null;
    return {v, age, kmNow, perM, rep, all, perKm: k365 ? all / k365 : null, to300};
  });
  const pk = rows.filter(r => r.perKm), avgPK = pk.length ? pk.reduce((s, r) => s + r.perKm, 0) / pk.length : null;
  rows.forEach(r => { const why = [];
    if (r.kmNow >= 300000){ why.push([2, 'ponad 300 tys. km']); } else if (r.kmNow >= 250000) why.push([1, 'ponad 250 tys. km']);
    if (r.age >= 8) why.push([2, `${r.age} lat`]); else if (r.age >= 6) why.push([1, `${r.age} lat`]);
    if (r.rep >= 8000) why.push([2, 'drogie naprawy']); else if (r.rep >= 4000) why.push([1, 'naprawy']);
    if (avgPK && r.perKm > avgPK * 1.25) why.push([1, 'wysoki koszt/km']);
    r.score = why.reduce((s, x) => s + x[0], 0); r.why = why.map(x => x[1]); });
  return {rows: rows.sort((a, b) => b.score - a.score || (b.kmNow || 0) - (a.kmNow || 0)), avgPK};
}
function fleetAgeSection(){
  if (!P().manage && !P().service) return '';
  const {rows, avgPK} = fleetAgeRows(); if (rows.length < 2) return '';
  const nf = n => new Intl.NumberFormat('pl-PL').format(Math.round(n));
  const flag = rows.filter(r => r.score >= 4).length, watch = rows.filter(r => r.score >= 2 && r.score < 4).length;
  const kms = rows.filter(r => r.kmNow).map(r => r.kmNow), ages = rows.filter(r => r.age!=null).map(r => r.age);
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const verdict = r => r.score >= 4 ? '<span class="pill bad">do rozważenia wymiany</span>' : r.score >= 2 ? '<span class="pill warn">obserwuj</span>' : '<span class="pill ok">w porządku</span>';
  return `<details class="panel fold"><summary class="sec-head"><h3>Stan floty i wymiana aut</h3><span class="muted small">${flag ? `<b class="neg">${flag} do wymiany</b> · ` : ''}${watch ? watch + ' do obserwacji · ' : ''}średnio ${avg(kms) ? nf(avg(kms)) + ' km' : '—'}${avg(ages)!=null ? ', ' + avg(ages).toFixed(1).replace('.', ',') + ' lat' : ''}</span></summary>
    <div class="tablewrap"><table><thead><tr><th>Auto</th><th class="r">Rocznik</th><th class="r">Przebieg</th><th class="r">Km / miesiąc</th><th class="r">Naprawy 12 mies.</th><th class="r">Koszt / km</th><th class="r">300 tys. km</th><th>Ocena</th></tr></thead><tbody>
    ${rows.map(r => `<tr class="click" data-card-go="${esc(r.v.id)}"><td>${plate(r.v.plate)}<span class="sub">${esc([r.v.make, r.v.model].filter(Boolean).join(' '))}</span></td>
      <td class="r num">${r.v.year ? esc(r.v.year) + `<span class="sub">${r.age} ${isPlural(r.age,'rok','lata','lat')}</span>` : '<span class="muted">—</span>'}</td>
      <td class="r num">${r.kmNow ? nf(r.kmNow) + ' km' : '<span class="muted">—</span>'}</td>
      <td class="r num">${r.perM ? nf(r.perM) + ' km' : '<span class="muted">—</span>'}</td>
      <td class="r num">${r.rep ? zl(r.rep) : '<span class="muted">0 zł</span>'}</td>
      <td class="r num">${r.perKm ? r.perKm.toFixed(2).replace('.', ',') + ' zł' : '<span class="muted">—</span>'}</td>
      <td class="r num">${r.kmNow >= 300000 ? '<b class="neg">przekroczone</b>' : r.to300!=null ? (r.to300 <= 12 ? `<b class="neg">za ${r.to300} mies.</b>` : `za ${r.to300} mies.`) : '<span class="muted">—</span>'}</td>
      <td>${verdict(r)}${r.why.length ? `<span class="sub">${esc(r.why.join(', '))}</span>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted small sec-empty">Ocena: przebieg (250 / 300 tys. km), wiek (6 / 8 lat), koszty napraw i opon z 12 miesięcy (4 / 8 tys. zł) oraz koszt/km wyższy o 25% od średniej floty${avgPK ? ' (' + avgPK.toFixed(2).replace('.', ',') + ' zł/km)' : ''}. Tempo km z ostatnich 90 dni. To podpowiedź – decyzja zależy też od stanu auta.</p></details>`;
}
