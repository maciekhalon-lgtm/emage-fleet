/* Emage FLEET — automatyka dla kierownictwa: blokady aut, podejrzane tankowania, opony sezonowe, grafik tygodniowy */
'use strict';

/* ---------- blokady (przegląd techniczny / OC po terminie) ---------- */
const BLOCK_TYPES = ['Przegląd techniczny', 'Ubezpieczenie OC'];
/* {reason, override} albo null; override = zgoda kierownika na dziś */
function vehicleBlock(v){
  if (!v) return null;
  const t = today();
  const late = S.deadlines.filter(d => d.vehicleId===v.id && BLOCK_TYPES.includes(d.type) && d.date < t).sort((a, b) => a.date<b.date?-1:1);
  if (!late.length) return null;
  const reason = late.map(d => `${d.type} po terminie (${fdate(d.date)})`).join(', ');
  const override = S.blockOverrides.find(o => o.vehicleId===v.id && o.date===t) || null;
  return {reason, override};
}
const blockedVehicles = () => S.vehicles.filter(v => v.status!=='wycofany').map(v => ({v, bl: vehicleBlock(v)})).filter(x => x.bl);

function openOverride(vid){
  const v = byId('vehicles', vid), bl = vehicleBlock(v);
  if (!v || !bl || !P().manage) return;
  editing = {col:'override', id:null, base:{}, special: () => saveOverride(vid)};
  $('#dlg-title').textContent = 'Zezwól na wyjazd dziś';
  $('#dlg-body').innerHTML = `<div class="field full"><span class="ho-car">${plate(v.plate)} <b>${esc(v.make)} ${esc(v.model)}</b></span><span class="pill bad" style="align-self:flex-start">${esc(bl.reason)}</span></div>
    <div class="field full"><label for="ov-why">Powód *</label><input id="ov-why" type="text" placeholder="np. jedzie na przegląd, polisa opłacona – czekamy na dokument"></div>
    <p class="muted small field full" style="margin:0">Zgoda działa tylko dziś (${fdate(today())}). Zapisze się w historii.</p><div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zezwól dziś';
  $('#dlg-del').hidden = true;
  $('#scrim').hidden = false;
  setTimeout(() => $('#ov-why')?.focus(), 20);
}
async function saveOverride(vid){
  const why = $('#ov-why').value.trim(); const w = $('#dlg-warn');
  if (!why){ w.textContent = 'Podaj powód.'; w.hidden = false; $('#ov-why').focus(); return; }
  try { await db.collection('blockOverrides').doc().set({vehicleId: vid, date: today(), reason: why}); closeForm(); toast('Zezwolono na wyjazd dziś'); }
  catch(err){ handleWriteErr(err); }
}
const blockBanner = v => { const bl = vehicleBlock(v); if (!bl) return '';
  return bl.override ? `<div class="notice"><span><b>Zablokowane:</b> ${esc(bl.reason)}. Dziś zezwolono na wyjazd: „${esc(bl.override.reason)}”.</span></div>`
    : `<div class="notice err"><span><b>Auto zablokowane:</b> ${esc(bl.reason)}. Kierowcy nie mogą go przejąć.</span>${P().manage ? `<button class="small" data-override="${esc(v.id)}">Zezwól dziś</button>` : ''}</div>`; };

/* ---------- podejrzane tankowania ---------- */
const flaggedCosts = () => S.costs.filter(c => c.flagState==='open' || c.flagState==='explain').sort((a, b) => a.date<b.date?1:-1);
function flagRow(c, compact, noAct){
  const who = c.driverId ? dName(c.driverId) : (c.createdBy ? pName(c.createdBy) : '—');
  const fx = typeof fxNote==='function' && fxNote(c) ? ' · ' + fxNote(c) : '';
  const act = noAct ? '' : P().manage ? (c.flagState==='explain'
      ? `<span class="pill info">czeka na kierowcę</span><button class="small ghost" data-flag-ok="${esc(c.id)}">OK</button>`
      : `<button class="small" data-flag-ok="${esc(c.id)}">${ic('check')}OK</button><button class="small" data-flag-ask="${esc(c.id)}">Wyjaśnij</button>`) : '';
  return `<div class="att-row flag-row"><i class="stripe ${c.flagState==='explain' ? 'info' : 'warn'}"></i>${vPlate(c.vehicleId)}
    <div class="att-t"><b>${fdate(c.date)} · ${String(c.liters || '').replace('.', ',')} l · ${zl2(c.amount)}${fx}</b><span class="sub">${esc(who)}${c.station ? ' · ' + esc(c.station) : ''}</span>
      <span class="sub flag-list">${(c.flags || []).map(f => `<span class="pill warn">${esc(f)}</span>`).join('')}</span>
      ${c.flagQuestion ? `<span class="sub">Pytanie: „${esc(c.flagQuestion)}”</span>` : ''}${c.flagReply ? `<span class="sub"><b>Odpowiedź kierowcy:</b> „${esc(c.flagReply)}”</span>` : ''}
      ${compact ? '' : photoStrip(c.photos)}</div><div class="att-act">${act}</div></div>`;
}
function flagsPanel(){
  if (!P().service) return '';
  const list = flaggedCosts(); if (!list.length) return '';
  return `<div class="panel confirms"><div class="sec-head"><h3>Tankowania do wyjaśnienia</h3><span class="pill warn">${list.length}</span></div><div class="att">${list.map(c => flagRow(c)).join('')}</div></div>`;
}
function openFlagAsk(id){
  const c = byId('costs', id); if (!c) return;
  editing = {col:'flag-ask', id, base:{}, special: async () => {
    const q = $('#fq').value.trim(); if (!q){ const w = $('#dlg-warn'); w.textContent = 'Wpisz pytanie do kierowcy.'; w.hidden = false; return; }
    try { await db.collection('costs').doc(id).update({flagState:'explain', flagQuestion: q}); closeForm(); toast('Wysłano prośbę o wyjaśnienie'); } catch(err){ handleWriteErr(err); }
  }};
  $('#dlg-title').textContent = 'Poproś kierowcę o wyjaśnienie';
  $('#dlg-body').innerHTML = `<div class="field full">${flagRow(c, true, true)}</div>
    <div class="field full"><label for="fq">Pytanie do kierowcy *</label><textarea id="fq">${esc(c.flagQuestion || (c.flags && c.flags[0] ? 'Wyjaśnij proszę: ' + c.flags[0].toLowerCase() + '.' : ''))}</textarea></div><div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Wyślij pytanie';
  $('#dlg-del').hidden = true;
  $('#scrim').hidden = false;
}
async function flagOk(id){
  try { await db.collection('costs').doc(id).update({flagState:'ok'}); toast('Oznaczono jako wyjaśnione'); } catch(err){ handleWriteErr(err); }
}
/* Kierowca: prośby kierownika o wyjaśnienie */
function myExplainPanel(){
  const list = S.costs.filter(c => c.flagState==='explain' && (c.driverId===myDriverId() || c.createdBy===myId));
  if (!list.length) return '';
  return `<div class="panel confirms"><div class="sec-head"><h3>Kierownik prosi o wyjaśnienie</h3></div>${list.map(c => `<div class="confirm"><span>${vPlate(c.vehicleId)} <b>Tankowanie ${fdate(c.date)}</b> · ${String(c.liters||'').replace('.', ',')} l · ${zl2(c.amount)}<span class="sub">„${esc(c.flagQuestion || '')}”</span></span>
    <span class="disp"><input id="exp-${esc(c.id)}" type="text" placeholder="Twoje wyjaśnienie"><button class="small primary" data-explain="${esc(c.id)}">Wyślij</button></span></div>`).join('')}</div>`;
}
async function sendExplain(id){
  const el = $('#exp-' + id); const v = el ? el.value.trim() : '';
  if (!v){ el && el.focus(); return toast('Napisz wyjaśnienie'); }
  const {error} = await sb.rpc('explain_cost', {cost_id: id, reply: v});
  if (error) return toast(dbErr(error).message || 'Nie udało się wysłać');
  await refresh('costs'); toast('Wysłano wyjaśnienie');
}

