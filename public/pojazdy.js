/* Emage FLEET — pojazdy: lista pojazdów */
'use strict';
function viewVehicles(){
  const head = `<div class="bar"><h2>Pojazdy</h2><div class="tools"><input class="search" id="search" type="search" placeholder="Szukaj: rejestracja, marka…" value="${esc(q)}" aria-label="Szukaj pojazdu">${canCreate('vehicles')?'<button data-action="open-import">Import z Excela</button><button class="primary" data-new="vehicles">+ Dodaj pojazd</button>':''}</div></div>`;
  if (!S.vehicles.length) return head + loadingOr('vehicles', emptyBlock('Brak pojazdów w ewidencji','Dodaj pierwszy pojazd – numer rejestracyjny, markę i przebieg. Potem przypiszesz kierowców, terminy przeglądów i koszty.','<button class="primary" data-new="vehicles">+ Dodaj pojazd</button>', (canCreate('vehicles')?'<button data-action="open-import">Importuj z Excela</button>':''), 'vehicles'));
  const ql = q.toLowerCase();
  const urgentDl = v => { const nd = nextDeadline(v.id); return nd && ['bad','warn'].includes(dlState(nd).cls); };
  const F = {
    all:  ['Wszystkie', v => v.status!=='wycofany'],
    out:  ['W trasie', v => vehicleState(v).cls==='info'],
    free: ['Wolne', v => vehicleState(v).cls==='ok'],
    att:  ['Wymaga uwagi', v => v.status!=='wycofany' && (['bad','warn'].includes(vehicleState(v).cls) || urgentDl(v))],
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
      <td><span class="pill ${st.cls}">${esc(st.txt)}</span></td>
      <td>${nd?`<span class="pill ${ds.cls}">${esc(nd.type)}</span><span class="sub num">${esc(ds.txt)}</span>`:'<span class="muted">brak terminów</span>'}</td>
      <td class="r num">${c ? `<b>${c.val.toFixed(1).replace('.', ',')}</b> <span class="muted small">l/100</span>` : '<span class="muted">—</span>'}</td>
    </tr>`; }).join('');
  return head + chips + `<div class="panel tablewrap"><table><thead><tr><th>Auto</th><th>Status</th><th>Najbliższy termin</th><th class="r">Spalanie</th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="muted">Brak pojazdów${q ? ` pasujących do „${esc(q)}”` : ' w tym filtrze'}.</td></tr>`}</tbody></table></div>`;
}
let vehFilter = 'all';
document.addEventListener('click', e => { const t = e.target.closest('[data-vf]'); if (!t) return; vehFilter = t.dataset.vf; render(); });
