/* Emage FLEET — przystanki (klienci) na trasach.
   Kierownik floty: Grafik → Trasy → „Przystanki” przy trasie (kolejność, klient, adres, godzina, telefon, uwagi).
   Kierowca: lista przystanków swojej dzisiejszej trasy pod kartą auta – nawigacja i telefon jednym kliknięciem.
   Tabela route_stops powstaje w migracji 022_przystanki.sql. */

const stopsOf = rid => !modOn('przystanki') ? [] : (S.routeStops || []).filter(s => s.routeId===rid).sort((a, b) => (a.pos || 0) - (b.pos || 0));
const mapsUrl = addr => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addr);
function routeMapsUrl(stops){
  const a = stops.map(s => s.address).filter(Boolean); if (!a.length) return '';
  const dest = a[a.length - 1], way = a.slice(0, -1).slice(0, 9);
  return mapsUrl(dest) + (way.length ? '&waypoints=' + encodeURIComponent(way.join('|')) : '') + '&travelmode=driving';
}
const telHref = p => 'tel:' + String(p).replace(/[^\d+]/g, '');

/* ---------- kierowca ---------- */
function myStopsPanel(rid){
  if (!rid) return '';
  const st = stopsOf(rid); if (!st.length) return '';
  const all = routeMapsUrl(st);
  return `<details class="panel fold stops" open><summary class="sec-head"><h3>Przystanki · ${esc(rCode(rid))}</h3><span class="count">${st.length}</span></summary>
    ${st.map((s, i) => `<div class="st-row"><span class="st-n">${i + 1}</span><div class="st-t"><b>${esc(s.client)}</b>${s.timeFrom ? ` <span class="pill soon">${esc(s.timeFrom)}</span>` : ''}
      ${s.address ? `<span class="sub">${esc(s.address)}</span>` : ''}${s.note ? `<span class="st-note">${esc(s.note)}</span>` : ''}</div>
      <div class="st-act">${s.address ? `<a class="btn small" href="${esc(mapsUrl(s.address))}" target="_blank" rel="noopener">${ic('route')}Nawiguj</a>` : ''}${s.phone ? `<a class="btn small" href="${esc(telHref(s.phone))}" aria-label="Zadzwoń do ${esc(s.client)}">${ic('phone')}</a>` : ''}</div></div>`).join('')}
    ${all ? `<div class="st-foot"><a class="btn small" href="${esc(all)}" target="_blank" rel="noopener">${ic('route')}Cała trasa w Mapach Google</a></div>` : ''}</details>`;
}

