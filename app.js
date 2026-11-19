(function(){
 'use strict';
 const E=FruitLedger,S=LedgerStore,U=LedgerUI,{icon,esc,money,weight,weightInput,rateInput,dateLabel,time,names,btn,field}=U;
 const app=document.getElementById('app'),modal=document.getElementById('modal');
 let data,model,pending=false,ms=null,toastTimer,lastSale=null;
 const view={page:'today',filter:'',period:'all',kind:'all',stockFilter:'all',summaryDate:E.day(),menuOpen:false};
 function notify(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4500);}
 function render(){model=E.replay(data);app.innerHTML=U.render({...view,data,model});}
 function close(){if(pending)return;modal.close();ms=null;}
 function show(title,description,body,footer,formId='transaction-form'){
  modal.innerHTML=`<form id="${formId}"><div class="modal-header"><div><h2 id="modal-title">${title}</h2><p>${description}</p></div><button type="button" class="icon-button" data-action="close" aria-label="Close dialog">${icon('close')}</button></div>${body}<p class="form-error" id="form-error" role="alert"></p><div class="modal-footer">${footer}</div></form>`;
  if(!modal.open)modal.showModal();
 }
 const cancel=()=>'<button type="button" class="button" data-action="close">Cancel</button>';
 const submit=(label,value='',cls='primary')=>`<button class="button ${cls}" type="submit" value="${value}">${label}</button>`;
 const unitSelect=u=>`<label class="form-field"><span>Weight unit</span><select name="unit"><option value="kg" ${u==='kg'?'selected':''}>Kilograms (kg)</option><option value="g" ${u==='g'?'selected':''}>Grams (g)</option></select></label>`;
 function fruitSelect(items,selected,locked=false){return `<label class="form-field full"><span>Fruit</span><select name="fruitId" required ${locked?'disabled':''}>${items.map(i=>`<option value="${esc(i.id)}" ${selected===i.id?'selected':''}>${esc(i.name)} · ${E.stock(i)===0?'Out of stock':weight(E.stock(i),data.unit)+' available'}</option>`).join('')}</select></label>`;}
 function stamp(type,id=crypto.randomUUID()){const now=new Date();return {id,type,at:now.toISOString(),day:E.day(now)};}
 function reversal(target,note='Preview',id=crypto.randomUUID()){return {...stamp('void',id),targetId:target,note};}
 function openEntry(kind,fruitId,saleId,targetId,continueSale=false){
  if(pending)return;let sourceModel=model,original;
  if(targetId){original=model.transactions.find(t=>t.id===targetId);try{sourceModel=E.replay(E.append(data,reversal(targetId),data.revision));}catch(e){if(modal.open)modal.querySelector('#form-error').textContent=e.message;else notify(e.message);return;}kind=original.type;fruitId=original.fruitId;saleId=original.saleId;}
  const u=continueSale&&lastSale?lastSale.unit:data.unit;
  const available=sourceModel.items.filter(i=>['sale','purchase','adjustment','return'].includes(kind)||E.stock(i)>0);
  if(kind!=='purchase'&&!available.length){notify('Add stock before recording this transaction.');return;}
  const i=available.find(i=>i.id===fruitId)||available.find(i=>kind==='sale'&&i.id===lastSale?.fruitId)||available.find(i=>E.stock(i)>0)||available[0];
  const sale=sourceModel.sales.find(t=>t.id===saleId);if(kind==='return'&&!sale){notify('The original sale is no longer available.');return;}
  ms={kind,id:crypto.randomUUID(),revision:data.revision,unit:u,saleId,targetId,fruitId:i?.id};
  let fields='',qty='',cost='',p=rateInput(i?.price||0,u),note='';const input=original?.input;
  if(input){qty=weightInput(kind==='adjustment'?input.counted:input.grams,u);cost=input.cost===undefined?'':(input.cost/100).toFixed(2);p=rateInput(input.price??i?.price??0,u);note=input.note||'';}
  if(kind==='purchase')fields=field('Fruit name','name',original?.name||(fruitId?i?.name:''),{full:true,list:true,readonly:!!targetId})+`<datalist id="fruit-names">${model.items.map(i=>`<option value="${esc(i.name)}"></option>`).join('')}</datalist>`+field(`Quantity (${u})`,'quantity',qty,{numeric:true})+unitSelect(u)+field('Total purchase cost ($)','cost',cost,{numeric:true,hint:'Total paid for the entire delivery.'})+field(`Selling price ($ / ${u})`,'price',targetId||fruitId?p:'',{numeric:true,hint:'Suggested price for future sales.'});
  if(kind==='sale'){
   if(continueSale&&lastSale?.fruitId===i.id)p=rateInput(lastSale.price,u);
   fields=fruitSelect(available,i.id,!!targetId)+`<div class="recent-fruits full">${[...new Set(model.sales.filter(s=>!s.voidedBy).slice(-12).reverse().map(s=>s.fruitId))].slice(0,3).map(id=>{const fruit=available.find(x=>x.id===id);return fruit&&!targetId?`<button type="button" data-action="pick-fruit" data-fruit="${esc(id)}">${esc(fruit.name)}</button>`:'';}).join('')}</div>`+field(`Weight sold (${u})`,'quantity',qty,{numeric:true})+unitSelect(u)+`<div class="quick-weights full" role="group" aria-label="Quick weights">${[250,500,1000].map(g=>`<button type="button" data-action="quick-weight" data-grams="${g}">${g===1000?'1 kg':g+' g'}</button>`).join('')}${lastSale?`<button type="button" data-action="quick-weight" data-grams="${lastSale.grams}">Last: ${weight(lastSale.grams,u)}</button>`:''}</div><details class="sale-options full" ${targetId?'open':''}><summary>Price & note</summary><div class="form-grid">${field(`Selling price ($ / ${u})`,'price',p,{numeric:true,full:true})}${field('Note (optional)','note',note,{full:true,optional:true,long:true})}</div></details>`;
  }
  if(kind==='spoilage')fields=fruitSelect(available,i.id,!!targetId)+field(`Waste weight (${u})`,'quantity',qty,{numeric:true})+unitSelect(u)+field('Waste reason','note',note,{full:true,long:true,hint:'For example: overripe, bruised, or damaged.'});
  if(kind==='adjustment')fields=fruitSelect(available,i.id,!!targetId)+field(`Actual counted stock (${u})`,'quantity',input?qty:weightInput(E.stock(i),u),{numeric:true})+unitSelect(u)+field(`Cost of added stock ($ / ${u})`,'costRate',rateInput(input?.costRate??(E.stock(i)?E.ratio(E.value(i),1000,E.stock(i)):0),u),{numeric:true,full:true,hint:'Used only when the counted stock is higher.'})+field('Discrepancy reason','note',note,{full:true,long:true,hint:'For example: physical count correction. Use Record Waste for spoiled fruit.'});
  if(kind==='return')fields=`<div class="return-source full"><strong>${esc(sale.name)}</strong><span>${dateLabel(sale.day)} · ${time(sale)} · Original sale ${money(sale.amount)}</span><small>${weight(sale.grams-sale.returned,u)} can still be returned.</small></div>`+field(`Return weight (${u})`,'quantity',qty,{numeric:true})+unitSelect(u)+`<label class="form-field full"><span>Condition of returned fruit</span><select name="restock"><option value="yes">Sellable — return to stock</option><option value="no" ${input?.restock===false?'selected':''}>Unsellable — record as waste</option></select></label>`+field('Note (optional)','note',note,{full:true,optional:true,long:true});
  if(kind==='purchase')fields+=field('Note (optional)','note',note,{full:true,optional:true,long:true});
  if(targetId)fields=`<div class="correction-context full"><strong>Correcting ${esc(targetId.slice(-8))}</strong><span>The original entry stays visible. Its exact reversal and your replacement are saved together.</span></div>`+fields+field('Reason for correction','reason','',{full:true,long:true});
  const labels={purchase:['Add Stock','Receive fresh stock and record its purchase cost.','Save Stock'],sale:['Record Sale','Enter a weight. Save, and you’re ready for the next customer.','Save & Close'],spoilage:['Record Waste','Record spoiled or damaged fruit at purchase cost.','Save Waste'],adjustment:['Record Stock Count','Reconcile your physical count. This is separate from waste.','Save Count'],return:['Record Return','Refund the original sale and record the fruit’s condition.','Save Return']};
  const footer=targetId?cancel()+submit('Save Correction'):kind==='sale'?submit('Save & Next','next')+submit('Save & Close','close',''):cancel()+submit(labels[kind][2]);
  show(targetId?`Correct ${names[kind]}`:labels[kind][0],labels[kind][1],`<div class="form-grid">${fields}</div><div id="sale-stock-notice" role="status" hidden></div><div class="form-preview" id="form-preview" aria-live="polite"></div>`,footer);modal.classList.toggle('sale-dialog',kind==='sale');updatePreview();if(kind==='sale')modal.querySelector(ms.outOfStock?'[name="fruitId"]':'[name="quantity"]').focus();
 }
 function openFruitSettings(id){
  const i=model.items.find(i=>i.id===id);if(!i)return;const u=data.unit;ms={kind:'settings',id:crypto.randomUUID(),revision:data.revision,fruitId:id,unit:u};modal.classList.remove('sale-dialog');
  show('Edit Fruit Settings',i.name,`<div class="form-grid">${field(`Selling price ($ / ${u})`,'price',rateInput(i.price,u),{numeric:true})}${unitSelect(u)}${field(`Low-stock alert (${u})`,'quantity',weightInput(i.lowStock,u),{numeric:true,full:true,hint:'Alert when stock is at or below this weight. Zero alerts only when out of stock.'})}</div><div class="notice"><p>Changes apply to future sales. Existing transactions and stock quantities stay unchanged. This update is saved in the audit history.</p></div>`,cancel()+submit('Save Settings'));
 }
 function openDetails(id){
  const t=model.transactions.find(t=>t.id===id);if(!t)return;ms={kind:'details'};modal.classList.remove('sale-dialog');
  const related=model.transactions.filter(x=>x.id===t.targetId||x.id===t.correctedFrom||x.id===t.voidedBy||x.id===t.replacementId||x.correctedFrom===t.id||x.targetId===t.id||x.id===t.saleId||x.saleId===t.id||(t.createdLot&&!x.voidedBy&&x.portions.some(p=>p.lotId===t.createdLot)));
  const signed=g=>(g>0?'+':'')+weight(g,data.unit);
  const body=`<div class="detail-status"><span class="stock-badge">${U.status(t)}</span><span class="record-id">${esc(t.id)}</span></div><dl class="transaction-details"><div><dt>Fruit</dt><dd>${esc(t.name)}</dd></div><div><dt>Recorded</dt><dd>${dateLabel(t.day)} · ${time(t)}</dd></div>${t.type==='settings'?`<div><dt>Selling price / ${data.unit}</dt><dd>$${rateInput(t.previousPrice,data.unit)} → $${rateInput(t.price,data.unit)}</dd></div><div><dt>Low-stock alert</dt><dd>${weight(t.previousLowStock,data.unit)} → ${weight(t.lowStock,data.unit)}</dd></div>`:`<div><dt>Weight</dt><dd>${weight(t.grams,data.unit)}</dd></div><div><dt>Stock change</dt><dd>${signed(t.delta)}</dd></div><div><dt>Net sales effect</dt><dd>${money(t.revenue)}</dd></div><div><dt>Cost of sales effect</dt><dd>${money(t.cogs)}</dd></div><div><dt>Waste at cost</dt><dd>${money(t.waste)}</dd></div><div><dt>Stock discrepancy loss</dt><dd>${money(t.discrepancy)}</dd></div>${t.type==='purchase'||t.originalType==='purchase'?`<div><dt>Purchase cost effect</dt><dd>${money(t.purchases)}</dd></div>`:''}`}</dl>${t.note?`<div class="notice"><strong>${t.type==='void'?'Reversal reason':'Note'}</strong><p>${esc(t.note)}</p></div>`:''}${related.length?`<div class="audit-links"><h3>Linked audit history</h3>${related.map(r=>`<button type="button" class="audit-link" data-action="details" data-record="${esc(r.id)}"><span>${r.type==='void'?(r.replacementId?'Correction reversal':'Void / reversal'):r.correctedFrom?'Replacement entry':names[r.type]} · ${esc(r.id.slice(-8))}</span>${icon('arrow')}</button>`).join('')}</div>`:''}`;
  let footer=btn('close','Close');if(!t.voidedBy&&['sale','purchase','spoilage','return','adjustment'].includes(t.type))footer=btn('void','Void','',`data-record="${esc(t.id)}"`)+btn('correct','Correct','',`data-record="${esc(t.id)}"`)+(t.type==='sale'&&t.grams>t.returned?btn('return','Record Return','primary',`data-sale="${esc(t.id)}"`):'');
  show(names[t.type],t.type==='void'?'An exact reversal. The original entry remains in your history.':'Transaction details and audit history.',body,footer,'details-form');
 }
 function openVoid(id){
  let next;try{next=E.replay(E.append(data,reversal(id),data.revision));}catch(e){if(modal.open)modal.querySelector('#form-error').textContent=e.message;else notify(e.message);return;}
  const t=next.transactions.at(-1),i=next.items.find(i=>i.id===t.fruitId);ms={kind:'void',id:crypto.randomUUID(),revision:data.revision,targetId:id};
  show('Void Transaction',`${names[t.originalType]} · ${t.name}`,`<div class="notice"><strong>The original record will be kept.</strong><p>This appends an exact reversal today. Stock will be ${weight(E.stock(i),data.unit)}. Net sales change: ${money(t.revenue)}. Loss change: ${money(t.loss)}.</p></div><div class="form-grid void-fields">${field('Reason for void','reason','',{full:true,long:true})}</div><label class="checkbox-label"><input type="checkbox" name="confirm" required> I have reviewed this reversal.</label>`,cancel()+submit('Confirm Void'));
 }
 function command(preview=false){
  const f=new FormData(modal.querySelector('form')),m=ms,base=stamp(m.kind,m.id);
  if(m.kind==='void')return {...base,targetId:m.targetId,note:preview?'Preview':String(f.get('reason')||'').trim()};
  if(m.kind==='sale'&&!m.targetId){const selected=model.items.find(i=>i.id===f.get('fruitId'));if(!selected||E.stock(selected)===0)throw new Error('This fruit is out of stock. Select another fruit before recording a sale.');}
  const qty=E.grams(f.get('quantity'),f.get('unit'));
  if(m.kind==='settings')return {...base,fruitId:m.fruitId,price:E.rate(f.get('price'),f.get('unit')),lowStock:qty};
  const c={...base,note:String(f.get('note')||'').trim()};if(preview&&!c.note)c.note='Preview';
  if(m.kind==='purchase')Object.assign(c,{name:String(f.get('name')).trim(),grams:qty,cost:E.cents(f.get('cost')),price:E.rate(f.get('price'),f.get('unit'))});
  else if(m.kind==='return')Object.assign(c,{saleId:m.saleId,grams:qty,restock:f.get('restock')==='yes'});
  else if(m.kind==='adjustment')Object.assign(c,{fruitId:m.targetId?m.fruitId:f.get('fruitId'),counted:qty,costRate:E.rate(f.get('costRate'),f.get('unit'))});
  else{Object.assign(c,{fruitId:m.targetId?m.fruitId:f.get('fruitId'),grams:qty});if(m.kind==='sale')c.price=E.rate(f.get('price'),f.get('unit'));}
  return m.targetId?{...base,type:'correction',targetId:m.targetId,note:preview?'Preview':String(f.get('reason')||'').trim(),replacement:c}:c;
 }
 function syncSaleAvailability(){
  if(ms?.kind!=='sale'||ms.targetId)return;
  const form=modal.querySelector('form'),selected=model.items.find(i=>i.id===form.elements.fruitId.value);
  ms.outOfStock=!selected||E.stock(selected)===0;
  const notice=modal.querySelector('#sale-stock-notice');notice.hidden=!ms.outOfStock;
  notice.textContent=ms.outOfStock?`${selected?.name||'This fruit'} is out of stock. ${model.items.some(i=>E.stock(i)>0)?'Select another fruit to continue.':'Add stock before recording another sale.'}`:'';
  form.elements.quantity.disabled=ms.outOfStock;
  form.querySelectorAll('[data-action="quick-weight"],button[type="submit"]').forEach(b=>b.disabled=pending||ms.outOfStock);
 }
 function updatePreview(){
  const p=modal.querySelector('#form-preview'),err=modal.querySelector('#form-error');if(!p||!ms)return;
  syncSaleAvailability();
  if(ms.revision!==data.revision){err.textContent='The ledger changed in another tab. Close this form and review the latest stock.';p.textContent='This preview is out of date.';return;}err.textContent='';
  if(ms.outOfStock){p.textContent='No sale will be saved until you select an in-stock fruit.';return;}
  try{const c=command(true),next=E.replay(E.append(data,c,data.revision)),t=next.transactions.at(-1),i=next.items.find(i=>i.id===t.fruitId),label={sale:'Sale total',purchase:'Purchase total',return:'Refund',spoilage:'Waste at cost',adjustment:t.delta<0?'Discrepancy loss':'Added stock value'}[t.type];let extra='';if(ms.targetId){const before=E.daily(model,E.day()),after=E.daily(next,E.day());extra=`<small>Net sales change today: ${money(after.revenue-before.revenue)} · Profit change: ${money(after.profit-before.profit)}</small>`;}p.innerHTML=`<span>${label}<strong>${money(t.amount)}</strong></span><small>Remaining stock: ${weight(E.stock(i),ms.unit)}</small>${extra}`;}catch(e){p.textContent=modal.querySelector('[name="quantity"]')?.value?e.message:'Enter a weight to see the total.';}
 }
 function confirmReplace(kind,imported){
  const restoring=kind==='restore';ms={kind:'replace',revision:data.revision,replacement:restoring?imported:kind==='demo'?E.demo():E.empty()};modal.classList.remove('sale-dialog');
  show(restoring?'Restore Backup?':kind==='demo'?'Reload Demo Data?':'Start Your Shop?',restoring?`${imported.commands.length} validated ledger entries · Version ${imported.version}`:'Replace the current ledger with '+(kind==='demo'?'sample data.':'an empty shop ledger.'),`<div class="notice"><strong>Your current ledger will be replaced.</strong><p>Download a backup to keep it. This cannot be undone without a backup.</p></div><div class="backup-before">${btn('export',icon('download')+' Download Current Backup')}</div><label class="checkbox-label"><input type="checkbox" name="confirm" required> I understand this replaces my current data.</label>`,cancel()+submit(restoring?'Restore Backup':kind==='demo'?'Load Demo':'Start Fresh'),'replace-form');
 }
 async function exportBackup(){try{const d=await S.read(),url=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`FruitLedger-v${d.version}-${d.mode}-${E.day()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);notify('Backup download started. Keep a copy somewhere safe.');}catch(e){notify(e.message);}}
 document.addEventListener('click',async e=>{
  const nav=e.target.closest('[data-page]');if(nav){e.preventDefault();Object.assign(view,{page:nav.dataset.page,filter:'',period:'all',kind:'all',stockFilter:'all',menuOpen:false});render();window.scrollTo(0,0);return;}
  const unit=e.target.closest('[data-unit]');if(unit){try{data=await S.unit(unit.dataset.unit);render();}catch(err){notify(err.message);}return;}
  const b=e.target.closest('[data-action]');if(!b||b.disabled||pending)return;const a=b.dataset.action;
  if(['sale','purchase','spoilage','adjustment','return'].includes(a))openEntry(a,b.dataset.fruit,b.dataset.sale);
  if(a==='details')openDetails(b.dataset.record);if(a==='correct')openEntry(null,null,null,b.dataset.record);if(a==='void')openVoid(b.dataset.record);if(a==='fruit-settings')openFruitSettings(b.dataset.fruit);if(a==='close')close();if(a==='export')exportBackup();if(a==='fresh'||a==='demo')confirmReplace(a);if(a==='import')document.getElementById('backup-file').click();
  if(a==='menu'){view.menuOpen=!view.menuOpen;render();if(view.menuOpen)app.querySelector('.sidebar .nav-item.active')?.focus();else app.querySelector('.menu-toggle')?.focus();}
  if(a==='quick-weight'){modal.querySelector('[name="quantity"]').value=weightInput(Number(b.dataset.grams),ms.unit);updatePreview();modal.querySelector('[name="quantity"]').focus();}
  if(a==='pick-fruit'){const f=modal.querySelector('form'),i=model.items.find(x=>x.id===b.dataset.fruit);f.elements.fruitId.value=i.id;f.elements.price.value=rateInput(i.price,ms.unit);f.elements.quantity.value='';updatePreview();if(!ms.outOfStock)f.elements.quantity.focus();}
 });
 document.addEventListener('input',e=>{if(e.target.id==='search'){const pos=e.target.selectionStart;view.filter=e.target.value;render();const f=document.getElementById('search');f.focus();try{f.setSelectionRange(pos,pos);}catch{}}else if(modal.contains(e.target))updatePreview();});
 document.addEventListener('change',async e=>{
  const el=e.target,filters={'period-filter':'period','type-filter':'kind','stock-filter':'stockFilter'};if(filters[el.id]){view[filters[el.id]]=el.value;render();}
  if(el.id==='summary-date'){if(E.validDay(el.value)&&el.value<=E.day()){view.summaryDate=el.value;render();}else{el.value=view.summaryDate;notify('Choose today or an earlier valid date.');}}
  if(el.id==='backup-file'&&el.files[0]){try{if(el.files[0].size>20*1024*1024)throw new Error('Choose a backup smaller than 20 MB.');confirmReplace('restore',E.backup(await el.files[0].text()));}catch(err){notify('Backup not restored: '+err.message);}finally{el.value='';}}
  if(modal.contains(el)&&ms&&ms.kind!=='replace'){
   const f=el.form;if(el.name==='unit'){const old=ms.unit,next=el.value,converted={};try{if(f.elements.quantity.value)converted.quantity=weightInput(E.grams(f.elements.quantity.value,old),next);for(const key of ['price','costRate'])if(f.elements[key]?.value)converted[key]=rateInput(E.rate(f.elements[key].value,old),next);for(const [key,value]of Object.entries(converted))f.elements[key].value=value;ms.unit=next;for(const label of f.querySelectorAll('.form-field > span'))label.textContent=label.textContent.replace(`(${old})`,`(${next})`).replace(` / ${old})`,` / ${next})`);}catch(err){el.value=old;notify(err.message);}}
   if(el.name==='fruitId'){const i=model.items.find(x=>x.id===el.value);if(f.elements.price)f.elements.price.value=rateInput(i.price,ms.unit);if(ms.kind==='sale')f.elements.quantity.value='';if(ms.kind==='adjustment'){f.elements.quantity.value=weightInput(E.stock(i),ms.unit);f.elements.costRate.value=rateInput(E.stock(i)?E.ratio(E.value(i),1000,E.stock(i)):0,ms.unit);}}
   if(el.name==='name'&&ms.kind==='purchase'){const i=model.items.find(x=>x.name.toLowerCase()===el.value.trim().toLowerCase());if(i&&!f.elements.price.value)f.elements.price.value=rateInput(i.price,ms.unit);}updatePreview();
  }
 });
 document.addEventListener('submit',async e=>{
  if(!modal.contains(e.target))return;e.preventDefault();if(pending||!ms||ms.kind==='details')return;
  const f=e.target,err=f.querySelector('#form-error');let cmd;try{if(ms.kind!=='replace'){cmd=command();E.append(data,cmd,ms.revision);}}catch(error){err.textContent=error.message;return;}
  const again=e.submitter?.value==='next'&&ms.kind==='sale'&&!ms.targetId,unit=ms.unit;pending=true;f.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{data=cmd?await S.commit(cmd,ms.revision):await S.replace(ms.replacement,ms.revision);if(cmd?.type==='sale')lastSale={fruitId:cmd.fruitId,price:cmd.price,grams:cmd.grams,unit};if(!cmd)lastSale=null;pending=false;close();render();if(again){openEntry('sale',cmd.fruitId,null,null,true);notify(`Sale saved · ${money(E.ratio(cmd.price,cmd.grams,1000))}. ${ms.outOfStock?'This fruit is now out of stock.':'Ready for the next customer.'}`);}else notify(cmd?`${names[cmd.type]} saved. Your ledger is up to date.`:'Your ledger is ready.');}catch(error){err.textContent=error.message;try{data=await S.read();render();}catch{}}finally{pending=false;f.querySelectorAll('button').forEach(b=>b.disabled=false);if(modal.open)syncSaleAvailability();}
 });
 modal.addEventListener('cancel',e=>{if(pending)e.preventDefault();else ms=null;});modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&view.menuOpen){view.menuOpen=false;render();app.querySelector('.menu-toggle')?.focus();}});
 async function refresh(){if(pending||!data)return;try{const d=await S.read();if(JSON.stringify(d)!==JSON.stringify(data)){data=d;render();if(modal.open){syncSaleAvailability();if(ms?.revision!==undefined&&ms.revision!==data.revision)modal.querySelector('#form-error').textContent='The ledger changed in another tab. Close this form and review the latest stock.';}}}catch(e){notify(e.message);}}
 S.subscribe(refresh);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});let lastDay=E.day();setInterval(()=>{if(data&&lastDay!==E.day()){lastDay=E.day();render();}},30000);
 S.read().then(d=>{data=d;render();}).catch(e=>{app.innerHTML=`<main class="startup-error"><h1>Your ledger couldn’t open</h1><p>${esc(e.message)}</p><p>No data has been changed. Use a regular Chrome or Edge window with browser storage enabled.</p><button class="button primary" id="retry">Try Again</button></main>`;document.getElementById('retry').onclick=()=>location.reload();});
})();
