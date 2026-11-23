/* Emage FLEET — rozliczenie miesiąca (kierownik floty): Koszty → Rozliczenie aut.
   Dla każdego busa w wybranym miesiącu: przejechane km (z liczników), koszty własne auta wg grup,
   udział w kosztach ogólnych floty (tabela fleet_costs, migracja 024) – po równo na wszystkie aktywne auta,
   razem i koszt 1 km. Paliwo = koszty „Paliwo/Ładowanie” z aplikacji + tankowania z kart paliwowych (PLN),
   które nie są połączone z wpisem w aplikacji (żeby nie liczyć dwa razy). */

let setlMonth = today().slice(0, 7);
const FLEET_CATS = ['GPS / telematyka', 'Plac / parking', 'Ubezpieczenie floty', 'Oprogramowanie', 'Obsługa / księgowość', 'Myjnia (abonament)', 'Szkolenia kierowców', 'Inne'];
/* grupy kosztów – te same w Podsumowaniu, Według aut, raporcie dla zarządu i rankingu */
const SETL_GROUPS = [['Paliwo', ['Paliwo','Ładowanie']], ['Serwis i naprawy', ['Serwis i naprawy']], ['Opony', ['Opony']], ['Ubezpieczenie', ['Ubezpieczenie']], ['Leasing i najem', ['Leasing']], ['Opłaty drogowe', ['Opłaty i parkingi']], ['Myjnia i inne', ['Myjnia','Inne']]];
const G_INS = 3, G_LEASE = 4;

function setlRange(m){ const [y, mm] = m.split('-').map(Number); const last = new Date(y, mm, 0).getDate(); return [m + '-01', m + '-' + String(last).padStart(2, '0')]; }
/* ymAdd(ym, n) – prognoza.js */
function monthsList(a, b){ const out = []; for (let m = a.slice(0, 7); m <= b.slice(0, 7) && out.length < 240; m = ymAdd(m, 1)) out.push(m); return out; }
/* ubezpieczenie: roczna składka netto z danych polisy auta → 1/12 na każdy z 12 miesięcy kończących się w miesiącu „Polisa ważna do” */
function insShare(v, ym){
  const p = Number(v && v.insPremium); if (!(p > 0) || !v.policyUntil) return 0;
  const end = String(v.policyUntil).slice(0, 7);
  return ym >= ymAdd(end, -11) && ym <= end ? p / 12 : 0;
}

/* Koszty netto aut w okresie (pełne miesiące od a do b): paliwo (wpisy + karty), serwis, opony,
   ubezpieczenie (składka z polisy i wpisy „Ubezpieczenie” – po 1/12 przez 12 miesięcy), leasing (rata netto z umowy,
   chyba że w miesiącu jest ręczny wpis „Leasing”), opłaty, myjnia i inne + koszty ogólne floty po równo na aktywne auta. */
