(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const has = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const n = (value, digits = 0) => has(value) ? new Intl.NumberFormat('pt-BR', {maximumFractionDigits: digits, minimumFractionDigits: 0}).format(Number(value)) : '—';
  const money = (value, compact = false) => has(value) ? new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL',maximumFractionDigits:compact?0:2,minimumFractionDigits:compact?0:2}).format(Number(value)) : '—';
  const stateNames = {calculado:'Calculado',parcial:'Parcial / proxy',indisponivel:'Indisponível',sem_base:'Sem base'};
  const cadenceNames = {diario:'Diário',semanal:'Semanal',mensal:'Mensal',trimestral:'Trimestral'};
  const periodNames = {month:'Mês atual', '3m':'Últimos 3 meses', '12m':'Últimos 12 meses',all:'Histórico disponível'};
  const unitNames = {BRL:'R$',dias:'dias',horas:'horas',percentual:'%',registros:'registros',pessoas_chave:'chaves de pessoa',controles:'controles',unidade_monetaria_da_origem_nao_identificada:'moeda não confirmada'};
  const familyCopy = {
    1:'Vendas registradas e o que falta para entender caixa e margem.',
    2:'Oportunidades abertas, valor informado e cobertura de meta.',
    3:'Estoque, ganhos e perdas observados ao longo do funil.',
    4:'Qualidade do cadastro e evidência do valor entregue ao aluno.',
    5:'Tempos registrados e espera observada em cada etapa.',
    6:'Investimento de mídia e os insumos para avaliar eficiência.',
    7:'Continuidade observável, contato e valor ainda a comprovar.',
    8:'Integridade, vínculos e limites que afetam a decisão.'
  };
  const state = {data:null, groups:[],period:'12m',cadence:'all',priority:'all',family:'all',status:'all',search:'',page:0,pageSize:10,auto:true,busy:false,failed:false,dialogGroup:null,dialogObservation:0};
  let timer = null;
  let toastTimer = null;

  function date(value, options = {}) {
    if (!value) return 'Não informado';
    const parsed = new Date(value.length === 10 ? `${value}T12:00:00-03:00` : value);
    if (Number.isNaN(parsed.getTime())) return 'Não informado';
    return new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',...options}).format(parsed);
  }
  function dateTime(value) { return date(value, {hour:'2-digit',minute:'2-digit'}); }
  function month(value, short = false) {
    if (!value) return 'Sem data';
    return date(value,{day:undefined,month:short?'short':'long',year:short?'2-digit':'numeric'}).replace('. de ','/').replace(' de ','/').replaceAll('.','');
  }
  function tag(status, extra = '') { return `<span class="status-tag ${esc(status)} ${extra}">${esc(stateNames[status] || status || 'Sem estado')}</span>`; }
  function unit(value) { return unitNames[value] || String(value || '').replaceAll('_',' '); }
  function value(valueToFormat, valueUnit, exact = false) {
    if (!has(valueToFormat)) return '—';
    if (valueUnit === 'BRL') return money(valueToFormat, !exact);
    if (valueUnit === 'percentual') return `${n(valueToFormat,2)}%`;
    if (valueUnit === 'dias' || valueUnit === 'horas') return `${n(valueToFormat,2)} ${unit(valueUnit)}`;
    if (valueUnit === 'unidade_monetaria_da_origem_nao_identificada') return `${n(valueToFormat,exact?6:2)} · moeda não confirmada`;
    return n(valueToFormat,exact?8:2);
  }
  function refDate() { return state.data?.freshness?.reference_date_max || state.data?.freshness?.warehouse_date || new Date().toISOString().slice(0,10); }
  function periodBounds() {
    if (state.period === 'all') return null;
    const ref = refDate();
    const [year,monthNumber] = ref.slice(0,7).split('-').map(Number);
    const offset = state.period === 'month' ? 0 : state.period === '3m' ? 2 : 11;
    const start = new Date(Date.UTC(year,monthNumber-1-offset,1));
    return {start:start.toISOString().slice(0,10),end:ref};
  }
  function selectedSeries() {
    const bounds = periodBounds();
    return (state.data?.revenue_series || []).filter((r) => !bounds || (r.period >= bounds.start && r.period <= bounds.end));
  }
  function selectedObservations(group) {
    const bounds = periodBounds();
    return group.rows.filter((r) => !bounds || !(r.grain === 'mensal' || String(r.grain || '').startsWith('coorte')) || (r.period_start && r.period_start >= bounds.start && r.period_start <= bounds.end));
  }
  function aggregateStatus(rows) {
    if (!rows.length) return 'sem_base';
    if (!rows.some((row) => has(row.value))) return rows.every((row) => row.status === 'indisponivel') ? 'indisponivel' : 'sem_base';
    return rows.every((row) => row.status === 'calculado') ? 'calculado' : 'parcial';
  }
  function buildGroups(data) {
    const groups = new Map();
    data.families.forEach((family) => family.sensors.forEach((row) => {
      const key = `${family.id}:${row.id}`;
      if (!groups.has(key)) groups.set(key,{key,id:row.id,familyId:family.id,familyName:family.name,name:row.name,rows:[]});
      groups.get(key).rows.push(row);
    }));
    return [...groups.values()].map((group) => ({...group,rows:group.rows.sort((a,b) => (b.period_start || '').localeCompare(a.period_start || '') || JSON.stringify(a.dimensions).localeCompare(JSON.stringify(b.dimensions)))}));
  }
  function nameOfFamily(id) { return state.data?.families.find((family) => String(family.id) === String(id))?.name || 'Medição'; }
  function showToast(text) { $('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('#toast').hidden=true;},4000); }
  function setPeriod(period) {
    state.period=period;state.page=0;
    $$('[data-period]').forEach((button)=>{const active=button.dataset.period===period;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',active);});
    const url=new URL(location.href);url.searchParams.set('period',period);history.replaceState(null,'',url);
    if(state.data){renderHeadlines();renderRevenue();renderSensors();}
  }
  function loading(busy) {state.busy=busy;$('#refresh-button').disabled=busy;$('#refresh-button').classList.toggle('loading',busy);$('#refresh-button span').textContent=busy?'Consultando…':'Atualizar';}
  function renderConnection() {
    if(!state.data)return;
    const freshness=state.data.freshness || {};
    const delivery=state.data._delivery || {};
    const readAt=freshness.read_at || state.data.generated_at;
    const staticRead=!String(window.VOID_DASHBOARD_ENDPOINT || '/api/dashboard').includes('/api/');
    const seconds=readAt?(Date.now()-new Date(readAt).getTime())/1000:null;
    const older=!staticRead&&has(seconds)&&seconds>180;
    const stale=state.failed || delivery.state==='stale';
    const todayParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const today=['year','month','day'].map((key)=>todayParts.find((part)=>part.type===key).value).join('-');
    const olderReference=freshness.reference_date_max && freshness.reference_date_max<today;
    const indicator=$('#connection-status');
    indicator.classList.toggle('stale',stale || older);
    indicator.classList.toggle('offline',state.failed);
    const label=state.failed?'Última leitura preservada':stale?'Verificando última leitura':staticRead?'Leitura publicada':older?'Leitura disponível':'Conectado aos dados ouro';
    indicator.innerHTML=`<i aria-hidden="true"></i>${esc(label)}`;
    $('#read-time').textContent=`Leitura Nekt: ${dateTime(readAt)}`;
    $('#gold-time').textContent=`Ouro calculado: ${dateTime(freshness.gold_calculated_at_max)}`;
    const alert=$('#connection-alert');
    alert.hidden=!state.failed && !delivery.last_error_at && !olderReference;
    alert.classList.toggle('error',state.failed && !state.data);
    if(!alert.hidden)alert.textContent=state.failed || delivery.last_error_at?`Não foi possível obter uma nova leitura. Exibindo os dados lidos em ${dateTime(readAt)}. Confira os horários das fontes antes de decidir.`:`A fotografia do ouro tem referência em ${date(freshness.reference_date_max)}. Confira a próxima carga e os horários das fontes antes de usar estes números como retrato de hoje.`;
    const interval=Number(freshness.refresh_seconds || state.data.meta?.refresh_seconds || 60);
    $('#auto-toggle small').textContent=state.auto?`a cada ${interval===60?'minuto':`${n(interval)} s`}`:'pausada';
  }

  function renderHeadlines() {
    const series=selectedSeries();
    const sum=(key)=>{const values=series.map((r)=>r[key]).filter(has);return values.length?values.reduce((a,b)=>a+Number(b),0):null;};
    const items=(state.data.headline_kpis || []).map((item)=>({...item}));
    const sold=items.find((item)=>item.id==='sold');const sales=items.find((item)=>item.id==='sales');
    const range=state.period==='all'?'Histórico com data válida':periodNames[state.period];
    if(sold){sold.value=sum('value');sold.description='Valor de venda registrado. Inclui as situações da base; não é recebido nem caixa.';sold.periodLabel=range;sold.status=series.length?aggregateStatus(series):'sem_base';}
    if(sales){sales.value=sum('records');sales.description='Registros de venda no período. Não representa alunos únicos.';sales.periodLabel=range;sales.status=series.length?aggregateStatus(series):'sem_base';}
    const icons={sold:'↗',sales:'▤',pipeline:'⇄',controls:'✓'};
    $('#headline-kpis').innerHTML=items.map((item)=>{
      let display=item.unit==='BRL'&&has(item.value)?`<small>R$</small>${esc(n(item.value,0))}`:esc(value(item.value,item.unit));
      if(item.id==='controls')display=`${esc(n(item.value))}<small> / ${esc(n(item.denominator))}</small>`;
      const desc=!has(item.value)&&['sold','sales'].includes(item.id)?'Sem observação nesse período. Ausência de linha não significa zero.':item.description;
      const period=item.periodLabel || (item.id==='pipeline'?`Fotografia · ${date(item.period)}`:'Carga ouro atual');
      return `<article class="headline-card"><div class="headline-top"><span class="headline-label">${esc(item.label)}</span><span class="headline-icon" aria-hidden="true">${icons[item.id] || '↗'}</span></div><strong class="headline-value">${display}</strong><p class="headline-description">${esc(desc)}</p><div class="headline-bottom"><span class="${esc(item.status)}">${esc(item.status==='calculado'?'Fato registrado':item.status==='parcial'?'Leitura parcial':'Sem base')}</span>${esc(period)}</div><button class="headline-detail" type="button" data-headline="${esc(item.id)}" aria-label="Entender ${esc(item.label)}"></button></article>`;
    }).join('');
    $$('[data-headline]').forEach((button)=>button.addEventListener('click',()=>{
      const item=items.find((row)=>row.id===button.dataset.headline);
      if(item.id==='controls')openControls();else openSensor(item.sensor_id,item.family_id);
    }));
  }
  function renderRevenue() {
    const all=selectedSeries();const rows=all.filter((row)=>has(row.value));
    const amounts=rows.map((row)=>Number(row.value));
    const sum=amounts.length?amounts.reduce((a,b)=>a+b,0):null;
    $('#revenue-total').textContent=money(sum,true);
    $('#chart-period').textContent=periodNames[state.period];
    $('#revenue-caption').textContent=rows.length?`${n(rows.length)} ${rows.length===1?'mês com registros':'meses com registros'} · soma do período selecionado`:'Sem valor registrado no período selecionado';
    const counts=all.map((row)=>row.records).filter(has);const count=counts.length?counts.reduce((a,b)=>a+Number(b),0):null;
    const cancelled=all.map((row)=>row.cancelled_records).filter(has);const cancelledCount=cancelled.length?cancelled.reduce((a,b)=>a+Number(b),0):null;
    const locked=all.map((row)=>row.locked_records).filter(has);const lockedCount=locked.length?locked.reduce((a,b)=>a+Number(b),0):null;
    $('#revenue-disclosure').textContent=`${has(count)?`${n(count)} registros de venda no período. `:''}${has(cancelledCount)?`${n(cancelledCount)} registros estão marcados como cancelados. `:''}${has(lockedCount)?`${n(lockedCount)} estão marcados como trancados. `:''}O valor preserva as situações registradas na fonte e não é receita líquida, recebimento ou caixa. Datas ausentes e futuras não compõem esta série. Meses sem linha não são preenchidos com zero. O mês corrente permanece aberto.`;
    if(!rows.length){$('#revenue-chart').innerHTML='<div class="chart-placeholder">Não há observações de venda neste período.<br>Isso não comprova ausência de vendas na operação.</div>';return;}
    const width=720,height=205,left=46,right=14,top=16,bottom=31;
    const innerWidth=width-left-right,innerHeight=height-top-bottom;
    const min=Math.min(0,...amounts),max=Math.max(...amounts,1);
    const padding=(max-min)*.12;const ceiling=max+padding;const floor=min<0?min-padding:0;
    const x=(index)=>left+(rows.length===1?innerWidth/2:index/(rows.length-1)*innerWidth);
    const y=(amount)=>top+(ceiling-amount)/(ceiling-floor)*innerHeight;
    const baseline=y(0);
    const points=rows.map((row,index)=>`${x(index).toFixed(2)},${y(Number(row.value)).toFixed(2)}`);
    const path=`M${points.join(' L')}`;
    const area=`${path} L${x(rows.length-1)},${baseline} L${x(0)},${baseline} Z`;
    const shortMoney=(amount)=>Math.abs(amount)>=1000000?`${n(amount/1000000,1)} mi`:Math.abs(amount)>=1000?`${n(amount/1000,0)} mil`:n(amount);
    const ticks=[0,.33,.66,1].map((step)=>{
      const amount=floor+(ceiling-floor)*step;const yy=y(amount);
      return `<line class="chart-grid" x1="${left}" x2="${width-right}" y1="${yy}" y2="${yy}"/><text class="chart-tick" x="${left-9}" y="${yy+3}" text-anchor="end">${esc(shortMoney(amount))}</text>`;
    }).join('');
    const labelStep=Math.max(1,Math.ceil(rows.length/7));
    const labels=rows.map((row,index)=>index%labelStep===0||index===rows.length-1?`<text class="chart-tick" x="${x(index)}" y="${height-7}" text-anchor="middle">${esc(month(row.period,true))}${row.open_month?'*':''}</text>`:'').join('');
    const hitWidth=Math.max(12,Math.min(55,innerWidth/rows.length));
    const hit=rows.map((row,index)=>`<g class="chart-point-group" data-chart-point="${index}" tabindex="0" role="button" aria-label="${esc(month(row.period))}: ${esc(money(row.value))}; ${esc(n(row.records))} registros${row.open_month?', mês aberto':''}"><circle class="chart-point" cx="${x(index)}" cy="${y(Number(row.value))}" r="4"/><rect class="chart-hit" x="${x(index)-hitWidth/2}" y="${top}" width="${hitWidth}" height="${innerHeight}"/></g>`).join('');
    $('#revenue-chart').innerHTML=`<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Série mensal do valor de vendas registrado, em reais. Não representa caixa."><defs><linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1f675e" stop-opacity="0.12"/><stop offset="100%" stop-color="#1f675e" stop-opacity="0.005"/></linearGradient></defs>${ticks}<path class="chart-area" d="${area}"/><path class="chart-line" d="${path}"/>${rows.length===1?`<circle cx="${x(0)}" cy="${y(Number(rows[0].value))}" r="4" fill="#1f675e"/>`:''}${labels}${hit}</svg><div id="chart-tooltip" class="chart-tooltip" hidden></div>`;
    $$('[data-chart-point]').forEach((point)=>{
      const show=()=>{const row=rows[Number(point.dataset.chartPoint)];const tooltip=$('#chart-tooltip');tooltip.innerHTML=`<strong>${esc(money(row.value))}</strong>${esc(month(row.period))}<small>${esc(n(row.records))} registros${row.open_month?' · mês aberto':''}</small>`;tooltip.hidden=false;const chart=$('#revenue-chart').getBoundingClientRect();const box=point.getBoundingClientRect();tooltip.style.left=`${Math.max(0,Math.min(chart.width-165,box.left-chart.left-60))}px`;tooltip.style.top='5px';};
      point.addEventListener('mouseenter',show);point.addEventListener('focus',show);point.addEventListener('mouseleave',()=>{$('#chart-tooltip').hidden=true;});point.addEventListener('blur',()=>{$('#chart-tooltip').hidden=true;});point.addEventListener('click',()=>openRevenueMonth(rows[Number(point.dataset.chartPoint)]));point.addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openRevenueMonth(rows[Number(point.dataset.chartPoint)]);}});
    });
  }
  function renderCoverage() {
    const coverage=state.data.coverage;
    $('#measurement-summary').innerHTML=`<strong>${esc(n(coverage.available_count))}<span>/ ${esc(n(coverage.sensor_count))}</span><small>sensores com alguma observação</small></strong>`;
    $('#coverage-bar').innerHTML='<span class="available"></span><span class="unavailable"></span>';
    $('#coverage-bar .available').style.width=`${Number(coverage.available_count)/Math.max(Number(coverage.sensor_count),1)*100}%`;
    $('#coverage-bar .unavailable').style.width=`${Number(coverage.unavailable_count)/Math.max(Number(coverage.sensor_count),1)*100}%`;
    $('#measurement-legend').innerHTML=`<span>Com valor observado ou proxy <b>${esc(n(coverage.available_count))}</b></span><span>Indisponíveis ou sem base <b>${esc(n(coverage.unavailable_count))}</b></span>`;
    $('#technical-score').textContent=`${n(coverage.technical_ok)} / ${n(coverage.technical_total)}`;
    $('#technical-caption').textContent=`${coverage.technical_ok===coverage.technical_total?'Controles técnicos conciliados com a prata.':'Há controles técnicos que precisam de revisão.'} Isso não certifica completude financeira nem elimina as lacunas de medição.`;
    const runtime=state.data.refresh_runtime || {};
    $('#pipeline-mode').textContent=runtime.enabled?'Verificação automática':'Processamento manual';
    $('#pipeline-caption').textContent=runtime.enabled?`A cadeia é verificada a cada ${n(runtime.check_interval_minutes || 15)} minutos, respeitando a coleta das fontes. ${runtime.streaming===false?'A atualização não é instantânea.':''}`:'O painel consulta o ouro automaticamente. Isso não demonstra sincronização instantânea das fontes.';
  }
  function renderActions() {
    const actions=state.data.actions || [];
    const first=actions[0];
    if(first){$('#hero-action-title').textContent=first.title;$('#hero-action-fact').textContent=first.fact;$('#hero-action-open').disabled=false;}
    const shown=actions.filter((action)=>(state.cadence==='all'||action.cadence===state.cadence)&&(state.priority==='all'||action.priority===state.priority));
    $('#actions-count').textContent=`${n(shown.length)} ${shown.length===1?'próximo passo':'próximos passos'}`;
    $('#action-list').innerHTML=shown.length?shown.map((action,index)=>`<article class="action-card"><span class="action-order">${String(index+1).padStart(2,'0')}</span><div><div class="action-labels"><span class="priority ${esc(action.priority)}">${esc(action.priority==='alta'?'Prioridade alta':action.priority==='baixa'?'Prioridade baixa':'Prioridade média')}</span><span>${esc(nameOfFamily(action.family_id))}</span><span>· ${esc(cadenceNames[action.cadence] || action.cadence)}</span></div><h3>${esc(action.title)}</h3><p class="action-fact">${esc(action.fact)}</p><p class="action-step"><span>Próximo passo</span> · ${esc(action.next_step)}</p><button type="button" class="text-button" data-action="${esc(action.id)}">Ver plano e evidência <span aria-hidden="true">↗</span></button></div></article>`).join(''):'<div class="empty-state">Nenhuma recomendação nessa combinação de filtros.<br>Os limites de alerta de negócio permanecem pendentes de calibração.</div>';
    $$('[data-action]').forEach((button)=>button.addEventListener('click',()=>openAction(actions.find((action)=>action.id===button.dataset.action))));
  }
  function renderFamilies() {
    $('#family-grid').innerHTML=state.data.families.map((family)=>`<button type="button" class="family-card" data-family-card="${esc(family.id)}"><span class="family-top"><span class="family-number">${String(family.id).padStart(2,'0')}</span><span class="family-state">${family.unavailable_count?'Medição incompleta':family.state==='parcial'?'Com limitações':'Fatos registrados'}</span></span><h3>${esc(family.name)}</h3><span class="family-description">${esc(familyCopy[family.id] || family.description)}</span><span class="family-bottom"><span><strong>${esc(n(family.available_count))}</strong> de ${esc(n(family.sensor_count))} sensores<br>com observação</span><span class="family-arrow" aria-hidden="true">↗</span></span></button>`).join('');
    $$('[data-family-card]').forEach((button)=>button.addEventListener('click',()=>{state.family=button.dataset.familyCard;state.page=0;$('#sensor-family').value=state.family;renderSensors();$('#sensores').scrollIntoView({behavior:'smooth'});}));
    const select=$('#sensor-family');const current=select.value;
    select.innerHTML='<option value="all">Todas as famílias</option>'+state.data.families.map((family)=>`<option value="${esc(family.id)}">${esc(family.name)}</option>`).join('');select.value=current || 'all';
  }
  function renderSensors() {
    const search=state.search.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu,'');
    const groups=state.groups.filter((group)=>{
      if(state.family!=='all'&&String(group.familyId)!==String(state.family))return false;
      const text=`${group.name} ${group.id} ${group.familyName}`.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu,'');
      if(search&&!text.includes(search))return false;
      const status=aggregateStatus(selectedObservations(group));
      if(state.status!=='all'&&(state.status==='indisponivel'?!['indisponivel','sem_base'].includes(status):status!==state.status))return false;
      return true;
    });
    const maxPage=Math.max(0,Math.ceil(groups.length/state.pageSize)-1);state.page=Math.min(state.page,maxPage);
    const start=state.page*state.pageSize;const shown=groups.slice(start,start+state.pageSize);
    $('#sensor-count').textContent=`${n(groups.length)} de ${n(state.groups.length)} sensores`;
    $('#sensor-rows').innerHTML=shown.map((group)=>{
      const rows=selectedObservations(group);const status=aggregateStatus(rows);const observed=rows.filter((r)=>has(r.value));
      let display='—',caption='Sem medição disponível';
      if(!rows.length){caption='Sem observação no período';}
      else if(rows.length===1){display=value(rows[0].value,rows[0].unit);caption=rows[0].grain==='fotografia'?`Fotografia · ${date(rows[0].period_start)}`:rows[0].period_start?month(rows[0].period_start):'Sem data registrada';}
      else if(observed.length){display=`${n(rows.length)} recortes`;caption=`${n(observed.length)} com valor · abrir detalhes`;}
      return `<tr><td><span class="sensor-name">${esc(group.name)}</span><span class="sensor-family-label">${String(group.familyId).padStart(2,'0')} · ${esc(group.familyName)}</span>${tag(status,'mobile-status')}</td><td><span class="sensor-value">${esc(display)}</span><span class="sensor-subvalue">${esc(caption)}</span></td><td>${tag(status)}</td><td><button type="button" data-sensor-key="${esc(group.key)}" class="sensor-detail-button" aria-label="Ver evidência de ${esc(group.name)}">↗</button></td></tr>`;
    }).join('');
    $('#sensor-empty').hidden=groups.length>0;
    $('#sensor-page-label').textContent=groups.length?`${n(start+1)}–${n(Math.min(start+state.pageSize,groups.length))} de ${n(groups.length)} sensores`:'Nenhum sensor encontrado';
    $('#sensor-previous').disabled=state.page===0;$('#sensor-next').disabled=state.page>=maxPage;
    $('#clear-filters').hidden=state.family==='all'&&state.status==='all'&&!state.search;
    $$('[data-sensor-key]').forEach((button)=>button.addEventListener('click',()=>openSensorGroup(state.groups.find((group)=>group.key===button.dataset.sensorKey))));
  }
  function render() {renderConnection();renderHeadlines();renderRevenue();renderCoverage();renderActions();renderFamilies();renderSensors();}

  function openDialog(eyebrow,content) {
    $('#dialog-eyebrow').textContent=eyebrow;$('#dialog-content').innerHTML=content;
    if(!$('#detail-dialog').open)$('#detail-dialog').showModal();
    $('#detail-dialog').scrollTop=0;
  }
  function openSensor(id,familyId) {
    const group=state.groups.find((item)=>item.id===id&&(!familyId||Number(item.familyId)===Number(familyId))) || state.groups.find((item)=>item.id===id);
    if(group)openSensorGroup(group);else showToast('Este indicador não possui observação disponível nessa leitura.');
  }
  function dimensions(row) {
    const names={escopo:'Escopo',situacao_registrada:'Situação',situacao_temporal:'Situação temporal',moeda_do_valor:'Moeda',funil_fonte_id:'Funil (ID na origem)',moeda:'Moeda',etapa_fonte_id:'Etapa (ID na origem)',status_registrado:'Status',qualidade_data:'Qualidade da data',qualidade_temporal:'Qualidade temporal',tipo_data:'Data de referência',tipo:'Tipo',intervalo:'Intervalo',qualidade_intervalo:'Qualidade do intervalo',plataforma:'Plataforma',escopo_conta:'Conta (referência)',representacao:'Representação',tabela:'Tabela',controle:'Controle',condicao:'Condição',status:'Status',coorte:'Coorte',tipo_coorte:'Tipo de coorte'};
    const entries=Object.entries(row.dimensions || {});
    return entries.length?entries.map(([key,val])=>`<dt>${esc(names[key] || key.replaceAll('_',' '))}</dt><dd>${esc(val===null?'Não informado':String(val).replaceAll('_',' '))}</dd>`).join(''):'<dt>Escopo</dt><dd>Sem dimensão adicional informada.</dd>';
  }
  function observationLabel(row,index) {
    const dimensionValues=Object.entries(row.dimensions || {}).filter(([,v])=>v!==null).map(([key,val])=>`${key.replaceAll('_',' ')}: ${String(val).replaceAll('_',' ')}`).join(' · ');
    return `${index+1}. ${row.period_start?date(row.period_start):'Sem data'} · ${row.grain || 'observação'} · ${dimensionValues || 'total'}`;
  }
  function openSensorGroup(group,selectedIndex=0) {
    if(!group)return;
    state.dialogGroup=group;const filtered=selectedObservations(group);const rows=filtered.length?filtered:group.rows;
    const index=Math.max(0,Math.min(selectedIndex,rows.length-1));state.dialogObservation=index;
    const row=rows[index];if(!row)return;
    const actions=(state.data.actions || []).filter((action)=>action.sensor_id===group.id);
    const notInPeriod=!filtered.length;
    const options=rows.map((item,i)=>`<option value="${i}"${i===index?' selected':''}>${esc(observationLabel(item,i))}</option>`).join('');
    openDialog(`${String(group.familyId).padStart(2,'0')} · ${group.familyName}`,`<h2 id="dialog-title">${esc(group.name)}</h2>${tag(row.status)}<p class="code-id">${esc(group.id)}</p>${notInPeriod?'<p class="dialog-note">Não há observação desse sensor no período selecionado. Os detalhes abaixo mostram a leitura disponível, com seu período original.</p>':''}${rows.length>1?`<label class="observation-picker"><span>${n(rows.length)} recortes disponíveis · não são somados entre si</span><input id="observation-search" type="search" aria-label="Filtrar recortes" placeholder="Filtrar por data, funil, etapa, plataforma…"><select id="observation-select" aria-label="Selecionar observação">${options}</select></label>`:''}<div class="dialog-value">${esc(value(row.value,row.unit,true))}${row.unit!=='BRL'&&has(row.value)&&!['percentual','dias','horas','unidade_monetaria_da_origem_nao_identificada'].includes(row.unit)?`<small>${esc(unit(row.unit))}</small>`:''}</div><p class="dialog-chart-note">${row.grain==='fotografia'?'Fotografia da base':`Periodicidade: ${esc(row.grain || row.periodicity)}`} · ${row.period_start?esc(date(row.period_start)):'Sem data'}${row.period_end&&row.period_end!==row.period_start?` a ${esc(date(row.period_end))}`:''}</p><div class="dialog-note">${esc(row.limitation || 'O cálculo descreve apenas os registros e o recorte informados; não certifica completude da operação.')}</div><section class="dialog-section"><h3>Como foi medido</h3><p>${esc(row.formula || 'Consultar o contrato do sensor na camada semântica.')}</p><dl class="dialog-kv"><dt>Registros da base</dt><dd>${esc(n(row.base ?? row.base_records))}</dd><dt>Sem informação</dt><dd>${esc(n(row.missing))}</dd>${has(row.numerator)?`<dt>Numerador</dt><dd>${esc(n(row.numerator,8))}</dd>`:''}${has(row.denominator)?`<dt>Denominador / amostra</dt><dd>${esc(n(row.denominator,8))}</dd>`:''}<dt>Limite do alerta</dt><dd>Pendente de calibração. Não há classificação de saúde de negócio aprovada.</dd></dl></section><section class="dialog-section"><h3>População e recorte</h3><dl class="dialog-kv">${dimensions(row)}</dl></section>${actions.length?`<section class="dialog-section"><h3>Próximo passo relacionado</h3>${actions.map((action)=>`<p><strong>${esc(action.title)}</strong><br>${esc(action.next_step)}</p>`).join('')}</section>`:''}<section class="dialog-section"><h3>Origem e processamento</h3><dl class="dialog-kv"><dt>Fontes prata</dt><dd>${(row.source_tables || []).map((table)=>`<code>${esc(table)}</code>`).join(' ')}</dd><dt>Cálculo ouro</dt><dd>${esc(dateTime(row.calculated_at))}</dd><dt>Processamento prata</dt><dd>${esc(dateTime(row.silver_processed_at || row.source_processed_at || state.data.freshness.silver_processed_at_min))}</dd></dl><p class="dialog-chart-note">Processamento não comprova atualização instantânea da origem. Percentis, tickets e percentuais não são somados para consolidar populações.</p></section>`);
    if(rows.length>1){$('#observation-select').addEventListener('change',(event)=>openSensorGroup(group,Number(event.target.value)));$('#observation-search').addEventListener('input',(event)=>{const text=event.target.value.toLocaleLowerCase('pt-BR');[...$('#observation-select').options].forEach((option)=>{option.hidden=!option.textContent.toLocaleLowerCase('pt-BR').includes(text);});});}
  }
  function openAction(action) {
    if(!action)return;
    const sensor=state.groups.find((group)=>group.id===action.sensor_id);
    openDialog(`${nameOfFamily(action.family_id)} · ${cadenceNames[action.cadence] || action.cadence}`,`<h2 id="dialog-title">${esc(action.title)}</h2><p class="dialog-intro">Recomendação baseada em uma lacuna ou conferência observada. A prioridade organiza a revisão; não representa um alerta de negócio calibrado.</p><section class="dialog-section"><h3>O que os dados mostram</h3><p>${esc(action.fact)}</p></section><section class="dialog-section"><h3>O que fazer</h3><p>${esc(action.next_step)}</p><dl class="dialog-kv"><dt>Decisão que destrava</dt><dd>${esc(action.impact || 'Melhorar a evidência disponível para a decisão.')}</dd><dt>Horizonte</dt><dd>${esc(action.horizon || 'Próxima revisão; prazo a combinar.')}</dd><dt>Responsável</dt><dd>${esc(action.owner || 'A definir na operação')}</dd><dt>Cadência sugerida</dt><dd>${esc(cadenceNames[action.cadence] || action.cadence)}</dd><dt>Limite de negócio</dt><dd>Pendente de calibração.</dd></dl></section><section class="dialog-section"><h3>Evidência relacionada</h3><p>${esc(sensor?.name || action.sensor_id)}</p><p class="code-id">${esc(action.sensor_id)}</p></section><div class="dialog-actions"><button id="action-evidence" type="button" class="button button-primary">Abrir sensor ↗</button><button id="action-copy" type="button" class="button button-secondary">Copiar plano</button></div>`);
    $('#action-evidence').addEventListener('click',()=>openSensor(action.sensor_id));
    $('#action-copy').addEventListener('click',async()=>{
      const text=`${action.title}\n\nEvidência: ${action.fact}\n\nPróximo passo: ${action.next_step}\n\nImpacto esperado: ${action.impact || 'A combinar'}\nCadência sugerida: ${cadenceNames[action.cadence] || action.cadence}\nResponsável: a definir\nLimites: pendentes de calibração\n\nFonte: Dados Ouro / The VOID\nLeitura: ${dateTime(state.data.freshness.read_at)}`;
      try{await navigator.clipboard.writeText(text);showToast('Plano copiado para compartilhar na próxima revisão.');}catch{const area=document.createElement('textarea');area.value=text;$('#dialog-content').append(area);area.select();const copied=document.execCommand('copy');area.remove();showToast(copied?'Plano copiado.':'O navegador bloqueou a cópia. Selecione o texto do plano.');}
    });
  }
  function openRevenueMonth(row) {
    openDialog('RESULTADO REGISTRADO',`<h2 id="dialog-title">${esc(month(row.period))}</h2>${tag(row.status)}<div class="dialog-value">${esc(money(row.value))}</div><p class="dialog-intro">Valor de venda registrado no mês${row.open_month?' em aberto':''}. ${esc(row.description || 'Não representa caixa ou recebimento.')}</p><dl class="dialog-kv"><dt>Registros de venda</dt><dd>${esc(n(row.records))}</dd><dt>Ticket dos valores informados</dt><dd>${esc(money(row.ticket))}</dd><dt>Marcados como cancelados</dt><dd>${esc(n(row.cancelled_records))} registros · ${esc(money(row.cancelled_value))}</dd><dt>Marcados como trancados</dt><dd>${esc(n(row.locked_records))} registros · ${esc(money(row.locked_value))}</dd><dt>Registros sem valor</dt><dd>${esc(n(row.missing_value_records))}</dd></dl><div class="dialog-note">As situações são mantidas separadas na base. O total exibido não é receita líquida, realização financeira ou previsão. Ausência de dado permanece desconhecida.</div><div class="dialog-actions"><button id="revenue-evidence" type="button" class="button button-primary">Ver observações do sensor ↗</button></div>`);
    $('#revenue-evidence').addEventListener('click',()=>openSensor('resultado_valor_vendas_brl',1));
  }
  function openFreshness() {
    if(!state.data)return;
    const f=state.data.freshness;
    const ingestion=state.data.source_ingestion || {};
    const sourceRows=(ingestion.sources || []).map((source)=>`<div class="control-row"><strong>${esc(source.name)}</strong><span class="control-status${['success','succeeded','completed'].includes(source.last_status)?'':' attention'}">${esc(['success','succeeded','completed'].includes(source.last_status)?'Última coleta concluída':source.last_status || 'Sem histórico')}</span><small>Último sucesso: ${esc(dateTime(source.last_success_at))}${source.last_attempt_at?` · Última tentativa: ${esc(dateTime(source.last_attempt_at))}`:''}${source.warning?`<br>${esc(source.warning)}`:''}</small></div>`).join('');
    openDialog('ATUALIZAÇÃO E FRESCOR',`<h2 id="dialog-title">Quando cada etapa foi atualizada</h2><p class="dialog-intro">A consulta do painel, a carga do ouro e a chegada de dados das fontes são eventos diferentes. Um painel recém-consultado pode conter uma fotografia anterior da operação.</p><dl class="dialog-kv"><dt>Leitura na Nekt</dt><dd>${esc(dateTime(f.read_at || state.data.generated_at))}</dd><dt>Consulta no banco</dt><dd>${esc(dateTime(f.warehouse_read_at))}</dd><dt>Cálculo ouro mais antigo</dt><dd>${esc(dateTime(f.gold_calculated_at_min))}</dd><dt>Cálculo ouro mais recente</dt><dd>${esc(dateTime(f.gold_calculated_at_max))}</dd><dt>Prata mais antiga consultada</dt><dd>${esc(dateTime(f.silver_processed_at_min))}</dd><dt>Prata mais recente consultada</dt><dd>${esc(dateTime(f.silver_processed_at_max))}</dd><dt>Referências ouro</dt><dd>${esc(date(f.reference_date_min))} a ${esc(date(f.reference_date_max))}</dd><dt>Ingestão na origem</dt><dd>${f.source_ingestion_known?esc(dateTime(f.bronze_ingested_at)):'Horário ponta a ponta não comprovado nesta leitura.'}</dd><dt>SLA de atualização</dt><dd>${esc(f.approved_freshness_sla || 'Ainda não aprovado.')}</dd><dt>Consulta do painel</dt><dd>${state.auto?'Automática, a cada minuto.':'Pausada neste navegador.'}</dd></dl><div class="dialog-note">${esc(f.note || 'A consulta não dispara cargas de dados. As camadas prata e ouro precisam de processamento próprio.')}</div>${state.data.refresh_runtime?.enabled?`<section class="dialog-section"><h3>Rotina automática da cadeia</h3><dl class="dialog-kv"><dt>Verificação da cadeia</dt><dd>A cada ${esc(n(state.data.refresh_runtime.check_interval_minutes || 15))} minutos.</dd><dt>Coleta das fontes</dt><dd>${esc(state.data.refresh_runtime.bronze_schedule || 'Conforme a programação de cada fonte.')}</dd><dt>Último sucesso da rotina</dt><dd>${esc(dateTime(state.data.refresh_runtime.last_success_at))}</dd><dt>Atualização instantânea</dt><dd>Não. A rotina depende das coletas disponíveis e da validação das camadas.</dd></dl></section>`:''}${sourceRows?`<section class="dialog-section"><h3>Coletas conhecidas nas fontes</h3><p class="dialog-chart-note">Histórico conferido em ${esc(dateTime(ingestion.checked_at || f.source_history_checked_at))}.</p><div class="controls-list">${sourceRows}</div><p>${esc(ingestion.note || 'O sucesso de uma coleta não comprova que a geração atual da prata já incorporou esses dados.')}</p></section>`:''}<section class="dialog-section"><h3>Para decidir com segurança</h3><p>Confira se o período e a referência da medição cobrem a decisão. Uma data de processamento não comprova que a origem enviou todos os eventos, que o mês fechou ou que a operação foi atualizada naquele instante.</p></section>`);
  }
  function openControls() {
    if(!state.data)return;
    const technical=state.data.controls.filter((control)=>!control.id.startsWith('mensuracao:'));
    const other=state.data.controls.filter((control)=>control.id.startsWith('mensuracao:'));
    openDialog('CONFERÊNCIAS DA CARGA',`<h2 id="dialog-title">${esc(n(state.data.coverage.technical_ok))} de ${esc(n(state.data.coverage.technical_total))} controles técnicos OK</h2><p class="dialog-intro">Os controles verificam integridade e conciliação entre camadas no grão declarado. Não são uma nota de precisão de toda a operação. As limitações de medição são apresentadas separadamente.</p><label class="observation-picker"><span>Buscar uma conferência</span><input id="control-search" type="search" placeholder="Buscar por sensor, tabela ou controle"></label><div id="controls-list" class="controls-list"></div>`);
    function list(filter=''){
      const display=(rows)=>rows.filter((row)=>JSON.stringify(row).toLocaleLowerCase('pt-BR').includes(filter)).map((row)=>`<div class="control-row"><span>${esc(row.name || row.description || row.id)}</span><span class="control-status${row.status!=='ok'?' attention':''}">${esc(row.status==='ok'?'OK':row.status)}</span><small>${esc(row.source_table || row.id)} · ${esc(row.note || row.limitation || '')}${has(row.observed)?` · Observado: ${n(row.observed,8)}`:''}${has(row.expected)?` · Esperado: ${n(row.expected,8)}`:''}${has(row.difference)?` · Diferença: ${n(row.difference,8)}`:''}</small></div>`).join('');
      $('#controls-list').innerHTML=`<section class="dialog-section"><h3>Integridade e conciliação</h3>${display(technical)||'<p>Nenhuma conferência encontrada.</p>'}</section><section class="dialog-section"><h3>Limitações de medição</h3>${display(other)||'<p>Nenhuma limitação encontrada nesse filtro.</p>'}</section>`;
    }
    list();$('#control-search').addEventListener('input',(event)=>list(event.target.value.toLocaleLowerCase('pt-BR')));
  }
  function openLimits() {
    openDialog('CRITÉRIOS DE USO',`<h2 id="dialog-title">Leia o número junto da evidência</h2><p class="dialog-intro">Os controles técnicos sustentam a consistência da carga. O uso gerencial depende do significado e da cobertura de cada sensor.</p><section class="dialog-section"><h3>Quatro estados de medição</h3><ul><li><strong>Calculado:</strong> o cálculo do fato nomeado foi concluído na base informada. Não comprova cobertura total da operação.</li><li><strong>Parcial / proxy:</strong> há uma observação útil, com população limitada, período aberto ou aproximação explicitada.</li><li><strong>Indisponível:</strong> falta dado ou critério necessário. O valor continua desconhecido.</li><li><strong>Sem base:</strong> falta população ou denominador suficiente naquele recorte. Não é zero.</li></ul></section><section class="dialog-section"><h3>Distinções que mudam a decisão</h3><ul><li>Venda registrada, recebimento, receita reconhecida, margem e caixa precisam de evidências próprias.</li><li>Oportunidades abertas representam pipeline bruto. Cobertura exige meta e elegibilidade aprovadas.</li><li>Investimento de mídia não é custo completo de aquisição. Moedas não comprovadas permanecem separadas.</li><li>Parcelas de curso não demonstram receita recorrente, MRR, GRR ou NRR.</li><li>Contato registrado e vendas em datas distintas não comprovam retenção, recompra ou risco do aluno.</li><li>Percentuais, tickets, medianas e P90 não são somados entre recortes para formar uma população maior.</li></ul></section><div class="dialog-note">As recomendações organizam revisões. Metas, responsáveis, cadências acordadas e limites de alerta de negócio ainda precisam de aprovação.</div>`);
  }
  function openAbout() {
    if(!state.data)return;
    openDialog('SOBRE ESTA LEITURA',`<h2 id="dialog-title">Uma visão das oito famílias de sensores</h2><p class="dialog-intro">O painel usa dados agregados da pasta Dados Ouro da The VOID na Nekt. Cada observação preserva fonte, período, fórmula, população e limitação.</p><dl class="dialog-kv"><dt>Camada</dt><dd>${esc(state.data.source?.layer || 'thevoid')}</dd><dt>Famílias</dt><dd>${esc(n(state.data.coverage.families))}</dd><dt>Sensores distintos</dt><dd>${esc(n(state.data.coverage.sensor_count))}</dd><dt>Observações / recortes</dt><dd>${esc(n(state.data.coverage.observation_count))}</dd><dt>Fuso operacional</dt><dd>America/Sao_Paulo</dd><dt>Última leitura</dt><dd>${esc(dateTime(state.data.freshness.read_at))}</dd></dl><section class="dialog-section"><h3>O que os filtros fazem</h3><p>O período selecionado filtra as séries mensais e os recortes de coorte. Fotografias mantêm a sua referência original. Os números do placar preservam unidades e populações compatíveis; múltiplos recortes de um sensor ficam separados no explorador.</p></section><section class="dialog-section"><h3>Atualização</h3><p>A consulta automática busca uma nova leitura a cada minuto enquanto a página está visível. Ela não executa cargas, altera dados de origem ou envia mensagens. Os horários de ouro e prata permanecem visíveis para orientar a decisão.</p></section>`);
  }

  async function fetchPayload(endpoint) {
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),22000);
    const requestUrl=new URL(endpoint,location.href);
    // The static host may cache responses for ten minutes despite browser no-store.
    if(requestUrl.pathname.endsWith('.json'))requestUrl.searchParams.set('_v',String(Math.floor(Date.now()/60000)));
    try{const response=await fetch(requestUrl.href,{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});if(!response.ok)throw new Error('read_failed');const data=await response.json();if(data.schema_version!=='void-ouro-dashboard-v1'||!Array.isArray(data.families)||data.families.length!==8||!data.coverage)throw new Error('invalid_payload');return data;}finally{clearTimeout(timeout);}
  }
  async function refresh(manual=false) {
    if(state.busy)return;
    loading(true);
    const endpoint=window.VOID_DASHBOARD_ENDPOINT || '/api/dashboard';
    try{const data=await fetchPayload(endpoint);state.data=data;state.groups=buildGroups(data);state.failed=false;render();if(manual)showToast('Leitura consultada. Os horários das camadas estão disponíveis em “Ver atualização das fontes”.');}
    catch{
      state.failed=true;
      if(!state.data){try{const fallback=await fetchPayload('./snapshot.json');state.data=fallback;state.groups=buildGroups(fallback);render();}catch{$('#connection-status').innerHTML='<i aria-hidden="true"></i> Leitura indisponível';$('#connection-status').className='connection-status offline';$('#read-time').textContent='Não foi possível consultar os dados.';$('#connection-alert').hidden=false;$('#connection-alert').classList.add('error');$('#connection-alert').textContent='A leitura da Nekt está temporariamente indisponível. Use Atualizar para tentar novamente. Nenhum número de demonstração é exibido.';$('#headline-kpis').innerHTML='<div class="loading-block">Os indicadores aparecerão quando uma leitura validada estiver disponível.</div>';}}
      if(state.data)renderConnection();
      if(manual)showToast('Não foi possível obter uma nova leitura. A última disponível foi preservada.');
    }finally{loading(false);schedule();}
  }
  function schedule() {clearTimeout(timer);if(state.auto&&!document.hidden){const interval=Math.max(30000,Number(state.data?.freshness?.refresh_seconds || 60)*1000);timer=setTimeout(()=>refresh(),interval);}}

  $$('[data-period]').forEach((button)=>button.addEventListener('click',()=>setPeriod(button.dataset.period)));
  $$('[data-cadence]').forEach((button)=>button.addEventListener('click',()=>{state.cadence=button.dataset.cadence;$$('[data-cadence]').forEach((item)=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',active);});if(state.data)renderActions();}));
  $('#action-priority').addEventListener('change',(event)=>{state.priority=event.target.value;if(state.data)renderActions();});
  $('#sensor-search').addEventListener('input',(event)=>{state.search=event.target.value;state.page=0;if(state.data)renderSensors();});
  $('#sensor-family').addEventListener('change',(event)=>{state.family=event.target.value;state.page=0;if(state.data)renderSensors();});
  $('#sensor-status').addEventListener('change',(event)=>{state.status=event.target.value;state.page=0;if(state.data)renderSensors();});
  $('#clear-filters').addEventListener('click',()=>{state.family='all';state.status='all';state.search='';state.page=0;$('#sensor-family').value='all';$('#sensor-status').value='all';$('#sensor-search').value='';renderSensors();});
  $('#sensor-previous').addEventListener('click',()=>{state.page=Math.max(0,state.page-1);renderSensors();});
  $('#sensor-next').addEventListener('click',()=>{state.page+=1;renderSensors();});
  $('#auto-toggle').addEventListener('click',()=>{state.auto=!state.auto;$('#auto-toggle').setAttribute('aria-pressed',state.auto);renderConnection();schedule();});
  $('#refresh-button').addEventListener('click',()=>refresh(true));
  $('#dialog-close').addEventListener('click',()=>$('#detail-dialog').close());
  $('#detail-dialog').addEventListener('click',(event)=>{if(event.target===$('#detail-dialog')){const box=$('#detail-dialog').getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)$('#detail-dialog').close();}});
  $('#freshness-open').addEventListener('click',openFreshness);$('#sources-open').addEventListener('click',openFreshness);$('#controls-open').addEventListener('click',openControls);$('#limits-open').addEventListener('click',openLimits);$('#about-open').addEventListener('click',openAbout);
  $('#hero-action-open').addEventListener('click',()=>{if(state.data?.actions?.length)openAction(state.data.actions[0]);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else if(state.auto)refresh();});
  const navObserver=new IntersectionObserver((entries)=>{entries.forEach((entry)=>{if(entry.isIntersecting){$$('.main-nav a').forEach((link)=>link.classList.toggle('active',link.hash===`#${entry.target.id}`));}});},{rootMargin:'-5% 0px -75% 0px'});
  ['visao','acoes','sensores','confiabilidade'].forEach((id)=>navObserver.observe(document.getElementById(id)));
  const urlPeriod=new URLSearchParams(location.search).get('period');if(Object.hasOwn(periodNames,urlPeriod))setPeriod(urlPeriod);
  refresh();
})();
