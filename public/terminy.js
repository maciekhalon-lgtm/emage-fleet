/* Emage FLEET — terminy: terminy i przypomnienia */
'use strict';
function viewDeadlines(){
  const chips = [['all','Wszystkie'],['over','Po terminie'],['soon','Do 30 dni'],['later','Później']];
  const head = `<div class="bar"><h2>Terminy i przypomnienia</h2><div class="tools">${chips.map(([k,l])=>`<button class="small ${dlFilter===k?'primary':''}" data-dlf="${k}">${l}</button>`).join('')}${canCreate('deadlines')?'<button class="primary" data-new="deadlines">+ Dodaj termin</button>':''}</div></div>`;
  if (!S.deadlines.length) return head + loadingOr('deadlines', emptyBlock('Brak zapisanych terminów','Zapisz daty przeglądów technicznych, końca polis OC/AC, serwisów i wymiany opon. Strona podświetli to, co zbliża się w ciągu 30 dni.', '<button class="primary" data-new="deadlines">+ Dodaj termin</button>', '', 'deadlines'));
  const all = S.deadlines.map(d => ({d, s:dlState(d)})).sort((a,b)=> a.d.date<b.d.date?-1:a.d.date>b.d.date?1:0);
  const f = all.filter(({s}) => dlFilter==='all' || (dlFilter==='over' && s.d<=0) || (dlFilter==='soon' && s.d>0 && s.d<=30) || (dlFilter==='later' && s.d>30));
  const groups = [['Po terminie lub dziś', x=>x.s.d<=0],['W ciągu 14 dni', x=>x.s.d>0&&x.s.d<=14],['W ciągu 30 dni',x=>x.s.d>14&&x.s.d<=30],['Później',x=>x.s.d>30]];
  let html='';
  for (const [name, fn] of groups){
    const items = f.filter(fn); if (!items.length) continue;
    html += `<div class="dl-group label">${name} · ${items.length}</div>` + items.map(({d,s}) => {
      const v = byId('vehicles', d.vehicleId);
      const cyc = [d.intervalMonths?'co '+d.intervalMonths+' mies.':'', d.intervalKm?'co '+km(d.intervalKm):''].filter(Boolean).join(' lub ');
      const kmInfo = (d.kmDue ? `<span class="sub num">lub przy ${km(d.kmDue)}${v&&v.km?` (teraz ${km(v.km)})`:''}</span>` : '') + (cyc ? `<span class="sub">Cykl: ${cyc}</span>` : '') + (d.note && !d.kmDue ? `<span class="sub">${esc(d.note)}</span>` : '');
      return `<div class="dl-row ${s.cls==='ok'?'':s.cls}" ${canEditDoc('deadlines',d)?'data-edit="deadlines" tabindex="0"':'style="cursor:default"'} data-id="${esc(d.id)}">
        <div class="dl-date">${fdate(d.date)}</div>
        <div style="min-width:0"><b>${esc(d.type)}</b>${kmInfo}</div>
        <div class="hide-sm" style="min-width:0">${vPlate(d.vehicleId)} <span class="sub">${esc(vName(d.vehicleId))}</span></div>
        <div class="hide-sm"><span class="pill ${s.cls}">${esc(s.txt)}</span></div>
        <div>${canEditDoc('deadlines',d)?`<button class="small" data-renew="${esc(d.id)}" title="Oznacz jako wykonane i ustaw kolejny termin">Wykonane</button>`:''}</div>
      </div>`; }).join('');
  }
  return head + `<div class="panel dl">${html || '<div class="empty"><p>Brak terminów w tym filtrze.</p></div>'}</div>`;
}
/* domyślne cykle: [miesiące, km] */
const DL_INTERVALS = {'Przegląd techniczny':[12,null],'Ubezpieczenie OC':[12,null],'Ubezpieczenie AC':[12,null],'Serwis olejowy':[12,15000],'Wymiana opon':[6,null],'Przegląd gwarancyjny':[12,30000],'Legalizacja tachografu':[24,null],'Leasing – koniec umowy':[null,null],'Inne':[null,null]};
function renew(id){
  const d = byId('deadlines', id); if (!d) return;
  const def = DL_INTERVALS[d.type] || [12,null];
  const months = Number(d.intervalMonths) || def[0] || 12;
  const kmStep = Number(d.intervalKm) || (d.kmDue ? def[1] : null);
  const v = byId('vehicles', d.vehicleId);
  openForm('deadlines', id);
  if (editing) editing.renew = true;
  setTimeout(()=>{ const el=$('#f-deadlines-date'); if(el){ el.value = addMonths(today(), months); el.focus(); }
    const k=$('#f-deadlines-kmDue'); if (k && kmStep && v && v.km) k.value = Number(v.km) + kmStep;
    $('#dlg-title').textContent = 'Wykonane – ustaw kolejny termin'; },30);
}