function settleRange(a, b){
  const months = monthsList(a, b);
  const vc = visibleCosts().filter(c => c.vehicleId);
  const inR = vc.filter(c => c.date >= a && c.date <= b && c.category!=='Ubezpieczenie');
  const insC = vc.filter(c => c.category==='Ubezpieczenie' && c.date);
  const fleet = (S.fleetCosts || []).filter(c => c.date >= a && c.date <= b);
  const fleetSum = fleet.reduce((s, c) => s + Number(c.amount || 0), 0);
  const active = S.vehicles.filter(v => v.status!=='wycofany');
  const share = active.length ? fleetSum / active.length : 0;
  const vs = S.vehicles.filter(v => v.status!=='wycofany' || inR.some(c => c.vehicleId===v.id)).sort((x, y) => String(x.plate).localeCompare(y.plate));
  const rows = vs.map(v => {
    const own = inR.filter(c => c.vehicleId===v.id), myIns = insC.filter(c => c.vehicleId===v.id);
    const g = SETL_GROUPS.map(([, cats]) => netSum(own.filter(c => cats.includes(c.category))));
    const card = netSum(own.filter(c => c.virtual));
    let ins = 0, lease = 0;
    months.forEach(m => {
      ins += insShare(v, m) + netSum(myIns.filter(c => c.date.slice(0, 7) <= m && c.date.slice(0, 7) >= ymAdd(m, -11))) / 12;
      const [mf, mt] = setlRange(m);
      lease += typeof contractMonthCost==='function' ? contractMonthCost(v.id, mf, mt, own.filter(c => c.date >= mf && c.date <= mt)) : 0;
    });
    g[G_INS] += ins; g[G_LEASE] += lease;
    const ownSum = g.reduce((s, x) => s + x, 0);
    const r = typeof odoRange==='function' ? odoRange(v.id, a, b) : null;
    const kmV = r && r.km > 0 ? Math.round(r.km) : null;
    const sh = v.status!=='wycofany' ? share : 0, total = ownSum + sh;
    return {v, km: kmV, g, card, lease, ins, ownSum, share: sh, total, perKm: kmV ? total / kmV : null};
  });
  const sum = k => rows.reduce((s, r) => s + (r[k] || 0), 0);
  return {from: a, to: b, months, rows, fleet, fleetSum, share, n: active.length,
    tot: {km: sum('km'), own: sum('ownSum'), total: sum('total'), g: SETL_GROUPS.map((_, i) => rows.reduce((s, r) => s + r.g[i], 0))}};
}
function settlement(m){ const [from, to] = setlRange(m); return settleRange(from, to); }

