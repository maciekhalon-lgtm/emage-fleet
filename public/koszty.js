/* Emage FLEET — Koszty: Podsumowanie (miesiąc floty netto) i Wydatki (lista wpisów z filtrami).
   Liczby w Podsumowaniu, Według aut (rozliczenie.js), raporcie dla zarządu i rankingu aut pochodzą z jednego miejsca: settleRange(). */
'use strict';
const expF = {veh: '', grp: '', drv: '', src: ''};
const EXP_FLEET = 'Koszty ogólne floty';
const monthLabel = m => { const [y, mm] = m.split('-').map(Number); return MONTHS_FULL[mm - 1] + ' ' + y; };
const pctTxt = (a, b) => { if (!b) return ''; const d = Math.round((a - b) / b * 100); return `${d > 0 ? '+' : ''}${d}% do poprz. miesiąca`; };

/* ---------- Podsumowanie ---------- */
function viewCosts(){
  if (!(P().manage || P().reports)) return viewExpenses();
  if (typeof repMonth!=='undefined'){ repMode = 'month'; repMonth = costMonth; }   // raport dla zarządu i Excel – ten sam miesiąc
  const st = settlement(costMonth), prev = settlement(ymAdd(costMonth, -1));
  const tot = st.tot.total, km = st.tot.km, perKm = km ? tot / km : null, fb = Number(budget().monthly) || 0;
  const head = `<div class="bar"><h2>Koszty · ${esc(monthLabel(costMonth))}</h2><div class="tools">
    <input id="month" type="month" value="${costMonth}" style="width:auto" aria-label="Miesiąc">
    ${P().manage ? `<button data-action="board-report" title="Jedna strona do wydruku lub PDF">${ic('clip')}Raport dla zarządu</button>` : ''}
    <button data-action="export-xlsx">${ic('chart')}Excel</button>
    ${canCreate('costs') ? `<button class="primary" data-new="costs">${ic('plus')}Dodaj koszt</button>` : ''}</div></div>`;
  const kpis = `<div class="kpis k4">
    ${kpi({label:'Koszty netto', icon:'coins', cls:'acc', value: zl(tot).replace(/\s?zł/, ''), small:' zł', bar:[], foot: pctTxt(tot, prev.tot.total) || 'wszystkie koszty floty w miesiącu'})}
    ${kpi({label:'Przejechane km', icon:'route', cls:'info', value: new Intl.NumberFormat('pl-PL').format(km || 0), small:' km', bar:[], foot: `${st.rows.filter(r => r.km).length} z ${st.n} aut z odczytem`})}
    ${kpi({label:'Koszt na 1 km', icon:'chart', cls:'ok', value: perKm ? perKm.toFixed(2).replace('.', ',') : '—', small: perKm ? ' zł' : '', bar:[], foot: prev.tot.km && prev.tot.total ? `poprzedni miesiąc ${(prev.tot.total / prev.tot.km).toFixed(2).replace('.', ',')} zł` : 'koszty ÷ km'})}
    ${fb ? kpi({label:'Budżet miesięczny', icon:'clip', cls: tot > fb ? 'bad' : 'warn', value: Math.round(tot / fb * 100), small:' %', bar:[[Math.min(100, tot / fb * 100), tot > fb ? 'bad' : tot >= fb * 0.9 ? 'warn' : 'ok']], foot: `${zl(tot)} z ${zl(fb)}`})
      : kpi({label:'Koszty ogólne floty', icon:'truck', cls:'warn', value: zl(st.fleetSum).replace(/\s?zł/, ''), small:' zł', bar:[], foot: st.n ? `po ${zl(st.share)} na auto` : ''})}
  </div>`;
  const parts = SETL_GROUPS.map(([l], i) => [l, st.tot.g[i], prev.tot.g[i], String(i)]).concat([[EXP_FLEET, st.fleetSum, prev.fleetSum, 'f']]);
  const max = Math.max(1, ...parts.map(p => p[1]));
  const breakdown = `<div class="panel"><div class="sec-head"><h3>Na co poszły pieniądze</h3><span class="muted small">netto · kliknij, żeby zobaczyć wydatki</span></div>
    <div class="catbars cost-parts">${parts.map(([l, v, pv, k]) => `<button type="button" class="catbar click" data-exp-grp="${k}"><span>${esc(l)}</span><div class="track"><div class="fill" style="width:${(v / max * 100).toFixed(1)}%"></div></div>
      <span class="v">${v ? zl(v) : '<span class="muted">0 zł</span>'}<span class="sub">${tot && v ? Math.round(v / tot * 100) + '%' : ''}${pv && v ? ` · ${pctTxt(v, pv).replace(' do poprz. miesiąca', '')}` : ''}</span></span></button>`).join('')}</div>
    ${!(st.tot.g[G_INS] > 0) ? `<p class="muted small sec-empty">Brak ubezpieczeń w kosztach – wpisz roczną składkę netto w danych polisy auta (Pojazdy → auto → Edytuj → Ubezpieczenie), aplikacja rozłoży ją po 1/12 na miesiąc.</p>` : ''}</div>`;
  const months = []; for (let i = 11; i >= 0; i--){ const m = ymAdd(costMonth, -i); months.push([m, MONTHS[Number(m.slice(5, 7)) - 1], i===0 ? tot : settlement(m).tot.total]); }
  const maxM = Math.max(1, ...months.map(x => x[2]));
  const trend = `<div class="panel"><div class="sec-head"><h3>Ostatnie 12 miesięcy</h3><span class="muted small">razem ${zl(months.reduce((s, x) => s + x[2], 0))} · średnio ${zl(months.reduce((s, x) => s + x[2], 0) / 12)}/mies.</span></div>
    <div class="months m12" role="img" aria-label="Koszty netto w ostatnich 12 miesiącach">${months.map(([k, l, v]) => `<button type="button" class="mcol ${k===costMonth ? 'cur' : ''}" data-cost-month="${k}" title="${esc(monthLabel(k))}: ${v ? zl(v) : '0 zł'}"><span class="v">${v ? (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',') + ' tys.' : zl(v)) : ''}</span><div class="col" style="height:${Math.round(v / maxM * 120)}px"></div><span class="m">${l}</span></button>`).join('')}</div></div>`;
  const top = st.rows.filter(r => r.total > 0).sort((a, b) => b.total - a.total).slice(0, 5);
  const topCars = top.length ? `<div class="panel"><div class="sec-head"><h3>Najdroższe auta w miesiącu</h3><a class="small ghost btn" href="#rozliczenie">Wszystkie auta</a></div>
    ${top.map(r => `<div class="mini click" data-card-go="${esc(r.v.id)}">${plate(r.v.plate)}<span>${esc([r.v.make, r.v.model].filter(Boolean).join(' '))}<span class="sub">${r.km ? new Intl.NumberFormat('pl-PL').format(r.km) + ' km' : 'brak km'}${r.perKm ? ' · ' + r.perKm.toFixed(2).replace('.', ',') + ' zł/km' : ''}</span></span><span class="mini-r num"><b>${zl(r.total)}</b></span></div>`).join('')}</div>` : '';
  const fl = typeof flagsPanel==='function' ? flagsPanel() : '';
  return `<div class="section">${head}${kpis}
    <div class="grid2"><div class="section">${breakdown}${topCars}</div><div class="section">${trend}${fl ? `<div class="panel notice"><span>${ic('alert')} Tankowania do wyjaśnienia są teraz w <a href="#spalanie">Paliwo → Spalanie</a>.</span></div>` : ''}</div></div>
    ${typeof forecastSection==='function' ? forecastSection() : ''}
    ${typeof fleetAgeSection==='function' ? fleetAgeSection() : ''}
    <p class="muted small">${COST_NOTE}</p></div>`;
}

