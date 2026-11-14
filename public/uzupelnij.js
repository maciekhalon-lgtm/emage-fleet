/* Emage FLEET — „Uzupełnij dane floty”: jedna tabela wszystkich aut z brakującymi danymi do wpisania naraz.
   Rocznik, VIN, pojemność baku, ubezpieczyciel i OC do, a gdy działają moduły: umowa (rodzaj, rata, koniec),
   gaśnica ważna do, opony na aucie (sezon, bieżnik). Wypełnione dane są pokazane jako tekst – zmienia się je w karcie auta.
   Wejścia: Pojazdy → „Uzupełnij dane”, Porządki w danych. */
'use strict';
const fillCols = () => {
  const c = [['year', 'Rocznik'], ['vin', 'VIN'], ['tankL', 'Bak (l)'], ['insurer', 'Ubezpieczyciel'], ['policyUntil', 'OC do']];
  if (typeof contractsOn==='function' && contractsOn() && canContracts()) c.push(['contract', 'Umowa: rodzaj / rata netto / koniec']);
  if (typeof eqOn==='function' && eqOn() && canEq()) c.push(['fire', 'Gaśnica ważna do']);
  if (typeof tiresOn==='function' && tiresOn() && canTires()) c.push(['tire', 'Opony na aucie / bieżnik mm']);
  return c;
};
const fillHas = (v, k) => k==='contract' ? S.contracts.some(c => c.vehicleId===v.id) : k==='fire' ? !!(eqOf(v.id, 'Gaśnica') || {}).validUntil : k==='tire' ? !!mountedOf(v.id) : v[k]!=null && v[k]!=='';
const fillMissing = () => { const cols = fillCols(); return S.vehicles.filter(v => v.status!=='wycofany').map(v => ({v, miss: cols.filter(([k]) => !fillHas(v, k)).length})).filter(x => x.miss); };
function openFillData(){
  if (!canWrite || !canCreate('vehicles') && !P().service) return;
  const cols = fillCols(), rows = S.vehicles.filter(v => v.status!=='wycofany').sort((a, b) => String(a.plate).localeCompare(b.plate));
  const todo = rows.filter(v => cols.some(([k]) => !fillHas(v, k)));
  if (!todo.length) return toast('Wszystkie auta mają komplet tych danych');
  const show = (v, k) => { const e = k==='contract' ? S.contracts.find(c => c.vehicleId===v.id) : null;
    if (k==='contract') return esc(CONTRACT_KINDS[e.kind] || e.kind) + (e.endDate ? ' do ' + fdate(e.endDate) : '');
    if (k==='fire') return fdate(eqOf(v.id, 'Gaśnica').validUntil);
    if (k==='tire'){ const m = mountedOf(v.id); return esc(TIRES[m.season] || m.season) + (m.treadMm!=null ? ' ' + String(m.treadMm).replace('.', ',') + ' mm' : ''); }
    if (k==='policyUntil') return fdate(v[k]); return esc(v[k]); };
  const inp = (v, k) => { const a = `data-fd="${esc(v.id)}" data-k="${k}" aria-label="${esc(v.plate)} – ${k}"`;
    if (k==='year') return `<input type="number" ${a} min="1990" max="${Number(today().slice(0, 4)) + 1}" placeholder="2020" style="width:84px">`;
    if (k==='vin') return `<input ${a} maxlength="17" placeholder="17 znaków" style="width:190px;text-transform:uppercase">`;
    if (k==='tankL') return `<input type="number" ${a} min="20" max="400" placeholder="90" style="width:70px">`;
    if (k==='insurer') return `<input ${a} placeholder="np. PZU" style="width:120px">`;
    if (k==='policyUntil' || k==='fire') return `<input type="date" ${a}>`;
    if (k==='contract') return `<span class="fd-multi"><select ${a.replace('data-k="contract"', 'data-k="ctKind"')} style="width:110px"><option value="">—</option>${Object.entries(CONTRACT_KINDS).filter(([x]) => x!=='wlasne').map(([x, l]) => `<option value="${x}">${esc(l)}</option>`).join('')}<option value="wlasne">własne</option></select><input type="number" step="0.01" ${a.replace('data-k="contract"', 'data-k="ctRate"')} placeholder="rata" style="width:90px"><input type="date" ${a.replace('data-k="contract"', 'data-k="ctEnd"')}></span>`;
    if (k==='tire') return `<span class="fd-multi"><select ${a.replace('data-k="tire"', 'data-k="tSeason"')} style="width:110px"><option value="">—</option>${Object.entries(TIRES).map(([x, l]) => `<option value="${x}" ${v.tires===x ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select><input type="number" step="0.1" ${a.replace('data-k="tire"', 'data-k="tTread"')} placeholder="mm" style="width:64px"></span>`;
    return ''; };
  editing = {col:'fill-data', id: null, base:{}, special: saveFillData};
  $('#dlg-title').textContent = `Uzupełnij dane floty · ${todo.length} ${isPlural(todo.length,'auto','auta','aut')}`;
  $('#dlg-body').innerHTML = `<p class="muted small field full" style="margin:0">Wpisz, co masz pod ręką – puste pola pominiemy, możesz uzupełniać na raty. Wypełnione wcześniej dane zmienisz w karcie auta.</p>
    <div class="field full tablewrap sb-wrap"><table class="sb-tbl fd-tbl"><thead><tr><th>Auto</th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
      ${todo.map(v => `<tr><td>${plate(v.plate)}<span class="sub">${esc([v.make, v.model].filter(Boolean).join(' '))}</span></td>${cols.map(([k]) => `<td>${fillHas(v, k) ? `<span class="muted small">${show(v, k)}</span>` : inp(v, k)}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div><div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zapisz dane'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
  $('#dialog')?.classList.add('dlg-wide');
}
async function saveFillData(){
  const val = (vid, k) => { const el = document.querySelector(`[data-fd="${vid}"][data-k="${k}"]`); return el ? String(el.value || '').trim() : ''; };
  const ids = [...new Set([...document.querySelectorAll('[data-fd]')].map(e => e.dataset.fd))];
  const warn = $('#dlg-warn'); warn.hidden = true;
  // sprawdzenie przed zapisem
  for (const vid of ids){ const v = byId('vehicles', vid), y = val(vid, 'year'), vin = val(vid, 'vin').toUpperCase();
    if (y && (Number(y) < 1990 || Number(y) > Number(today().slice(0, 4)) + 1)){ warn.textContent = `${v.plate}: rocznik ${y} wygląda na błędny.`; warn.hidden = false; return; }
    if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)){ warn.textContent = `${v.plate}: VIN ma mieć 17 znaków (bez I, O, Q).`; warn.hidden = false; return; }
    if ((val(vid, 'ctRate') || val(vid, 'ctEnd')) && !val(vid, 'ctKind')){ warn.textContent = `${v.plate}: wybierz rodzaj umowy.`; warn.hidden = false; return; }
    if (val(vid, 'tTread') && !val(vid, 'tSeason')){ warn.textContent = `${v.plate}: wybierz sezon opon.`; warn.hidden = false; return; } }
  const btn = $('#dlg-save'); btn.disabled = true; let n = 0;
  try {
    for (const vid of ids){ const v = byId('vehicles', vid), up = {};
      const y = val(vid, 'year'), vin = val(vid, 'vin').toUpperCase(), tank = val(vid, 'tankL'), ins = val(vid, 'insurer'), pol = val(vid, 'policyUntil');
      if (y) up.year = Number(y); if (vin) up.vin = vin; if (tank) up.tankL = Number(tank); if (ins) up.insurer = ins; if (pol) up.policyUntil = pol;
      if (Object.keys(up).length){ await db.collection('vehicles').doc(vid).update(up); n += Object.keys(up).length; }
      const kind = val(vid, 'ctKind');
      if (kind){ const rate = Number(val(vid, 'ctRate').replace(',', '.')) || null;
        await db.collection('contracts').doc().set({vehicleId: vid, kind, monthlyNet: rate, endDate: val(vid, 'ctEnd') || null, kmStart: kind!=='wlasne' && v.km ? Number(v.km) : null}); n++; }
      const fire = val(vid, 'fire');
      if (fire){ const e = eqOf(vid, 'Gaśnica'); await db.collection('equipment').doc(e ? e.id : undefined).set({vehicleId: vid, item:'Gaśnica', ok: true, validUntil: fire, checkedAt: e && e.checkedAt || null, note: e && e.note || null}); n++; }
      const season = val(vid, 'tSeason');
      if (season){ const tr = val(vid, 'tTread'); await db.collection('tires').doc().set({vehicleId: vid, season, location:'na_aucie', treadMm: tr ? Number(tr.replace(',', '.')) : null, mountedAt: null}); n++; }
    }
    closeForm(); toast(n ? `Zapisano ${n} ${isPlural(n,'pole','pola','pól')}` : 'Nic nie wpisano');
  } catch(err){ handleWriteErr(err); if (n) toast(`Zapisano ${n} – reszta nie przeszła`); }
  finally { btn.disabled = false; }
}
document.addEventListener('click', e => { if (e.target.closest('[data-action="fill-data"]')){ e.preventDefault(); openFillData(); } });

/* ---------- Edycja tabelą: wszystkie auta naraz, wartości wypełnione, zapis tylko zmienionych pól ---------- */
const QE_COLS_ALL = [['tankL','Zbiornik (l)','number','min="20" max="400" step="1" inputmode="numeric"'],['tireSize','Rozmiar opon','text','maxlength="40" placeholder="225/75 R16C"'],['year','Rocznik','number','min="1990" step="1" inputmode="numeric"'],
  ['vin','VIN','text','maxlength="17" autocapitalize="characters"'],['insurer','Ubezpieczyciel','text',''],['policyUntil','OC do','date','']];
const qeCols = () => QE_COLS_ALL.filter(c => c[0]!=='tireSize' || tireSizeOn());
function openQuickEdit(){
  const vs = S.vehicles.filter(v => v.status!=='wycofany').sort((a, b) => a.plate.localeCompare(b.plate));
  $('#dlg-title').textContent = `Edycja tabelą · ${vs.length} aut`;
  $('#dlg-body').innerHTML = `<p class="muted small field full" style="margin:0">Popraw wartości i kliknij Zapisz – zapiszą się tylko zmienione pola. Tab przechodzi do następnego pola, Enter w dół.</p>
    <div class="field full tablewrap sb-wrap"><table class="sb-tbl fd-tbl qe-tbl"><thead><tr><th>Auto</th>${qeCols().map(c => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>${vs.map(v => `<tr><td>${plate(v.plate)}<span class="sub">${esc((v.make || '') + ' ' + (v.model || ''))}</span></td>${
      qeCols().map(([k, l, t, a]) => `<td data-l="${l}"><input type="${t}" ${a} data-qe="${esc(v.id)}" data-k="${k}" value="${esc(v[k]==null ? '' : String(v[k]))}" aria-label="${esc(v.plate)}: ${k}"></td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dialog')?.classList.add('dlg-wide');
  editing = {col:'quick-edit', id: null, base:{}, special: saveQuickEdit};
  $('#dlg-save').textContent = 'Zapisz zmiany'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
  setTimeout(() => document.querySelector('[data-qe][data-k="tankL"]')?.focus(), 50);
}
async function saveQuickEdit(){
  const warn = $('#dlg-warn'); warn.hidden = true;
  const ch = {};
  document.querySelectorAll('[data-qe]').forEach(i => { const v = byId('vehicles', i.dataset.qe), k = i.dataset.k; let x = i.value.trim();
    const cur = v[k]==null ? '' : String(v[k]); if (x===cur) return;
    (ch[v.id] = ch[v.id] || {})[k] = x; });
  for (const [vid, up] of Object.entries(ch)){ const v = byId('vehicles', vid);
    if (up.tankL && !(Number(up.tankL) >= 20 && Number(up.tankL) <= 400)){ warn.textContent = `${v.plate}: zbiornik 20–400 l.`; warn.hidden = false; return; }
    if (up.year && !(Number(up.year) >= 1990 && Number(up.year) <= new Date().getFullYear() + 1)){ warn.textContent = `${v.plate}: rocznik wygląda na błędny.`; warn.hidden = false; return; }
    if (up.vin){ up.vin = up.vin.toUpperCase(); if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(up.vin)){ warn.textContent = `${v.plate}: VIN ma 17 znaków (bez I, O, Q).`; warn.hidden = false; return; } }
    ['tankL','year'].forEach(k => { if (k in up) up[k] = up[k]==='' ? null : Number(up[k]); });
    if (up.tireSize) up.tireSize = normTireSize(up.tireSize);
    ['vin','insurer','policyUntil','tireSize'].forEach(k => { if (k in up && up[k]==='') up[k] = null; });
  }
  const ids = Object.keys(ch); if (!ids.length){ closeForm(); toast('Nic się nie zmieniło'); return; }
  const btn = $('#dlg-save'); btn.disabled = true; let n = 0;
  try { for (const vid of ids){ await db.collection('vehicles').doc(vid).update(ch[vid]); n++; }
    if (typeof suspMemo!=='undefined') suspMemo = {k: '', v: []};
    closeForm(); toast(`Zapisano zmiany w ${n} ${isPlural(n,'aucie','autach','autach')}`); }
  catch(err){ handleWriteErr(err); if (n) toast(`Zapisano ${n} – reszta nie przeszła`); }
  finally { btn.disabled = false; }
}
document.addEventListener('click', e => { if (e.target.closest('[data-action="quick-edit"]')){ e.preventDefault(); openQuickEdit(); } });
document.addEventListener('keydown', e => { const i = e.target.closest && e.target.closest('[data-qe]'); if (!i || e.key!=='Enter') return; e.preventDefault();
  const all = [...document.querySelectorAll(`[data-qe][data-k="${i.dataset.k}"]`)], nx = all[all.indexOf(i) + 1]; if (nx){ nx.focus(); nx.select && nx.select(); } });
