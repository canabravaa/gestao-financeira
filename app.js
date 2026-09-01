/* ===================== Utils ===================== */
function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
}
function fmtMoney(v) {
  return (v < 0 ? '-' : '') + Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function currentMonthKey() {
  return todayISO().slice(0, 7);
}
function monthKeyOf(dateISO) {
  return dateISO.slice(0, 7);
}
function addMonths(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function dayLabel(dateISO) {
  const d = new Date(dateISO + 'T00:00:00');
  const s = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', weekday: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ===================== Storage ===================== */
const KEYS = { categories: 'gf.categories', cards: 'gf.cards', transactions: 'gf.transactions', installments: 'gf.installments' };
function load(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } }
function save(key, arr) { localStorage.setItem(key, JSON.stringify(arr)); }

const DEFAULT_CATEGORIES = [
  { id: uid(), type: 'expense', name: 'Alimentação', icon: '🍔', color: '#ef4444' },
  { id: uid(), type: 'expense', name: 'Transporte', icon: '🚗', color: '#f97316' },
  { id: uid(), type: 'expense', name: 'Moradia', icon: '🏠', color: '#a855f7' },
  { id: uid(), type: 'expense', name: 'Saúde', icon: '⚕️', color: '#ec4899' },
  { id: uid(), type: 'expense', name: 'Lazer', icon: '🎮', color: '#06b6d4' },
  { id: uid(), type: 'expense', name: 'Educação', icon: '📚', color: '#3b82f6' },
  { id: uid(), type: 'expense', name: 'Compras', icon: '🛍️', color: '#14b8a6' },
  { id: uid(), type: 'expense', name: 'Assinaturas', icon: '🔁', color: '#8b5cf6' },
  { id: uid(), type: 'expense', name: 'Contas', icon: '🧾', color: '#f59e0b' },
  { id: uid(), type: 'expense', name: 'Outros', icon: '📦', color: '#6b7280' },
  { id: uid(), type: 'income', name: 'Salário', icon: '💰', color: '#22c55e' },
  { id: uid(), type: 'income', name: 'Extra', icon: '✨', color: '#16a34a' },
];

const ICON_CHOICES = ['🍔','🚗','🏠','⚕️','🎮','📚','🛍️','🔁','🧾','📦','💰','✨','🐶','✈️','🎁','💻','🧴','🏋️','🍺','☕','🎓','🧒','🔧','💳'];
const COLOR_CHOICES = ['#ef4444','#f97316','#f59e0b','#84cc16','#22c55e','#14b8a6','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#a855f7','#ec4899','#6b7280'];
const CARD_COLORS = ['#4f46e5','#7c3aed','#0f172a','#0891b2','#be123c','#15803d','#b45309'];

const PAY_METHODS = [
  { id: 'dinheiro', label: 'Dinheiro', icon: '💵' },
  { id: 'pix', label: 'Pix', icon: '⚡' },
  { id: 'debito', label: 'Débito', icon: '💳' },
  { id: 'credito', label: 'Crédito', icon: '🏦' },
];

/* ===================== State ===================== */
const state = {
  tab: 'home',
  month: currentMonthKey(),
  categories: [],
  cards: [],
  transactions: [],
  installments: [],
  sheet: null, // {type: 'transaction'|'card'|'category', data: {...}}
  catTypeFilter: 'expense',
  openCardId: null,
};

function seedIfNeeded() {
  if (!localStorage.getItem(KEYS.categories)) save(KEYS.categories, DEFAULT_CATEGORIES);
}
function loadState() {
  seedIfNeeded();
  state.categories = load(KEYS.categories);
  state.cards = load(KEYS.cards);
  state.transactions = load(KEYS.transactions);
  state.installments = load(KEYS.installments);
}
function persist() {
  save(KEYS.categories, state.categories);
  save(KEYS.cards, state.cards);
  save(KEYS.transactions, state.transactions);
  save(KEYS.installments, state.installments);
}

function catById(id) { return state.categories.find(c => c.id === id); }
function cardById(id) { return state.cards.find(c => c.id === id); }

/* ===================== Domain logic ===================== */
// Gera as alocações de fatura (parcelas) de uma compra no cartão.
// A soma sempre bate com o valor total da compra (ajuste de arredondamento na última parcela).
function generateInstallments(tx) {
  if (tx.paymentMethod !== 'credito') return [];
  const n = Math.max(1, tx.installmentsCount || 1);
  const card = cardById(tx.cardId);
  const purchase = new Date(tx.date + 'T00:00:00');
  let firstOffset = 1;
  if (card && card.closingDay) {
    firstOffset = purchase.getDate() <= card.closingDay ? 1 : 2;
  }
  const base = Math.floor((tx.amount / n) * 100) / 100;
  const remainder = Math.round((tx.amount - base * n) * 100) / 100;
  const out = [];
  for (let i = 1; i <= n; i++) {
    const due = new Date(purchase.getFullYear(), purchase.getMonth() + firstOffset + (i - 1), 1);
    const amount = i === n ? Math.round((base + remainder) * 100) / 100 : base;
    out.push({
      id: uid(),
      transactionId: tx.id,
      cardId: tx.cardId,
      number: i,
      of: n,
      amount,
      dueMonth: due.getFullYear() + '-' + String(due.getMonth() + 1).padStart(2, '0'),
    });
  }
  return out;
}

function upsertTransaction(tx) {
  const idx = state.transactions.findIndex(t => t.id === tx.id);
  if (idx >= 0) state.transactions[idx] = tx; else state.transactions.push(tx);
  state.installments = state.installments.filter(i => i.transactionId !== tx.id);
  state.installments.push(...generateInstallments(tx));
  persist();
}
function deleteTransaction(id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  state.installments = state.installments.filter(i => i.transactionId !== id);
  persist();
}

function monthTransactions(monthKey) {
  return state.transactions.filter(t => monthKeyOf(t.date) === monthKey).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
}
function monthTotals(monthKey) {
  const txs = monthTransactions(monthKey);
  let expense = 0, income = 0;
  for (const t of txs) { if (t.type === 'expense') expense += t.amount; else income += t.amount; }
  return { expense, income, balance: income - expense, txs };
}
function categoryBreakdown(monthKey) {
  const txs = monthTransactions(monthKey).filter(t => t.type === 'expense');
  const map = new Map();
  for (const t of txs) {
    map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amount);
  }
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  return [...map.entries()]
    .map(([categoryId, amount]) => ({ category: catById(categoryId), amount, pct: total ? (amount / total) * 100 : 0 }))
    .filter(x => x.category)
    .sort((a, b) => b.amount - a.amount);
}
function cardCommitted(cardId) {
  // soma das parcelas futuras (a partir do mês atual) já registradas para esse cartão
  const cur = currentMonthKey();
  return state.installments.filter(i => i.cardId === cardId && i.dueMonth >= cur).reduce((a, b) => a + b.amount, 0);
}
function cardInvoices(cardId, count = 6) {
  const start = currentMonthKey();
  const months = [];
  for (let i = 0; i < count; i++) months.push(addMonths(start, i));
  return months.map(m => ({
    month: m,
    total: state.installments.filter(i => i.cardId === cardId && i.dueMonth === m).reduce((a, b) => a + b.amount, 0),
  }));
}

/* ===================== Rendering ===================== */
const app = document.getElementById('app');

function render() {
  const parts = [];
  parts.push(renderTopbar());
  if (state.tab === 'home') parts.push(renderHome());
  else if (state.tab === 'lancamentos') parts.push(renderLancamentos());
  else if (state.tab === 'cartoes') parts.push(renderCartoes());
  else if (state.tab === 'categorias') parts.push(renderCategorias());
  parts.push(renderFab());
  parts.push(renderBottomNav());
  if (state.sheet) parts.push(renderSheet());
  app.innerHTML = parts.join('');
  afterRender();
}

function renderTopbar() {
  const titles = { home: 'Início', lancamentos: 'Lançamentos', cartoes: 'Cartões', categorias: 'Categorias' };
  const showMonth = state.tab === 'home' || state.tab === 'lancamentos';
  return `
  <div class="topbar">
    <h1>${titles[state.tab]}</h1>
    ${showMonth ? `
    <div class="month-switcher">
      <button data-action="month-prev">‹</button>
      <div class="month-label">${monthLabel(state.month)}</div>
      <button data-action="month-next">›</button>
    </div>` : ''}
  </div>`;
}

function renderFab() {
  return `<button class="fab" data-action="open-add-tx">+</button>`;
}

function renderBottomNav() {
  const items = [
    { id: 'home', ic: '🏠', label: 'Início' },
    { id: 'lancamentos', ic: '📋', label: 'Lançamentos' },
    { id: 'cartoes', ic: '💳', label: 'Cartões' },
    { id: 'categorias', ic: '🏷️', label: 'Categorias' },
  ];
  return `
  <div class="bottom-nav">
    <div class="bottom-nav-inner">
      ${items.map(i => `
        <button class="nav-btn ${state.tab === i.id ? 'active' : ''}" data-action="set-tab" data-tab="${i.id}">
          <span class="ic">${i.ic}</span>
          <span>${i.label}</span>
        </button>
      `).join('')}
    </div>
  </div>`;
}

function renderHome() {
  const { expense, income, balance, txs } = monthTotals(state.month);
  const breakdown = categoryBreakdown(state.month);
  const recent = txs.slice(0, 5);
  return `
  <section class="view">
    <div class="summary-card">
      <div class="row"><span class="label">Gastos do mês</span><span class="value big">${fmtMoney(expense)}</span></div>
      <div class="divider"></div>
      <div class="row"><span class="label">Receitas</span><span class="value">${fmtMoney(income)}</span></div>
      <div class="row"><span class="label">Saldo</span><span class="value">${fmtMoney(balance)}</span></div>
    </div>

    <div class="section-title">Por categoria</div>
    <div class="card">
      ${breakdown.length === 0 ? `<div class="hint">Nenhum gasto registrado neste mês.</div>` : breakdown.map(b => `
        <div class="cat-row">
          <div class="top">
            <span class="name">${b.category.icon} ${escapeHtml(b.category.name)}</span>
            <span class="amount">${fmtMoney(b.amount)} · ${b.pct.toFixed(0)}%</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${b.pct}%;background:${b.category.color}"></div></div>
        </div>
      `).join('')}
    </div>

    <div class="section-title">Últimos lançamentos <a data-action="set-tab" data-tab="lancamentos">ver todos</a></div>
    ${recent.length === 0 ? emptyState('🧾', 'Sem lançamentos', 'Toque em + para adicionar o primeiro.') : `<div class="tx-list">${recent.map(renderTxRow).join('')}</div>`}
  </section>`;
}

function emptyState(icon, title, sub) {
  return `<div class="empty-state"><div class="icon">${icon}</div><div class="title">${title}</div><div>${sub}</div></div>`;
}

function renderTxRow(t) {
  const cat = catById(t.categoryId) || { icon: '❓', color: '#999', name: '—' };
  const pay = PAY_METHODS.find(p => p.id === t.paymentMethod);
  const card = t.cardId ? cardById(t.cardId) : null;
  let sub = pay ? pay.label : '';
  if (t.paymentMethod === 'credito') {
    sub = (card ? card.name : 'Cartão');
    if (t.installmentsCount > 1) sub += ` · <span class="badge">${t.installmentsCount}x de ${fmtMoney(t.amount / t.installmentsCount)}</span>`;
  }
  return `
  <div class="tx-row" data-action="edit-tx" data-id="${t.id}">
    <div class="tx-icon" style="background:${cat.color}22;color:${cat.color}">${cat.icon}</div>
    <div class="tx-mid">
      <div class="tx-desc">${escapeHtml(t.description || cat.name)}</div>
      <div class="tx-sub">${sub}</div>
    </div>
    <div class="tx-amount ${t.type}">${t.type === 'expense' ? '-' : '+'}${fmtMoney(t.amount)}</div>
  </div>`;
}

function renderLancamentos() {
  const txs = monthTransactions(state.month);
  if (txs.length === 0) {
    return `<section class="view">${emptyState('📋', 'Nada por aqui', 'Nenhum lançamento neste mês ainda.')}</section>`;
  }
  const groups = new Map();
  for (const t of txs) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  return `
  <section class="view">
    ${[...groups.entries()].map(([date, items]) => `
      <div class="day-group">
        <div class="day-header">${dayLabel(date)}</div>
        <div class="tx-list">${items.map(renderTxRow).join('')}</div>
      </div>
    `).join('')}
  </section>`;
}

function renderCartoes() {
  if (state.openCardId) {
    const card = cardById(state.openCardId);
    if (!card) { state.openCardId = null; }
    else {
      const invoices = cardInvoices(card.id, 6);
      return `
      <section class="view">
        <button class="btn secondary" data-action="close-card-detail" style="margin-bottom:14px">‹ Voltar</button>
        <div class="ccard" style="background:${card.color}">
          <div class="ccard-name">${escapeHtml(card.name)}</div>
          <div class="ccard-sub">Fecha dia ${card.closingDay || '—'} · Vence dia ${card.dueDay || '—'}</div>
          <div class="ccard-total-label">Comprometido (a partir de agora)</div>
          <div class="ccard-total">${fmtMoney(cardCommitted(card.id))}</div>
        </div>
        <div class="section-title">Próximas faturas</div>
        <div class="card" style="padding:0">
          ${invoices.map(inv => `
            <div class="invoice-row">
              <div class="m">${monthLabel(inv.month)}</div>
              <div class="v">${fmtMoney(inv.total)}</div>
            </div>
          `).join('')}
        </div>
        <div class="hint" style="margin:14px 4px 0">Esses valores mostram quanto vai cair na fatura em cada mês. O total da compra já conta como gasto no mês em que ela foi feita, na tela Início.</div>
        <button class="btn danger" data-action="delete-card" data-id="${card.id}" style="margin-top:20px">Excluir cartão</button>
      </section>`;
    }
  }
  return `
  <section class="view">
    ${state.cards.length === 0 ? emptyState('💳', 'Nenhum cartão', 'Adicione um cartão para acompanhar as faturas.') : state.cards.map(c => `
      <div class="ccard" style="background:${c.color}" data-action="open-card-detail" data-id="${c.id}">
        <div class="ccard-name">${escapeHtml(c.name)}</div>
        <div class="ccard-sub">Fecha dia ${c.closingDay || '—'} · Vence dia ${c.dueDay || '—'}</div>
        <div class="ccard-total-label">Comprometido</div>
        <div class="ccard-total">${fmtMoney(cardCommitted(c.id))}</div>
      </div>
    `).join('')}
    <button class="btn secondary" data-action="open-add-card" style="margin-top:8px">+ Novo cartão</button>
  </section>`;
}

function renderCategorias() {
  const list = state.categories.filter(c => c.type === state.catTypeFilter);
  return `
  <section class="view">
    <div class="tabs-2">
      <button class="${state.catTypeFilter === 'expense' ? 'active' : ''}" data-action="set-cat-filter" data-val="expense">Despesas</button>
      <button class="${state.catTypeFilter === 'income' ? 'active' : ''}" data-action="set-cat-filter" data-val="income">Receitas</button>
    </div>
    <div class="chip-grid">
      ${list.map(c => `
        <div class="chip del">
          <span>${c.icon} ${escapeHtml(c.name)}</span>
          <span class="x" data-action="delete-category" data-id="${c.id}">✕</span>
        </div>
      `).join('')}
    </div>
    <button class="btn secondary" data-action="open-add-category" style="margin-top:18px">+ Nova categoria</button>
  </section>`;
}

/* ===================== Sheets (modals) ===================== */
function renderSheet() {
  const s = state.sheet;
  let body = '';
  if (s.type === 'transaction') body = txSheetBody(s.data);
  else if (s.type === 'card') body = cardSheetBody(s.data);
  else if (s.type === 'category') body = categorySheetBody(s.data);
  return `
  <div class="sheet-overlay" data-action="close-sheet-overlay">
    <div class="sheet" data-action="noop">
      <div class="sheet-handle"></div>
      ${body}
    </div>
  </div>`;
}

function txSheetBody(d) {
  const isEdit = !!d.id;
  const expenseCats = state.categories.filter(c => c.type === d.type);
  const creditCards = state.cards;
  return `
  <h2>${isEdit ? 'Editar lançamento' : 'Novo lançamento'}</h2>
  <div class="field">
    <div class="toggle-2">
      <button type="button" class="${d.type === 'expense' ? 'active expense' : ''}" data-action="tx-set-type" data-val="expense">Despesa</button>
      <button type="button" class="${d.type === 'income' ? 'active income' : ''}" data-action="tx-set-type" data-val="income">Receita</button>
    </div>
  </div>
  <div class="field">
    <label>Valor total</label>
    <input class="amount-input" id="f-amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0,00" value="${d.amount || ''}">
  </div>
  <div class="field">
    <label>Descrição</label>
    <input id="f-desc" type="text" placeholder="Ex: Supermercado" value="${escapeHtml(d.description || '')}">
  </div>
  <div class="field">
    <label>Data</label>
    <input id="f-date" type="date" value="${d.date}">
  </div>
  <div class="field">
    <label>Categoria</label>
    <div class="chip-grid">
      ${expenseCats.map(c => `<div class="chip ${d.categoryId === c.id ? 'selected' : ''}" data-action="tx-set-cat" data-id="${c.id}">${c.icon} ${escapeHtml(c.name)}</div>`).join('') || '<div class="hint">Crie categorias na aba Categorias.</div>'}
    </div>
  </div>
  <div class="field">
    <label>Forma de pagamento</label>
    <div class="pay-grid">
      ${PAY_METHODS.map(p => `
        <div class="pay-opt ${d.paymentMethod === p.id ? 'selected' : ''}" data-action="tx-set-pay" data-val="${p.id}">
          <span class="ic">${p.icon}</span>${p.label}
        </div>
      `).join('')}
    </div>
  </div>
  ${d.paymentMethod === 'credito' ? `
  <div class="field">
    <label>Cartão</label>
    <select id="f-card">
      <option value="">Selecione...</option>
      ${creditCards.map(c => `<option value="${c.id}" ${d.cardId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
    </select>
    ${creditCards.length === 0 ? '<div class="hint">Nenhum cartão cadastrado — adicione um na aba Cartões.</div>' : ''}
  </div>
  <div class="field">
    <label>Parcelas</label>
    <input id="f-installments" type="number" min="1" max="36" value="${d.installmentsCount || 1}">
    <div class="hint">O valor total já conta como gasto no mês da compra. As parcelas ficam registradas para você acompanhar a fatura do cartão.</div>
  </div>
  ` : ''}
  <button class="btn" data-action="save-tx">Salvar</button>
  ${isEdit ? `<button class="btn danger" data-action="delete-tx" data-id="${d.id}" style="margin-top:10px">Excluir</button>` : ''}
  <button class="close-x" data-action="close-sheet">✕</button>
  `;
}

function cardSheetBody(d) {
  return `
  <h2>Novo cartão</h2>
  <div class="field">
    <label>Nome</label>
    <input id="f-cname" type="text" placeholder="Ex: Nubank" value="${escapeHtml(d.name || '')}">
  </div>
  <div class="field">
    <label>Dia de fechamento</label>
    <input id="f-closing" type="number" min="1" max="31" value="${d.closingDay || ''}">
  </div>
  <div class="field">
    <label>Dia de vencimento</label>
    <input id="f-due" type="number" min="1" max="31" value="${d.dueDay || ''}">
  </div>
  <div class="field">
    <label>Cor</label>
    <div class="color-grid">
      ${CARD_COLORS.map(c => `<div class="color-dot ${d.color === c ? 'selected' : ''}" style="background:${c}" data-action="card-set-color" data-val="${c}"></div>`).join('')}
    </div>
  </div>
  <button class="btn" data-action="save-card">Salvar</button>
  <button class="close-x" data-action="close-sheet">✕</button>
  `;
}

function categorySheetBody(d) {
  return `
  <h2>Nova categoria</h2>
  <div class="field">
    <div class="toggle-2">
      <button type="button" class="${d.type === 'expense' ? 'active expense' : ''}" data-action="cat-set-type" data-val="expense">Despesa</button>
      <button type="button" class="${d.type === 'income' ? 'active income' : ''}" data-action="cat-set-type" data-val="income">Receita</button>
    </div>
  </div>
  <div class="field">
    <label>Nome</label>
    <input id="f-catname" type="text" placeholder="Ex: Pets" value="${escapeHtml(d.name || '')}">
  </div>
  <div class="field">
    <label>Ícone</label>
    <div class="icon-grid">
      ${ICON_CHOICES.map(i => `<div class="icon-opt ${d.icon === i ? 'selected' : ''}" data-action="cat-set-icon" data-val="${i}">${i}</div>`).join('')}
    </div>
  </div>
  <div class="field">
    <label>Cor</label>
    <div class="color-grid">
      ${COLOR_CHOICES.map(c => `<div class="color-dot ${d.color === c ? 'selected' : ''}" style="background:${c}" data-action="cat-set-color" data-val="${c}"></div>`).join('')}
    </div>
  </div>
  <button class="btn" data-action="save-category">Salvar</button>
  <button class="close-x" data-action="close-sheet">✕</button>
  `;
}

/* ===================== Event handling ===================== */
function afterRender() {}

app.addEventListener('click', onClick);

// Antes de qualquer clique que possa disparar um re-render, guarda o que já
// estiver digitado nos campos da folha aberta — senão um clique num chip
// (categoria, forma de pagamento, etc.) reconstrói o HTML e apaga o texto.
function syncSheetInputs() {
  if (!state.sheet) return;
  const d = state.sheet.data;
  const fields = {
    'f-amount': 'amount', 'f-desc': 'description', 'f-date': 'date',
    'f-cname': 'name', 'f-closing': 'closingDay', 'f-due': 'dueDay',
    'f-catname': 'name', 'f-installments': 'installmentsCount',
  };
  for (const [id, key] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el) d[key] = el.value;
  }
}

function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  syncSheetInputs();
  const action = el.dataset.action;
  const d = state.sheet ? state.sheet.data : null;

  switch (action) {
    case 'set-tab':
      state.tab = el.dataset.tab;
      state.openCardId = null;
      render();
      break;
    case 'month-prev':
      state.month = addMonths(state.month, -1);
      render();
      break;
    case 'month-next':
      state.month = addMonths(state.month, 1);
      render();
      break;

    case 'open-add-tx': {
      const firstExpenseCat = state.categories.find(c => c.type === 'expense');
      state.sheet = { type: 'transaction', data: { type: 'expense', date: todayISO(), categoryId: firstExpenseCat ? firstExpenseCat.id : null, paymentMethod: 'dinheiro', installmentsCount: 1 } };
      render();
      break;
    }
    case 'edit-tx': {
      const tx = state.transactions.find(t => t.id === el.dataset.id);
      if (tx) { state.sheet = { type: 'transaction', data: { ...tx } }; render(); }
      break;
    }
    case 'tx-set-type': {
      d.type = el.dataset.val;
      const firstCat = state.categories.find(c => c.type === d.type);
      d.categoryId = firstCat ? firstCat.id : null;
      render();
      break;
    }
    case 'tx-set-cat':
      d.categoryId = el.dataset.id;
      render();
      break;
    case 'tx-set-pay':
      d.paymentMethod = el.dataset.val;
      if (d.paymentMethod !== 'credito') { d.cardId = null; d.installmentsCount = 1; }
      render();
      break;
    case 'save-tx': {
      const amount = parseFloat(document.getElementById('f-amount').value);
      const description = document.getElementById('f-desc').value.trim();
      const date = document.getElementById('f-date').value;
      if (!amount || amount <= 0) { alert('Informe um valor válido.'); return; }
      if (!date) { alert('Informe a data.'); return; }
      if (!d.categoryId) { alert('Escolha uma categoria.'); return; }
      if (d.paymentMethod === 'credito') {
        const cardSel = document.getElementById('f-card');
        d.cardId = cardSel ? cardSel.value : null;
        if (!d.cardId) { alert('Escolha o cartão.'); return; }
        const inst = document.getElementById('f-installments');
        d.installmentsCount = Math.max(1, parseInt(inst.value, 10) || 1);
      }
      const tx = {
        id: d.id || uid(),
        type: d.type,
        amount,
        description,
        date,
        categoryId: d.categoryId,
        paymentMethod: d.paymentMethod,
        cardId: d.paymentMethod === 'credito' ? d.cardId : null,
        installmentsCount: d.paymentMethod === 'credito' ? d.installmentsCount : 1,
        createdAt: d.createdAt || Date.now(),
      };
      upsertTransaction(tx);
      state.sheet = null;
      state.month = monthKeyOf(tx.date);
      render();
      break;
    }
    case 'delete-tx':
      if (confirm('Excluir este lançamento?')) {
        deleteTransaction(el.dataset.id);
        state.sheet = null;
        render();
      }
      break;

    case 'open-add-card':
      state.sheet = { type: 'card', data: { color: CARD_COLORS[0] } };
      render();
      break;
    case 'card-set-color':
      d.color = el.dataset.val;
      render();
      break;
    case 'save-card': {
      const name = document.getElementById('f-cname').value.trim();
      if (!name) { alert('Informe o nome do cartão.'); return; }
      const closingDay = parseInt(document.getElementById('f-closing').value, 10) || null;
      const dueDay = parseInt(document.getElementById('f-due').value, 10) || null;
      const card = { id: d.id || uid(), name, closingDay, dueDay, color: d.color || CARD_COLORS[0] };
      const idx = state.cards.findIndex(c => c.id === card.id);
      if (idx >= 0) state.cards[idx] = card; else state.cards.push(card);
      persist();
      state.sheet = null;
      render();
      break;
    }
    case 'open-card-detail':
      state.openCardId = el.dataset.id;
      render();
      break;
    case 'close-card-detail':
      state.openCardId = null;
      render();
      break;
    case 'delete-card':
      if (confirm('Excluir este cartão? Lançamentos feitos nele permanecem, mas perdem o vínculo.')) {
        const id = el.dataset.id;
        state.cards = state.cards.filter(c => c.id !== id);
        state.installments = state.installments.filter(i => i.cardId !== id);
        persist();
        state.openCardId = null;
        render();
      }
      break;

    case 'set-cat-filter':
      state.catTypeFilter = el.dataset.val;
      render();
      break;
    case 'open-add-category':
      state.sheet = { type: 'category', data: { type: state.catTypeFilter, icon: ICON_CHOICES[0], color: COLOR_CHOICES[0] } };
      render();
      break;
    case 'cat-set-type':
      d.type = el.dataset.val;
      render();
      break;
    case 'cat-set-icon':
      d.icon = el.dataset.val;
      render();
      break;
    case 'cat-set-color':
      d.color = el.dataset.val;
      render();
      break;
    case 'save-category': {
      const name = document.getElementById('f-catname').value.trim();
      if (!name) { alert('Informe o nome da categoria.'); return; }
      const cat = { id: d.id || uid(), type: d.type, name, icon: d.icon, color: d.color };
      const idx = state.categories.findIndex(c => c.id === cat.id);
      if (idx >= 0) state.categories[idx] = cat; else state.categories.push(cat);
      persist();
      state.sheet = null;
      render();
      break;
    }
    case 'delete-category': {
      const id = el.dataset.id;
      const inUse = state.transactions.some(t => t.categoryId === id);
      if (inUse) { alert('Essa categoria está em uso por lançamentos e não pode ser excluída.'); return; }
      if (confirm('Excluir esta categoria?')) {
        state.categories = state.categories.filter(c => c.id !== id);
        persist();
        render();
      }
      break;
    }

    case 'close-sheet':
      state.sheet = null;
      render();
      break;
    case 'close-sheet-overlay':
      state.sheet = null;
      render();
      break;
  }
}

/* ===================== Init ===================== */
loadState();
render();
