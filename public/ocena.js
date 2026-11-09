/* Emage FLEET — ocena kierowców (Pracownicy → Kierowcy → Ocena kierowców, tylko kierownik floty).
   Punkty 0–100 za ostatnie 30 / 90 dni, z wyjaśnieniem: spalanie na jego odcinkach vs średnia floty,
   podejrzane tankowania z kart, tankowania do wyjaśnienia, złe liczniki, szkody, spóźnione zdania auta.
   Bez nowej tabeli – liczone z danych, które już są (te same co karta kierowcy). */
'use strict';
let rankDays = 30;
const RANK_RULES = [
  ['fuel', 'spalanie ponad średnią floty', 25], ['susp', 'podejrzane tankowania z kart', 8, 24], ['flag', 'tankowania do wyjaśnienia', 5, 15],
  ['odo', 'błędne liczniki', 4, 12], ['acc', 'szkody / kolizje', 15, 30], ['late', 'spóźnione zdania auta', 4, 12],
];
function fleetRate(from, to){
  const rs = S.drivers.map(d => drvCardStats(d.id, from, to)).filter(s => s.rate!=null && s.km >= 300);
  const km = rs.reduce((a, s) => a + s.km, 0), l = rs.reduce((a, s) => a + s.l, 0);
  return km ? l / km * 100 : null;
}
function driverScore(id, from, to, avg){
  const s = drvCardStats(id, from, to); if (s.days < 1) return null;
  const ch = typeof fcCheckedIds==='function' ? fcCheckedIds() : new Set();
  const late = S.bookings.filter(b => b.driverId===id && b.pickup && b.to >= from && b.to <= to && ((b.returned && b.returned.at.slice(0, 10) > b.to) || (!b.returned && b.to < today()))).length;
  const n = {susp: s.susp.filter(x => !ch.has(x.row.id)).length, flag: s.flagged.length, odo: s.bad.length, acc: s.acc.length, late};
  const why = []; let pts = 100;
  if (s.rate!=null && avg){ const over = s.rate / avg - 1; if (over > 0.03){ const m = Math.min(25, Math.round(over * 150)); pts -= m; why.push([m, `spalanie ${s.rate.toFixed(1).replace('.', ',')} l/100 (+${Math.round(over * 100)}% vs flota)`]); } }
  RANK_RULES.slice(1).forEach(([k, l, per, max]) => { if (!n[k]) return; const m = Math.min(max, n[k] * per); pts -= m; why.push([m, `${l}: ${n[k]}`]); });
  pts = Math.max(0, Math.round(pts));
  return {id, s, n, pts, why: why.sort((a, b) => b[0] - a[0]), grade: pts >= 85 ? ['ok', 'bardzo dobry'] : pts >= 70 ? ['ok', 'dobry'] : pts >= 50 ? ['warn', 'do poprawy'] : ['bad', 'słaby']};
}
function rankRows(){
  const to = today(), from = addDays(to, -(rankDays - 1)), avg = fleetRate(from, to);
  const rows = S.drivers.filter(d => d.active!==false).map(d => driverScore(d.id, from, to, avg)).filter(Boolean).sort((a, b) => b.pts - a.pts || b.s.days - a.s.days);
  return {rows, avg, from, to, none: S.drivers.filter(d => d.active!==false && !rows.some(r => r.id===d.id))};
}
function viewRanking(){
  if (!P().manage) return '';
  const {rows, avg, none} = rankRows();
  const bar = p => `<span class="rk-bar"><i style="width:${p}%" class="${p >= 85 ? 'ok' : p >= 70 ? 'good' : p >= 50 ? 'warn' : 'bad'}"></i></span>`;
  const c = (x, bad) => x ? `<b class="${bad ? 'neg' : ''}">${x}</b>` : '<span class="muted">0</span>';
  return `<div class="bar"><h2>Ocena kierowców</h2><div class="tools"><div class="seg">${[30, 90].map(n => `<button type="button" class="${rankDays===n ? 'on' : ''}" data-rk-days="${n}">${n} dni</button>`).join('')}</div>
      <button class="small" data-action="rank-xlsx">${ic('download')}Excel</button></div></div>
    <div class="panel tablewrap"><table class="rk-tbl"><thead><tr><th>#</th><th>Kierowca</th><th>Wynik</th><th class="r">Dni pracy</th><th class="r">Spalanie</th><th class="r">Podejrz. z kart</th><th class="r">Do wyjaśn.</th><th class="r">Liczniki</th><th class="r">Szkody</th><th class="r">Spóźn. zdania</th><th>Dlaczego</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="click" data-drv-card="${esc(r.id)}"><td class="num muted">${i + 1}</td><td><b>${esc(dName(r.id))}</b></td>
        <td class="rk-cell"><b class="num">${r.pts}</b>${bar(r.pts)}<span class="pill ${r.grade[0]}">${r.grade[1]}</span>${r.s.days < 5 ? '<span class="sub">mało danych</span>' : ''}</td>
        <td class="r num">${r.s.days}</td><td class="r num">${r.s.rate!=null ? r.s.rate.toFixed(1).replace('.', ',') + (avg ? `<span class="sub">${r.s.rate > avg * 1.03 ? '+' : ''}${Math.round((r.s.rate / avg - 1) * 100)}%</span>` : '') : '<span class="muted">—</span>'}</td>
        <td class="r num">${c(r.n.susp, 1)}</td><td class="r num">${c(r.n.flag, 1)}</td><td class="r num">${c(r.n.odo, 1)}</td><td class="r num">${c(r.n.acc, 1)}</td><td class="r num">${c(r.n.late, 1)}</td>
        <td class="small">${r.why.length ? r.why.map(([m, t]) => `−${m} ${esc(t)}`).join('<br>') : '<span class="muted">bez uwag</span>'}</td></tr>`).join('') || '<tr><td colspan="11" class="muted">Brak kierowców z pracą w grafiku w tym okresie.</td></tr>'}
    </tbody></table></div>
    <p class="muted small" style="margin:0;max-width:95ch">Start 100 pkt. Odejmujemy: spalanie ponad średnią floty${avg ? ` (${avg.toFixed(1).replace('.', ',')} l/100 km)` : ''} – do 25 pkt; podejrzane tankowania z kart (niewyjaśnione) – 8 pkt (max 24); tankowania do wyjaśnienia – 5 (max 15); błędne liczniki – 4 (max 12); szkody w dniach jego jazdy – 15 (max 30); spóźnione zdania auta – 4 (max 12). Oceniamy kierowców, którzy w tym okresie byli w grafiku (poniżej 5 dni – „mało danych”).${none.length ? ` Bez oceny (nie było ich w grafiku): ${esc(none.map(d => d.name).join(', '))}.` : ''} Kliknij wiersz – karta kierowcy.</p>`;
}
async function rankXlsx(){
  const X = await loadXLSX(), {rows, from, to} = rankRows();
  const data = rows.map((r, i) => ({'Miejsce': i + 1, 'Kierowca': dName(r.id), 'Wynik': r.pts, 'Ocena': r.grade[1], 'Dni pracy': r.s.days, 'Spalanie (l/100 km)': r.s.rate!=null ? +r.s.rate.toFixed(1) : '',
    'Podejrzane z kart': r.n.susp, 'Do wyjaśnienia': r.n.flag, 'Błędne liczniki': r.n.odo, 'Szkody': r.n.acc, 'Spóźnione zdania': r.n.late, 'Dlaczego': r.why.map(([m, t]) => `-${m} ${t}`).join('; ')}));
  const wb = X.utils.book_new(), ws = X.utils.json_to_sheet(data.length ? data : [{'Informacja':'Brak danych'}]);
  ws['!cols'] = [{wch:8},{wch:24},{wch:8},{wch:13},{wch:10},{wch:12},{wch:12},{wch:12},{wch:12},{wch:8},{wch:12},{wch:60}];
  X.utils.book_append_sheet(wb, ws, 'Ocena kierowców'); X.writeFile(wb, `ocena-kierowcow_${from}_${to}.xlsx`);
}
document.addEventListener('click', e => {
  const d = e.target.closest('[data-rk-days]'); if (d){ rankDays = Number(d.dataset.rkDays); render(); return; }
  if (e.target.closest('[data-action="rank-xlsx"]')){ e.preventDefault(); rankXlsx().catch(() => toast('Nie udało się przygotować pliku')); return; }
});
