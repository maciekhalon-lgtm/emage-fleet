/* Emage FLEET — załadunek i grafik kierowcy.
   Kierowca zaznacza, towar których tras zabiera (na jutro) i od razu widzi, kto jutro jedzie tą trasą – z telefonem.
   Kierowca jadący trasą widzi, kto ma jego towar. Kierownik widzi załadunek pod grafikiem. */
'use strict';
const tomorrow = () => addDays(today(), 1);
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
function loadingTargets(routeId){
  const crew = routeCrew(routeId, tomorrow());
  if (!crew.length) return `<div class="ld-who muted small">Jutro nikt nie ma tej trasy w grafiku – zapytaj kierownika.</div>`;
  return `<div class="ld-who">${crew.map(x => personRow(x.driver, x.vehicle ? 'jutro · ' + esc(x.vehicle.plate) : 'jutro')).join('')}</div>`;
}
/* Kierowca jedzie dziś trasą załadunkową → wpisuje wagę (obowiązkowo) i jedno zdjęcie */
function onLoadingRouteToday(){
  const t = today(), me_ = myDriverId();
  return S.bookings.some(b => crewOf(b).includes(me_) && b.from<=t && b.to>=t && b.routeId && (routeById(b.routeId) || {}).loading);
}
const myReportToday = () => S.loadingReports.find(r => r.driverId===myDriverId() && r.loadDate===today());
function weightField(){
  const r = myReportToday();
  return `<div class="field full ld-weight"><label for="ld-kg">Waga towaru (kg) *</label>
    <input id="ld-kg" type="number" inputmode="decimal" min="0" step="0.1" placeholder="np. 1250" value="${r ? esc(String(r.weightKg)) : ''}"></div>
    <div class="field full"><label for="ld-photo">Zdjęcie towaru</label>
    ${r && r.photo ? `<span class="thumbs">${photoStrip([r.photo])}</span><span class="muted small">Nowe zdjęcie zastąpi to.</span>` : ''}
    <input id="ld-photo" type="file" accept="${PHOTO_TYPES.join(',')}" capture="environment"></div>`;
}
function openLoading(){
  const me_ = myDriverId(); if (!me_) return toast('Kierownik floty musi najpierw powiązać Twoje konto z kierowcą');
  const rs = loadRoutes(); if (!rs.length) return toast('Kierownik nie dodał jeszcze tras');
  const mine = new Set(S.loadings.filter(l => l.driverId===me_ && l.forDate===tomorrow()).map(l => l.routeId));
  const withWeight = onLoadingRouteToday();
  editing = {col:'loading', id:null, base:{}, special: () => saveLoading(mine, withWeight)};
  $('#dlg-title').textContent = 'Załadunek';
  $('#dlg-body').innerHTML = `<div class="field full"><p class="muted small" style="margin:0">Zaznacz trasy, których towar zabierasz. Pod trasą zobaczysz, kto jutro nią jedzie – możesz od razu zadzwonić.</p></div>
    <div class="field full ld-list">${rs.map(r => `<div class="ld-route ${mine.has(r.id) ? 'on' : ''}" data-ld="${esc(r.id)}">
      <label class="check"><input type="checkbox" value="${esc(r.id)}" ${mine.has(r.id) ? 'checked' : ''}><span><b>${esc(r.code)}</b> ${esc(r.name)}</span></label>
      <div class="ld-targets" ${mine.has(r.id) ? '' : 'hidden'}>${loadingTargets(r.id)}</div></div>`).join('')}</div>
    ${withWeight ? weightField() : ''}
    <div class="warnline" id="dlg-warn" hidden></div>`;
  hydrateFiles($('#dlg-body'));
  $('#dlg-save').textContent = 'Zapisz załadunek';
  $('#dlg-del').hidden = true;
  $('#scrim').hidden = false;
}
document.addEventListener('change', e => {
  const box = e.target.closest && e.target.closest('.ld-route');
  if (!box || e.target.type!=='checkbox') return;
  box.classList.toggle('on', e.target.checked);
  box.querySelector('.ld-targets').hidden = !e.target.checked;
});
async function saveLoading(before, withWeight){
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
    const me_ = myDriverId(), t = tomorrow();
    if (withWeight && kg > 0){
      const old = myReportToday();
      let photo = old ? old.photo : null;
      if (file){ if (!assetsNS) throw {code:'upload', message:'Dodawanie zdjęć nie jest dostępne'}; photo = (await assetsNS.upload(file, {type: file.type})).id; }
      const q = old ? sb.from('loading_reports').update({weight_kg: kg, photo}).eq('id', old.id)
                    : sb.from('loading_reports').insert({driver_id: me_, weight_kg: kg, photo});
      const {error} = await q; if (error) throw dbErr(error);
      await refresh('loadingReports');
    }
    const add = [...now].filter(id => !before.has(id)).map(route_id => ({route_id, driver_id: me_}));
    const del = S.loadings.filter(l => l.driverId===me_ && l.forDate===t && !now.has(l.routeId)).map(l => l.id);
    if (add.length){ const {error} = await sb.from('loadings').insert(add); if (error) throw dbErr(error); }
    if (del.length){ const {error} = await sb.from('loadings').delete().in('id', del); if (error) throw dbErr(error); }
    await refresh('loadings');
    closeForm();
    toast(now.size ? `Załadunek zapisany: ${now.size} ${isPlural(now.size,'trasa','trasy','tras')}` : 'Załadunek wyczyszczony');
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}

