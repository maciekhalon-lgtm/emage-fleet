/* Emage FLEET — rentowność transportu (Koszty → Rentowność, kierownik floty).
   Przychód miesiąca = km × (stawka bazowa + współczynnik × hurtowa cena ON w Orlenie) + dopłaty
   (albo kwota z faktur, jeśli ją wpiszesz – wtedy ma pierwszeństwo).
   Km = km do faktury wpisane dla miesiąca, a gdy brak – przejechane km floty z liczników (Rozliczenie aut).
   Koszty = koszty aut z Rozliczenia (paliwo z aplikacji i kart, serwis i opony, ubezpieczenie i leasing, pozostałe, koszty ogólne floty)
            + stałe koszty miesięczne (ZUS, wynagrodzenia, księgowość…) + koszty jednorazowe miesiąca.
   Zysk = przychód − koszty; porównanie z celem. Na busie: przychód z jego km, jego koszty i udział kosztów stałych proporcjonalnie do km.
   Ustawienia w settings: id 'profit'. */
'use strict';
let pfMonth = prevMonth(today().slice(0, 7)), pfDelta = 0;
const PF_DEF = {base: 1.09, coef: 0.13, goal: 40000, fixed: [
  {name: 'ZUS kierowców', amount: 67069.36}, {name: 'Wynagrodzenia kierowców', amount: 0}, {name: 'Kierowcy na fakturę', amount: 0},
  {name: 'Certyfikat kompetencji', amount: 0}, {name: 'Dyspozytor', amount: 0}, {name: 'Księgowość', amount: 0}], months: {}};
const pfCfg = () => { const s = (S.settings || []).find(x => x.id==='profit') || {};
  return {base: s.base ?? PF_DEF.base, coef: s.coef ?? PF_DEF.coef, goal: s.goal ?? PF_DEF.goal, fixed: Array.isArray(s.fixed) ? s.fixed : PF_DEF.fixed, months: s.months || {}}; };
const zl0 = n => n==null ? '—' : zl(Math.round(n));
const zlk = n => n==null ? '—' : (n).toFixed(2).replace('.', ',') + ' zł';
const nfk = n => new Intl.NumberFormat('pl-PL').format(Math.round(n || 0));
/* hurtowa cena: wpisana dla miesiąca, a gdy brak – ostatnia wcześniejsza */
function pfHurt(cfg, m){ const ks = Object.keys(cfg.months).filter(k => k <= m && cfg.months[k].hurt).sort(); return ks.length ? {v: Number(cfg.months[ks[ks.length - 1]].hurt), own: ks[ks.length - 1]===m} : null; }

function pfMonthCalc(m, delta = 0){
  const cfg = pfCfg(), mm = cfg.months[m] || {}, st = settlement(m);
  const kmOdo = st.tot.km || 0, km_ = Number(mm.km) > 0 ? Number(mm.km) : kmOdo;
  const h = pfHurt(cfg, m), rate = h ? cfg.base + cfg.coef * h.v + delta : null;
  const extra = Number(mm.extra) || 0;
  const revInv = Number(mm.revenue) > 0 ? Number(mm.revenue) : null;
  const revKm = rate!=null ? km_ * rate : null;
  const rev = revInv!=null ? revInv + (delta ? km_ * delta : 0) : revKm!=null ? revKm + extra : null;
  const fixed = cfg.fixed.reduce((s, f) => s + (Number(f.amount) || 0), 0), once = Number(mm.once) || 0;
  const fleet = st.tot.total + 0;   // z udziałem kosztów ogólnych floty
  const cost = fleet + fixed + once;
  const profit = rev!=null ? rev - cost : null;
  return {m, cfg, mm, st, km: km_, kmOdo, kmSrc: Number(mm.km) > 0 ? 'faktura' : 'liczniki', h, rate, extra, revInv, revKm, rev, fixed, once, fleet, cost, profit,
    perKm: profit!=null && km_ ? profit / km_ : null, costKm: km_ ? cost / km_ : null};
}

