/* Emage FLEET — prognoza kosztów floty na 12 miesięcy (Koszty → Raporty, sekcja „Prognoza kosztów”).
   Składniki: raty z umów (029), terminy (przegląd, OC/AC, olej wg daty albo tempa km, rozrząd, opony…) z kosztem
   = średnia z historii tej kategorii dla auta/floty albo stawka orientacyjna, paliwo i bieżące koszty = średnia z 3 pełnych miesięcy.
   To szacunek do planowania budżetu, nie faktura. */
'use strict';
const FC_RATES = {'Przegląd techniczny':150, 'Ubezpieczenie OC':2500, 'Ubezpieczenie AC':3500, 'Serwis olejowy':900, 'Wymiana rozrządu':3500, 'Wymiana opon':300, 'Przegląd gwarancyjny':1200, 'Legalizacja tachografu':400, 'Przegląd klimatyzacji':300};
const FC_CAT = t => /ubezpiecz|\boc\b|\bac\b/i.test(t) ? 'Ubezpieczenie' : /opon/i.test(t) ? 'Opony' : 'Serwis i naprawy';
function ymAdd(ym, k){ const d = new Date(ym + '-15T12:00:00'); d.setMonth(d.getMonth() + k); return d.toISOString().slice(0, 7); }
function forecast(){
  const t = today(), cur = t.slice(0, 7), months = Array.from({length: 12}, (_, i) => ymAdd(cur, i + 1));
  const vs = S.vehicles.filter(v => v.status!=='wycofany'), all = visibleCosts();
  const full3 = [ymAdd(cur, -3), ymAdd(cur, -2), ymAdd(cur, -1)];
  const avgCat = f => full3.reduce((s, m) => s + sumOf(all.filter(c => (c.date || '').startsWith(m) && f(c))), 0) / 3;
  const fuel = avgCat(c => c.category==='Paliwo' || c.category==='Ładowanie');
  const running = avgCat(c => ['Myjnia', 'Opłaty i parkingi', 'Inne'].includes(c.category));
  const repairs = avgCat(c => c.category==='Serwis i naprawy');   // naprawy i serwis z ostatnich miesięcy (część pokrywa się z terminami – szacunek ostrożny)
  const rows = months.map(m => ({m, lease: 0, dl: 0, ins: 0, tires: 0, fuel, running, repairs, items: []}));
  const at = m => rows.find(r => r.m===m);
  // raty z umów aktywnych w miesiącu (bez ręcznie wpisywanego „Leasing” – ten jest w średnich, ale je wykluczamy)
  if (typeof contractsOn==='function' && optOn('contracts')) months.forEach(m => vs.forEach(v => {
    const c = S.contracts.find(x => x.vehicleId===v.id && x.kind!=='wlasne' && (!x.startDate || x.startDate.slice(0, 7) <= m) && (!x.endDate || x.endDate.slice(0, 7) >= m));
    if (c){ const r = at(m); r.lease += monthlyOf(c); } }));
  // koszt terminu: średnia z historii tej kategorii dla podobnych wpisów (notatka/typ), inaczej stawka orientacyjna
  const histCost = type => { const xs = all.filter(c => c.category===FC_CAT(type) && new RegExp(type.split(' ')[0], 'i').test(c.note || '')).map(c => Number(c.amount)).filter(x => x > 0);
    return xs.length >= 2 ? xs.reduce((s, x) => s + x, 0) / xs.length : (FC_RATES[type] || 500); };
  const pace = vid => { if (typeof odoRange!=='function') return null; const o = odoRange(vid, addDays(t, -90), t); if (!o.km || !o.first || !o.last) return null;
    const span = diffDays(o.first.d.slice(0, 10), o.last.d.slice(0, 10)); return span >= 30 ? o.km / span * 30 : null; };
  S.deadlines.forEach(d => { const v = byId('vehicles', d.vehicleId); if (!v || v.status==='wycofany') return;
    const def = (typeof DL_INTERVALS!=='undefined' && DL_INTERVALS[d.type]) || [12, null];
    let due = d.date; const p = d.kmDue && v.km ? pace(v.id) : null;
    if (p && d.kmDue > v.km){ const byKm = addDays(t, Math.round((d.kmDue - v.km) / p * 30)); if (!due || byKm < due) due = byKm; }
    if (!due) return;
    let m = due.slice(0, 7); if (m <= cur) m = months[0];           // zaległe i bieżące – w najbliższym miesiącu
    const cost = histCost(d.type), cat = FC_CAT(d.type);
    for (let k = 0; k < 3; k++){                                      // kolejne powtórzenia w oknie 12 mies.
      const r = at(m); if (!r) break;
      if (cat==='Ubezpieczenie') r.ins += cost; else if (cat==='Opony') r.tires += cost; else r.dl += cost;
      r.items.push(`${v.plate}: ${d.type}`);
      if (!def[0]) break; m = ymAdd(m, def[0]);
    } });
  rows.forEach(r => { r.total = r.lease + r.dl + r.ins + r.tires + r.fuel + r.running + r.repairs; });
  return {rows, fuel, running, repairs, total: rows.reduce((s, r) => s + r.total, 0), budget: Number(budget().monthly) || 0};
}
function forecastSection(){
  if (!P().manage) return '';
  const f = forecast(), max = Math.max(1, ...f.rows.map(r => r.total));
  const parts = [['lease', 'Raty umów', 'var(--accent-ink)'], ['ins', 'Ubezpieczenia', 'var(--info)'], ['dl', 'Przeglądy i serwisy', 'var(--warn)'], ['tires', 'Opony', 'var(--ok)'], ['repairs', 'Naprawy (średnia)', 'var(--bad)'], ['fuel', 'Paliwo (średnia)', 'var(--line-2)'], ['running', 'Myjnia, opłaty, inne', 'var(--faint)']];
  const mn = m => MONTHS_FULL[Number(m.slice(5, 7)) - 1].slice(0, 3).toLowerCase() + (m.slice(5, 7)==='01' ? ' ' + m.slice(2, 4) : '');
  const over = f.budget ? f.rows.filter(r => r.total > f.budget) : [];
  return `<details class="panel fold"><summary class="sec-head"><h3>Prognoza kosztów – 12 miesięcy</h3><span class="muted small">razem ok. <b>${zl(f.total)}</b> · średnio ${zl(f.total / 12)}/mies.${over.length ? ` · <b class="neg">${over.length} mies. ponad budżet</b>` : ''}</span></summary>
    <div class="tco-ch fc-ch">${f.rows.map(r => `<div class="tco-c" title="${esc(mn(r.m))}: ${zl(r.total)}${r.items.length ? '\n' + esc(r.items.join('\n')) : ''}"><div class="tco-b" style="height:${(r.total / max * 100).toFixed(0)}%">${parts.map(([k, , c]) => r[k] ? `<i style="flex:${r[k]};background:${c}"></i>` : '').join('')}</div><span>${esc(mn(r.m))}</span></div>`).join('')}</div>
    ${f.budget ? `<p class="muted small" style="margin:4px 22px 0">Budżet: ${zl(f.budget)}/mies.</p>` : ''}
    <div class="fc-leg">${parts.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>
    <div class="tablewrap"><table><thead><tr><th>Miesiąc</th>${parts.map(([, l]) => `<th class="r">${l}</th>`).join('')}<th class="r">Razem</th><th>Co wypada</th></tr></thead><tbody>
      ${f.rows.map(r => `<tr><td>${esc(mn(r.m))}</td>${parts.map(([k]) => `<td class="r num">${r[k] ? zl(r[k]) : '<span class="muted">—</span>'}</td>`).join('')}<td class="r num"><b class="${f.budget && r.total > f.budget ? 'neg' : ''}">${zl(r.total)}</b></td><td class="small">${esc(r.items.slice(0, 4).join(', '))}${r.items.length > 4 ? ` +${r.items.length - 4}` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted small sec-empty">Szacunek: raty z umów (Leasing i umowy), terminy z zakładki Terminy (olej także wg tempa km z 90 dni), koszt terminu = średnia z historii albo stawka orientacyjna (np. przegląd 150 zł, olej 900 zł, OC 2500 zł). Paliwo, naprawy i bieżące koszty = średnia z 3 ostatnich pełnych miesięcy (${zl(f.fuel)}, ${zl(f.repairs)}, ${zl(f.running)}). Najedź na słupek, aby zobaczyć, co wypada w miesiącu.</p></details>`;
}