/* ---------- opony sezonowe ---------- */
const TIRES = {letnie:'Letnie', zimowe:'Zimowe', caloroczne:'Całoroczne'};
/* Przypomnienie: od 1.10 auta na letnich (od 15.10 pilne), od 1.04 do 31.05 auta na zimowych */
function tireReminder(){
  const md = today().slice(5);
  const act = S.vehicles.filter(v => v.status!=='wycofany');
  if (md >= '10-01' && md <= '12-31'){ const list = act.filter(v => v.tires==='letnie'); return list.length ? {list, to:'zimowe', urgent: md >= '10-15', txt:'na letnich oponach – czas na zimowe (do 15.10)'} : null; }
  if (md >= '04-01' && md <= '05-31'){ const list = act.filter(v => v.tires==='zimowe'); return list.length ? {list, to:'letnie', urgent: md >= '04-20', txt:'na zimowych oponach – czas na letnie (od 1.04)'} : null; }
  return null;
}

/* ---------- grafik tygodniowy: kierowcy × dni ---------- */
let schedDay = '';
const docsBad = d => [['licenseExpiry','prawo jazdy'],['medicalExpiry','badania lekarskie'],['psychExpiry','badania psychologiczne']].filter(([k]) => d[k] && d[k] < today()).map(([, l]) => l).join(', ');
function viewSchedule(){
  const days = Array.from({length:7}, (_, i) => addDays(calStart, i)), t = today(), end = days[6];
  const nav = `<div class="cal-nav"><button class="small" data-cal="-7" aria-label="Poprzedni tydzień">‹</button><button class="small" data-cal="0">Ten tydzień</button><button class="small" data-cal="7" aria-label="Następny tydzień">›</button><span class="label num">${fdate(calStart)} – ${fdate(end)}</span>
    <span class="cal-r">${canCreate('bookings') && P().bookings==='rw' ? `<button class="small" data-action="copy-week">Kopiuj poprzedni tydzień</button>` : ''}<button class="small ghost no-print" data-print-week>${ic('clip')}Drukuj</button></span></div>`;
  const drivers = S.drivers.filter(d => d.active!==false).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  if (!drivers.length) return nav + '<div class="panel empty"><p>Dodaj kierowców, aby układać grafik.</p></div>';
  const conf = conflicts();
  if (matchMedia('(max-width:640px)').matches && !document.documentElement.classList.contains('printing')){   // telefon: jeden dzień naraz zamiast tabeli tygodnia
    if (!days.includes(schedDay)) schedDay = days.includes(t) ? t : days[0];
    const d = schedDay;
    const pills = `<div class="sch-days">${days.map(x => { const dt = parse(x), wd = (dt.getDay()+6)%7, n = S.bookings.filter(b => b.from<=x && b.to>=x).length;
      return `<button class="sch-dp ${x===d?'on':''} ${x===t?'today':''}" data-schday="${x}"><span>${DOW[wd]}</span><b>${dt.getDate()}</b><i>${n || ''}</i></button>`; }).join('')}</div>`;
    const list = drivers.map(dr => {
      const bs = S.bookings.filter(b => crewOf(b).includes(dr.id) && b.from<=d && b.to>=d);
      const chips = bs.map(b => { const v = byId('vehicles', b.vehicleId);
        return `<span class="sch-chip ${conf.has(b.id)?'bad':''} ${b.pickup && !b.returned ? 'out' : ''} ${b.returned ? 'back' : ''}" ${canEditDoc('bookings', b) ? `data-edit="bookings" data-id="${esc(b.id)}"` : ''}><b>${esc(v ? v.plate : '?')}</b>${b.routeId ? `<i>${esc(rLabel(b.routeId))}</i>` : ''}${crewOf(b).length > 1 ? `<i>+ ${esc(dName(crewOf(b).find(x => x!==dr.id)))}</i>` : ''}${b.purpose ? `<i class="sch-note">${esc(b.purpose)}</i>` : ''}</span>`; }).join('');
      const add = canCreate('bookings') && P().bookings==='rw' && !bs.length ? `<button class="small ghost" data-sched="${esc(dr.id)}|${d}">${ic('plus')}Przydziel</button>` : '';
      return `<div class="sch-li ${bs.length ? '' : 'free'}"><b class="sch-li-n">${esc(dr.name)}${docsBad(dr) ? ' <span class="pill bad">dokumenty!</span>' : ''}</b><div class="sch-li-c">${chips || (add || '<span class="muted small">wolne</span>')}</div></div>`; }).join('');
    const frM = S.vehicles.filter(v => v.status==='aktywny' && vehicleState(v).cls!=='bad' && !S.bookings.some(b => b.vehicleId===v.id && b.from<=d && b.to>=d));
    return nav + pills + `<div class="panel sch-list">${list}<div class="sch-li free"><b class="sch-li-n">Wolne auta (${frM.length})</b><div class="sch-li-c"><span class="muted small">${esc(frM.map(v => v.plate).join(', ')) || 'brak'}</span></div></div></div>`;
  }
  const head = `<tr><th>Kierowca</th>${days.map(d => { const dt = parse(d), wd = (dt.getDay()+6)%7; return `<th class="sch-day ${d===t?'today':''} ${wd>4?'we':''}">${DOW[wd]} <b class="num">${dt.getDate()}</b></th>`; }).join('')}</tr>`;
  const rows = drivers.map(dr => `<tr><td class="sch-name"><b>${esc(dr.name)}</b>${docsBad(dr) ? `<span class="pill bad" title="${esc(docsBad(dr))}">nieważne dokumenty</span>` : ''}</td>${days.map(d => {
      const bs = S.bookings.filter(b => crewOf(b).includes(dr.id) && b.from<=d && b.to>=d);
      const wd = (parse(d).getDay()+6)%7;
      const cell = bs.map(b => { const v = byId('vehicles', b.vehicleId);
        return `<span class="sch-chip ${conf.has(b.id)?'bad':''} ${b.pickup && !b.returned ? 'out' : ''} ${b.returned ? 'back' : ''}" ${canEditDoc('bookings', b) ? `data-edit="bookings" data-id="${esc(b.id)}"` : ''} title="${esc((v ? v.plate+' · '+v.make+' '+v.model : '') + (b.routeId ? ' · ' + rLabel(b.routeId) : '') + (b.purpose ? ' · ' + b.purpose : ''))}">
          <b>${esc(v ? v.plate : '?')}</b>${b.routeId ? `<i>${esc(rCode(b.routeId))}</i>` : ''}${crewOf(b).length > 1 ? `<i>+ ${esc(dName(crewOf(b).find(x => x!==dr.id)).split(' ')[0])}</i>` : ''}${b.purpose ? `<i class="sch-note">${esc(b.purpose)}</i>` : ''}${b.routeId && routeLoaders(b.routeId, d).length ? `<i class="sch-load">${ic('box')}${esc(routeLoaders(b.routeId, d).map(x => x.name.split(' ')[0]).join(', '))}</i>` : ''}</span>`; }).join('');
      const add = canCreate('bookings') && P().bookings==='rw' && !bs.length ? `data-sched="${esc(dr.id)}|${d}" title="Przydziel auto"` : '';
      return `<td class="sch-cell ${d===t?'today':''} ${wd>4?'we':''} ${add?'add':''}" ${add}>${cell}</td>`; }).join('')}</tr>`).join('');
  // wiersz „Wolne auta”: sprawne auta bez przydziału danego dnia
  const okVeh = S.vehicles.filter(v => v.status==='aktywny' && vehicleState(v).cls!=='bad');
  const freeRow = `<tr class="sch-free"><td class="sch-name"><b>Wolne auta</b></td>${days.map(d => { const fr = okVeh.filter(v => !S.bookings.some(b => b.vehicleId===v.id && b.from<=d && b.to>=d && !(b.returned && b.returned.at && b.returned.at.slice(0, 10) < d)));
    return `<td class="sch-cell ${d===t?'today':''}" title="${esc(fr.map(v => v.plate).join(', '))}"><b class="num">${fr.length}</b>${fr.length ? `<i>${esc(fr.slice(0, 3).map(v => v.plate).join(', '))}${fr.length > 3 ? '…' : ''}</i>` : ''}</td>`; }).join('')}</tr>`;
  return nav + `<div class="panel tablewrap sch"><table><thead>${head}</thead><tbody>${rows}${freeRow}</tbody></table></div>
    <p class="muted small" style="margin:0">Kliknij puste pole, aby przydzielić kierowcy auto, trasę i uwagi na ten dzień. Kliknij przydział, aby go zmienić. Na czerwono – to samo auto u dwóch kierowców albo kierowca z dwoma autami tego samego dnia. Ikona paczki – kto wiezie towar dla tej trasy.</p>`;
}
function copyWeekAsk(){
  const from = addDays(calStart, -7), to = addDays(calStart, -1);
  const src = S.bookings.filter(b => b.from>=from && b.from<=to);
  if (!src.length) return toast('W poprzednim tygodniu nie ma przydziałów do skopiowania');
  editing = {col:'copy-week', id:null, base:{}, special: () => copyWeek(src)};
  $('#dlg-title').textContent = 'Kopiuj poprzedni tydzień';
  $('#dlg-body').innerHTML = `<div class="field full"><p style="margin:0">Skopiować <b>${src.length}</b> ${isPlural(src.length,'przydział','przydziały','przydziałów')} z tygodnia ${fdate(from)}–${fdate(to)} na tydzień ${fdate(calStart)}–${fdate(addDays(calStart, 6))}?</p>
    <p class="muted small" style="margin:6px 0 0">Te same auta, kierowcy i trasy. Pominę przydziały, przy których auto albo kierowca są już zajęci.</p></div><div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Kopiuj';
  $('#dlg-del').hidden = true;
  $('#scrim').hidden = false;
}
async function copyWeek(src){
  const btn = $('#dlg-save'); btn.disabled = true;
  let ok = 0, skip = 0;
  try {
    for (const b of src){
      const nf = addDays(b.from, 7), nt = addDays(b.to, 7);
      const busy = S.bookings.some(x => x.from<=nt && nf<=x.to && (x.vehicleId===b.vehicleId || crewOf(x).includes(b.driverId)) && !(x.returned && !holds(x) && x.to < nf));
      if (busy){ skip++; continue; }
      await db.collection('bookings').doc().set({vehicleId: b.vehicleId, driverId: b.driverId, routeId: b.routeId || null, coDriverId: b.coDriverId || null, purpose: b.purpose || '', from: nf, to: nt});
      ok++;
    }
    closeForm();
    toast(`Skopiowano ${ok}${skip ? ` · pominięto ${skip} (zajęte)` : ''}`);
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-override],[data-flag-ok],[data-flag-ask],[data-explain],[data-sched],[data-action="copy-week"]');
  if (!t || t.closest('#dialog')) return;
  if (t.dataset.override) return openOverride(t.dataset.override);
  if (t.dataset.flagOk) return flagOk(t.dataset.flagOk);
  if (t.dataset.flagAsk) return openFlagAsk(t.dataset.flagAsk);
  if (t.dataset.explain) return sendExplain(t.dataset.explain);
  if (t.dataset.sched){ const [driverId, d] = t.dataset.sched.split('|'); return openForm('bookings', null, {driverId, from: d, to: d}); }
  if (t.dataset.action==='copy-week') return copyWeekAsk();
});

document.addEventListener('click', e => { const t = e.target.closest('[data-schday]'); if (t){ schedDay = t.dataset.schday; render(); } });
let schedMobile = matchMedia('(max-width:640px)').matches;
addEventListener('resize', () => { const m = matchMedia('(max-width:640px)').matches; if (m!==schedMobile){ schedMobile = m; if (location.hash==='#przydzial') render(); } });

/* Druk grafiku: zawsze widok tygodnia (także na telefonie) */
document.addEventListener('click', e => {
  if (!e.target.closest('[data-print-week]')) return;
  document.documentElement.classList.add('printing'); render();
  setTimeout(() => { window.print(); document.documentElement.classList.remove('printing'); render(); }, 50);
});