function viewProfit(){
  if (!P().manage) return '';
  const R = pfMonthCalc(pfMonth), cfg = R.cfg, D = pfDelta ? pfMonthCalc(pfMonth, pfDelta) : null;
  const gap = R.profit!=null ? R.profit - cfg.goal : null;
  const head = `<div class="bar"><h2>Rentowność transportu</h2><div class="tools"><label class="label" for="pf-m">Miesiąc</label><input id="pf-m" type="month" value="${pfMonth}" style="width:auto">
    <button data-pf-month>${ic('edit')}Dane miesiąca</button><button class="ghost" data-pf-set>${ic('cog')}Stawka i koszty stałe</button></div></div>`;
  const kpi = (l, v, cls = '', sub = '') => `<div class="kpi ${cls}"><span class="label">${l}</span><b>${v}</b>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
  const kpis = `<div class="kpis k4">${kpi('Przychód', zl0(R.rev), '', R.rev==null ? 'wpisz hurtową cenę ON albo kwotę z faktur' : R.revInv!=null ? 'z faktur' : `${nfk(R.km)} km × ${zlk(R.rate)}`)}
    ${kpi('Koszty', zl0(R.cost), '', R.costKm!=null ? `${zlk(R.costKm)} na km` : '')}
    ${kpi('Zysk', zl0(R.profit), R.profit==null ? '' : R.profit < 0 ? 'pf-bad' : gap >= 0 ? 'pf-ok' : 'pf-warn', R.perKm!=null ? `${zlk(R.perKm)} na km` : '')}
    ${kpi('Do celu ' + zl0(cfg.goal), gap==null ? '—' : (gap >= 0 ? '+' : '') + zl0(gap), gap==null ? '' : gap >= 0 ? 'pf-ok' : 'pf-bad', gap==null ? '' : gap >= 0 ? 'cel osiągnięty' : 'brakuje do celu')}</div>`;
  const ln = (l, v, cls = '', sub = '') => `<tr class="${cls}"><td>${l}${sub ? `<span class="sub">${sub}</span>` : ''}</td><td class="r num">${v}</td></tr>`;
  const g = R.st.tot.g;
  const bill = `<div class="panel"><div class="sec-head"><h3>Rachunek – ${esc(monthName(pfMonth))}</h3></div><div class="tablewrap"><table class="pf-tbl"><tbody>
    ${ln('Kilometry', nfk(R.km) + ' km', '', R.kmSrc==='faktura' ? `wpisane do faktury · z liczników ${nfk(R.kmOdo)} km` : 'z liczników floty (Rozliczenie aut) – wpisz km do faktury w „Dane miesiąca”, jeśli się różnią')}
    ${ln('Stawka', R.rate!=null ? zlk(R.rate) + ' / km' : '—', '', R.h ? `${String(cfg.base).replace('.', ',')} + ${String(cfg.coef).replace('.', ',')} × ${String(R.h.v).replace('.', ',')} zł/l (hurt ON Orlen${R.h.own ? '' : ', z poprzedniego miesiąca'})` : 'brak hurtowej ceny ON – wpisz w „Dane miesiąca”')}
    ${R.revInv!=null ? ln('Przychód z faktur', zl0(R.revInv), 'pf-sum') : `${ln('Przychód z km', zl0(R.revKm))}${ln('Dopłaty (drugi kierowca i inne)', zl0(R.extra))}${ln('Przychód', zl0(R.rev), 'pf-sum')}`}
    ${['Paliwo (aplikacja + karty)', 'Serwis i opony', 'Ubezpieczenie i leasing', 'Pozostałe koszty aut'].map((l, i) => ln(l, zl0(g[i]))).join('')}
    ${ln('Koszty ogólne floty', zl0(R.st.fleetSum))}
    ${cfg.fixed.map(f => ln(esc(f.name), zl0(Number(f.amount) || 0), Number(f.amount) ? '' : 'muted')).join('')}
    ${R.once ? ln('Koszty jednorazowe miesiąca', zl0(R.once), '', esc(R.mm.onceNote || '')) : ''}
    ${ln('Koszty razem', zl0(R.cost), 'pf-sum')}
    ${ln('Zysk', zl0(R.profit), 'pf-total ' + (R.profit!=null && R.profit < 0 ? 'neg' : ''))}
  </tbody></table></div>${cfg.fixed.some(f => !Number(f.amount)) ? `<p class="muted small sec-empty">Część kosztów stałych ma 0 zł – uzupełnij je w „Stawka i koszty stałe”, inaczej zysk wyjdzie zawyżony.</p>` : ''}</div>`;
  // co jeśli: zmiana stawki
  const what = R.rate!=null || R.revInv!=null ? `<div class="panel"><div class="sec-head"><h3>Co jeśli zmienię stawkę?</h3><b class="num">${pfDelta >= 0 ? '+' : ''}${pfDelta.toFixed(2).replace('.', ',')} zł/km</b></div>
    <div class="pf-what"><input type="range" id="pf-delta" min="-0.10" max="0.20" step="0.01" value="${pfDelta}" aria-label="Zmiana stawki zł/km">
    <div class="pf-what-r">${D ? `<span>Przychód <b>${(D.rev - R.rev) >= 0 ? '+' : ''}${zl0(D.rev - R.rev)}</b> / mies. (≈ ${zl0((D.rev - R.rev) * 12)} / rok)</span><span>Zysk <b class="${D.profit < 0 ? 'neg' : ''}">${zl0(D.profit)}</b> · ${D.profit - cfg.goal >= 0 ? `ponad cel o ${zl0(D.profit - cfg.goal)} – tyle zostaje np. na serwis` : `do celu brakuje ${zl0(cfg.goal - D.profit)}`}</span>` : '<span class="muted">Przesuń suwak, żeby zobaczyć, ile da zmiana stawki przy tych samych km.</span>'}</div></div></div>` : '';
  // busy
  const fixedAll = R.fixed + R.once + 0;
  const busRows = R.st.rows.map(r => { const k = r.km || 0, rev = R.rate!=null ? k * R.rate : R.revInv!=null && R.kmOdo ? R.revInv * k / R.kmOdo : null;
    const shareFixed = R.kmOdo ? fixedAll * k / R.kmOdo : 0, cost = r.total + shareFixed, pr = rev!=null ? rev - cost : null;
    return {r, k, rev, cost, pr, pk: pr!=null && k ? pr / k : null}; }).sort((a, b) => (a.pk==null) - (b.pk==null) || (a.pk ?? 0) - (b.pk ?? 0));
  const bus = `<div class="panel"><div class="sec-head"><h3>Busy – zysk na km</h3><span class="muted small">od najsłabszego</span></div><div class="tablewrap"><table><thead><tr><th>Auto</th><th class="r">Km</th><th class="r">Przychód</th><th class="r">Koszty auta</th><th class="r">Udział kosztów stałych</th><th class="r">Zysk</th><th class="r">Zysk / km</th></tr></thead>
    <tbody>${busRows.map(x => `<tr class="click" data-card-go="${esc(x.r.v.id)}" data-ctab-go="paliwo"><td>${plate(x.r.v.plate)}</td><td class="r num">${x.k ? nfk(x.k) : '—'}</td><td class="r num">${zl0(x.rev)}</td><td class="r num">${zl0(x.r.total)}</td><td class="r num muted">${zl0(x.cost - x.r.total)}</td>
      <td class="r num"><b class="${x.pr!=null && x.pr < 0 ? 'neg' : ''}">${zl0(x.pr)}</b></td><td class="r num"><span class="pill ${x.pk==null ? 'off' : x.pk < 0 ? 'bad' : R.perKm!=null && x.pk < R.perKm * 0.7 ? 'warn' : 'ok'}">${x.pk==null ? '—' : zlk(x.pk)}</span></td></tr>`).join('')}</tbody></table></div>
    <p class="muted small sec-empty">Przychód busa = jego km × stawka. Koszty stałe (ZUS, wynagrodzenia…) rozdzielone proporcjonalnie do km. Bus bez km w miesiącu ma tylko koszty – sprawdź liczniki albo import kart.</p></div>`;
  // ostatnie miesiące
  const ms = monthsBack(6).map(m => pfMonthCalc(m)).filter(x => x.km || x.cost);
  const hist = `<div class="panel"><div class="sec-head"><h3>Ostatnie miesiące</h3></div><div class="tablewrap"><table class="pf-hist"><thead><tr><th>Miesiąc</th><th class="r">Km</th><th class="r">Przychód</th><th class="r">Koszty</th><th class="r">Zysk</th><th class="r">Zysk / km</th></tr></thead><tbody>
    ${ms.map(x => `<tr class="click ${x.m===pfMonth ? 'on' : ''}" data-pf-pick="${x.m}"><td>${esc(monthName(x.m))}</td><td class="r num">${nfk(x.km)}</td><td class="r num">${zl0(x.rev)}</td><td class="r num">${zl0(x.cost)}</td><td class="r num"><b class="${x.profit!=null && x.profit < 0 ? 'neg' : ''}">${zl0(x.profit)}</b></td><td class="r num">${x.perKm!=null ? zlk(x.perKm) : '—'}</td></tr>`).join('')}</tbody></table></div></div>`;
  return head + kpis + `<div class="grid2">${bill}<div>${what}${hist}</div></div>` + bus;
}

/* Dane miesiąca: km do faktury, hurt ON, dopłaty, przychód z faktur, koszty jednorazowe */
function openProfitMonth(){
  const cfg = pfCfg(), mm = cfg.months[pfMonth] || {}, h = pfHurt(cfg, pfMonth);
  editing = {col:'profit-month', id: pfMonth, base:{}, special: saveProfitMonth};
  $('#dlg-title').textContent = `Dane miesiąca · ${monthName(pfMonth)}`;
  const f = (id, l, v, ph, sub = '') => `<label class="field"><span class="label">${l}</span><input id="${id}" type="text" inputmode="decimal" autocomplete="off" value="${v==null ? '' : esc(String(v).replace('.', ','))}" placeholder="${esc(ph)}">${sub ? `<span class="sub muted small">${sub}</span>` : ''}</label>`;
  $('#dlg-body').innerHTML = `
    ${f('pf-hurt', 'Hurtowa cena ON w Orlenie (zł/l)', mm.hurt, h ? String(h.v) : 'np. 5,12', h && !h.own ? `bez wpisu użyjemy ${String(h.v).replace('.', ',')} z poprzedniego miesiąca` : '')}
    ${f('pf-km', 'Km do faktury (opcjonalnie)', mm.km, nfk(settlement(pfMonth).tot.km) + ' z liczników', 'puste = km z liczników floty')}
    ${f('pf-extra', 'Dopłaty – drugi kierowca i inne (zł)', mm.extra, '0')}
    ${f('pf-rev', 'Przychód z faktur (zł, opcjonalnie)', mm.revenue, 'puste = liczymy ze stawki', 'jeśli wpiszesz, zastępuje wyliczenie ze stawki')}
    ${f('pf-once', 'Koszty jednorazowe w tym miesiącu (zł)', mm.once, '0')}
    <label class="field"><span class="label">Co to za koszty</span><input id="pf-once-note" value="${esc(mm.onceNote || '')}" maxlength="120" placeholder="np. kara, szkolenie"></label>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zapisz'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
}
async function saveProfitMonth(){
  const num = id => { const x = String($(id).value).replace(/\s/g, '').replace(',', '.').trim(); return x==='' ? null : Number(x); };
  const d = {hurt: num('#pf-hurt'), km: num('#pf-km'), extra: num('#pf-extra'), revenue: num('#pf-rev'), once: num('#pf-once'), onceNote: $('#pf-once-note').value.trim() || null};
  if (Object.entries(d).some(([k, v]) => k!=='onceNote' && v!=null && isNaN(v))){ $('#dlg-warn').textContent = 'Wpisz same liczby (np. 5,12 albo 12 500).'; $('#dlg-warn').hidden = false; return; }
  if (d.hurt!=null && !(d.hurt > 1 && d.hurt < 20)){ $('#dlg-warn').textContent = 'Hurtowa cena ON wygląda na błędną (zł za litr, np. 5,12).'; $('#dlg-warn').hidden = false; return; }
  const cfg = pfCfg(), months = {...cfg.months, [pfMonth]: d};
  try { await db.collection('settings').doc('profit').set({base: cfg.base, coef: cfg.coef, goal: cfg.goal, fixed: cfg.fixed, months}); closeForm(); toast('Zapisano dane miesiąca'); }
  catch(err){ handleWriteErr(err); }
}
/* Stawka, cel i stałe koszty miesięczne */
function openProfitSettings(){
  const cfg = pfCfg();
  editing = {col:'profit-set', id: 'profit', base:{}, special: saveProfitSettings};
  $('#dlg-title').textContent = 'Stawka i koszty stałe';
  const row = (f, i) => `<div class="pf-fx" data-pf-row><input data-pf-name value="${esc(f.name || '')}" placeholder="np. Księgowość" aria-label="Nazwa kosztu ${i + 1}"><input data-pf-amt type="text" inputmode="decimal" value="${f.amount==null || f.amount==='' ? '' : String(f.amount).replace('.', ',')}" placeholder="zł / mies." aria-label="Kwota ${i + 1}"><button type="button" class="ghost icon" data-pf-del aria-label="Usuń">${ic('x')}</button></div>`;
  $('#dlg-body').innerHTML = `
    <label class="field"><span class="label">Stawka bazowa (zł/km)</span><input id="pf-base" type="text" inputmode="decimal" value="${String(cfg.base).replace('.', ',')}"></label>
    <label class="field"><span class="label">Współczynnik × hurtowa cena ON</span><input id="pf-coef" type="text" inputmode="decimal" value="${String(cfg.coef).replace('.', ',')}"></label>
    <label class="field"><span class="label">Cel zysku miesięcznie (zł)</span><input id="pf-goal" type="text" inputmode="numeric" value="${cfg.goal}"></label>
    <span class="field"></span>
    <div class="field full"><span class="label">Stałe koszty miesięczne (poza kosztami aut)</span><div id="pf-fixed">${cfg.fixed.map(row).join('')}</div>
      <button type="button" class="small ghost" data-pf-add>+ Dodaj koszt</button></div>
    <p class="muted small field full" style="margin:0">Stawka = bazowa + współczynnik × hurtowa cena ON (wpisujesz ją co miesiąc w „Dane miesiąca”). Koszty aut (paliwo, serwis, opony, leasing) liczą się same z aplikacji i kart.</p>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zapisz'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
  window.__pfRow = row;
}
async function saveProfitSettings(){
  const n = id => Number(String($(id).value).replace(/\s/g, '').replace(',', '.'));
  const fixed = [...document.querySelectorAll('[data-pf-row]')].map(r => ({name: r.querySelector('[data-pf-name]').value.trim(), amount: Number(String(r.querySelector('[data-pf-amt]').value).replace(/\s/g, '').replace(',', '.')) || 0})).filter(f => f.name);
  const base = n('#pf-base'), coef = n('#pf-coef'), goal = n('#pf-goal');
  if (!(base >= 0 && base < 10) || !(coef >= 0 && coef < 5)){ $('#dlg-warn').textContent = 'Sprawdź stawkę bazową i współczynnik.'; $('#dlg-warn').hidden = false; return; }
  try { await db.collection('settings').doc('profit').set({base, coef, goal: goal || 0, fixed, months: pfCfg().months}); closeForm(); toast('Zapisano stawkę i koszty stałe'); }
  catch(err){ handleWriteErr(err); }
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-pf-month]')){ openProfitMonth(); return; }
  if (e.target.closest('[data-pf-set]')){ openProfitSettings(); return; }
  if (e.target.closest('[data-pf-add]')){ const box = $('#pf-fixed'); box.insertAdjacentHTML('beforeend', window.__pfRow({name: '', amount: ''}, box.children.length)); box.lastElementChild.querySelector('input').focus(); return; }
  const del = e.target.closest('[data-pf-del]'); if (del){ del.closest('[data-pf-row]').remove(); return; }
  const pk = e.target.closest('[data-pf-pick]'); if (pk){ pfMonth = pk.dataset.pfPick; render(); }
});
document.addEventListener('change', e => { if (e.target.id==='pf-m' && e.target.value){ pfMonth = e.target.value; render(); } });
document.addEventListener('input', e => { if (e.target.id==='pf-delta'){ pfDelta = Number(e.target.value); clearTimeout(window.__pfT); window.__pfT = setTimeout(() => { const y = scrollY; render(); scrollTo(0, y); const r = $('#pf-delta'); if (r) r.focus(); }, 120); } });