function viewSettlement(){
  if (!P().manage) return '';
  setlMonth = costMonth;   // jeden miesiąc w całych Kosztach
  const st = settlement(setlMonth);
  const [y, mm] = setlMonth.split('-').map(Number);
  const z = x => x ? zl(x) : '<span class="muted">—</span>';
  const kmF = x => x ? new Intl.NumberFormat('pl-PL').format(x) + ' km' : '<span class="muted">—</span>';
  const pk = x => x != null ? x.toFixed(2).replace('.', ',') + ' zł' : '<span class="muted">—</span>';
  const avgKm = st.tot.km ? st.tot.total / st.tot.km : null;
  const head = `<div class="bar"><h2>Koszty według aut · ${MONTHS_FULL[mm - 1]} ${y}</h2><div class="tools">
    <input id="setl-month" type="month" value="${setlMonth}" style="width:auto" aria-label="Miesiąc rozliczenia">
    <button data-action="setl-xlsx">${ic('chart')}Excel</button>
    ${fleetCostsReady ? `<button class="primary" data-action="fleet-cost-new">${ic('plus')}Koszt ogólny floty</button>` : ''}</div></div>`;
  const kpis = `<div class="kpis k4">
    ${kpi({label:'Przejechane km', icon:'route', cls:'info', value: new Intl.NumberFormat('pl-PL').format(st.tot.km || 0), small:' km', bar:[], foot: `${st.rows.filter(r => r.km).length} z ${st.n} aut z odczytami licznika`})}
    ${kpi({label:'Koszty aut', icon:'truck', cls:'acc', value: zl(st.tot.own).replace(/\s?zł/, ''), small:' zł', bar:[], foot:'paliwo, serwis, ubezpieczenia, opłaty'})}
    ${kpi({label:'Koszty ogólne floty', icon:'coins', cls:'warn', value: zl(st.fleetSum).replace(/\s?zł/, ''), small:' zł', bar:[], foot: st.n ? `po ${zl(st.share)} na każde z ${st.n} aut` : 'brak aut'})}
    ${kpi({label:'Średnio za 1 km', icon:'chart', cls:'ok', value: avgKm ? avgKm.toFixed(2).replace('.', ',') : '—', small: avgKm ? ' zł' : '', bar:[], foot: `razem ${zl(st.tot.total)}`})}
  </div>`;
  const table = `<div class="panel tablewrap setl"><table><thead><tr><th>Auto</th><th class="r">Km</th>${SETL_GROUPS.map(([l]) => `<th class="r">${l}</th>`).join('')}<th class="r">Koszty ogólne</th><th class="r">Razem</th><th class="r">Za 1 km</th></tr></thead>
    <tbody>${st.rows.map(r => `<tr class="click" data-card-go="${esc(r.v.id)}"><td>${plate(r.v.plate)}<span class="sub">${esc([r.v.make, r.v.model].filter(Boolean).join(' '))}</span></td>
      <td class="r num" data-l="Km">${kmF(r.km)}</td>${r.g.map((x, i) => `<td class="r num" data-l="${SETL_GROUPS[i][0]}">${z(x)}${i===0 && r.card ? `<span class="sub">w tym karty ${zl(r.card)}</span>` : ''}</td>`).join('')}
      <td class="r num" data-l="Koszty ogólne">${z(r.share)}</td><td class="r num" data-l="Razem"><b>${zl(r.total)}</b></td><td class="r num" data-l="Za 1 km">${pk(r.perKm)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><th>Razem (${st.n})</th><th class="r num">${kmF(st.tot.km)}</th>${st.tot.g.map(x => `<th class="r num">${z(x)}</th>`).join('')}<th class="r num">${z(st.fleetSum)}</th><th class="r num">${zl(st.tot.total)}</th><th class="r num">${pk(avgKm)}</th></tr></tfoot></table></div>`;
  const fleetList = !fleetCostsReady
    ? `<div class="panel"><div class="sec-head"><h3>Koszty ogólne floty</h3></div><p class="muted sec-empty">Żeby dodawać koszty wspólne dla całej floty (GPS, plac, abonamenty…), uruchom w Supabase migrację <b>024_koszty_ogolne.sql</b>.</p></div>`
    : `<div class="panel"><div class="sec-head"><h3>Koszty ogólne floty – ${MONTHS_FULL[mm - 1].toLowerCase()}</h3><span class="muted small">${zl(st.fleetSum)} · po ${zl(st.share)} na auto</span></div>
      ${st.fleet.length ? st.fleet.sort((a, b) => a.date < b.date ? -1 : 1).map(c => `<div class="mini click" data-fleet-cost="${esc(c.id)}"><span class="num">${fdate(c.date)}</span><span>${esc(c.category)}${c.note ? `<span class="sub">${esc(c.note)}</span>` : ''}</span><span class="mini-r num"><b>${zl(Number(c.amount))}</b></span></div>`).join('')
        : `<p class="muted sec-empty">Brak kosztów ogólnych w tym miesiącu. Dodaj np. abonament GPS, plac, księgowość floty – rozłożą się po równo na wszystkie auta.</p>`}
      ${st.fleet.length ? '' : prevFleetHint(setlMonth)}</div>`;
  return `<div class="section">${head}${kpis}${table}${fleetList}
    <p class="muted small" style="margin-top:12px">${COST_NOTE} Koszty ogólne dzielone po równo na ${st.n} ${isPlural(st.n,'aktywne auto','aktywne auta','aktywnych aut')} (bez wycofanych).</p></div>`;
}

/* podpowiedź: skopiuj stałe koszty ogólne z poprzedniego miesiąca */
function prevFleetHint(m){
  const [y, mm] = m.split('-').map(Number), d = new Date(y, mm - 2, 1), pm = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const [f, t] = setlRange(pm), prev = (S.fleetCosts || []).filter(c => c.date >= f && c.date <= t);
  return prev.length ? `<div class="sec-empty"><button class="small" data-action="fleet-copy-prev" data-from="${pm}">Skopiuj z poprzedniego miesiąca (${prev.length} poz., ${zl(prev.reduce((s, c) => s + Number(c.amount || 0), 0))})</button></div>` : '';
}
async function fleetCopyPrev(pm){
  const [f, t] = setlRange(pm), prev = (S.fleetCosts || []).filter(c => c.date >= f && c.date <= t);
  try {
    for (const c of prev) await db.collection('fleetCosts').doc().set({date: setlMonth + c.date.slice(7), category: c.category, amount: Number(c.amount), note: c.note || null});
    await refresh('fleetCosts'); toast(`Skopiowano ${prev.length} poz.`);
  } catch(err){ handleWriteErr(err); }
}

/* okno: koszt ogólny floty */
function openFleetCost(id){
  const c = id ? (S.fleetCosts || []).find(x => x.id===id) : null;
  editing = {col:'fleetCosts', id: id || null, base: c || {}, special: saveFleetCost};
  const cat = c ? c.category : FLEET_CATS[0];
  $('#dlg-title').textContent = c ? 'Koszt ogólny floty' : 'Nowy koszt ogólny floty';
  $('#dlg-body').innerHTML = `<div class="field"><label for="flc-date">Data</label><input id="flc-date" type="date" value="${c ? c.date : (setlMonth===today().slice(0, 7) ? today() : setlMonth + '-01')}"></div>
    <div class="field"><label for="flc-amount">Kwota netto (zł)</label><input id="flc-amount" type="number" step="0.01" min="0" inputmode="decimal" value="${c ? c.amount : ''}"></div>
    <div class="field full"><label for="flc-cat">Rodzaj</label><input id="flc-cat" list="flc-cats" value="${esc(cat)}"><datalist id="flc-cats">${FLEET_CATS.map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
    <div class="field full"><label for="flc-note">Opis (opcjonalnie)</label><input id="flc-note" value="${esc(c ? c.note || '' : '')}" placeholder="np. abonament GPS za 28 aut"></div>
    <p class="muted small field full">Koszt rozłoży się po równo na wszystkie aktywne auta w rozliczeniu tego miesiąca.</p>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  const del = $('#dlg-del'); del.hidden = !c; del.classList.remove('armed'); del.textContent = 'Usuń';
  $('#dlg-save').textContent = 'Zapisz'; $('#scrim').hidden = false;
  $('#flc-amount').focus();
}
async function saveFleetCost(){
  const w = $('#dlg-warn'), date = $('#flc-date').value, amount = Number($('#flc-amount').value), category = ($('#flc-cat').value || '').trim(), note = ($('#flc-note').value || '').trim() || null;
  if (!date || !(amount >= 0) || $('#flc-amount').value==='' || !category){ w.textContent = 'Podaj datę, kwotę i rodzaj kosztu.'; w.hidden = false; return; }
  try {
    const ref = editing.id ? db.collection('fleetCosts').doc(editing.id) : db.collection('fleetCosts').doc();
    await ref.set({date, amount, category, note});
    closeForm(); await refresh('fleetCosts'); toast('Zapisano koszt ogólny');
  } catch(err){ handleWriteErr(err); }
}

async function settlementXlsx(){
  let X; try { X = await loadXLSX(); } catch(_){ return toast('Nie udało się wczytać modułu Excel – sprawdź połączenie'); }
  const st = settlement(setlMonth);
  const rows = st.rows.map(r => ({'Auto': r.v.plate, 'Model': [r.v.make, r.v.model].filter(Boolean).join(' '), 'Km': r.km || '',
    ...Object.fromEntries(SETL_GROUPS.map(([l], i) => [l + ' (zł)', +r.g[i].toFixed(2)])), 'Koszty ogólne (zł)': +r.share.toFixed(2), 'Razem (zł)': +r.total.toFixed(2), 'Za 1 km (zł)': r.perKm != null ? +r.perKm.toFixed(2) : ''}));
  rows.push({'Auto': 'RAZEM', 'Model': '', 'Km': st.tot.km || '', ...Object.fromEntries(SETL_GROUPS.map(([l], i) => [l + ' (zł)', +st.tot.g[i].toFixed(2)])), 'Koszty ogólne (zł)': +st.fleetSum.toFixed(2), 'Razem (zł)': +st.tot.total.toFixed(2), 'Za 1 km (zł)': st.tot.km ? +(st.tot.total / st.tot.km).toFixed(2) : ''});
  const wb = X.utils.book_new(), ws = X.utils.json_to_sheet(rows);
  ws['!cols'] = [{wch:12},{wch:18},{wch:9},{wch:12},{wch:14},{wch:15},{wch:12},{wch:17},{wch:12},{wch:12}];
  X.utils.book_append_sheet(wb, ws, 'Rozliczenie ' + setlMonth);
  if (st.fleet.length) X.utils.book_append_sheet(wb, X.utils.json_to_sheet(st.fleet.map(c => ({'Data': c.date, 'Rodzaj': c.category, 'Kwota (zł)': Number(c.amount), 'Opis': c.note || ''}))), 'Koszty ogólne');
  await saveFile(`Emage-FLEET-rozliczenie-${setlMonth}.xlsx`, new Uint8Array(X.write(wb, {type:'array', bookType:'xlsx'})));
}

document.addEventListener('change', e => { if (e.target.id==='setl-month' && e.target.value){ setlMonth = costMonth = e.target.value; render(); } });
document.addEventListener('click', e => {
  if (e.target.closest('[data-action="setl-xlsx"]')){ e.preventDefault(); settlementXlsx(); return; }
  if (e.target.closest('[data-action="fleet-cost-new"]')){ e.preventDefault(); openFleetCost(null); return; }
  const cp = e.target.closest('[data-action="fleet-copy-prev"]'); if (cp){ e.preventDefault(); cp.disabled = true; fleetCopyPrev(cp.dataset.from); return; }
  const f = e.target.closest('[data-fleet-cost]'); if (f){ e.preventDefault(); openFleetCost(f.dataset.fleetCost); }
});

/* Karta auta: ostatnie 6 miesięcy – km, koszty auta, udział w kosztach ogólnych, razem, zł/km */
function vehMonthsHtml(v){
  const t = today(), y0 = +t.slice(0, 4), m0 = +t.slice(5, 7) - 1, ms = [];
  for (let i = 5; i >= 0; i--){ const k = y0 * 12 + m0 - i; ms.push(`${Math.floor(k / 12)}-${String(k % 12 + 1).padStart(2, '0')}`); }
  const rows = ms.map(m => { const st = settlement(m); return {m, r: st.rows.find(x => x.v.id===v.id)}; }).filter(x => x.r).reverse();
  if (!rows.length) return '<p class="muted sec-empty">Auto wycofane – brak rozliczeń.</p>';
  const MN = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
  return `<div class="tablewrap"><table class="vm-t"><thead><tr><th>Miesiąc</th><th class="r">Km</th><th class="r">Koszty auta</th><th class="r">Koszty ogólne</th><th class="r">Razem</th><th class="r">Za 1 km</th></tr></thead><tbody>
    ${rows.map(({m, r}) => `<tr><td>${MN[+m.slice(5) - 1]} ${m.slice(0, 4)}</td><td class="r num">${r.km ? new Intl.NumberFormat('pl-PL').format(r.km) + ' km' : '<span class="muted">—</span>'}</td><td class="r num">${zl(r.ownSum)}</td><td class="r num">${zl(r.share)}</td><td class="r num"><b>${zl(r.total)}</b></td><td class="r num">${r.perKm != null ? r.perKm.toFixed(2).replace('.', ',') + ' zł' : '—'}</td></tr>`).join('')}
  </tbody></table></div>`;
}

/* jedno zdanie „jak liczymy” – to samo pod Podsumowaniem i Według aut */
const COST_NOTE = 'Wszystkie kwoty netto. Paragony kierowców i karty – bez VAT (PL 23%, DE 19%, CZ 21%; karty – netto z wyciągu). Ubezpieczenie – roczna składka z polisy auta po 1/12 na miesiąc. Leasing – rata netto z umowy. Km z GPS (bez GPS – z liczników).';
