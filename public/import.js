/* Emage FLEET — import: wczytanie listy pojazdów z pliku Excel lub CSV */
'use strict';
const IMPORT_COLS = {
  plate: ['rejestracja','nr rejestracyjny','numer rejestracyjny','nr rej','nr rej.','tablica','numer','rej'],
  make:  ['marka','producent'],
  model: ['model'],
  year:  ['rok','rok produkcji','rocznik'],
  vin:   ['vin','nr vin','numer vin'],
  km:    ['przebieg','km','stan licznika','licznik'],
  fuel:  ['napęd','naped','paliwo','rodzaj paliwa','silnik'],
  notes: ['uwagi','notatki','opis'],
};
let importRows = [];
const normHead = s => String(s||'').toLowerCase().replace(/[()*:]/g,'').replace(/\s+/g,' ').trim();
const normPlate = s => String(s||'').toUpperCase().replace(/\s+/g,'');
function normFuel(s){
  const t = String(s||'').toLowerCase();
  if (!t) return '';
  if (/elektr|ev\b|bev/.test(t)) return 'Elektryczny';
  if (/hybr|phev|hev/.test(t)) return 'Hybryda';
  if (/lpg|gaz/.test(t)) return 'LPG';
  if (/diesel|\bon\b|tdi|dci|hdi|crdi/.test(t)) return 'Diesel';
  if (/benz|pb|tsi|petrol/.test(t)) return 'Benzyna';
  return '';
}
function prettyPlate(p){
  const s = normPlate(p);
  const m = s.match(/^([A-Z]{2,3})([A-Z0-9]{4,5})$/);
  return m ? m[1]+' '+m[2] : s;
}

