/* Emage FLEET — użytkownicy: zatwierdzanie kont, role, powiązanie z kierowcą, blokowanie */
'use strict';
const STATUS = {pending:{l:'Oczekuje', cls:'warn'}, active:{l:'Aktywne', cls:'ok'}, blocked:{l:'Zablokowane', cls:'bad'}};
const pendingUsers = () => profiles.filter(p => p.status==='pending');
const pendingRequests = () => S.requests.filter(r => r.status==='pending');
const FIELD_NAMES = {phone:'Telefon'};
/* Spory w podwójnej obsadzie: drugi kierowca nie zgodził się z wpisem */
const openDisputes = () => [
  ...S.bookings.filter(b => b.disputeStage && !b.disputeResolvedAt).map(b => ({kind:'booking', b})),
  ...S.costs.filter(c => c.confirmStatus==='disputed').map(c => ({kind:'cost', c})),
];
function disputesPanel(){
  const list = openDisputes(); if (!list.length) return '';
  return `<div class="panel"><div class="sec-head"><h3>Sporne wpisy w podwójnej obsadzie</h3><span class="pill bad">${list.length}</span></div>
    ${list.map(x => x.kind==='booking' ? `<div class="mini"><span class="num">${fdate((x.b.disputeAt||'').slice(0,10))}</span>
        <span><b>${x.b.disputeStage==='pickup' ? 'Przejęcie' : 'Zdanie'} ${esc(byId('vehicles', x.b.vehicleId)?.plate || '')}</b> · ${esc(crewName(x.b))}
        <span class="sub">Licznik ${km((x.b.disputeStage==='pickup' ? x.b.pickup : x.b.returned)?.km)} · uwaga: „${esc(x.b.disputeNote || '')}”</span></span>
        <span class="mini-r"><button class="small primary" data-disp-ok="booking:${esc(x.b.id)}">Zatwierdź</button>${x.b.disputeStage==='return' || x.b.disputeStage==='pickup' ? `<button class="small" data-edit="bookings" data-id="${esc(x.b.id)}">Szczegóły</button>` : ''}</span></div>`
      : `<div class="mini"><span class="num">${fdate(x.c.date)}</span>
        <span><b>Tankowanie ${esc(byId('vehicles', x.c.vehicleId)?.plate || '')}</b> · wpisał(a) ${esc(dName(x.c.driverId))}, nie zgadza się ${esc(dName(x.c.coDriverId))}
        <span class="sub">${String(x.c.liters).replace('.',',')} l · ${zl2(x.c.amount)} · licznik ${km(x.c.odometer)} · uwaga: „${esc(x.c.disputeNote || '')}”</span></span>
        <span class="mini-r"><button class="small" data-edit="costs" data-id="${esc(x.c.id)}">Popraw wpis</button><button class="small primary" data-disp-ok="cost:${esc(x.c.id)}">Zatwierdź</button></span></div>`).join('')}
    <p class="muted small sec-empty">„Zatwierdź” przyjmuje wpis w obecnej postaci (po ewentualnej poprawce) i liczy go do statystyk. Zdane auto staje się wolne.</p></div>`;
}
async function resolveDispute(key){
  const [kind, id] = key.split(':');
  const {error} = await sb.rpc('resolve_dispute', {kind, item_id:id});
  if (error) return toast(dbErr(error).message);
  await refresh(kind==='cost' ? 'costs' : 'bookings'); toast('Rozstrzygnięto');
}
document.addEventListener('click', e => { const d = e.target.closest('[data-disp-ok]'); if (d) resolveDispute(d.dataset.dispOk); });

function requestsPanel(){
  const list = pendingRequests(); if (!list.length) return '';
  return `<div class="panel"><div class="sec-head"><h3>Zmiany danych do akceptacji</h3><span class="pill warn">${list.length}</span></div>
    ${list.map(r => `<div class="mini"><span class="num">${fdate((r.createdAt||'').slice(0,10))}</span>
      <span><b>${esc(dName(r.driverId))}</b> · ${esc(FIELD_NAMES[r.field]||r.field)}: <s class="muted">${esc(r.oldValue||'—')}</s> → <b>${esc(r.newValue)}</b></span>
      <span class="mini-r"><button class="small primary" data-req-ok="${esc(r.id)}">Akceptuj</button><button class="small danger" data-req-no="${esc(r.id)}">Odrzuć</button></span></div>`).join('')}</div>`;
}
async function decideRequest(id, approve){
  const {error} = await sb.rpc('decide_change_request', {request_id:id, approve});
  if (error) return handleWriteErr(dbErr(error));
  await refresh('requests'); await refresh('drivers');
  toast(approve ? 'Zaakceptowano zmianę' : 'Odrzucono zmianę');
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-req-ok],[data-req-no]'); if (!a) return;
  if (a.dataset.reqOk) decideRequest(a.dataset.reqOk, true); else decideRequest(a.dataset.reqNo, false);
});
const pendingChoice = {};   // wybór roli/kierowcy dla oczekujących, zanim kliknie się „Zatwierdź”

