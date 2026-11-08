/* Emage FLEET — załadunek i grafik kierowcy.
   Przeładunek trwa ok. 23:00–01:00. Kierowca ładujący w poniedziałek przekazuje towar kierowcom, którzy w grafiku
   mają poniedziałek (zmiana z poniedziałku na wtorek). Dzień załadunku = dzień w grafiku, bez godzin granicznych:
   bierzemy go ze zmiany kierowcy (auto przejęte w poniedziałek i jeszcze niezdane → poniedziałek, także po północy).
   Kierowca jadący trasą widzi, kto ma jego towar. Kierownik widzi załadunek pod grafikiem. */
'use strict';
/* Dzień w grafiku, którego dotyczy załadunek: dzień zmiany kierowcy (dziś albo wczoraj) */
function workDay(){
  const t = today(), y = addDays(t, -1), me_ = myDriverId();
  const a = S.bookings.find(b => crewOf(b).includes(me_) && b.pickup && !b.returned);
  if (a && a.to < t && a.to >= y) return a.to;
  return t;
}
const shortDay = d => { const dt = parse(d); return `${DOW[(dt.getDay()+6)%7]} ${dt.getDate()}.${String(dt.getMonth()+1).padStart(2,'0')}`; };
const shiftName = d => `${shortDay(d)} → ${shortDay(addDays(d, 1))}`;
const telOf = d => String((d && d.phone) || '').replace(/[^\d+]/g, '');
const callBtn = d => telOf(d) ? `<a class="btn small call" href="tel:${esc(telOf(d))}">${ic('phone')}${esc(d.phone)}</a>` : '<span class="muted small">brak telefonu</span>';
/* Kto jedzie trasą danego dnia (z grafiku) */
function routeCrew(routeId, d){
  return S.bookings.filter(b => b.routeId===routeId && b.from<=d && b.to>=d)
    .flatMap(b => crewOf(b).map(id => ({driver: byId('drivers', id), vehicle: byId('vehicles', b.vehicleId)}))).filter(x => x.driver);
}
/* Kto wiezie towar dla trasy na dany dzień */
const routeLoaders = (routeId, d) => S.loadings.filter(l => l.routeId===routeId && l.forDate===d).map(l => byId('drivers', l.driverId)).filter(Boolean);
const loadRoutes = () => S.routes.filter(r => r.active!==false && !r.loading).sort((a, b) => String(a.code).localeCompare(String(b.code), 'pl', {numeric:true}));
const personRow = (d, extra = '') => `<div class="ld-person"><span><b>${esc(d.name)}</b>${extra ? `<span class="sub">${extra}</span>` : ''}</span>${callBtn(d)}</div>`;

