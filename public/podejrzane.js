/* Emage FLEET — podejrzane tankowania z kart paliwowych (kierownik floty).
   Reguły (dla każdego tankowania paliwa z karty):
   1. więcej litrów niż bak auta (+5%),
   2. w ciągu doby (24 h, to samo auto) więcej niż 1,2 baku,
   3. drugie tankowanie tego samego auta w ciągu 3 godzin,
   4. cena za litr ponad 15% wyżej niż mediana z tego miesiąca (PLN),
   5. auto nie było tego dnia w grafiku (tylko od dnia, od którego prowadzony jest grafik).
   „Sprawdzone” zapisuje się w ustawieniach (settings: fc_checked). */

const fcCheckedIds = () => new Set(((S.settings.find(x => x.id==='fc_checked') || {}).ids) || []);
let suspMemo = {k: '', v: []};
let suspShowChecked = false;

function fcSuspicious(){
  const rows = (S.fuelCardRows || []).filter(r => r.kind!=='other' && r.vehicleId && Number(r.liters) > 0);
  const key = rows.length + '|' + S.vehicles.length + '|' + S.bookings.length + '|' + (rows[0] || {}).id;
  if (suspMemo.k===key) return suspMemo.v;
  const ts = r => { const t = /^(\d{1,2}):(\d{2})/.exec(r.txTime || ''); return t ? Date.parse(r.txDate + 'T00:00:00') + (Number(t[1]) * 60 + Number(t[2])) * 60e3 : null; };
  const out = new Map(); const add = (r, why) => { if (!out.has(r.id)) out.set(r.id, {row: r, why: []}); out.get(r.id).why.push(why); };
  const byV = {}; rows.forEach(r => (byV[r.vehicleId] = byV[r.vehicleId] || []).push(r));
  Object.entries(byV).forEach(([vid, xs]) => {
    const v = byId('vehicles', vid) || {}, tank = Number(v.tankL) || 90;
    xs.sort((a, b) => (a.txDate + (a.txTime || '')).localeCompare(b.txDate + (b.txTime || '')));
    xs.forEach((r, i) => {
      const l = Number(r.liters);
      if (l > tank * 1.05) add(r, `Więcej niż bak: ${fl(l)} (bak ${fl(tank)})`);
      const t = ts(r);
      if (t != null){
        let sum = l;
        for (let j = i - 1; j >= 0; j--){ const tj = ts(xs[j]); if (tj == null || t - tj > 24 * 3600e3) break; sum += Number(xs[j].liters); }
        if (sum > tank * 1.2 && l <= tank * 1.05) add(r, `W ciągu doby ${fl(sum)} (bak ${fl(tank)})`);
        const p = xs[i - 1], tp = p ? ts(p) : null;
        if (tp != null && t - tp < 3 * 3600e3) add(r, `Drugie tankowanie po ${Math.round((t - tp) / 60e3)} min`);
      } else {
        const sameDay = xs.filter(x => x.txDate===r.txDate).reduce((s, x) => s + Number(x.liters), 0);
        if (sameDay > tank * 1.2 && xs.filter(x => x.txDate===r.txDate).pop()===r) add(r, `Jednego dnia ${fl(sameDay)} (bak ${fl(tank)})`);
      }
    });
  });
  // cena za litr vs mediana miesiąca
  const pln = rows.filter(r => (!r.currency || r.currency==='PLN') && Number(r.amount) > 0);
  const byM = {}; pln.forEach(r => (byM[r.txDate.slice(0, 7)] = byM[r.txDate.slice(0, 7)] || []).push(Number(r.amount) / Number(r.liters)));
  const med = {}; Object.entries(byM).forEach(([m, a]) => { a.sort((x, y) => x - y); med[m] = a[Math.floor(a.length / 2)]; });
  pln.forEach(r => { const pr = Number(r.amount) / Number(r.liters), m = med[r.txDate.slice(0, 7)];
    if (m && byM[r.txDate.slice(0, 7)].length >= 10 && pr > m * 1.15) add(r, `Cena ${pr.toFixed(2).replace('.', ',')} zł/l – mediana ${m.toFixed(2).replace('.', ',')}`); });
  // poza grafikiem
  const first = S.bookings.reduce((m, b) => !m || b.from < m ? b.from : m, '');
  if (first) rows.forEach(r => { if (r.txDate >= first && !S.bookings.some(b => b.vehicleId===r.vehicleId && b.from<=r.txDate && b.to>=r.txDate)) add(r, 'Auto nie było tego dnia w grafiku'); });
  const v = [...out.values()].sort((a, b) => (b.row.txDate + (b.row.txTime || '')).localeCompare(a.row.txDate + (a.row.txTime || '')));
  suspMemo = {k: key, v};
  return v;
}
const suspTodoCount = () => { const ch = fcCheckedIds(); return fcSuspicious().filter(x => !ch.has(x.row.id)).length; };

