/* ============================================================================
   Emage FLEET — Karta pracy kierowcy (migracja 072)
   Wpisy liczy automatycznie funkcja „powiadomienia” z GPS (tryb work): jazda, praca inna, postój, przekroczenia granic,
   od przejęcia do zdania auta w aplikacji. Kierownik floty: karta każdego kierowcy za miesiąc, poprawki rodzaju aktywności,
   eksport do Excela w układzie firmowego wzoru. Kierowca: tylko podgląd swojej karty.
   ============================================================================ */
const WC_KIND = {jazda: 'JAZDA', praca: 'PRACA INNA', gotowosc: 'GOTOWOŚĆ', postoj: 'POSTÓJ'};
const wcOn = () => optOn('workEvents');
let wcDrv = '', wcMonth = '', wcBusy = false;
const wcCache = new Map();   // kierowca|miesiąc → wpisy
const wcParts = iso => { const d = new Date(iso), f = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).format(d).replace(',', '');
  const [day, hm] = f.split(' '); const [h, m] = hm.split(':').map(Number); return {day, min: (h % 24) * 60 + m}; };
const wcHM = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const wcDur = m => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min`;

async function wcLoad(drv, month, force){
  const k = drv + '|' + month; if (!force && wcCache.has(k)) return wcCache.get(k);
  const [y, m] = month.split('-').map(Number), from = new Date(Date.UTC(y, m - 1, 1) - 2 * 864e5).toISOString(), to = new Date(Date.UTC(y, m, 1) + 864e5).toISOString();
  const {data, error} = await sb.from('work_events').select('*').eq('driver_id', drv).gte('start_ts', from).lt('start_ts', to).order('start_ts');
  if (error) throw error;
  const rows = (data || []).map(r => ({id: r.id, bookingId: r.booking_id, vehicleId: r.vehicle_id, kind: r.kind, start: r.start_ts, end: r.end_ts, country: r.country, crossCountry: r.cross_country, crossTs: r.cross_ts, km: r.km, source: r.source}));
  wcCache.set(k, rows); return rows;
}
/* wiersze karty: wpisy podzielone o północy (czas polski), tylko dni z wybranego miesiąca */
function wcLines(rows, month){
  const out = [];
  rows.forEach(r => {
    const a = wcParts(r.start), b = wcParts(r.end || new Date().toISOString());
    const cr = r.crossCountry ? wcParts(r.crossTs || r.start) : null;
    let day = a.day, s = a.min;
    while (true){
      const last = day===b.day, e = last ? b.min : 1440;
      if (day.slice(0, 7)===month && (e > s || last && e===s && r.kind==='jazda'))
        out.push({r, day, from: s, to: e, cross: cr && cr.day===day && cr.min >= s && cr.min <= e ? {code: r.crossCountry, min: cr.min} : null, open: !r.end});
      if (last || day > b.day) break;
      day = addDays(day, 1); s = 0;
    }
  });
  return out.sort((x, y) => x.day < y.day ? -1 : x.day > y.day ? 1 : x.from - y.from);
}
function wcSum(lines){
  const s = {jazda: 0, praca: 0, gotowosc: 0, postoj: 0}, days = new Set(), ctry = {};
  lines.forEach(l => { const d = l.to - l.from; s[l.r.kind] = (s[l.r.kind] || 0) + d; days.add(l.day); if (l.r.country) ctry[l.r.country] = (ctry[l.r.country] || 0) + d; });
  return {s, days: days.size, ctry, work: s.jazda + s.praca + s.gotowosc};
}

/* ---------- widok (kierownik: wybór kierowcy; kierowca: tylko swoja karta) ---------- */
function viewWorkCard(own){
  const title = own ? 'Moja karta pracy' : 'Karta pracy';
  if (!wcOn()) return `<div class="bar"><h2>${title}</h2></div>${loadingOr('workEvents', `<div class="panel empty"><p>Karta pracy wymaga uruchomienia migracji 072 w bazie.</p></div>`)}`;
  const drivers = S.drivers.filter(d => d.active!==false).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  if (own) wcDrv = myDriverId() || '';
  if (!wcDrv && drivers.length) wcDrv = drivers[0].id;
  if (!wcMonth) wcMonth = today().slice(0, 7);
  const k = wcDrv + '|' + wcMonth, rows = wcCache.get(k);
  if (wcDrv && !rows && !wcBusy){ wcBusy = true; wcLoad(wcDrv, wcMonth).catch(e => { wcCache.set(k, []); toast('Nie udało się wczytać karty pracy: ' + (e.message || e)); }).finally(() => { wcBusy = false; render(); }); }
  const months = monthsList(addDays(today(), -365).slice(0, 7), today().slice(0, 7)).reverse();
  const d = byId('drivers', wcDrv) || {};
  const tools = `<div class="tools">
      ${own ? '' : `<select id="wc-drv" aria-label="Kierowca" style="width:auto">${drivers.map(x => `<option value="${esc(x.id)}" ${x.id===wcDrv ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`}
      <select id="wc-month" aria-label="Miesiąc" style="width:auto">${months.map(x => `<option value="${x}" ${x===wcMonth ? 'selected' : ''}>${monthLabel(x)}</option>`).join('')}</select>
      ${own ? '' : `<button class="ghost" data-wc-reload title="Wczytaj ponownie">${ic('refresh')}Odśwież</button><button class="primary" data-wc-xlsx ${rows && rows.length ? '' : 'disabled'}>${ic('download')}Pobierz Excel</button>`}</div>`;
  if (!rows) return `<div class="bar"><h2>${title}</h2>${tools}</div><div class="panel empty"><p>Wczytuję kartę pracy…</p></div>`;
  const lines = wcLines(rows, wcMonth), sm = wcSum(lines);
  const plate = id => (byId('vehicles', id) || {}).plate || '';
  const kindSel = l => own || l.open ? `<b>${WC_KIND[l.r.kind]}</b>` : `<select class="wc-kind" data-wc-kind="${esc(l.r.id)}" aria-label="Aktywność">${Object.entries(WC_KIND).map(([kk, v]) => `<option value="${kk}" ${kk===l.r.kind ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
  const body = lines.length ? lines.map(l => `<tr class="${l.open ? 'wc-open' : ''}"><td>${kindSel(l)}${l.r.source==='manual' && !own ? '<span class="sub">poprawione ręcznie</span>' : ''}</td><td class="num">${fdate(l.day)}</td><td class="num">${wcHM(l.from)}</td><td class="num">${l.open && l.to < 1440 ? wcHM(l.to) + ' <span class="pill warn">trwa</span>' : wcHM(l.to)}</td>
      <td>${l.cross ? `<b>${esc(l.cross.code)}</b>` : ''}</td><td class="num">${l.cross ? wcHM(l.cross.min) : ''}</td><td>${esc(plate(l.r.vehicleId))}</td></tr>`).join('')
    : `<tr><td colspan="7" class="muted">Brak wpisów w tym miesiącu. Karta uzupełnia się sama z GPS od przejęcia do zdania auta w aplikacji (co ok. 15 min).</td></tr>`;
  const sum = lines.length ? `<div class="wc-sum">
      <div><span class="label">Jazda</span><b>${wcDur(sm.s.jazda)}</b></div><div><span class="label">Praca inna</span><b>${wcDur(sm.s.praca)}</b></div>
      <div><span class="label">Gotowość</span><b>${wcDur(sm.s.gotowosc)}</b></div><div><span class="label">Postój</span><b>${wcDur(sm.s.postoj)}</b></div>
      <div><span class="label">Czas pracy (jazda + praca + gotowość)</span><b>${wcDur(sm.work)}</b></div><div><span class="label">Dni z wpisami</span><b>${sm.days}</b></div>
      <div><span class="label">W krajach</span><b>${Object.entries(sm.ctry).sort((a, b) => b[1] - a[1]).map(([c, m]) => `${esc(c)} ${wcDur(m)}`).join(' · ') || '—'}</b></div></div>` : '';
  const restore = !own && rows.some(r => r.source==='manual') ? `<p class="muted small">Dni poprawione ręcznie nie są już nadpisywane z GPS. <button type="button" class="link" data-wc-restore>Przywróć dane z GPS dla tego miesiąca</button></p>` : '';
  return `<div class="bar"><h2>${title}</h2>${tools}</div>
    <div class="panel wc-card"><div class="wc-head"><div class="wc-title">KARTA PRACY KIEROWCY</div>
      <div class="wc-name"><span>IMIĘ i NAZWISKO:</span><b>${esc(d.name || '')}</b><span class="muted">${monthLabel(wcMonth)}</span></div></div>
      <div class="tablewrap"><table class="wc-t"><thead><tr><th>AKTYWNOŚCI (jazda/praca inna/gotowość/postój)</th><th>DATA</th><th>GODZINA OD</th><th>GODZINA DO</th><th>PRZEKROCZENIE GRANIC (kod kraju wjazdu)</th><th>GODZINA PRZEKROCZENIA GRANICY</th><th>NR REJ. POJAZDU</th></tr></thead><tbody>${body}</tbody></table></div></div>
    ${sum}${restore}
    <p class="muted small">Wpisy z GPS: przejazdy = jazda; zatrzymanie u klienta lub na bazie (punkty z Planera tras) = praca inna; czas przed pierwszym wyjazdem i po ostatnim przejeździe do zdania auta = praca inna; inne zatrzymania od 15 min = postój. Granica: kraj wjazdu i godzina z pozycji GPS. ${own ? 'Jeśli coś się nie zgadza, zgłoś to kierownikowi.' : 'Rodzaj aktywności możesz poprawić w wierszu.'}</p>`;
}

/* ---------- eksport Excel – układ jak w firmowym wzorze „Karta pracy” ---------- */
function wcExport(){
  const rows = wcCache.get(wcDrv + '|' + wcMonth) || [], lines = wcLines(rows, wcMonth), sm = wcSum(lines), d = byId('drivers', wcDrv) || {};
  const plate = id => (byId('vehicles', id) || {}).plate || '';
  const R = [
    [{v: 'KARTA PRACY KIEROWCY', s: 1}, {s: 1}, {s: 1}, {s: 1}, {s: 1}, {s: 1}, {s: 1}],
    [{v: 'IMIE i NAZWISKO:', s: 2}, {v: `${d.name || ''} – ${monthLabel(wcMonth)}`, s: 4}, {s: 4}, {s: 4}, {s: 4}, {s: 4}, {s: 4}],
    [{v: 'AKTYWNOŚCI (jazda/praca inna/gotowość/postój)', s: 2}, {v: 'DATA', s: 3}, {v: 'GODZINA OD', s: 3}, {v: 'GODZINA DO', s: 3}, {v: 'PRZEKROCZENIE GRANIC (kod kraju wjazdu)', s: 3}, {v: 'GODZINA PRZEKROCZENIA GRANICY', s: 3}, {v: 'NR REJ. POJAZDU', s: 3}],
    ...lines.map(l => [{v: WC_KIND[l.r.kind], s: 5}, {v: {date: l.day}, s: 6}, {v: {time: l.from}, s: 7}, {v: {time: l.to}, s: 8}, {v: l.cross ? l.cross.code : '', s: 9}, l.cross ? {v: {time: l.cross.min}, s: 7} : {s: 9}, {v: plate(l.r.vehicleId), s: 9}]),
    [],
    [{v: 'PODSUMOWANIE MIESIĄCA', s: 10}],
    ...[['Jazda', sm.s.jazda], ['Praca inna', sm.s.praca], ['Gotowość', sm.s.gotowosc], ['Postój', sm.s.postoj], ['Czas pracy (jazda + praca inna + gotowość)', sm.work]].map(([l, m]) => [{v: l, s: 13}, {v: {time: m}, s: 8}]),
    [{v: 'Dni z wpisami', s: 13}, {v: sm.days, s: 9}],
    ...Object.entries(sm.ctry).sort((a, b) => b[1] - a[1]).map(([c, m]) => [{v: 'Czas w kraju: ' + c, s: 13}, {v: {time: m}, s: 8}]),
  ];
  const book = {sheets: [
    {name: 'MIESIĘCZNA KARTA PRACY KIEROWCY', cols: [45.14, 13.71, 12.43, 12.14, 23.43, 15.14, 16], rows: R, merges: ['A1:G1', 'B2:G2'], heights: {1: 35.1, 2: 30, 3: 51.95}},
    {name: 'AKTYWNOŚCI', cols: [22, 110], rows: [[{v: 'Rodzaj aktywności', s: 3}, {v: 'Definicja', s: 3}],
      ['JAZDA', 'Czas aktywnego prowadzenia pojazdu przez kierowcę.'], ['PRACA INNA', 'Czas wykonywania innych czynności zawodowych, np. załadunek, rozładunek, mycie pojazdu, wypełnianie dokumentów – wszystko poza jazdą.'],
      ['GOTOWOŚĆ', 'Czas oczekiwania, w którym kierowca pozostaje do dyspozycji pracodawcy, ale nie wykonuje żadnej pracy – np. podczas odprawy celnej czy jazdy jako drugi kierowca.'],
      ['POSTÓJ', 'Czas przerwy lub odpoczynku – kierowca nie pracuje i nie pozostaje w gotowości. Może to być pauza dzienna, tygodniowa lub krótsza przerwa.']].map((r, i) => i ? r.map(v => ({v, s: 11})) : r)}]};
  const blob = xlsxMini(book), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `Karta_Pracy_${(d.name || 'kierowca').replace(/\s+/g, '_')}_${wcMonth}.xlsx`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id==='wc-drv'){ wcDrv = t.value; return render(); }
  if (t.id==='wc-month'){ wcMonth = t.value; return render(); }
  if (t.dataset && t.dataset.wcKind && P().manage){
    const rows = wcCache.get(wcDrv + '|' + wcMonth) || [], r = rows.find(x => x.id===t.dataset.wcKind); if (!r) return;
    try {
      // poprawka ręczna: cały ten dzień pracy (przejęcie) przestaje być nadpisywany z GPS
      if (r.bookingId){ const u = await sb.from('work_events').update({source: 'manual'}).eq('booking_id', r.bookingId); if (u.error) throw u.error; }
      const {error} = await sb.from('work_events').update({kind: t.value, source: 'manual', updated_at: new Date().toISOString()}).eq('id', r.id); if (error) throw error;
      await wcLoad(wcDrv, wcMonth, true); toast('Zapisano: ' + WC_KIND[t.value]); render();
    } catch(err){ toast('Nie udało się zapisać: ' + (err.message || err)); render(); }
  }
});
document.addEventListener('click', async e => {
  if (e.target.closest('[data-wc-xlsx]')) return wcExport();
  if (e.target.closest('[data-wc-reload]')){ wcCache.delete(wcDrv + '|' + wcMonth); return render(); }
  if (e.target.closest('[data-wc-restore]') && P().manage){
    const rows = wcCache.get(wcDrv + '|' + wcMonth) || [], bks = [...new Set(rows.filter(r => r.source==='manual' && r.bookingId).map(r => r.bookingId))];
    try { if (bks.length){ const {error} = await sb.from('work_events').delete().in('booking_id', bks).eq('source', 'manual'); if (error) throw error; }
      wcCache.delete(wcDrv + '|' + wcMonth); toast('Przywrócono – dane z GPS uzupełnią się w ciągu ok. 15 minut'); render(); }
    catch(err){ toast('Nie udało się: ' + (err.message || err)); }
  }
});
