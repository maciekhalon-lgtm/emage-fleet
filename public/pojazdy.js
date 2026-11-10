/* Emage FLEET — pojazdy: lista pojazdów */
'use strict';
function viewVehicles(){
  const head = `<div class="bar"><h2>Pojazdy</h2><div class="tools"><input class="search" id="search" type="search" placeholder="Szukaj: rejestracja, marka…" value="${esc(q)}" aria-label="Szukaj pojazdu">${P().manage || P().reports ? `<button data-action="veh-xlsx" title="Lista floty do Excela">${ic('chart')}Eksport</button>` : ''}${canWrite && P().vehicles==='rw' && typeof openQuickEdit==='function' ? `<button data-action="quick-edit" title="Zbiornik, rozmiar opon, rocznik, VIN, OC – wszystkie auta w jednej tabeli do edycji">${ic('cog')}Edytuj tabelą</button>` : ''}${canCreate('vehicles') && typeof fillMissing==='function' && fillMissing().length ? `<button data-action="fill-data" title="Rocznik, VIN, OC, umowy, gaśnice, opony – wszystkie auta w jednej tabeli">${ic('clip')}Uzupełnij dane (${fillMissing().length})</button>` : ''}${canCreate('vehicles')?'<button data-action="open-import">Import z Excela</button><button class="primary" data-new="vehicles">+ Dodaj pojazd</button>':''}</div></div>`;
  if (!S.vehicles.length) return head + loadingOr('vehicles', emptyBlock('Brak pojazdów w ewidencji','Dodaj pierwszy pojazd – numer rejestracyjny, markę i przebieg. Potem przypiszesz kierowców, terminy przeglądów i koszty.','<button class="primary" data-new="vehicles">+ Dodaj pojazd</button>', (canCreate('vehicles')?'<button data-action="open-import">Importuj z Excela</button>':''), 'vehicles'));
  const ql = q.toLowerCase();
  const urgentDl = v => { const nd = nextDeadline(v.id); return nd && ['bad','warn'].includes(dlState(nd).cls); };
  const theftIds = P().manage && typeof theftVehicles==='function' ? new Set(theftVehicles().map(x => x.v.id)) : new Set();
  const spBy = {}; if (P().manage && typeof fcSuspicious==='function'){ const ch = fcCheckedIds(); fcSuspicious().forEach(x => { if (!ch.has(x.row.id) && x.lvl==='bad') spBy[x.row.vehicleId] = (spBy[x.row.vehicleId] || 0) + 1; }); }
  const fuelAlarm = v => theftIds.has(v.id) || spBy[v.id] > 0;
  const F = {
    all:  ['Wszystkie', v => v.status!=='wycofany'],
    out:  ['W trasie', v => vehicleState(v).cls==='info'],
    free: ['Wolne', v => vehicleState(v).cls==='ok'],
    att:  ['Wymaga uwagi', v => v.status!=='wycofany' && (['bad','warn'].includes(vehicleState(v).cls) || urgentDl(v) || fuelAlarm(v))],
    off:  ['Wycofane', v => v.status==='wycofany'],
  };
  if (!F[vehFilter]) vehFilter = 'all';
  const base = S.vehicles.filter(v => !ql || [v.plate,v.make,v.model,v.vin,respNames(v)].join(' ').toLowerCase().includes(ql));
  const chips = `<div class="pb-quick" style="margin-top:4px">${Object.entries(F).filter(([k, [, fn]]) => k!=='off' || base.some(fn)).map(([k, [l, fn]]) => { const n = base.filter(fn).length;
    return `<button class="small ${vehFilter===k ? 'primary' : ''}" data-vf="${k}">${l} <span class="count ${k==='att' && n ? 'bad' : ''}">${n}</span></button>`; }).join('')}</div>`;
  const list = base.filter(F[vehFilter][1]).sort((a,b) => String(a.plate).localeCompare(b.plate));
  const rows = list.map(v => {
    const st = vehicleState(v); const nd = nextDeadline(v.id); const ds = nd && dlState(nd); const c = consumption(v.id);
    return `<tr class="click" data-card="${esc(v.id)}" tabindex="0" title="Otwórz kartę pojazdu">
      <td>${plate(v.plate)}<span class="sub">${esc(v.make)} ${esc(v.model)} · ${km(v.km)}</span></td>
      <td class="vt-st"><span class="pill ${st.cls}">${esc(st.txt)}</span>${theftIds.has(v.id) ? ' <span class="pill bad">podejrzane spalanie</span>' : ''}${spBy[v.id] ? ` <span class="pill bad">${spBy[v.id]} ${isPlural(spBy[v.id],'niemożliwe tankowanie','niemożliwe tankowania','niemożliwych tankowań')}</span>` : ''}</td>
      <td class="vt-dl">${nd?`<span class="pill ${ds.cls}">${esc(nd.type)}</span><span class="sub num">${esc(ds.txt)}</span>`:'<span class="muted">brak terminów</span>'}</td>
      <td class="r num vt-c">${c ? `<b>${c.val.toFixed(1).replace('.', ',')}</b> <span class="muted small">l/100</span>` : '<span class="muted">—</span>'}</td>
    </tr>`; }).join('');
  return head + chips + `<div class="panel tablewrap veh-tbl"><table><thead><tr><th>Auto</th><th>Status</th><th>Najbliższy termin</th><th class="r">Spalanie</th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="muted">Brak pojazdów${q ? ` pasujących do „${esc(q)}”` : ' w tym filtrze'}.</td></tr>`}</tbody></table></div>`;
}
let vehFilter = 'all';
document.addEventListener('click', e => { const t = e.target.closest('[data-vf]'); if (!t) return; vehFilter = t.dataset.vf; render(); });

/* Lista floty do Excela (np. dla ubezpieczyciela lub księgowości): dane auta, polisa, najbliższe terminy, przebieg, kto jeździ */
async function vehiclesXlsx(){
  let X; try { X = await loadXLSX(); } catch(_){ return toast('Nie udało się wczytać modułu Excel – sprawdź połączenie'); }
  const dl = (vid, type) => { const d = S.deadlines.filter(x => x.vehicleId===vid && x.type===type).sort((a, b) => a.date < b.date ? -1 : 1)[0]; return d ? fdate(d.date) : ''; };
  const rows = S.vehicles.slice().sort((a, b) => String(a.plate).localeCompare(b.plate)).map(v => {
    const b = S.bookings.find(x => x.vehicleId===v.id && holds(x));
    return {'Rejestracja': v.plate, 'Marka': v.make || '', 'Model': v.model || '', 'Rok': v.year || '', 'VIN': v.vin || '', 'Paliwo': v.fuel || '', 'Przebieg (km)': v.km || '',
      'Status': vehicleState(v).txt, 'Ubezpieczyciel': v.insurer || '', 'Nr polisy': v.policyNo || '', 'Polisa do': v.policyUntil ? fdate(v.policyUntil) : '',
      'Przegląd techniczny': dl(v.id, 'Przegląd techniczny'), 'OC': dl(v.id, 'Ubezpieczenie OC'), 'Serwis olejowy': dl(v.id, 'Serwis olejowy'),
      'Odpowiedzialni': respOf(v).map(dName).join(', '), 'Teraz jedzie': b ? crewName(b) : ''};
  });
  const wb = X.utils.book_new(), ws = X.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] || {}).map(k => ({wch: Math.max(10, k.length + 2)}));
  X.utils.book_append_sheet(wb, ws, 'Flota');
  await saveFile(`Emage-FLEET-flota-${today()}.xlsx`, new Uint8Array(X.write(wb, {type:'array', bookType:'xlsx'})));
}
document.addEventListener('click', e => { if (e.target.closest('[data-action="veh-xlsx"]')){ e.preventDefault(); vehiclesXlsx(); } });