function openImport(){
  if (!canCreate('vehicles')) return;
  importRows = [];
  editing = {col:'import', id:null, base:{}, special: runImport};
  $('#dlg-title').textContent = 'Import pojazdów z Excela';
  $('#dlg-body').innerHTML = `
    <div class="field full"><p class="muted" style="margin:0">Plik Excel (.xlsx) lub CSV z nagłówkami w pierwszym wierszu. Rozpoznajemy kolumny: <b>Rejestracja</b>, Marka, Model, Rok, VIN, Przebieg, Napęd, Uwagi.</p></div>
    <div class="field full"><label for="imp-file">Plik</label><input id="imp-file" type="file" accept=".xlsx,.xls,.csv"></div>
    <div class="field full"><button type="button" class="small" data-action="import-template">Pobierz pusty szablon</button></div>
    <div class="field full"><label class="check"><input id="imp-update" type="checkbox" checked> Aktualizuj auta, które już są w ewidencji (po numerze rejestracyjnym)</label></div>
    <div class="field full" id="imp-preview"></div>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-del').hidden = true;
  $('#dlg-save').textContent = 'Importuj';
  $('#scrim').hidden = false;
  $('#imp-file').addEventListener('change', readImportFile);
}

async function readImportFile(e){
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const box = $('#imp-preview'); box.innerHTML = '<span class="muted">Wczytywanie pliku…</span>';
  let X; try { X = await loadXLSX(); } catch(_){ box.innerHTML = '<span class="warnline">Nie udało się wczytać modułu Excel.</span>'; return; }
  try {
    const wb = X.read(await f.arrayBuffer(), {type:'array'});
    const raw = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
    if (!raw.length){ box.innerHTML = '<span class="warnline">Plik nie zawiera wierszy z danymi.</span>'; return; }
    const heads = Object.keys(raw[0]);
    const map = {};
    for (const [k, syn] of Object.entries(IMPORT_COLS)){ const h = heads.find(h => syn.includes(normHead(h))); if (h) map[k] = h; }
    if (!map.plate){ box.innerHTML = `<span class="warnline">Nie znaleziono kolumny z numerem rejestracyjnym. Nagłówki w pliku: ${esc(heads.join(', '))}.</span>`; importRows = []; return; }
    const existing = new Map(S.vehicles.map(v => [normPlate(v.plate), v]));
    const seen = new Set();
    importRows = raw.map(r => {
      const g = k => map[k] ? String(r[map[k]]).trim() : '';
      const plate = prettyPlate(g('plate'));
      const row = {plate, make:g('make'), model:g('model'), year: Number(g('year'))||null, vin:g('vin').toUpperCase(), km: Number(String(g('km')).replace(/[^\d]/g,''))||null, fuel: normFuel(g('fuel')), notes:g('notes')};
      const key = normPlate(plate);
      row.state = !key ? 'skip' : seen.has(key) ? 'dup' : existing.has(key) ? 'update' : 'new';
      row.existing = existing.get(key) || null;
      seen.add(key);
      return row;
    }).filter(r => r.state!=='skip');
    const n = s => importRows.filter(r => r.state===s).length;
    const miss = Object.keys(IMPORT_COLS).filter(k => !map[k]);
    box.innerHTML = `<div class="imp-sum"><span class="pill ok">${n('new')} nowych</span><span class="pill info">${n('update')} już w ewidencji</span>${n('dup')?`<span class="pill warn">${n('dup')} powtórzonych w pliku – pominięte</span>`:''}</div>
      ${miss.length ? `<span class="sub muted">Brak kolumn: ${miss.map(k => IMPORT_COLS[k][0]).join(', ')} – te pola zostaną puste.</span>` : ''}
      <div class="tablewrap imp-table"><table><thead><tr><th>Rejestracja</th><th>Pojazd</th><th class="r">Przebieg</th><th>Napęd</th><th></th></tr></thead><tbody>
      ${importRows.slice(0,50).map(r => `<tr><td>${plate(r.plate)}</td><td>${esc([r.make,r.model,r.year].filter(Boolean).join(' '))}</td><td class="r num">${km(r.km)}</td><td>${esc(r.fuel||'—')}</td><td>${r.state==='new'?'<span class="pill ok">nowy</span>':r.state==='update'?'<span class="pill info">aktualizacja</span>':'<span class="pill warn">pominięty</span>'}</td></tr>`).join('')}
      </tbody></table></div>${importRows.length>50?`<span class="sub muted">…i ${importRows.length-50} kolejnych</span>`:''}`;
  } catch(_){ box.innerHTML = '<span class="warnline">Nie udało się odczytać pliku. Zapisz go jako .xlsx lub .csv i spróbuj ponownie.</span>'; importRows = []; }
}

async function runImport(){
  const w = $('#dlg-warn');
  const upd = $('#imp-update').checked;
  const todo = importRows.filter(r => r.state==='new' || (upd && r.state==='update'));
  if (!todo.length){ w.textContent = importRows.length ? 'Nie ma nic do zaimportowania.' : 'Najpierw wybierz plik.'; w.hidden = false; return; }
  const btn = $('#dlg-save'); btn.disabled = true;
  let done = 0;
  try {
    for (const r of todo){
      btn.textContent = `Importowanie ${++done}/${todo.length}…`;
      const fields = Object.fromEntries(['plate','make','model','year','vin','km','fuel','notes'].map(k => [k, r[k]]).filter(([,v]) => v!=='' && v!==null));
      const meta = {updatedAt: new Date().toISOString()}; if (myId) meta.updatedBy = myId;
      if (r.state==='update') await db.collection('vehicles').doc(r.existing.id).update({...fields, ...meta});
      else await db.collection('vehicles').doc().set({status:'aktywny', fuel:'Diesel', ...fields, ...meta, ...(myId?{createdBy:myId}:{})});
    }
    closeForm(); toast(`Zaimportowano ${todo.length} ${isPlural(todo.length,'pojazd','pojazdy','pojazdów')}`);
  } catch(err){ handleWriteErr(err); toast(`Przerwano po ${done-1} z ${todo.length}`); }
  finally { btn.disabled = false; btn.textContent = 'Zapisz'; }
}

async function importTemplate(){
  let X; try { X = await loadXLSX(); } catch(_){ toast('Nie udało się wczytać modułu Excel'); return; }
  const ws = X.utils.aoa_to_sheet([['Rejestracja','Marka','Model','Rok','VIN','Przebieg','Napęd','Uwagi'],['PO 1AB23','Škoda','Octavia Combi',2021,'TMBJJ7NX5MY000000',118400,'Diesel','przykładowy wiersz – usuń']]);
  ws['!cols'] = [{wch:14},{wch:14},{wch:18},{wch:8},{wch:20},{wch:12},{wch:12},{wch:28}];
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Pojazdy');
  await saveFile('Emage-FLEET-szablon-pojazdow.xlsx', new Uint8Array(X.write(wb, {type:'array', bookType:'xlsx'})));
}
