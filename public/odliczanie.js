/* Emage FLEET — Serwis → Terminy: odliczanie km do oleju, rozrządu i przeglądu gwarancyjnego.
   Codzienny podgląd „który bus ma najbliżej”: zostało km (z GPS), pasek zużycia cyklu, przybliżona data wg tempa jazdy.
   Auta bez terminu danego rodzaju na dole – z przyciskiem „Ustaw”. */
'use strict';
let cdType = 'Serwis olejowy';
const CD_TYPES = [['Serwis olejowy', 'Olej'], ['Wymiana rozrządu', 'Rozrząd'], ['Przegląd gwarancyjny', 'Przegląd gwar.']];
const cdOn = () => !!(P().manage || P().service);
function cdRows(type){
  const vs = S.vehicles.filter(v => v.status!=='wycofany');
  const rows = [], none = [];
  vs.forEach(v => {
    const d = S.deadlines.filter(x => x.vehicleId===v.id && x.type===type).sort((a, b) => (Number(a.kmDue) || Infinity) - (Number(b.kmDue) || Infinity))[0];
    if (!d){ none.push(v); return; }
    const sk = svcKm(v.id), cur = sk && sk.km != null ? Number(sk.km) : null, due = Number(d.kmDue) || null;
    const left = cur != null && due ? due - cur : null, step = Number(d.intervalKm) || (DL_INTERVALS[type] || [])[1] || null;
    const used = left != null && step ? Math.min(1, Math.max(0, 1 - left / step)) : null;
    const rate = typeof kmPerDay==='function' ? kmPerDay(v.id) : 0, days = left != null && left > 0 && rate > 5 ? Math.round(left / rate) : null;
    rows.push({v, d, s: dlState(d), cur, gps: sk && sk.gps, due, left, step, used, days, rate});
  });
  rows.sort((a, b) => (a.left == null ? Infinity : a.left) - (b.left == null ? Infinity : b.left));
  return {rows, none};
}
function cdCount(){
  if (!cdOn()) return {n: 0, bad: false};
  const xs = S.deadlines.filter(d => isKmDl(d) && ['bad', 'warn'].includes(dlState(d).cls) && (byId('vehicles', d.vehicleId) || {}).status!=='wycofany');
  return {n: xs.length, bad: xs.some(d => dlState(d).cls==='bad')};
}
function viewSvcCountdown(){
  const nf = new Intl.NumberFormat('pl-PL');
  const cnt = t => cdRows(t).rows.filter(r => ['bad', 'warn'].includes(r.s.cls)).length;
  const {rows, none} = cdRows(cdType);
  const head = `<div class="bar"><h2>Terminy serwisowe</h2><div class="tools"><div class="seg">${CD_TYPES.map(([t, l]) => { const c = cnt(t);
    return `<button type="button" class="${cdType===t ? 'on' : ''}" data-cd-type="${esc(t)}">${l}${c ? ` <span class="count bad">${c}</span>` : ''}</button>`; }).join('')}</div></div></div>`;
  const row = r => {
    const tone = r.s.cls==='bad' ? 'bad' : r.s.cls==='warn' ? 'warn' : r.s.cls==='soon' ? 'soon' : 'ok';
    const big = r.left == null ? '—' : r.left <= 0 ? `+${nf.format(-r.left)}` : nf.format(r.left);
    const lbl = r.left == null ? 'brak przebiegu' : r.left <= 0 ? 'km po terminie' : 'km zostało';
    const act = canEditDoc('deadlines', r.d) ? `<button class="small ${tone==='bad' || tone==='warn' ? 'primary' : ''}" data-renew="${esc(r.d.id)}">Wykonane</button>` : '';
    return `<div class="cd-row ${tone}">
      <div class="cd-left"><b class="num">${big}</b><span>${lbl}</span></div>
      <div class="cd-mid"><div class="cd-car">${plate(r.v.plate)}<span class="sub">${esc([r.v.make, r.v.model].filter(Boolean).join(' '))}</span></div>
        ${r.used != null ? `<div class="cd-meter" role="img" aria-label="Zużyto ${Math.round(r.used * 100)}% cyklu"><i style="width:${Math.round(r.used * 100)}%"></i></div>` : ''}
        <span class="sub">${r.cur != null ? `teraz ${km(r.cur)}${r.gps ? ' (GPS)' : ' (bez GPS)'}` : 'brak przebiegu auta'} · wymiana przy ${r.due ? km(r.due) : '—'}${r.step ? ` · co ${km(r.step)}` : ''}${r.days != null ? ` · ok. ${r.days} ${r.days===1 ? 'dzień' : 'dni'} (jeździ ~${nf.format(Math.round(r.rate))} km/dzień)` : ''}</span></div>
      <div class="cd-act"><span class="pill ${tone==='soon' ? 'warn' : tone}">${esc(r.s.txt)}</span>${act}</div></div>`;
  };
  const canSet = canCreate('deadlines');
  return head + `<div class="panel"><div class="sec-head"><h3>${esc(CD_TYPES.find(([t]) => t===cdType)[1])} – od najbliższego</h3><span class="count">${rows.length}</span></div>
      ${rows.length ? `<div class="cd-list">${rows.map(row).join('')}</div>` : '<p class="muted sec-empty">Żadne auto nie ma jeszcze tego terminu – ustaw go niżej.</p>'}</div>
    ${none.length ? `<details class="panel fold" ${rows.length ? '' : 'open'}><summary class="sec-head"><h3>Bez terminu</h3><span class="count">${none.length}</span></summary><div class="dl">
      ${none.sort((a, b) => a.plate.localeCompare(b.plate)).map(v => `<div class="mini">${plate(v.plate)}<span><span class="sub">${esc([v.make, v.model].filter(Boolean).join(' '))}${v.km ? ' · ' + km(v.km) : ''}</span></span><span class="mini-r">${canSet ? `<button class="small" data-cd-set="${esc(v.id)}">Ustaw</button>` : ''}</span></div>`).join('')}</div></details>` : ''}`;
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-cd-type]'); if (t){ cdType = t.dataset.cdType; render(); return; }
  const s = e.target.closest('[data-cd-set]'); if (s){
    const def = DL_INTERVALS[cdType] || [null, null];
    openForm('deadlines', null, {vehicleId: s.dataset.cdSet, type: cdType, date: null, intervalMonths: null, intervalKm: def[1], remindKm: cdType==='Serwis olejowy' ? 2000 : 5000});
    setTimeout(() => typeof dlDoneUi==='function' && dlDoneUi(), 30);
  }
});
