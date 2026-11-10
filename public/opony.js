/* Emage FLEET — opony: komplety letnie / zimowe / całoroczne każdego auta, magazyn, bieżnik i wiek.
   Dane: tabela tires (migracja 027). Komplet „na aucie” sam ustawia vehicles.tires (przypomnienie o sezonie).
   Wejścia: Serwis → Opony, karta auta (wiersz „Opony”), Pulpit (zużyte / stare opony). */
'use strict';
const TIRE_LOC = {na_aucie:'na aucie', magazyn:'w magazynie', zuzyte:'zużyte / zezłomowane'};
const canTires = () => canWrite && ['rw'].includes(P().tires);
const tiresOn = () => typeof optOn==='function' && optOn('tires') && (P().manage || P().service);
const tiresOf = vid => S.tires.filter(t => t.vehicleId===vid && t.location!=='zuzyte');
const mountedOf = vid => S.tires.find(t => t.vehicleId===vid && t.location==='na_aucie') || null;
const tireAge = t => t.dot ? Number(today().slice(0, 4)) - Number(t.dot) : null;
/* Uwagi do kompletu: bieżnik (zima: poniżej 4 mm – w Niemczech i Austrii zalecane minimum, prawo 1,6 mm), wiek ≥ 6 lat */
function tireWarn(t){
  const out = [], mm = t.treadMm==null ? null : Number(t.treadMm), lim = t.season==='letnie' ? 3 : 4;
  if (mm!=null && mm < 1.6) out.push(['bad', `bieżnik ${String(mm).replace('.', ',')} mm – poniżej prawa`]);
  else if (mm!=null && mm < lim) out.push(['warn', `bieżnik ${String(mm).replace('.', ',')} mm`]);
  const a = tireAge(t); if (a!=null && a >= 8) out.push(['bad', `${a} lat`]); else if (a!=null && a >= 6) out.push(['warn', `${a} lat`]);
  const v = t.vehicleId && byId('vehicles', t.vehicleId);
  if (v && v.tireSize && t.size && normTireSize(t.size).replace(/\s/g, '')!==normTireSize(v.tireSize).replace(/\s/g, '')) out.push(['warn', `inny rozmiar niż auto (${v.tireSize})`]);
  return out;
}
const tireLabel = t => `${TIRES[t.season] || t.season}${t.size ? ' · ' + t.size : ''}`;
function tireChip(t){
  const w = tireWarn(t);
  return `<button type="button" class="tire-chip ${t.season}" ${canTires() ? `data-edit="tires" data-id="${esc(t.id)}"` : ''} title="Kliknij, aby edytować">
    <b>${esc(TIRES[t.season] || t.season)}</b><span>${esc([t.brand, t.size].filter(Boolean).join(' · ') || 'bez opisu')}</span>
    <span class="sub">${t.treadMm!=null ? String(t.treadMm).replace('.', ',') + ' mm' : 'bieżnik ?'}${t.dot ? ' · DOT ' + esc(t.dot) : ''}${t.location==='magazyn' && t.storage ? ' · ' + esc(t.storage) : ''}${t.location==='na_aucie' && t.mountedAt ? ' · od ' + fdate(t.mountedAt) : ''}</span>
    ${w.map(([c, x]) => `<span class="pill ${c}">${esc(x)}</span>`).join(' ')}</button>`;
}
function tireProblems(){
  return S.tires.filter(t => t.location!=='zuzyte' && tireWarn(t).length)
    .map(t => ({t, v: byId('vehicles', t.vehicleId), w: tireWarn(t)})).filter(x => !x.t.vehicleId || (x.v && x.v.status!=='wycofany'));
}
let tireFilter = 'all';
function viewTires(){
  if (!tiresOn()){ return `<div class="bar"><h2>Opony</h2></div><div class="panel empty"><h3>Moduł opon czeka na bazę</h3><p>Uruchom w Supabase migrację <b>027_opony.sql</b> – potem w tej zakładce pojawią się komplety opon, magazyn i bieżnik.</p></div>`; }
  const vs = S.vehicles.filter(v => v.status!=='wycofany').sort((a, b) => String(a.plate).localeCompare(b.plate));
  const cnt = s => vs.filter(v => (mountedOf(v.id) || {}).season===s || (!mountedOf(v.id) && v.tires===s)).length;
  const noSet = vs.filter(v => !tiresOf(v.id).length), noOther = vs.filter(v => { const m = mountedOf(v.id); return m && m.season!=='caloroczne' && !tiresOf(v.id).some(t => t.location==='magazyn' && t.season!==m.season); });
  const probs = tireProblems(), spare = S.tires.filter(t => !t.vehicleId && t.location==='magazyn');
  const season = typeof tireReminder==='function' ? tireReminder() : null;
  const tile = (k, n, l, cls) => `<button class="fc-tile ${cls} ${tireFilter===k ? 'on' : ''}" data-tf="${k}"><b>${n}</b><span>${l}</span></button>`;
  const list = tireFilter==='noset' ? noSet : tireFilter==='noother' ? noOther : tireFilter==='warn' ? vs.filter(v => tiresOf(v.id).some(t => tireWarn(t).length)) : tireFilter==='season' && season ? season.list : vs;
  const row = v => { const m = mountedOf(v.id), st = tiresOf(v.id).filter(t => t.location==='magazyn');
    const swap = m && st.length ? st.find(t => t.season!==m.season) || st[0] : (!m && st.length ? st[0] : null);
    return `<tr><td>${plate(v.plate)}<span class="sub">${[v.tireSize ? `<b>${esc(v.tireSize)}</b>` : (tireSizeOn() ? '<span class="muted">rozmiar?</span>' : ''), v.km ? km(v.km) : ''].filter(Boolean).join(' · ')}</span></td>
      <td data-l="Na aucie">${m ? tireChip(m) : v.tires ? `<span class="muted">${esc(TIRES[v.tires])} – komplet nieopisany</span>` : '<span class="muted">—</span>'}</td>
      <td data-l="W magazynie">${st.map(tireChip).join('') || '<span class="muted">—</span>'}</td>
      <td class="r">${canTires() ? `${swap ? `<button class="small" data-tire-swap="${esc(v.id)}" data-to="${esc(swap.id)}">Załóż ${esc((TIRES[swap.season] || '').toLowerCase())}</button> ` : ''}<button class="small ghost" data-tire-new="${esc(v.id)}">${ic('plus')}Komplet</button>` : ''}</td></tr>`; };
  return `<div class="bar"><h2>Opony</h2><div class="tools">${canTires() ? `<button class="primary" data-tire-new="">${ic('plus')}Komplet opon</button>` : ''}</div></div>
    ${season ? `<div class="notice ${season.urgent ? 'err' : ''}"><span><b>Sezon na ${esc(season.to)}:</b> ${season.list.length} ${isPlural(season.list.length,'auto jeździ','auta jeżdżą','aut jeździ')} jeszcze na innych oponach. Kliknij „Załóż …” przy aucie albo dodaj komplet.</span></div>` : ''}
    <div class="fc-tiles">${tile('all', vs.length, 'aut', '')}${tile('zim', cnt('zimowe'), 'na zimowych', 'info')}${tile('let', cnt('letnie'), 'na letnich', '')}${season ? tile('season', season.list.length, 'do wymiany na sezon', 'warn') : ''}${tile('warn', probs.length, 'zużyte lub stare', probs.length ? 'bad' : 'ok')}${tile('noset', noSet.length, 'bez opisanych opon', noSet.length ? 'warn' : 'ok')}${tile('noother', noOther.length, 'bez drugiego kompletu', '')}</div>
    <div class="panel tablewrap"><table class="tire-tbl"><thead><tr><th>Auto</th><th>Na aucie</th><th>W magazynie</th><th></th></tr></thead><tbody>
      ${(tireFilter==='zim' ? vs.filter(v => (mountedOf(v.id) || {season: v.tires}).season==='zimowe') : tireFilter==='let' ? vs.filter(v => (mountedOf(v.id) || {season: v.tires}).season==='letnie') : list).map(row).join('') || '<tr><td colspan="4" class="muted">Brak aut dla tego filtra.</td></tr>'}
    </tbody></table></div>
    ${spare.length ? `<div class="panel"><div class="sec-head"><h3>Zapas bez auta</h3><span class="count">${spare.length}</span></div><div class="tire-spare">${spare.map(tireChip).join('')}</div></div>` : ''}
    <p class="muted small" style="margin:0;max-width:90ch">Bieżnik: prawo w Polsce i UE – min. 1,6 mm; zimą w Niemczech i Austrii zalecane min. 4 mm (dla tras zagranicznych). Opony starsze niż 6 lat (rok z kodu DOT na boku opony) tracą przyczepność nawet z dobrym bieżnikiem. Komplet „na aucie” sam ustawia rodzaj opon auta – z tego korzysta przypomnienie o sezonowej wymianie.</p>`;
}
/* Wymiana jednym kliknięciem: zdejmij komplet z auta do magazynu, załóż wybrany; opcjonalnie koszt wymiany */
function openTireSwap(vid, toId){
  const v = byId('vehicles', vid), to = byId('tires', toId); if (!v || !to || !canTires()) return;
  const m = mountedOf(vid);
  editing = {col:'tire-swap', id: toId, base:{}, special: () => saveTireSwap(vid, toId)};
  $('#dlg-title').textContent = `Wymiana opon · ${v.plate}`;
  $('#dlg-body').innerHTML = `<div class="field full"><span class="label">Zakładamy</span><b>${esc(tireLabel(to))}</b>${to.storage ? ` <span class="muted small">z: ${esc(to.storage)}</span>` : ''}</div>
    ${m ? `<label class="field full"><span class="label">Zdjęte (${esc(tireLabel(m))}) odkładamy do</span><input id="ts-store" placeholder="np. regał A3, przechowalnia Vulco" value="${esc(m.storage || to.storage || '')}"></label>
      <label class="field"><span class="label">Bieżnik zdjętych (mm)</span><input id="ts-tread" type="number" step="0.1" inputmode="decimal" min="0" value="${m.treadMm!=null ? esc(m.treadMm) : ''}"></label>` : ''}
    <label class="field"><span class="label">Data</span><input id="ts-date" type="date" value="${today()}"></label>
    <label class="field"><span class="label">Przebieg (km)</span><input id="ts-km" type="number" inputmode="numeric" min="0" value="${v.km || ''}"></label>
    <label class="field"><span class="label">Koszt wymiany (zł, opcjonalnie)</span><input id="ts-cost" type="number" step="0.01" inputmode="decimal" min="0" placeholder="doda się do kosztów auta"></label>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zapisz wymianę'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
}
async function saveTireSwap(vid, toId){
  const m = mountedOf(vid), d = $('#ts-date').value || today(), kmv = Number($('#ts-km').value) || null, cost = Number(($('#ts-cost').value || '').replace(',', '.')) || 0;
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    if (m && m.id!==toId){ const tr = $('#ts-tread') && $('#ts-tread').value!=='' ? Number($('#ts-tread').value.replace(',', '.')) : m.treadMm;
      await db.collection('tires').doc(m.id).update({location:'magazyn', storage: ($('#ts-store') || {}).value || null, treadMm: tr==null ? null : tr}); }
    await db.collection('tires').doc(toId).update({location:'na_aucie', vehicleId: vid, mountedAt: d, mountedKm: kmv, storage: null});
    if (cost > 0) await db.collection('costs').doc().set({vehicleId: vid, date: d, category:'Opony', amount: cost, odometer: kmv, note:`Wymiana opon: ${tireLabel(byId('tires', toId) || {})}`});
    closeForm(); toast(`Założono ${tireLabel(byId('tires', toId) || {}).toLowerCase()}${cost > 0 ? ' · koszt dodany' : ''}`);
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}
/* Karta auta: krótki opis opon */
function tiresFact(v){
  if (!tiresOn()) return null;
  const m = mountedOf(v.id), st = tiresOf(v.id).filter(t => t.location==='magazyn');
  if (!m && !st.length) return null;
  const w = m ? tireWarn(m) : [];
  return `${m ? esc(tireLabel(m)) + (m.treadMm!=null ? ', ' + String(m.treadMm).replace('.', ',') + ' mm' : '') : '<span class="muted">nieopisane</span>'}${st.length ? ` <span class="muted small">· w magazynie: ${st.map(t => esc((TIRES[t.season] || '').toLowerCase())).join(', ')}</span>` : ''}${w.map(([c, x]) => ` <span class="pill ${c}">${esc(x)}</span>`).join('')}`;
}
document.addEventListener('click', e => {
  const f = e.target.closest('[data-tf]'); if (f){ tireFilter = f.dataset.tf===tireFilter ? 'all' : f.dataset.tf; render(); return; }
  const n = e.target.closest('[data-tire-new]'); if (n){ e.preventDefault(); openForm('tires', null, n.dataset.tireNew ? {vehicleId: n.dataset.tireNew, location: mountedOf(n.dataset.tireNew) ? 'magazyn' : 'na_aucie', size: (byId('vehicles', n.dataset.tireNew) || {}).tireSize || ''} : undefined); return; }
  const s = e.target.closest('[data-tire-swap]'); if (s){ e.preventDefault(); openTireSwap(s.dataset.tireSwap, s.dataset.to); }
});