/* ---------- Wydatki: wszystkie wpisy z filtrami ---------- */
function expSource(c){
  if (c.virtual || cardByCost().has(c.id) || String(c.note || '').startsWith('Karta:')) return 'karta';
  if (c.fleet) return 'ogolne';
  const p = (profiles || []).find(x => x.id===c.createdBy);
  return p && p.role==='kierowca' ? 'kierowca' : 'reczny';
}
const EXP_SRC = {kierowca: 'kierowca', karta: 'karta paliwowa', reczny: 'wpis kierownika', ogolne: 'koszt ogólny'};
function viewExpenses(){
  const [a, b] = setlRange(costMonth);
  const grpOf = c => c.fleet ? 'f' : String(SETL_GROUPS.findIndex(([, cats]) => cats.includes(c.category)));
  let list = visibleCosts().filter(c => c.date >= a && c.date <= b);
  if (P().manage && fleetCostsReady) list = list.concat((S.fleetCosts || []).filter(c => c.date >= a && c.date <= b).map(c => ({...c, fleet: true, category: EXP_FLEET + (c.category ? ' – ' + c.category : '')})));
  const f = list.filter(c => (!expF.veh || c.vehicleId===expF.veh) && (!expF.grp || grpOf(c)===expF.grp) && (!expF.drv || (typeof fillDriver==='function' ? fillDriver(c) : c.driverId)===expF.drv) && (!expF.src || expSource(c)===expF.src))
    .sort((x, y) => x.date < y.date ? 1 : x.date > y.date ? -1 : 0);
  const sumN = netSum(f), sumG = f.reduce((s, c) => s + Number(c.amount || 0), 0);
  const vehs = S.vehicles.filter(v => list.some(c => c.vehicleId===v.id)).sort((x, y) => String(x.plate).localeCompare(y.plate));
  const drvs = [...new Set(list.map(c => typeof fillDriver==='function' ? fillDriver(c) : c.driverId).filter(Boolean))].map(id => [id, dName(id)]).sort((x, y) => x[1].localeCompare(y[1], 'pl'));
  const sel = (k, label, opts) => `<label class="exp-f"><span class="label">${label}</span><select data-expf="${k}"><option value="">wszystkie</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${expF[k]===v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const any = expF.veh || expF.grp || expF.drv || expF.src;
  const head = `<div class="bar"><h2>Wydatki · ${esc(monthLabel(costMonth))}</h2><div class="tools">
    <input id="month" type="month" value="${costMonth}" style="width:auto" aria-label="Miesiąc">
    ${P().manage && fleetCostsReady ? `<button data-action="fleet-cost-new">${ic('plus')}Koszt ogólny floty</button>` : ''}
    ${canCreate('costs') ? `<button class="primary" data-new="costs">${ic('plus')}Dodaj koszt</button>` : ''}</div></div>`;
  const filters = `<div class="panel exp-filters">
    ${sel('veh', 'Auto', vehs.map(v => [v.id, v.plate]))}
    ${sel('grp', 'Rodzaj', SETL_GROUPS.map(([l], i) => [String(i), l]).concat(P().manage ? [['f', EXP_FLEET]] : []))}
    ${P().manage ? sel('drv', 'Kierowca', drvs) : ''}
    ${P().manage ? sel('src', 'Skąd', Object.entries(EXP_SRC)) : ''}
    <div class="exp-sum"><span class="label">${f.length} ${isPlural(f.length, 'pozycja', 'pozycje', 'pozycji')}</span><b>${zl(sumN)} netto</b>${Math.abs(sumG - sumN) > 1 ? `<span class="sub">${zl(sumG)} z VAT</span>` : ''}</div>
    ${any ? `<button type="button" class="small ghost" data-expf-clear>Wyczyść filtry</button>` : ''}</div>`;
  const row = c => {
    const net = costNet(c), gross = Number(c.amount || 0), src = expSource(c), v = c.vehicleId ? byId('vehicles', c.vehicleId) : null;
    const isFuel = c.category==='Paliwo' || c.category==='Ładowanie', drv = typeof fillDriver==='function' ? fillDriver(c) : c.driverId;
    const sub = [v ? esc(v.plate) : c.fleet ? 'cała flota' : '', c.liters ? String(c.liters).replace('.', ',') + (c.category==='Ładowanie' ? ' kWh' : ' l') : '', c.full && isFuel ? 'do pełna' : '', c.odometer ? km(c.odometer) : '',
      c.routeId ? 'trasa ' + esc(rCode(c.routeId)) : '', c.station ? esc(c.station) : '', typeof fxNote==='function' && fxNote(c) ? fxNote(c) : '', drv ? esc(dName(drv)) : '', c.note ? esc(c.note) : '',
      c.category==='Ubezpieczenie' ? 'rozłożone na 12 miesięcy' : ''].filter(Boolean).join(' · ');
    const click = c.fleet ? `class="click" data-fleet-cost="${esc(c.id)}"` : canEditDoc('costs', c) ? `class="click" data-edit="costs" data-id="${esc(c.id)}"` : '';
    return `<tr ${click}><td class="num">${fdate(c.date).slice(0, 5)}</td><td><b>${esc(c.category)}</b><span class="sub">${sub}</span>${typeof photoStrip==='function' ? photoStrip(c.photos) : ''}</td>
      <td><span class="pill ${src==='karta' ? 'info' : src==='kierowca' ? '' : 'off'}">${EXP_SRC[src]}</span></td>
      <td class="r num"><b>${zl2(net)}</b>${Math.abs(gross - net) > 0.5 ? `<span class="sub">${zl2(gross)} z VAT</span>` : ''}</td></tr>`;
  };
  const body = f.length ? `<div class="panel tablewrap"><table class="exp-t"><thead><tr><th>Data</th><th>Pozycja</th><th>Skąd</th><th class="r">Netto</th></tr></thead><tbody>${f.map(row).join('')}</tbody></table></div>`
    : `<div class="panel empty"><p>${any ? 'Brak wydatków dla wybranych filtrów.' : 'Brak wydatków w tym miesiącu.'}</p></div>`;
  return `<div class="section">${head}${filters}${body}
    ${P().manage ? `<p class="muted small">Raty leasingu (z umów) i składki ubezpieczenia (z polis aut) nie są wpisami – liczą się w Podsumowaniu i w Według aut. Kwoty z VAT (paragony kierowców, karty) przeliczamy na netto.</p>` : ''}</div>`;
}
document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.expf; if (!k) return;
  expF[k] = e.target.value; render();
});
document.addEventListener('click', e => {
  if (e.target.closest('[data-expf-clear]')){ Object.keys(expF).forEach(k => { expF[k] = ''; }); render(); return; }
  const g = e.target.closest('[data-exp-grp]'); if (g){ Object.keys(expF).forEach(k => { expF[k] = ''; }); expF.grp = g.dataset.expGrp; location.hash = 'wydatki'; return; }
  const m = e.target.closest('[data-cost-month]'); if (m){ costMonth = m.dataset.costMonth; render(); }
});
