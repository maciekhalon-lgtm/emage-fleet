/* Emage FLEET — rezerwacje: przydział kierowców i rezerwacje */
'use strict';
function viewAssign(){
  const conf = conflicts();
  const head = `<div class="bar"><h2>Przydział i rezerwacje</h2><div class="tools"><div class="seg" role="group" aria-label="Widok"><button class="small ${assignView==='kalendarz'?'on':''}" data-av="kalendarz" aria-pressed="${assignView==='kalendarz'}">Kalendarz</button><button class="small ${assignView==='grafik'?'on':''}" data-av="grafik" aria-pressed="${assignView==='grafik'}">Grafik</button><button class="small ${assignView==='lista'?'on':''}" data-av="lista" aria-pressed="${assignView==='lista'}">Lista</button></div>${canCreate('bookings')?'<button class="primary" data-new="bookings">+ Nowa rezerwacja</button>':''}</div></div>`;
  let bk;
  if (!S.bookings.length) bk = loadingOr('bookings', emptyBlock('Brak rezerwacji','Zarezerwuj pojazd dla kierowcy na konkretne dni. Strona ostrzeże, jeśli auto jest już zajęte w tym czasie.','<button class="primary" data-new="bookings">+ Nowa rezerwacja</button>', '', 'bookings'));
  else {
    const list = S.bookings.map(b=>({b,s:bookingState(b)})).sort((x,y)=> x.s.key-y.s.key || (x.s.key===2 ? (x.b.from<y.b.from?1:-1) : (x.b.from<y.b.from?-1:1)));
    const shown = list.filter((x,i)=> x.s.key<2 || list.filter(y=>y.s.key===2).indexOf(x) < 8);
    bk = `<div class="panel tablewrap"><table><thead><tr><th>Termin</th><th>Pojazd</th><th>Kierowca</th><th>Cel</th><th>Status</th></tr></thead><tbody>${shown.map(({b,s})=>`
      <tr ${canEditDoc('bookings',b)?'class="click" data-edit="bookings"':''} data-id="${esc(b.id)}">
        <td class="num"><b>${fdate(b.from)}</b>${b.to!==b.from?`<span class="sub">do ${fdate(b.to)}</span>`:''}</td>
        <td>${vPlate(b.vehicleId)}<span class="sub">${esc(vName(b.vehicleId))}</span></td>
        <td>${esc(dName(b.driverId))}${P().bookings==='own'&&mine('bookings',b)?' <span class="pill soon">Twoja</span>':''}</td>
        <td style="min-width:200px">${routePill(b.routeId)} ${esc(b.purpose||'')}${handoverInfo(b)}</td>
        <td>${conf.has(b.id)?'<span class="pill bad">Konflikt</span>':`<span class="pill ${s.cls}">${s.txt}</span>`} ${handoverBtn(b)}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }
  const t = today();
  const drv = S.drivers.slice().sort((a,b)=>a.name.localeCompare(b.name,'pl')).map(d => {
    const veh = S.vehicles.filter(v=>v.driverId===d.id && v.status!=='wycofany');
    const now = S.bookings.find(b=>b.driverId===d.id && b.from<=t && b.to>=t);
    const warn = (d.active===false ? '<span class="pill off">nieaktywny</span> ' : '') + [['licenseExpiry','Prawo jazdy'],['medicalExpiry','Badania'],['psychExpiry','Psychotesty']].map(([k,l]) => { if(!d[k]) return ''; const x=diffDays(t,d[k]); return x<0?`<span class="pill bad">${l} wygasło</span>`:x<=30?`<span class="pill warn">${l} do ${fdate(d[k])}</span>`:''; }).join(' ');
    return `<div class="drv ${d.active===false?'off':''}" ${canEditDoc('drivers',d)?'data-edit="drivers" tabindex="0"':'style="cursor:default"'} data-id="${esc(d.id)}"><div class="who"><b>${esc(d.name)}</b><span>${esc([d.categories?'kat. '+d.categories:'', d.phone].filter(Boolean).join(' · '))}</span>
      <span style="display:block">${now?`W trasie: ${esc(byId('vehicles',now.vehicleId)?.plate||'')}`:veh.length?`Stały: ${veh.map(v=>esc(v.plate)).join(', ')}`:'Bez przypisanego auta'}</span></div><div>${warn}</div></div>`; }).join('');
  const drvPanel = `<div class="section"><div class="bar"><h2>Kierowcy</h2>${canCreate('drivers')?'<button class="small" data-new="drivers">+ Dodaj kierowcę</button>':''}</div>
    ${S.drivers.length?`<div class="panel drivers">${drv}</div>`:loadingOr('drivers', emptyBlock('Brak kierowców','Dodaj osoby, które korzystają z aut służbowych – z kategorią i ważnością prawa jazdy.','<button class="primary" data-new="drivers">+ Dodaj kierowcę</button>', '', 'drivers'))}</div>`;
  const confNote = conf.size?`<div class="notice err"><span>Ten sam pojazd ma nakładające się rezerwacje (${conf.size}). Popraw daty lub zmień auto.</span></div>`:'';
  if (assignView==='grafik') return `<div class="section">${head}${confNote}${viewSchedule()}</div><div class="drv-below">${drvPanel}</div>${crewChangesPanel()}`;
  if (assignView==='kalendarz') return `<div class="section">${head}${confNote}${viewCalendar()}</div><div class="drv-below">${drvPanel}</div>${crewChangesPanel()}`;
  return `<div class="grid2"><div class="section">${head}${confNote}${bk}</div>${drvPanel}</div>${crewChangesPanel()}`;
}