function viewWaiting(){
  if (!me) return `<div class="panel empty"><p>Logowanie…</p></div>`;
  const name = esc(me.full_name || me.email);
  if (me.status==='blocked') return `<div class="panel empty wait"><h2>Konto zablokowane</h2><p>Konto <b>${esc(me.email)}</b> zostało zablokowane. Jeśli to pomyłka, skontaktuj się z kierownikiem floty.</p><button data-action="logout">Wyloguj się</button></div>`;
  return `<div class="panel empty wait"><h2>Konto czeka na zatwierdzenie</h2>
    <p>Dzień dobry, ${name}. Kierownik floty widzi już Twoje konto na liście i nada Ci rolę. Strona odblokuje się sama, gdy to zrobi – nie musisz jej odświeżać.</p>
    <button data-action="logout">Wyloguj się</button></div>`;
}

function driverSelect(p, disabled){
  const cur = p.status==='pending' ? ((pendingChoice[p.id]||{}).drv ?? (p.driver_id||'')) : (p.driver_id||'');
  const opts = [['','— bez powiązania —'], ['__new','+ utwórz wpis kierowcy: '+(p.full_name || p.email)], ...S.drivers.slice().sort((a,b) => a.name.localeCompare(b.name,'pl')).map(d => [d.id, d.name])];
  return `<select id="drv-${esc(p.id)}" data-drv-for="${esc(p.id)}" ${disabled?'disabled':''} aria-label="Powiązany kierowca">${opts.map(([v,l]) => `<option value="${esc(v)}" ${cur===v?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
}
function roleSelect(p, disabled){
  const cur = p.status==='pending' ? ((pendingChoice[p.id]||{}).role ?? (p.role||'')) : (p.role||'');
  return `<select id="role-${esc(p.id)}" data-role-for="${esc(p.id)}" ${disabled?'disabled':''} aria-label="Rola"><option value="">— wybierz rolę —</option>${Object.entries(ROLES).map(([k,r]) => `<option value="${k}" ${cur===k?'selected':''}>${esc(r.name)}</option>`).join('')}</select>`;
}

function viewUsers(){
  const order = {pending:0, active:1, blocked:2};
  const list = profiles.slice().sort((a,b) => order[a.status]-order[b.status] || String(a.full_name||a.email).localeCompare(b.full_name||b.email,'pl'));
  const rows = list.map(p => {
    const isMe = p.id===myId, st = STATUS[p.status] || STATUS.pending;
    const act = isMe ? '<span class="muted small">to Ty</span>'
      : p.status==='pending' ? `<button class="small primary" data-approve="${esc(p.id)}">Zatwierdź</button><button class="small danger" data-block="${esc(p.id)}">Odrzuć</button>`
      : p.status==='active' ? `<button class="small danger" data-block="${esc(p.id)}">Zablokuj</button>`
      : `<button class="small" data-unblock="${esc(p.id)}">Odblokuj</button>`;
    return `<tr>
      <td><b>${esc(p.full_name || '—')}</b>${isMe?' <span class="muted">(Ty)</span>':''}<span class="sub">${esc(p.email)}</span><span class="sub">Konto od ${fdate((p.created_at||'').slice(0,10))}</span></td>
      <td><span class="pill ${st.cls}">${st.l}</span></td>
      <td style="min-width:180px">${roleSelect(p, isMe || p.status==='blocked')}</td>
      <td style="min-width:200px">${(p.role==='kierowca' || p.role==='floty' || (p.status==='pending' && (pendingChoice[p.id]||{}).role!=='serwisu')) ? driverSelect(p, p.status==='blocked' || (isMe && p.role!=='floty')) : '<span class="muted">—</span>'}${p.role==='floty' && !p.driver_id && p.status==='active' ? '<span class="sub muted">Powiąż, jeśli też prowadzi auta</span>' : ''}${p.role==='kierowca' && !p.driver_id && p.status==='active' ? '<span class="sub" style="color:var(--warn)">Powiąż, aby mógł rezerwować i tankować</span>' : ''}</td>
      <td><div class="row-act">${act}</div></td></tr>`;
  }).join('');
  const pend = pendingUsers().length;
  return `<div class="section">
    ${disputesPanel()}
    ${requestsPanel()}
    <div class="bar"><h2>Użytkownicy i role</h2>${pend ? `<span class="pill warn">${pend} ${isPlural(pend,'konto czeka','konta czekają','kont czeka')} na zatwierdzenie</span>` : ''}</div>
    <div class="panel tablewrap"><table><thead><tr><th>Osoba</th><th>Status</th><th>Rola</th><th>Powiązany kierowca</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="muted">Nikt się jeszcze nie zarejestrował. Wyślij pracownikom adres strony – po rejestracji pojawią się tutaj.</td></tr>'}</tbody></table></div>
    <p class="muted small" style="margin:0;max-width:80ch">Nowa osoba rejestruje się sama na stronie i potwierdza adres e-mail. Do czasu zatwierdzenia nie widzi żadnych danych. Kierowcę powiąż z jego wpisem na liście kierowców – wtedy jego tankowania i rezerwacje przypiszą się automatycznie.</p>
  </div>`;
}

async function profileUpdate(id, body, okMsg){
  try {
    const {error, count} = await sb.from('profiles').update(body, {count:'exact'}).eq('id', id);
    if (error) throw dbErr(error);
    if (!count) throw {code:'invalid_argument'};
    await refresh('members'); toast(okMsg);
  } catch(err){ handleWriteErr(err); }
}
async function ensureDriverFor(p){
  const ref = db.collection('drivers').doc();
  await ref.set({name: p.full_name || p.email});
  return ref.id;
}
async function approveUser(id){
  const p = profiles.find(x => x.id===id); if (!p) return;
  const role = $('#role-'+id)?.value, drv = $('#drv-'+id)?.value || '';
  if (!role){ toast('Najpierw wybierz rolę'); $('#role-'+id)?.focus(); return; }
  let driver_id = null;
  try { driver_id = drv==='__new' ? await ensureDriverFor(p) : (drv || null); } catch(err){ return handleWriteErr(err); }
  if (role==='kierowca' && !driver_id) toast('Zatwierdzono bez powiązania z kierowcą – możesz to uzupełnić później');
  await profileUpdate(id, {status:'active', role, driver_id: role==='kierowca' ? driver_id : null, approved_at:new Date().toISOString(), approved_by:myId}, 'Zatwierdzono konto: '+(p.full_name||p.email));
}
async function setRole(id, role){
  const p = profiles.find(x => x.id===id); if (!p) return;
  if (p.status==='pending'){ pendingChoice[id] = {...pendingChoice[id], role}; schedule(); return; }
  if (p.status!=='active' || !role) return;
  await profileUpdate(id, {role, driver_id: role==='kierowca' ? p.driver_id : null}, 'Zmieniono rolę na: '+ROLES[role].name);
}
async function setDriverLink(id, value){
  const p = profiles.find(x => x.id===id); if (!p) return;
  if (p.status==='pending'){ pendingChoice[id] = {...pendingChoice[id], drv:value}; return; }
  let driver_id = value || null;
  try { if (value==='__new') driver_id = await ensureDriverFor(p); } catch(err){ return handleWriteErr(err); }
  await profileUpdate(id, {driver_id}, driver_id ? 'Powiązano z kierowcą' : 'Usunięto powiązanie');
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-approve],[data-block],[data-unblock]'); if (!a) return;
  if (a.dataset.approve) return approveUser(a.dataset.approve);
  if (a.dataset.block) return profileUpdate(a.dataset.block, {status:'blocked'}, 'Zablokowano konto');
  if (a.dataset.unblock){ const p = profiles.find(x => x.id===a.dataset.unblock); return profileUpdate(a.dataset.unblock, {status: p && p.role ? 'active' : 'pending'}, 'Odblokowano konto'); }
});