/* ---------- okno „Załadunek” (kierowca) ---------- */
function loadingTargets(routeId, wd){
  const crew = routeCrew(routeId, wd);
  if (!crew.length) return `<div class="ld-who muted small">Na tę zmianę nikt nie ma tej trasy w grafiku – zapytaj kierownika.</div>`;
  return `<div class="ld-who">${crew.map(x => personRow(x.driver, x.vehicle ? esc(x.vehicle.plate) : '')).join('')}</div>`;
}
/* Kierowca jedzie na tej zmianie trasą załadunkową → wpisuje wagę (obowiązkowo) i jedno zdjęcie */
function onLoadingRoute(wd){
  const me_ = myDriverId();
  return S.bookings.some(b => crewOf(b).includes(me_) && b.from<=wd && b.to>=wd && b.routeId && (routeById(b.routeId) || {}).loading);
}
const myReport = wd => S.loadingReports.find(r => r.driverId===myDriverId() && r.loadDate===wd);
function weightField(wd){
  const r = myReport(wd);
  return `<div class="field full ld-weight"><label for="ld-kg">Waga towaru (kg) *</label>
    <input id="ld-kg" type="number" inputmode="decimal" min="0" step="0.1" placeholder="np. 1250" value="${r ? esc(String(r.weightKg)) : ''}"></div>
    <div class="field full"><label for="ld-photo">Zdjęcie towaru</label>
    ${r && r.photo ? `<span class="thumbs">${photoStrip([r.photo])}</span><span class="muted small">Nowe zdjęcie zastąpi to.</span>` : ''}
    <input id="ld-photo" type="file" accept="${PHOTO_TYPES.join(',')}" capture="environment"></div>`;
}
function openLoading(day){
  const me_ = myDriverId(); if (!me_) return toast('Kierownik floty musi najpierw powiązać Twoje konto z kierowcą');
  const rs = loadRoutes(); if (!rs.length) return toast('Kierownik nie dodał jeszcze tras');
  const wd = day || workDay(), t = today(), y = addDays(t, -1);
  const mine = new Set(S.loadings.filter(l => l.driverId===me_ && l.forDate===wd).map(l => l.routeId));
  const withWeight = onLoadingRoute(wd);
  editing = {col:'loading', id:null, base:{}, special: () => saveLoading(mine, withWeight, wd)};
  $('#dlg-title').textContent = 'Załadunek';
  $('#dlg-body').innerHTML = `<div class="field full"><label for="ld-day">Zmiana w grafiku</label><select id="ld-day">
      ${[y, t].map(d => `<option value="${d}" ${d===wd ? 'selected' : ''}>${shiftName(d)}</option>`).join('')}</select>
      <p class="muted small" style="margin:6px 0 0">Zaznacz trasy, których towar zabierasz. Pod trasą zobaczysz, kto na tej zmianie nią jedzie – możesz od razu zadzwonić.</p></div>
    <div class="field full ld-list">${rs.map(r => `<div class="ld-route ${mine.has(r.id) ? 'on' : ''}" data-ld="${esc(r.id)}">
      <label class="check"><input type="checkbox" value="${esc(r.id)}" ${mine.has(r.id) ? 'checked' : ''}><span><b>${esc(r.code)}</b> ${esc(r.name)}</span></label>
      <div class="ld-targets" ${mine.has(r.id) ? '' : 'hidden'}>${loadingTargets(r.id, wd)}</div></div>`).join('')}</div>
    ${withWeight ? weightField(wd) : ''}
    <div class="warnline" id="dlg-warn" hidden></div>`;
  hydrateFiles($('#dlg-body'));
  $('#dlg-save').textContent = 'Zapisz załadunek';
  $('#dlg-del').hidden = true;
  $('#scrim').hidden = false;
}
document.addEventListener('change', e => {
  if (e.target.id==='ld-day') return openLoading(e.target.value);
  const box = e.target.closest && e.target.closest('.ld-route');
  if (!box || e.target.type!=='checkbox') return;
  box.classList.toggle('on', e.target.checked);
  box.querySelector('.ld-targets').hidden = !e.target.checked;
});
async function saveLoading(before, withWeight, wd){
  const now = new Set([...document.querySelectorAll('.ld-route input:checked')].map(i => i.value));
  const warn = msg => { const w = $('#dlg-warn'); w.textContent = msg; w.hidden = false; };
  let kg = null, file = null;
  if (withWeight){
    kg = Number(String($('#ld-kg').value || '').replace(',', '.'));
    file = ($('#ld-photo').files || [])[0] || null;
    if (now.size && !(kg > 0)){ $('#ld-kg').focus(); return warn('Wpisz wagę towaru w kg.'); }
    if (file && !PHOTO_TYPES.includes(file.type)) return warn('To nie jest zdjęcie JPG, PNG ani WebP.');
    if (file && file.size > 10*1024*1024) return warn('Zdjęcie jest większe niż 10 MB.');
  }
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    const me_ = myDriverId();
    if (withWeight && kg > 0){
      const old = myReport(wd);
      let photo = old ? old.photo : null;
      if (file){ if (!assetsNS) throw {code:'upload', message:'Dodawanie zdjęć nie jest dostępne'}; photo = (await assetsNS.upload(file, {type: file.type})).id; }
      const q = old ? sb.from('loading_reports').update({weight_kg: kg, photo}).eq('id', old.id)
                    : sb.from('loading_reports').insert({driver_id: me_, load_date: wd, weight_kg: kg, photo});
      const {error} = await q; if (error) throw dbErr(error);
      await refresh('loadingReports');
    }
    const add = [...now].filter(id => !before.has(id)).map(route_id => ({route_id, driver_id: me_, load_date: wd, for_date: wd}));
    const del = S.loadings.filter(l => l.driverId===me_ && l.forDate===wd && !now.has(l.routeId)).map(l => l.id);
    if (add.length){ const {error} = await sb.from('loadings').insert(add); if (error) throw dbErr(error); }
    if (del.length){ const {error} = await sb.from('loadings').delete().in('id', del); if (error) throw dbErr(error); }
    await refresh('loadings');
    closeForm();
    toast(now.size ? `Załadunek zapisany: ${now.size} ${isPlural(now.size,'trasa','trasy','tras')}` : 'Załadunek wyczyszczony');
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}

