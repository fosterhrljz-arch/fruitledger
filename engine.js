(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FruitLedger = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX = 1_000_000_000;
  const fail = message => { throw new Error(message); };
  function integer(n, label, zero = true) {
    if (!Number.isSafeInteger(n) || n < (zero ? 0 : 1) || n > MAX) fail(`${label} is outside the supported range.`);
    return n;
  }
  function decimal(value, places, label = 'Value') {
    const s = String(value).trim();
    if (!/^\d+(\.\d+)?$/.test(s)) fail(`${label} must be a positive number or zero.`);
    let [whole, fraction = ''] = s.split('.');
    fraction = fraction.replace(/0+$/, '');
    if (fraction.length > places) fail(`${label} supports up to ${places} decimal places.`);
    const n = Number(whole) * 10 ** places + Number(fraction.padEnd(places, '0'));
    return integer(n, label);
  }
  const grams = (value, unit) => decimal(value, unit === 'kg' ? 3 : 0, 'Weight');
  const cents = value => decimal(value, 2, 'Amount');
  const rate = (value, unit) => decimal(value, unit === 'kg' ? 2 : 5, 'Unit price');
  function ratio(a, b, c) {
    if (!c) return 0;
    const result = Number((BigInt(a) * BigInt(b) * 2n + BigInt(c)) / (2n * BigInt(c)));
    return integer(result, 'Calculated amount');
  }
  function day(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function validDay(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  }
  function text(value, label, max = 100, required = true) {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`${label} is required (up to ${max} characters).`);
    return value.trim();
  }
  function empty(mode = 'live') { return { version: 2, revision: 0, mode, unit: 'kg', commands: [] }; }
  const stock = item => item.lots.reduce((sum, l) => sum + l.grams, 0);
  const value = item => item.lots.reduce((sum, l) => sum + l.cost, 0);
  function take(item, weight) {
    integer(weight, 'Weight', false);
    if (stock(item) < weight) fail(`Not enough ${item.name}. Reduce the weight or add a purchase first.`);
    let left = weight, cost = 0; const portions = [];
    for (const lot of item.lots) {
      if (!left) break;
      if (!lot.grams) continue;
      const used = Math.min(left, lot.grams);
      const portion = ratio(lot.cost, used, lot.grams);
      lot.grams -= used; lot.cost -= portion; left -= used; cost += portion;
      portions.push({ lotId: lot.id, grams: used, cost: portion });
    }
    return { cost, portions };
  }
  function replay(data) {
    if (!data || ![1, 2].includes(data.version) || !['live', 'demo'].includes(data.mode) || !['kg', 'g'].includes(data.unit) || !Array.isArray(data.commands) || data.commands.length > 50000) fail('This is not a supported FruitLedger backup.');
    integer(data.revision, 'Revision');
    const items = new Map(), names = new Map(), sales = new Map(), ids = new Set(), transactions = [], records = new Map();
    function apply(command, correctedFrom) {
      if (!command || typeof command !== 'object' || Array.isArray(command)) fail('Invalid transaction in backup.');
      const c = command;
      text(c.id, 'Transaction ID', 100);
      if (ids.has(c.id)) fail('Duplicate transaction in backup.');
      ids.add(c.id);
      if (!validDay(c.day) || typeof c.at !== 'string' || !Number.isFinite(Date.parse(c.at))) fail('Invalid transaction date.');
      if (c.note !== undefined) text(c.note, 'Note', 300, false);
      if (data.version === 1 && ['void', 'correction', 'settings'].includes(c.type)) fail('New ledger features require a version 2 backup.');
      const t = { id: c.id, type: c.type, day: c.day, at: c.at, note: c.note || '', revenue: 0, cogs: 0, loss: 0, waste: 0, discrepancy: 0, purchases: 0, amount: 0, delta: 0, portions: [], input: { ...c }, correctedFrom };
      let item;
      if (c.type === 'void' || c.type === 'correction') {
        const original = records.get(c.targetId);
        text(c.note, 'Correction or void reason', 300);
        if (!original || !['purchase','sale','spoilage','adjustment','return'].includes(original.type)) fail('Choose an original inventory transaction to reverse.');
        if (original.voidedBy) fail('This transaction has already been reversed.');
        if (c.day < original.day) fail('A reversal cannot be dated before its original transaction.');
        if (original.type === 'sale' && original.returned) fail('Reverse the linked customer returns before changing this sale.');
        if (original.type === 'return' && transactions.some(x => x.type === 'return' && x.saleId === original.saleId && !x.voidedBy && transactions.indexOf(x) > transactions.indexOf(original))) fail('Reverse later returns for this sale first to preserve exact refund rounding.');
        item = items.get(original.fruitId);
        if (original.createdLot) {
          const lot = item.lots.find(l => l.id === original.createdLot);
          if (lot.grams !== original.delta || lot.cost !== original.createdCost) {
            const dependents = transactions.filter(x => !x.voidedBy && x.portions.some(p => p.lotId === lot.id)).map(x => `${x.type === 'spoilage' ? 'waste' : x.type} ${x.id.slice(-8)}`);
            fail(`This stock has already been used. Reverse its dependent transactions first: ${dependents.join(', ')}.`);
          }
          lot.grams = 0; lot.cost = 0;
        }
        for (const portion of original.portions) {
          const lot = item.lots.find(l => l.id === portion.lotId);
          lot.grams += portion.grams; lot.cost += portion.cost;
        }
        if (original.type === 'return') sales.get(original.saleId).returned -= original.grams;
        original.voidedBy = c.id;
        for (const key of ['revenue','cogs','loss','waste','discrepancy','purchases','delta','amount']) t[key] = -original[key];
        t.type = 'void'; t.targetId = original.id; t.originalType = original.type; t.grams = original.grams;
        if (original.type === 'purchase') {
          const latest = [...transactions].reverse().find(x => x.fruitId === item.id && !x.voidedBy && (x.type === 'purchase' || x.type === 'settings'));
          item.price = latest ? latest.price : 0;
        }
        if (c.type === 'correction') {
          if (!c.replacement || c.replacement.type !== original.type) fail('The replacement must use the same transaction type.');
          if (original.type !== 'purchase' && original.type !== 'return' && c.replacement.fruitId !== original.fruitId) fail('A correction must use the original fruit. Void and re-enter to change fruit.');
          if (original.type === 'purchase' && String(c.replacement.name).trim().replace(/\s+/g,' ').toLowerCase() !== original.name.toLowerCase()) fail('A correction must use the original fruit name.');
          if (original.type === 'return' && c.replacement.saleId !== original.saleId) fail('A return correction must reference the original sale.');
          t.replacementId = `${c.id}:replacement`;
        }
      } else if (c.type === 'purchase') {
        const name = text(c.name, 'Fruit name', 60).replace(/\s+/g, ' ');
        integer(c.grams, 'Weight', false); integer(c.cost, 'Purchase cost'); integer(c.price, 'Selling price');
        item = items.get(names.get(name.toLocaleLowerCase('en-US')));
        if (!item) { item = { id: c.id, name, price: c.price, lowStock: 5000, lots: [] }; items.set(item.id, item); names.set(name.toLocaleLowerCase('en-US'), item.id); }
        item.price = c.price;
        item.lots.push({ id: c.id, grams: c.grams, cost: c.cost });
        t.createdLot = c.id; t.createdCost = c.cost;
        t.delta = c.grams; t.amount = c.cost; t.purchases = c.cost; t.price = c.price;
      } else if (c.type === 'return') {
        const sale = sales.get(c.saleId);
        if (!sale || sale.voidedBy) fail('The original sale could not be found or has been reversed.');
        integer(c.grams, 'Return weight', false);
        if (typeof c.restock !== 'boolean') fail('Choose whether the returned fruit is sellable.');
        if (sale.returned + c.grams > sale.grams) fail('Return weight exceeds the remaining returnable weight.');
        item = items.get(sale.fruitId);
        const refund = ratio(sale.amount, sale.returned + c.grams, sale.grams) - ratio(sale.amount, sale.returned, sale.grams);
        const cost = ratio(sale.cogs, sale.returned + c.grams, sale.grams) - ratio(sale.cogs, sale.returned, sale.grams);
        sale.returned += c.grams;
        t.revenue = -refund; t.cogs = -cost; t.amount = refund; t.saleId = c.saleId; t.restock = c.restock;
        if (c.restock) { item.lots.push({ id: c.id, grams: c.grams, cost }); t.delta = c.grams; t.createdLot = c.id; t.createdCost = cost; }
        else { t.loss = cost; t.waste = cost; }
        t.grams = c.grams;
      } else {
        item = items.get(c.fruitId);
        if (!item) fail('Choose an existing fruit.');
        if (c.type === 'sale') {
          integer(c.price, 'Selling price');
          const used = take(item, c.grams); t.cogs = used.cost; t.portions = used.portions; t.amount = ratio(c.price, c.grams, 1000); t.revenue = t.amount; t.delta = -c.grams; t.price = c.price; t.returned = 0;
          sales.set(c.id, t);
        } else if (c.type === 'spoilage') {
          text(c.note, 'Reason', 300);
          const used = take(item, c.grams); t.loss = used.cost; t.portions = used.portions; t.waste = t.loss; t.amount = t.loss; t.delta = -c.grams;
        } else if (c.type === 'adjustment') {
          integer(c.counted, 'Counted weight'); text(c.note, 'Reason', 300);
          t.beforeStock = correctedFrom ? records.get(correctedFrom).beforeStock : stock(item);
          t.delta = c.counted - t.beforeStock;
          if (!t.delta) fail('Counted stock already matches inventory. No adjustment is needed.');
          if (t.delta < 0) { const used = take(item, -t.delta); t.loss = used.cost; t.portions = used.portions; t.discrepancy = t.loss; t.amount = t.loss; }
          else { integer(c.costRate, 'Cost per unit'); t.amount = ratio(c.costRate, t.delta, 1000); item.lots.push({ id: c.id, grams: t.delta, cost: t.amount }); t.createdLot = c.id; t.createdCost = t.amount; }
        } else if (c.type === 'settings') {
          integer(c.price, 'Selling price'); integer(c.lowStock, 'Low-stock threshold');
          t.previousPrice = item.price; t.previousLowStock = item.lowStock;
          item.price = c.price; item.lowStock = c.lowStock; t.price = c.price; t.lowStock = c.lowStock;
        } else fail('Unknown transaction type.');
      }
      integer(stock(item), 'Total stock'); integer(value(item), 'Inventory value');
      t.fruitId = item.id; t.name = item.name; t.grams = t.grams || Math.abs(t.delta);
      transactions.push(t);
      records.set(t.id, t);
      if (c.type === 'correction') apply({ ...c.replacement, id: t.replacementId, at: c.at, day: c.day }, c.targetId);
    }
    for (const command of data.commands) apply(command);
    return { items: [...items.values()], transactions, sales: [...sales.values()] };
  }
  function append(data, command, revision) {
    if (data.commands.some(c => c.id === command.id)) return data;
    if (revision !== data.revision) fail('Your ledger changed in another tab. Review the refreshed stock and try again.');
    const next = { ...data, version: 2, revision: data.revision + 1, commands: [...data.commands, command] };
    replay(next); return next;
  }
  function summary(derived, date) {
    const ts = derived.transactions.filter(t => t.day === date);
    const revenue = ts.reduce((s, t) => s + t.revenue, 0);
    const loss = ts.reduce((s, t) => s + t.loss, 0);
    const cogs = ts.reduce((s, t) => s + t.cogs, 0);
    return { stock: derived.items.reduce((s, i) => s + stock(i), 0), value: derived.items.reduce((s, i) => s + value(i), 0), revenue, loss, profit: revenue - cogs - loss, cogs };
  }
  function backup(raw) {
    if (typeof raw !== 'string' || raw.length > 20 * 1024 * 1024) fail('Choose a JSON backup smaller than 20 MB.');
    let parsed; try { parsed = JSON.parse(raw); } catch { fail('The file is not valid JSON.'); }
    replay(parsed);
    // Retain only the documented state shape.
    return { version: parsed.version, revision: parsed.revision, mode: parsed.mode, unit: parsed.unit, commands: parsed.commands };
  }
  function daily(derived, date) {
    if (!validDay(date)) fail('Choose a valid summary date.');
    const ts = derived.transactions.filter(t => t.day === date), sum = key => ts.reduce((n,t)=>n+(t[key]||0),0);
    const closingStock = derived.transactions.filter(t=>t.day<=date).reduce((n,t)=>n+t.delta,0);
    const change = sum('delta'), waste = sum('waste'), discrepancy = sum('discrepancy'), revenue = sum('revenue'), cogs = sum('cogs');
    return { revenue, cogs, waste, discrepancy, purchases: sum('purchases'), profit: revenue-cogs-waste-discrepancy, change, openingStock: closingStock-change, closingStock, transactions: ts };
  }
  // Read-only projection: all quantities remain whole grams. Do not use an
  // original entry's current voided/returned status to rewrite earlier dates.
  function dailyByFruit(derived, date) {
    if (!validDay(date)) fail('Choose a valid summary date.');
    const records = new Map(derived.transactions.map(t => [t.id, t]));
    const rows = new Map();
    for (const t of derived.transactions) {
      if (t.day > date || t.type === 'settings') continue;
      if (!rows.has(t.fruitId)) rows.set(t.fruitId, {
        fruitId: t.fruitId, name: t.name, opening: 0, purchased: 0,
        sold: 0, wasted: 0, returned: 0, countChange: 0, remaining: 0
      });
      const r = rows.get(t.fruitId);
      r.remaining += t.delta;
      if (t.day < date) { r.opening += t.delta; continue; }
      const original = t.type === 'void' ? records.get(t.targetId) : t;
      const sign = t.type === 'void' ? -1 : 1;
      if (original.type === 'purchase') r.purchased += sign * original.grams;
      if (original.type === 'sale') r.sold += sign * original.grams;
      if (original.type === 'spoilage') r.wasted += sign * original.grams;
      if (original.type === 'return') {
        r.returned += sign * original.grams;
        r.sold -= sign * original.grams;
        if (!original.restock) r.wasted += sign * original.grams;
      }
      if (original.type === 'adjustment') r.countChange += t.delta;
    }
    return [...rows.values()];
  }
  function demo(now = new Date()) {
    const data = empty('demo'); let n = 0;
    function add(type, payload, ago, hour = 10, minute = 0) {
      const d = new Date(now); d.setDate(d.getDate() - ago); d.setHours(hour, minute, 0, 0);
      const c = { id: `demo-${++n}`, type, at: d.toISOString(), day: day(d), ...payload };
      data.commands.push(c); return c.id;
    }
    const fruits = [ ['Gala apples', 70000, 16800, 490], ['Cavendish bananas', 55000, 8250, 320], ['Navel oranges', 65000, 13000, 450], ['Strawberries', 24000, 14400, 1200], ['Green grapes', 45000, 13500, 590] ];
    const ids = fruits.map(([name, g, cost, price]) => add('purchase', { name, grams: g, cost, price }, 7));
    const daily = [[5000,4000,6000,1500,3000],[6500,5000,4500,2000,3500],[4000,3500,5000,1800,2500],[7000,6000,6500,2200,4000],[6000,5000,6000,2500,3500],[8000,6500,7000,3000,4500],[5500,4500,6500,2000,3000]];
    daily.forEach((weights, d) => weights.forEach((g, i) => add('sale', { fruitId: ids[i], grams:g, price: fruits[i][3] }, 6-d, 9 + i, 10 + d * 3)));
    add('spoilage', { fruitId: ids[3], grams: 800, note: 'Bruised during display' }, 0, 14, 10);
    add('spoilage', { fruitId: ids[1], grams: 600, note: 'Overripe fruit' }, 0, 14, 35);
    const saleId = add('sale', { fruitId: ids[4], grams: 1500, price: 590 }, 0, 15, 20);
    add('return', { saleId, grams: 500, restock: true, note: 'Customer bought too much' }, 0, 15, 45);
    add('settings', { fruitId: ids[3], price: 1200, lowStock: 10000 }, 0, 8, 0);
    add('settings', { fruitId: ids[4], price: 590, lowStock: 25000 }, 0, 8, 1);
    replay(data); return data;
  }
  return { MAX, decimal, grams, cents, rate, ratio, day, validDay, empty, stock, value, replay, append, summary, daily, dailyByFruit, backup, demo };
});