/* ---------- kierownik: edycja przystanków trasy ---------- */
let stopsDraft = null;
function openStops(rid){
  const r = routeById(rid); if (!r) return;
  stopsDraft = {rid, list: stopsOf(rid).map(s => ({...s}))};
  editing = {col:'route-stops', id: rid, base:{}, special: saveStops};
  $('#dlg-title').textContent = `Przystanki · ${r.code} ${r.name}`;
  renderStopsDlg();
  $('#dlg-save').textContent = 'Zapisz przystanki';
  $('#dlg-del').hidden = true;
  $('#scrim').hidden = false;
}
function readStopsDlg(){
  if (!stopsDraft) return;
  document.querySelectorAll('#dlg-body .se-row').forEach((row, i) => {
    const s = stopsDraft.list[i]; if (!s) return;
    ['client','address','timeFrom','phone','note'].forEach(k => { const el = row.querySelector(`[data-k="${k}"]`); if (el) s[k] = el.value; });
  });
}
function renderStopsDlg(){
  const L = stopsDraft.list;
  $('#dlg-body').innerHTML = `${!stopsReady ? '<div class="field full"><div class="notice err"><span>Przystanki wymagają jednorazowego uruchomienia migracji <b>022_przystanki.sql</b> w Supabase (SQL Editor). Do tego czasu nie da się ich zapisać.</span></div></div>' : ''}
    <div class="field full"><span class="muted small">Kolejność = kolejność jazdy. Kierowca zobaczy przystanki trasy, którą ma w grafiku, z przyciskami „Nawiguj” i telefonem.</span></div>
    ${L.map((s, i) => `<div class="field full se-row"><div class="se-h"><b class="se-n">${i + 1}</b>
        <span class="se-mv"><button type="button" class="small ghost icon" data-se-up="${i}" ${i ? '' : 'disabled'} aria-label="W górę">↑</button><button type="button" class="small ghost icon" data-se-down="${i}" ${i < L.length - 1 ? '' : 'disabled'} aria-label="W dół">↓</button><button type="button" class="small ghost icon" data-se-del="${i}" aria-label="Usuń przystanek">✕</button></span></div>
      <div class="se-grid">
        <input data-k="client" placeholder="Klient *" value="${esc(s.client || '')}" aria-label="Klient">
        <input data-k="timeFrom" placeholder="Godzina, np. 8:00" value="${esc(s.timeFrom || '')}" aria-label="Godzina">
        <input data-k="address" class="se-wide" placeholder="Adres (miasto, ulica)" value="${esc(s.address || '')}" aria-label="Adres">
        <input data-k="phone" type="tel" placeholder="Telefon" value="${esc(s.phone || '')}" aria-label="Telefon">
        <input data-k="note" placeholder="Uwagi, np. rampa od tyłu" value="${esc(s.note || '')}" aria-label="Uwagi">
      </div></div>`).join('')}
    <div class="field full"><button type="button" class="small" data-se-add>${ic('plus')}Dodaj przystanek</button></div>
    <div class="warnline" id="dlg-warn" hidden></div>`;
}
async function saveStops(){
  readStopsDlg();
  const w = $('#dlg-warn');
  if (!stopsReady){ w.textContent = 'Najpierw uruchom migrację 022_przystanki.sql w Supabase.'; w.hidden = false; return; }
  const L = stopsDraft.list.map(s => ({...s, client: (s.client || '').trim()})).filter(s => s.client || s.address || s.phone);
  const bad = L.findIndex(s => !s.client);
  if (bad >= 0){ w.textContent = `Wpisz nazwę klienta przy przystanku ${bad + 1}.`; w.hidden = false; return; }
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    const keep = new Set(L.filter(s => s.id).map(s => s.id));
    for (const s of stopsOf(stopsDraft.rid)) if (!keep.has(s.id)) await db.collection('routeStops').doc(s.id).delete();
    for (let i = 0; i < L.length; i++){
      const s = L[i], data = {routeId: stopsDraft.rid, pos: i + 1, client: s.client, address: (s.address || '').trim() || null, timeFrom: (s.timeFrom || '').trim() || null, phone: (s.phone || '').trim() || null, note: (s.note || '').trim() || null};
      await (s.id ? db.collection('routeStops').doc(s.id) : db.collection('routeStops').doc()).set(data);
    }
    closeForm(); stopsDraft = null;
    toast(`Zapisano przystanki: ${L.length}`);
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}
document.addEventListener('click', e => {
  const o = e.target.closest('[data-stops]');
  if (o){ e.preventDefault(); e.stopPropagation(); openStops(o.dataset.stops); return; }
  if (!stopsDraft || !e.target.closest('#dialog')) return;
  const t = e.target.closest('[data-se-add],[data-se-up],[data-se-down],[data-se-del]'); if (!t) return;
  readStopsDlg();
  const L = stopsDraft.list, d = t.dataset;
  if ('seAdd' in d) L.push({client:'', address:'', timeFrom:'', phone:'', note:''});
  else if (d.seUp){ const i = +d.seUp; [L[i - 1], L[i]] = [L[i], L[i - 1]]; }
  else if (d.seDown){ const i = +d.seDown; [L[i + 1], L[i]] = [L[i], L[i + 1]]; }
  else if (d.seDel){ L.splice(+d.seDel, 1); }
  renderStopsDlg();
  if ('seAdd' in d){ const r = document.querySelectorAll('#dlg-body .se-row'); r[r.length - 1]?.querySelector('input')?.focus(); }
}, true);