let schedAll = false;
function mySchedulePanel(){
  const me_ = myDriverId(); if (!me_) return '';
  const t = today();
  const days = Array.from({length:14}, (_, i) => addDays(t, i));
  const work = days.map(d => ({d, bs: S.bookings.filter(b => crewOf(b).includes(me_) && b.from<=d && b.to>=d)})).filter(x => x.bs.length && x.d!==t);
  const shown = schedAll ? work : work.slice(0, 3);
  const row = ({d, bs}) => bs.map(b => {
    const v = byId('vehicles', b.vehicleId), partner = crewOf(b).find(x => x!==me_);
    const loaders = b.routeId ? routeLoaders(b.routeId, d).filter(x => x.id!==me_) : [];
    const dt = parse(d);
    return `<div class="ms-row ${d===t ? 'today' : ''}"><span class="ms-day"><b>${d===t ? 'Dziś' : diffDays(t, d)===1 ? 'Jutro' : DOW[(dt.getDay()+6)%7]}</b><em>${dt.getDate()}.${String(dt.getMonth()+1).padStart(2,'0')}</em></span><span class="ms-main">
      <b>${b.routeId ? esc(rLabel(b.routeId)) : 'bez trasy'}</b>
      <span class="sub">${v ? esc(v.plate) : ''}${partner ? ' · z: ' + esc(dName(partner)) : ''}</span>
      ${b.purpose ? `<span class="ms-note">${esc(b.purpose)}</span>` : ''}
      ${b.routeId && typeof stopsOf==='function' && stopsOf(b.routeId).length ? `<span class="sub">${ic('route')} ${stopsOf(b.routeId).length} ${isPlural(stopsOf(b.routeId).length,'przystanek','przystanki','przystanków')}: ${esc(stopsOf(b.routeId).slice(0, 3).map(x => x.client).join(', '))}${stopsOf(b.routeId).length > 3 ? '…' : ''}</span>` : ''}
      ${loaders.length ? `<span class="ms-load">${ic('box')}Twój towar wiezie:</span>${loaders.map(x => personRow(x)).join('')}` : ''}
    </span></div>`; }).join('');
  return `<div class="panel myschedule"><div class="sec-head"><h3>Mój grafik</h3>${work.length > 3 ? `<button class="small ghost" data-action="sched-all">${schedAll ? 'Mniej' : `Wszystkie (${work.length})`}</button>` : ''}</div>
    ${shown.map(row).join('') || '<p class="muted sec-empty">W najbliższych dniach nie masz nic w grafiku.</p>'}</div>`;
}
document.addEventListener('click', e => { if (e.target.closest('[data-action="sched-all"]')){ schedAll = !schedAll; render(); } });

/* ---------- kierownik: załadunek pod grafikiem (zmiana dzisiejsza i wczorajsza) ---------- */
function loadingDay(d){
  const ls = S.loadings.filter(l => l.forDate===d), reps = S.loadingReports.filter(r => r.loadDate===d);
  if (!ls.length && !reps.length) return '';
  const byRoute = {};
  ls.forEach(l => { (byRoute[l.routeId] = byRoute[l.routeId] || []).push(l); });
  const rows = Object.keys(byRoute).sort((a, b) => String(rCode(a)).localeCompare(String(rCode(b)), 'pl', {numeric:true})).map(rid => {
    const crew = routeCrew(rid, d);
    return `<tr><td><b>${esc(rLabel(rid))}</b></td><td>${byRoute[rid].map(l => esc(dName(l.driverId))).join(', ')}</td>
      <td>${crew.length ? crew.map(x => esc(x.driver.name) + (x.vehicle ? ` <span class="muted small">${esc(x.vehicle.plate)}</span>` : '')).join(', ') : '<span class="pill warn">nikt w grafiku</span>'}</td></tr>`;
  }).join('');
  const repHtml = reps.length ? `<div class="ld-reports">${reps.map(r => `<div class="mini"><span><b>${esc(dName(r.driverId))}</b></span>
      <span class="num"><b>${new Intl.NumberFormat('pl-PL').format(Number(r.weightKg))} kg</b></span><span class="mini-r">${r.photo ? photoStrip([r.photo]) : '<span class="muted small">bez zdjęcia</span>'}</span></div>`).join('')}</div>` : '';
  return `<div class="ld-day"><div class="ld-day-head">Zmiana ${esc(shiftName(d))}</div>${repHtml}
    ${rows ? `<div class="tablewrap"><table><thead><tr><th>Trasa</th><th>Towar zabrał</th><th>Trasą jedzie</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}</div>`;
}
function loadingsPanel(){
  if (!modOn('zaladunek')) return '';
  const t = today(), html = [t, addDays(t, -1)].map(loadingDay).join('');
  const n = S.loadings.filter(l => l.forDate===t || l.forDate===addDays(t, -1)).length;
  return `<details class="panel fold"><summary class="sec-head"><h3>Załadunek</h3><span class="count">${n}</span></summary>${html || '<p class="muted sec-empty">Na dzisiejszą i wczorajszą zmianę nikt jeszcze nie zaznaczył załadunku.</p>'}</details>`;
}