function suspPanel(){
  const all = fcSuspicious(); if (!all.length) return '';
  const ch = fcCheckedIds(), todo = all.filter(x => !ch.has(x.row.id));
  const list = suspShowChecked ? all : todo;
  const rows = list.slice(0, 200).map(({row: r, why}) => `<div class="sp-row ${ch.has(r.id) ? 'done' : ''}">
    <span class="sp-d num"><b>${fdate(r.txDate)}</b><em>${esc(r.txTime || '')}</em></span>
    <span class="sp-v">${vPlate(r.vehicleId)}<span class="sub">${esc(fcDriver(r, null) || 'kierowca nieustalony')}${r.station ? ' · ' + esc(r.station) : ''}</span></span>
    <span class="sp-a num">${fl(r.liters)}<span class="sub">${fm(r.amount, r.currency)}</span></span>
    <span class="sp-w">${why.map(w => `<span class="pill warn">${esc(w)}</span>`).join('')}</span>
    <button class="small ${ch.has(r.id) ? 'ghost' : ''}" data-sp-ok="${esc(r.id)}">${ch.has(r.id) ? 'Cofnij' : `${ic('check')}Sprawdzone`}</button></div>`).join('');
  return `<details class="panel fold susp" ${todo.length ? 'open' : ''}><summary class="sec-head"><h3>Podejrzane tankowania</h3><span class="count ${todo.length ? 'bad' : ''}">${todo.length}</span></summary>
    <div class="sp-tools"><span class="muted small">Ze wszystkich zestawień: więcej niż bak, dużo litrów w ciągu doby, dwa tankowania w 3 godziny, wysoka cena za litr, auto poza grafikiem.</span>
      <span class="sp-tr">${todo.length > 5 ? `<button class="small ghost" data-sp-allok>Wszystkie jako sprawdzone</button>` : ''}<label class="check small"><input type="checkbox" data-sp-all ${suspShowChecked ? 'checked' : ''}> pokaż sprawdzone (${all.length - todo.length})</label></span></div>
    ${rows || '<p class="muted sec-empty">Wszystko sprawdzone.</p>'}${list.length > 200 ? `<p class="muted small sec-empty">Pokazano 200 z ${list.length}.</p>` : ''}</details>`;
}

async function suspMark(id){
  const set = fcCheckedIds(); let on;
  if (id==='*'){ fcSuspicious().forEach(x => set.add(x.row.id)); on = true; }
  else { on = !set.has(id); on ? set.add(id) : set.delete(id); }
  try { await db.collection('settings').doc('fc_checked').set({ids: [...set]}); toast(id==='*' ? 'Wszystkie oznaczone jako sprawdzone' : on ? 'Oznaczono jako sprawdzone' : 'Cofnięto'); }
  catch(err){ handleWriteErr(err); }
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-sp-allok]')){ e.preventDefault(); suspMark('*'); return; }
  const t = e.target.closest('[data-sp-ok]'); if (!t) return; e.preventDefault(); suspMark(t.dataset.spOk); });
document.addEventListener('change', e => { if (e.target.matches('[data-sp-all]')){ suspShowChecked = e.target.checked; render(); } });

/* Cena paliwa z kart: średnia zł/l w ostatnich 6 miesiącach i stacje najdroższe / najtańsze (min. 5 tankowań) */
function fuelPricePanel(){
  const rows = (S.fuelCardRows || []).filter(r => r.kind!=='other' && (!r.currency || r.currency==='PLN') && Number(r.liters) > 5 && Number(r.amount) > 0);
  if (rows.length < 10) return '';
  const byM = {}; rows.forEach(r => { const m = r.txDate.slice(0, 7); (byM[m] = byM[m] || {l:0, a:0, n:0}); byM[m].l += +r.liters; byM[m].a += +r.amount; byM[m].n++; });
  const ms = Object.keys(byM).sort().slice(-6);
  const pr = m => byM[m].a / byM[m].l;
  const lo = Math.min(...ms.map(pr)) * 0.97, hi = Math.max(...ms.map(pr)) * 1.01;
  const MN = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];
  const st = {}; rows.forEach(r => { const k = (r.station || '').trim(); if (!k) return; (st[k] = st[k] || {l:0, a:0, n:0}); st[k].l += +r.liters; st[k].a += +r.amount; st[k].n++; });
  const all = rows.reduce((s, r) => s + +r.amount, 0) / rows.reduce((s, r) => s + +r.liters, 0);
  const sl = Object.entries(st).filter(([, x]) => x.n >= 5).map(([k, x]) => ({k, p: x.a / x.l, n: x.n, l: x.l})).sort((a, b) => b.p - a.p);
  const f2 = x => x.toFixed(2).replace('.', ',');
  const stRow = x => `<div class="mini"><span>${esc(x.k)}</span><span class="muted small">${x.n} tank. · ${fl(x.l)}</span><span class="mini-r num"><b class="${x.p > all * 1.03 ? 'neg' : x.p < all * 0.98 ? 'pos' : ''}">${f2(x.p)} zł/l</b></span></div>`;
  return `<details class="panel fold"><summary class="sec-head"><h3>Cena paliwa</h3><span class="muted small">średnio ${f2(all)} zł/l</span></summary>
    <div class="fp-ch">${ms.map(m => `<div class="fp-c"><b class="num">${f2(pr(m))}</b><div class="fp-b" style="height:${Math.round((pr(m) - lo) / Math.max(0.01, hi - lo) * 100)}%"></div><span>${MN[+m.slice(5) - 1]}</span></div>`).join('')}</div>
    ${sl.length >= 4 ? `<div class="grid2 fp-st"><div><span class="label">Najdroższe stacje</span>${sl.slice(0, Math.min(5, Math.floor(sl.length / 2))).map(stRow).join('')}</div><div><span class="label">Najtańsze stacje</span>${sl.slice(-Math.min(5, Math.floor(sl.length / 2))).reverse().map(stRow).join('')}</div></div>
      <p class="muted small sec-empty">Kwoty brutto z kart, tylko stacje z co najmniej 5 tankowaniami. Warto podpowiedzieć kierowcom tańsze stacje na trasach.</p>` : ''}</details>`;
}