/* ---------- „Mój grafik” – najbliższe 7 dni (kierowca) ---------- */
function dayLabel(d){
  const t = today(), x = diffDays(t, d);
  if (x===0) return 'Dziś'; if (x===1) return 'Jutro';
  const dt = parse(d); return `${DOW[(dt.getDay()+6)%7]} ${dt.getDate()}.${String(dt.getMonth()+1).padStart(2,'0')}`;
}
function mySchedulePanel(){
  const me_ = myDriverId(); if (!me_) return '';
  const t = today();
  const days = Array.from({length:7}, (_, i) => addDays(t, i));
  const rows = days.map(d => {
    const bs = S.bookings.filter(b => crewOf(b).includes(me_) && b.from<=d && b.to>=d);
    if (!bs.length) return `<div class="ms-row off"><span class="ms-day">${dayLabel(d)}</span><span class="muted">wolne</span></div>`;
    return bs.map(b => {
      const v = byId('vehicles', b.vehicleId), partner = crewOf(b).find(x => x!==me_);
      const loaders = b.routeId ? routeLoaders(b.routeId, d).filter(x => x.id!==me_) : [];
      return `<div class="ms-row ${d===t ? 'today' : ''}"><span class="ms-day">${dayLabel(d)}</span><span class="ms-main">
        <b>${b.routeId ? esc(rLabel(b.routeId)) : 'bez trasy'}</b>
        <span class="sub">${v ? esc(v.plate) + ' · ' + esc(v.make) + ' ' + esc(v.model) : ''}${partner ? ' · z: ' + esc(dName(partner)) : ''}</span>
        ${b.purpose ? `<span class="ms-note">${esc(b.purpose)}</span>` : ''}
        ${loaders.length ? `<span class="ms-load">${ic('box')}Twój towar wiezie:</span>${loaders.map(x => personRow(x)).join('')}` : ''}
      </span></div>`;
    }).join('');
  }).join('');
  return `<div class="panel myschedule"><div class="sec-head"><h3>Mój grafik</h3><span class="muted small">najbliższe 7 dni</span></div>${rows}</div>`;
}
/* Przycisk na ekranie kierowcy */
function loadingBtn(){
  if (!myDriverId() || !loadRoutes().length) return '';
  const n = S.loadings.filter(l => l.driverId===myDriverId() && l.forDate===tomorrow()).length;
  return big('data-action="loading"', 'Załadunek', n ? `zabierasz ${n} ${isPlural(n,'trasę','trasy','tras')}` : 'zaznacz trasy, które zabierasz', 'wide', 'box');
}

/* ---------- kierownik: załadunek pod grafikiem ---------- */
function loadingsPanel(){
  const d = tomorrow();
  const ls = S.loadings.filter(l => l.forDate===d);
  const byRoute = {};
  ls.forEach(l => { (byRoute[l.routeId] = byRoute[l.routeId] || []).push(l); });
  const ids = Object.keys(byRoute);
  const rows = ids.sort((a, b) => String(rCode(a)).localeCompare(String(rCode(b)), 'pl', {numeric:true})).map(rid => {
    const crew = routeCrew(rid, d);
    return `<tr><td><b>${esc(rLabel(rid))}</b></td><td>${byRoute[rid].map(l => esc(dName(l.driverId))).join(', ')}</td>
      <td>${crew.length ? crew.map(x => esc(x.driver.name) + (x.vehicle ? ` <span class="muted small">${esc(x.vehicle.plate)}</span>` : '')).join(', ') : '<span class="pill warn">nikt w grafiku</span>'}</td></tr>`;
  }).join('');
  const reps = S.loadingReports.filter(r => r.loadDate===today());
  const repHtml = reps.length ? `<div class="ld-reports">${reps.map(r => `<div class="mini"><span><b>${esc(dName(r.driverId))}</b></span>
      <span class="num"><b>${new Intl.NumberFormat('pl-PL').format(Number(r.weightKg))} kg</b></span><span class="mini-r">${r.photo ? photoStrip([r.photo]) : '<span class="muted small">bez zdjęcia</span>'}</span></div>`).join('')}</div>` : '';
  return `<div class="panel"><div class="sec-head"><h3>Załadunek na jutro (${fdate(d)})</h3></div>${repHtml}
    ${rows ? `<div class="tablewrap"><table><thead><tr><th>Trasa</th><th>Towar zabrał</th><th>Jutro jedzie</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<p class="muted sec-empty">Nikt jeszcze nie zaznaczył załadunku na jutro.</p>'}</div>`;
}
