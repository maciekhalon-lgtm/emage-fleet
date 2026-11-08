/* Emage FLEET — koszty: koszty i paliwo */
'use strict';
function viewCosts(){
  const [y,m] = costMonth.split('-').map(Number);
  const head = `<div class="bar"><h2>Koszty</h2><div class="tools"><label class="label" for="month">Miesiąc</label><input id="month" type="month" value="${costMonth}" style="width:auto">${canCreate('costs')?'<button class="primary" data-new="costs">+ Dodaj koszt</button>':''}</div></div>`;
  const VC = visibleCosts(); const own = P().costs==='own';
  const mine = own ? myStatsPanel() : '';
  if (!VC.length) return head + mine + loadingOr('costs', emptyBlock(own?'Nie masz jeszcze wpisów':'Brak zapisanych kosztów', own?'Dodawaj swoje tankowania z litrami i stanem licznika, a także myjnię i opłaty. Widzisz tylko koszty, które sam wpisałeś.':'Wpisuj tankowania (z litrami i stanem licznika), serwisy, polisy i opłaty. Strona policzy sumy miesięczne i średnie spalanie każdego auta.','<button class="primary" data-new="costs">+ Dodaj koszt</button>', '', 'costs'));
  const inM = VC.filter(c => (c.date||'').startsWith(costMonth));
  const total = inM.reduce((s,c)=>s+Number(c.amount||0),0);
  const fuelT = inM.filter(c=>c.category==='Paliwo'||c.category==='Ładowanie').reduce((s,c)=>s+Number(c.amount||0),0);
  const yr = VC.filter(c => (c.date||'').startsWith(String(y))).reduce((s,c)=>s+Number(c.amount||0),0);
  const cats = COST_CATS.map(c => [c, inM.filter(x=>x.category===c).reduce((s,x)=>s+Number(x.amount||0),0)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
  const maxC = Math.max(1,...cats.map(c=>c[1]));
  const months = []; for (let i=5;i>=0;i--){ const d=new Date(y, m-1-i, 1); const key=d.getFullYear()+'-'+pad(d.getMonth()+1); months.push([key, MONTHS[d.getMonth()], VC.filter(c=>(c.date||'').startsWith(key)).reduce((s,c)=>s+Number(c.amount||0),0)]); }
  const maxM = Math.max(1, ...months.map(x=>x[2]));
  const perV = S.vehicles.map(v => ({v, m: inM.filter(c=>c.vehicleId===v.id).reduce((s,c)=>s+Number(c.amount||0),0), y: VC.filter(c=>c.vehicleId===v.id && (c.date||'').startsWith(String(y))).reduce((s,c)=>s+Number(c.amount||0),0), cons: consumption(v.id)})).filter(x=>x.y>0||x.m>0).sort((a,b)=>b.m-a.m||b.y-a.y);
  const entries = inM.filter(c=>!c.virtual).sort((a,b)=>a.date<b.date?1:-1);
  const cardM = inM.filter(c=>c.virtual), cardSum = cardM.reduce((s,c)=>s+Number(c.amount||0),0);
  const fl = flagsPanel();
  return head + (fl ? `<div style="margin-bottom:20px">${fl}</div>` : '') + (mine ? `<div style="margin-bottom:20px">${mine}</div>` : '') + `<div class="grid2">
    <div class="section">
      <div class="panel">
        <div class="totals"><div><span class="label">Razem w miesiącu</span><b>${zl(total)}</b></div><div><span class="label">W tym paliwo i ładowanie</span><b>${zl(fuelT)}</b></div><div><span class="label">Od początku ${y} r.</span><b>${zl(yr)}</b></div></div>
        <div class="months" role="img" aria-label="Koszty w ostatnich 6 miesiącach">${months.map(([k,l,v])=>`<div class="mcol ${k===costMonth?'cur':''}"><span class="v">${v?zl(v):''}</span><div class="col" style="height:${Math.round(v/maxM*120)}px"></div><span class="m">${l}</span></div>`).join('')}</div>
      </div>
      <div class="panel tablewrap"><table><thead><tr><th>Pojazd</th><th class="r">Miesiąc</th><th class="r">Rok ${y}</th><th class="r">Śr. zużycie</th></tr></thead><tbody>${(P().manage ? perV.filter(x=>x.m>0) : perV).map(x=>`<tr><td>${plate(x.v.plate)} <span class="sub">${esc(x.v.make+' '+x.v.model)}</span></td><td class="r num">${zl(x.m)}</td><td class="r num">${zl(x.y)}</td><td class="r num">${x.cons?x.cons.val.toFixed(1).replace('.',',')+' '+x.cons.unit:'<span class="muted">—</span>'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Brak kosztów przypisanych do pojazdów.</td></tr>'}</tbody></table>${P().manage ? `<p class="muted small sec-empty">Tylko auta z kosztami w tym miesiącu. Km, koszty ogólne i koszt 1 km każdego auta: <a href="#rozliczenie">Rozliczenie aut</a>.</p>` : ''}</div>
    </div>
    <div class="section">
      <div class="panel"><div style="padding:14px 16px 0"><h3>Według kategorii</h3></div><div class="catbars">${cats.map(([c,v])=>`<div class="catbar"><span>${esc(c)}</span><div class="track"><div class="fill" style="width:${(v/maxC*100).toFixed(1)}%"></div></div><span class="v">${zl(v)}</span></div>`).join('') || '<p class="muted" style="margin:0">Brak kosztów w tym miesiącu.</p>'}</div></div>
      <div class="panel tablewrap"><table><thead><tr><th>Data</th><th>Pozycja</th><th class="r">Kwota</th></tr></thead><tbody>${entries.map(c=>`<tr ${canEditDoc('costs',c)?'class="click" data-edit="costs"':''} data-id="${esc(c.id)}"><td class="num">${fdate(c.date).slice(0,5)}</td><td><b>${esc(c.category)}</b><span class="sub">${esc(byId('vehicles',c.vehicleId)?.plate||'—')}${c.liters?' · '+String(c.liters).replace('.',',')+(c.category==='Ładowanie'?' kWh':' l'):''}${c.full&&(c.category==='Paliwo'||c.category==='Ładowanie')?' · do pełna':''}${c.odometer?' · '+km(c.odometer):''}${c.routeId?' · trasa '+esc(rCode(c.routeId)):''}${c.station?' · '+esc(c.station):''}${fxNote(c)?' · '+fxNote(c):''}${!own && fillDriver(c)?' · '+esc(dName(fillDriver(c))):''}${c.note?' · '+esc(c.note):''}</span>${photoStrip(c.photos)}</td><td class="r num">${zl2(c.amount)}</td></tr>`).join('') || `<tr><td colspan="3" class="muted">Brak wpisów w miesiącu ${MONTHS_FULL[m-1]} ${y}.</td></tr>`}</tbody></table>${cardM.length ? `<p class="muted small sec-empty">+ ${cardM.length} ${isPlural(cardM.length,'tankowanie','tankowania','tankowań')} z kart paliwowych za ${zl(cardSum)} – wliczone w sumy powyżej, lista w <a href="#karty">Paliwo → Karty</a>.</p>` : ''}</div>
    </div></div>`;
}

