const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine.js'),fixture=require('./fixtures/v1-demo.json');
const D1='2026-11-10',D2='2026-11-11';
function shop(){let data=E.empty(),n=0;return {
 get data(){return data},get model(){return E.replay(data)},
 add(type,p={},day=D1){const c={id:`r-${++n}`,type,day,at:day+'T12:00:00Z',...p};data=E.append(data,c,data.revision);return c.id},
 buy(name='Apples',grams=2000,day=D1){return this.add('purchase',{name,grams,cost:grams/5,price:500},day)},
 report(day=D1){return E.dailyByFruit(this.model,day)},
 void(targetId,day=D1){return this.add('void',{targetId,note:'Entry mistake'},day)}
};}
function balanced(s,day){const rows=s.report(day),d=E.daily(s.model,day);for(const r of rows){assert.equal(r.opening+r.purchased-r.sold-r.wasted+r.countChange,r.remaining,r.name);for(const k of ['opening','purchased','sold','wasted','returned','countChange','remaining'])assert.ok(Number.isSafeInteger(r[k]),k)}assert.equal(rows.reduce((n,r)=>n+r.remaining,0),d.closingStock);assert.equal(rows.reduce((n,r)=>n+r.opening,0),d.openingStock)}
test('per-fruit quantities combine purchases, sales, both return conditions, waste and counts',()=>{
 const s=shop(),fruitId=s.buy(),bananas=s.buy('Bananas',1000),saleId=s.add('sale',{fruitId,grams:1000,price:500});
 s.add('return',{saleId,grams:200,restock:true});s.add('return',{saleId,grams:100,restock:false});
 s.add('spoilage',{fruitId,grams:50,note:'Bruised'});s.add('adjustment',{fruitId,counted:1100,costRate:200,note:'Counted'});
 s.add('sale',{fruitId:bananas,grams:1,price:300});
 assert.deepEqual(s.report()[0],{fruitId,name:'Apples',opening:0,purchased:2000,sold:700,wasted:150,returned:300,countChange:-50,remaining:1100});
 assert.equal(s.report()[1].remaining,999);balanced(s,D1);
});
test('historical closing quantities ignore later sales, returns, voids and new fruit',()=>{
 const s=shop(),fruitId=s.buy(),saleId=s.add('sale',{fruitId,grams:600,price:500}),before=s.report();
 const ret=s.add('return',{saleId,grams:200,restock:true},D2);s.void(ret,D2);s.void(saleId,D2);s.buy('Pears',1000,D2);
 assert.deepEqual(s.report(),before);assert.equal(s.report(D2)[0].sold,-600);assert.equal(s.report(D2)[0].remaining,2000);assert.equal(s.report('2026-11-09').length,0);balanced(s,D1);balanced(s,D2);
});
test('sale correction preserves the old report and books only net change on correction day',()=>{
 const s=shop(),fruitId=s.buy(),targetId=s.add('sale',{fruitId,grams:1000,price:500});
 s.add('correction',{targetId,note:'Wrong weight',replacement:{type:'sale',fruitId,grams:500,price:500}},D2);
 assert.equal(s.report()[0].sold,1000);assert.equal(s.report()[0].remaining,1000);
 assert.equal(s.report(D2)[0].sold,-500);assert.equal(s.report(D2)[0].remaining,1500);balanced(s,D1);balanced(s,D2);
});
test('purchase corrections and reversals adjust purchased quantities exactly',()=>{
 const s=shop(),targetId=s.buy();const correction=s.add('correction',{targetId,note:'Wrong delivery',replacement:{type:'purchase',name:'Apples',grams:2500,cost:500,price:500}});
 assert.equal(s.report()[0].purchased,2500);s.void(correction+':replacement',D2);assert.equal(s.report(D2)[0].purchased,-2500);assert.equal(s.report(D2)[0].remaining,0);balanced(s,D1);balanced(s,D2);
});
test('waste correction and reversal never become count discrepancies',()=>{
 const s=shop(),fruitId=s.buy(),targetId=s.add('spoilage',{fruitId,grams:300,note:'Bruised'});
 const c=s.add('correction',{targetId,note:'Wrong weight',replacement:{type:'spoilage',fruitId,grams:100,note:'Bruised'}});
 assert.equal(s.report()[0].wasted,100);s.void(c+':replacement',D2);assert.equal(s.report(D2)[0].wasted,-100);assert.equal(s.report(D2)[0].countChange,0);balanced(s,D1);balanced(s,D2);
});
test('changing a sellable return to unsellable moves returned grams to waste',()=>{
 const s=shop(),fruitId=s.buy(),saleId=s.add('sale',{fruitId,grams:1000,price:500}),targetId=s.add('return',{saleId,grams:400,restock:true});
 const c=s.add('correction',{targetId,note:'Actually damaged',replacement:{type:'return',saleId,grams:250,restock:false}},D2);
 let r=s.report(D2)[0];assert.equal(r.returned,-150);assert.equal(r.sold,150);assert.equal(r.wasted,250);assert.equal(r.remaining,1000);balanced(s,D1);balanced(s,D2);
 s.void(c+':replacement',D2);r=s.report(D2)[0];assert.equal(r.returned,-400);assert.equal(r.sold,400);assert.equal(r.wasted,0);balanced(s,D2);
});
test('count corrections retain the original baseline and later sales in reports',()=>{
 const s=shop(),fruitId=s.buy(),targetId=s.add('adjustment',{fruitId,counted:1800,costRate:200,note:'Count'});
 s.add('sale',{fruitId,grams:500,price:500});
 s.add('correction',{targetId,note:'Correct counted weight',replacement:{type:'adjustment',fruitId,counted:1900,costRate:200,note:'Count'}},D2);
 assert.equal(s.report()[0].countChange,-200);assert.equal(s.report(D2)[0].countChange,100);assert.equal(s.report(D2)[0].remaining,1400);assert.equal(s.report(D2)[0].wasted,0);balanced(s,D1);balanced(s,D2);
});
test('added stock and its reversal remain separate from purchased and wasted weight',()=>{
 const s=shop(),fruitId=s.buy(),targetId=s.add('adjustment',{fruitId,counted:2300,costRate:200,note:'Count'});s.void(targetId,D2);
 assert.equal(s.report()[0].countChange,300);assert.equal(s.report(D2)[0].countChange,-300);assert.equal(s.report(D2)[0].purchased,0);assert.equal(s.report(D2)[0].wasted,0);balanced(s,D1);balanced(s,D2);
});
test('reports are read-only and support legacy backups with integer gram precision',()=>{
 const d=structuredClone(fixture.data),m=E.replay(d),before=JSON.stringify({d,m});
 for(const day of [...new Set(m.transactions.map(t=>t.day))]){const rows=E.dailyByFruit(m,day);assert.equal(rows.reduce((n,r)=>n+r.remaining,0),E.daily(m,day).closingStock)}
 assert.equal(JSON.stringify({d,m}),before);assert.equal(d.version,1);
 const s=shop(),fruitId=s.buy();s.add('sale',{fruitId,grams:E.grams('0.001','kg'),price:E.rate('0.005','g')});assert.equal(s.report()[0].sold,1);assert.equal(s.report()[0].remaining,1999);balanced(s,D1);
});
test('empty and inactive dates return valid snapshots and invalid dates fail',()=>{
 const s=shop();assert.deepEqual(s.report(),[]);s.buy();s.add('settings',{fruitId:'r-1',price:700,lowStock:300},D2);
 const r=s.report(D2)[0];assert.equal(r.opening,2000);assert.equal(r.remaining,2000);assert.equal(r.purchased+r.sold+r.wasted,0);assert.throws(()=>s.report('2026-02-30'),/valid summary date/);balanced(s,D2);
});
