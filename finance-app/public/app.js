// ===== FinTrack — Personal Finance Tracker (API-backed) =====

(function () {
    'use strict';

    // ===== API Client =====
    const api = {
        async get(url) {
            const res = await fetch(url);
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        async post(url, data) {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Erro ao salvar'); }
            return res.json();
        },
        async put(url, data) {
            const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Erro ao atualizar'); }
            return res.json();
        },
        async del(url) {
            const res = await fetch(url, { method: 'DELETE' });
            if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Erro ao excluir'); }
            return res.json();
        }
    };

    // ===== Cache (in-memory for rendering) =====
    let categories = [];

    // ===== Helpers =====
    function $(sel) { return document.querySelector(sel); }
    function $$(sel) { return document.querySelectorAll(sel); }
    function genId() { return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

    function formatCurrency(val) {
        return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function getCurrentMonth() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    function getCategoryById(id) {
        return categories.find(c => c.id === id);
    }

    function showToast(msg) {
        const toast = $('#toast');
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ===== Month State =====
    let selectedMonth = getCurrentMonth();

    function changeMonth(delta) {
        const [y, m] = selectedMonth.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        selectedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        updateMonthLabel();
        refreshCurrentView();
    }

    function updateMonthLabel() {
        const [y, m] = selectedMonth.split('-').map(Number);
        const d = new Date(y, m - 1, 1);
        const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        const el = $('#month-label');
        if (el) el.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    }

    // ===== Navigation =====
    const views = { dashboard: 'Dashboard', transactions: 'Transações', categories: 'Categorias', budget: 'Orçamento', recurring: 'Recorrentes', reports: 'Relatórios' };

    function switchView(viewName) {
        $$('.view').forEach(v => v.classList.remove('active'));
        $$('.nav-btn').forEach(b => b.classList.remove('active'));
        $(`#view-${viewName}`).classList.add('active');
        $(`.nav-btn[data-view="${viewName}"]`).classList.add('active');
        $('#page-title').textContent = views[viewName];

        // Show month nav on relevant views
        const monthNav = $('#month-nav');
        if (monthNav) {
            monthNav.classList.toggle('visible', ['dashboard', 'budget'].includes(viewName));
        }

        if (viewName === 'dashboard') renderDashboard();
        if (viewName === 'transactions') renderTransactions();
        if (viewName === 'categories') renderCategories();
        if (viewName === 'budget') renderBudget();
        if (viewName === 'recurring') renderRecurring();
        if (viewName === 'reports') renderReports();
    }

    $$('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // ===== Modals =====
    function openModal(id) { $(`#${id}`).classList.add('active'); }
    function closeModal(id) { $(`#${id}`).classList.remove('active'); }

    $$('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    $$('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });

    // ===== Transaction Form =====
    let txType = 'expense';

    $('#btn-new-transaction').addEventListener('click', () => {
        $('#tx-id').value = '';
        $('#form-transaction').reset();
        $('#tx-date').value = new Date().toISOString().split('T')[0];
        txType = 'expense';
        updateTxTypeToggle();
        populateCategorySelect();
        $('#modal-transaction-title').textContent = 'Nova Transação';
        openModal('modal-transaction');
    });

    $$('#form-transaction .toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            txType = btn.dataset.type;
            updateTxTypeToggle();
            populateCategorySelect();
        });
    });

    function updateTxTypeToggle() {
        $$('#form-transaction .toggle-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.type === txType);
        });
    }

    function populateCategorySelect() {
        const sel = $('#tx-category');
        const cats = categories.filter(c => c.type === txType || c.type === 'both');
        sel.innerHTML = cats.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
    }

    $('#form-transaction').addEventListener('submit', async (e) => {
        e.preventDefault();
        const existingId = $('#tx-id').value;
        const id = existingId || genId();
        const data = {
            id,
            type: txType,
            description: $('#tx-description').value.trim(),
            amount: parseFloat($('#tx-amount').value),
            category_id: $('#tx-category').value,
            date: $('#tx-date').value,
            notes: $('#tx-notes').value.trim(),
        };

        try {
            if (existingId) {
                await api.put(`/api/transactions/${id}`, data);
                showToast('Transação atualizada!');
            } else {
                await api.post('/api/transactions', data);
                showToast('Transação adicionada!');
            }
            closeModal('modal-transaction');
            refreshCurrentView();
        } catch (err) {
            showToast('Erro: ' + err.message);
        }
    });

    async function editTransaction(id) {
        try {
            const tx = await api.get(`/api/transactions/${id}`);
            txType = tx.type;
            updateTxTypeToggle();
            populateCategorySelect();

            $('#tx-id').value = tx.id;
            $('#tx-description').value = tx.description;
            $('#tx-amount').value = tx.amount;
            $('#tx-category').value = tx.category_id;
            $('#tx-date').value = tx.date;
            $('#tx-notes').value = tx.notes || '';
            $('#modal-transaction-title').textContent = 'Editar Transação';
            openModal('modal-transaction');
        } catch (err) {
            showToast('Erro ao carregar transação');
        }
    }

    async function deleteTransaction(id) {
        if (!confirm('Excluir esta transação?')) return;
        try {
            await api.del(`/api/transactions/${id}`);
            showToast('Transação excluída');
            refreshCurrentView();
        } catch (err) {
            showToast('Erro: ' + err.message);
        }
    }

    // ===== Category Form =====
    let catType = 'expense';
    let catIcon = '🛒';

    $('#btn-new-category').addEventListener('click', () => {
        $('#form-category').reset();
        catType = 'expense';
        catIcon = '🛒';
        updateCatTypeToggle();
        updateIconPicker();
        $('#cat-color').value = '#6366f1';
        openModal('modal-category');
    });

    $$('#form-category .toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            catType = btn.dataset.cattype;
            updateCatTypeToggle();
        });
    });

    function updateCatTypeToggle() {
        $$('#form-category .toggle-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.cattype === catType);
        });
    }

    $$('.icon-option').forEach(btn => {
        btn.addEventListener('click', () => {
            catIcon = btn.dataset.icon;
            updateIconPicker();
        });
    });

    function updateIconPicker() {
        $$('.icon-option').forEach(b => {
            b.classList.toggle('selected', b.dataset.icon === catIcon);
        });
    }

    $('#form-category').addEventListener('submit', async (e) => {
        e.preventDefault();
        const cat = {
            id: genId(),
            name: $('#cat-name').value.trim(),
            icon: catIcon,
            color: $('#cat-color').value,
            type: catType,
        };
        try {
            await api.post('/api/categories', cat);
            categories.push(cat);
            showToast('Categoria criada!');
            closeModal('modal-category');
            renderCategories();
        } catch (err) {
            showToast('Erro: ' + err.message);
        }
    });

    async function deleteCategory(id) {
        if (!confirm('Excluir esta categoria?')) return;
        try {
            await api.del(`/api/categories/${id}`);
            categories = categories.filter(c => c.id !== id);
            showToast('Categoria excluída');
            renderCategories();
        } catch (err) {
            showToast(err.message);
        }
    }

    // Global handlers
    window._editTx = editTransaction;
    window._deleteTx = deleteTransaction;
    window._deleteCat = deleteCategory;

    // ===== Render: Transaction Row =====
    function renderTxRow(tx, showActions = true) {
        const cat = getCategoryById(tx.category_id);
        const icon = cat ? cat.icon : '❓';
        const catName = cat ? cat.name : 'Sem categoria';
        const color = cat ? cat.color : '#666';
        const sign = tx.type === 'income' ? '+' : '-';

        return `
            <div class="tx-row">
                <div class="tx-icon" style="background:${color}22">${icon}</div>
                <div class="tx-info">
                    <div class="tx-desc">${escapeHtml(tx.description)}</div>
                    <div class="tx-meta">${catName} · ${formatDate(tx.date)}${tx.notes ? ' · ' + escapeHtml(tx.notes) : ''}</div>
                </div>
                <div class="tx-amount ${tx.type}">${sign} ${formatCurrency(tx.amount)}</div>
                ${showActions ? `
                <div class="tx-actions">
                    <button class="btn-icon" onclick="window._editTx('${tx.id}')" title="Editar">✏️</button>
                    <button class="btn-icon danger" onclick="window._deleteTx('${tx.id}')" title="Excluir">🗑️</button>
                </div>` : ''}
            </div>
        `;
    }

    // ===== Render: Dashboard =====
    async function renderDashboard() {
        const month = selectedMonth;

        try {
            const [stats, recentTxs, monthlyData, catData] = await Promise.all([
                api.get(`/api/stats/summary?month=${month}`),
                api.get(`/api/transactions?month=${month}&limit=5`),
                api.get('/api/stats/monthly?months_back=6'),
                api.get(`/api/stats/by-category?month=${month}&type=expense`),
            ]);

            $('#total-balance').textContent = formatCurrency(stats.balance);
            $('#total-income').textContent = formatCurrency(stats.monthIncome);
            $('#total-expenses').textContent = formatCurrency(stats.monthExpenses);
            $('#total-savings').textContent = formatCurrency(stats.monthSavings);

            if (recentTxs.length === 0 && stats.balance === 0) {
                // Onboarding empty state
                $('#recent-transactions').innerHTML = `
                    <div class="onboarding">
                        <h2>Bem-vindo ao FinTrack!</h2>
                        <p>Comece a controlar suas finanças em poucos passos.</p>
                        <div class="onboarding-actions">
                            <div class="onboarding-card" onclick="document.getElementById('btn-new-transaction').click()">
                                <span class="ob-icon">💸</span>
                                <span class="ob-label">Adicionar Gasto</span>
                                <span class="ob-desc">Registre sua primeira despesa</span>
                            </div>
                            <div class="onboarding-card" onclick="document.querySelector('[data-view=budget]').click()">
                                <span class="ob-icon">🎯</span>
                                <span class="ob-label">Criar Orçamento</span>
                                <span class="ob-desc">Defina limites mensais</span>
                            </div>
                            <div class="onboarding-card" onclick="document.querySelector('[data-view=recurring]').click()">
                                <span class="ob-icon">🔄</span>
                                <span class="ob-label">Gastos Fixos</span>
                                <span class="ob-desc">Configure contas recorrentes</span>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                $('#recent-transactions').innerHTML = recentTxs.length
                    ? recentTxs.map(tx => renderTxRow(tx, false)).join('')
                    : '<div class="empty-state">Nenhuma transação neste mês.</div>';
            }

            renderCategoryChart(catData);
            renderMonthlyChart(monthlyData);
        } catch (err) {
            showToast('Erro ao carregar dashboard');
            console.error(err);
        }
    }

    // ===== Render: Transactions =====
    async function renderTransactions() {
        populateFilterCategory();
        await applyFilters();
    }

    function populateFilterCategory() {
        const sel = $('#filter-category');
        const current = sel.value;
        sel.innerHTML = '<option value="all">Todas as categorias</option>' +
            categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
        sel.value = current || 'all';
    }

    async function applyFilters() {
        const search = $('#filter-search').value;
        const type = $('#filter-type').value;
        const category = $('#filter-category').value;
        const month = $('#filter-month').value;

        const params = new URLSearchParams();
        if (type !== 'all') params.set('type', type);
        if (category !== 'all') params.set('category_id', category);
        if (month) params.set('month', month);
        if (search) params.set('search', search);

        try {
            const txs = await api.get(`/api/transactions?${params}`);
            const container = $('#all-transactions');
            const empty = $('#no-transactions');

            if (txs.length === 0) {
                container.innerHTML = '';
                empty.style.display = 'block';
            } else {
                empty.style.display = 'none';
                container.innerHTML = txs.map(tx => renderTxRow(tx, true)).join('');
            }
        } catch (err) {
            showToast('Erro ao buscar transações');
        }
    }

    let filterTimeout;
    ['filter-search', 'filter-type', 'filter-category', 'filter-month'].forEach(id => {
        $(`#${id}`).addEventListener('input', () => {
            clearTimeout(filterTimeout);
            filterTimeout = setTimeout(applyFilters, 300);
        });
        $(`#${id}`).addEventListener('change', applyFilters);
    });

    // ===== Render: Categories =====
    async function renderCategories() {
        try {
            const txs = await api.get('/api/transactions');
            const totals = {};
            txs.forEach(t => { totals[t.category_id] = (totals[t.category_id] || 0) + t.amount; });

            const grid = $('#categories-grid');
            grid.innerHTML = categories.map(cat => {
                const total = totals[cat.id] || 0;
                const typeLabel = { expense: 'Despesa', income: 'Receita', both: 'Ambos' }[cat.type];
                return `
                    <div class="category-card">
                        <button class="cat-delete" onclick="window._deleteCat('${cat.id}')" title="Excluir">✕</button>
                        <div class="cat-icon" style="background:${cat.color}22">${cat.icon}</div>
                        <div class="cat-name">${escapeHtml(cat.name)}</div>
                        <div class="cat-type">${typeLabel}</div>
                        <div class="cat-total">${formatCurrency(total)}</div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            showToast('Erro ao carregar categorias');
        }
    }

    // ===== Render: Reports =====
    async function renderReports() {
        const monthsBack = parseInt($('#report-period').value);
        const now = new Date();
        const monthKeys = [];
        for (let i = monthsBack - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }

        try {
            const [monthlyData, catData] = await Promise.all([
                api.get(`/api/stats/monthly?months_back=${monthsBack}`),
                api.get(`/api/stats/by-category?type=expense&months=${monthKeys.join(',')}`),
            ]);

            let totalIncome = 0, totalExpense = 0;
            monthlyData.forEach(m => { totalIncome += m.income; totalExpense += m.expense; });

            const avgIncome = totalIncome / monthsBack;
            const avgExpense = totalExpense / monthsBack;
            const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100) : 0;

            $('#avg-income').textContent = formatCurrency(avgIncome);
            $('#avg-expenses').textContent = formatCurrency(avgExpense);
            $('#savings-rate').textContent = savingsRate.toFixed(1) + '%';

            renderComparisonChart(monthlyData);
            renderTopCategories(catData);
        } catch (err) {
            showToast('Erro ao carregar relatórios');
            console.error(err);
        }
    }

    $('#report-period').addEventListener('change', renderReports);

    // ===== Render: Budget =====
    async function renderBudget() {
        const month = selectedMonth;
        const monthInput = $('#budget-month');
        if (monthInput) monthInput.value = month;

        try {
            const [budgetStatus, stats] = await Promise.all([
                api.get(`/api/budgets/status?month=${month}`),
                api.get(`/api/stats/summary?month=${month}`),
            ]);

            const totalBudget = budgetStatus.reduce((s, b) => s + b.amount, 0);
            const totalSpent = budgetStatus.reduce((s, b) => s + b.spent, 0);
            const overallPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
            const pctClass = overallPct >= 90 ? 'danger' : overallPct >= 70 ? 'warning' : 'safe';

            $('#budget-summary').innerHTML = budgetStatus.length > 0 ? `
                <div class="card">
                    <span class="card-label">Orçamento Total</span>
                    <span class="card-value" style="color:var(--blue)">${formatCurrency(totalBudget)}</span>
                </div>
                <div class="card">
                    <span class="card-label">Gasto no Mês</span>
                    <span class="card-value" style="color:var(--red)">${formatCurrency(totalSpent)}</span>
                </div>
                <div class="card">
                    <span class="card-label">Restante</span>
                    <span class="card-value" style="color:var(--${pctClass})">${formatCurrency(totalBudget - totalSpent)}</span>
                </div>
                <div class="card">
                    <span class="card-label">Utilização</span>
                    <span class="card-value ${pctClass}" style="color:var(--${pctClass})">${overallPct}%</span>
                </div>
            ` : '';

            const list = $('#budget-list');
            const empty = $('#no-budgets');

            if (budgetStatus.length === 0) {
                list.innerHTML = '';
                empty.style.display = 'block';
            } else {
                empty.style.display = 'none';
                list.innerHTML = budgetStatus.map(b => {
                    const cat = getCategoryById(b.category_id);
                    const pct = b.percentage;
                    const cls = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'safe';
                    return `
                        <div class="budget-row">
                            <div class="tx-icon" style="background:${cat ? cat.color + '22' : '#66622'}">${cat ? cat.icon : '❓'}</div>
                            <div class="budget-info">
                                <div class="budget-cat-name">${cat ? escapeHtml(cat.name) : 'Outro'}</div>
                                <div class="budget-amounts">${formatCurrency(b.spent)} de ${formatCurrency(b.amount)}</div>
                            </div>
                            <div class="budget-bar-container">
                                <div class="budget-bar ${cls}" style="width:${Math.min(100, pct)}%"></div>
                            </div>
                            <div class="budget-pct ${cls}">${pct}%</div>
                            <button class="btn-icon danger" onclick="window._deleteBudget('${b.id}')" title="Remover">✕</button>
                        </div>
                    `;
                }).join('');
            }
        } catch (err) {
            showToast('Erro ao carregar orçamentos');
            console.error(err);
        }
    }

    $('#budget-month')?.addEventListener('change', (e) => {
        selectedMonth = e.target.value;
        updateMonthLabel();
        renderBudget();
    });

    // Budget form
    $('#btn-add-budget')?.addEventListener('click', () => {
        const sel = $('#budget-category');
        const expenseCats = categories.filter(c => c.type === 'expense' || c.type === 'both');
        sel.innerHTML = expenseCats.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
        $('#budget-amount').value = '';
        openModal('modal-budget');
    });

    $('#form-budget')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api.put('/api/budgets', {
                category_id: $('#budget-category').value,
                month: selectedMonth,
                amount: parseFloat($('#budget-amount').value),
            });
            showToast('Orçamento salvo!');
            closeModal('modal-budget');
            renderBudget();
        } catch (err) {
            showToast('Erro: ' + err.message);
        }
    });

    async function deleteBudget(id) {
        if (!confirm('Remover este orçamento?')) return;
        try {
            await api.del(`/api/budgets/${id}`);
            showToast('Orçamento removido');
            renderBudget();
        } catch (err) { showToast('Erro: ' + err.message); }
    }
    window._deleteBudget = deleteBudget;

    // ===== Render: Recurring =====
    let recType = 'expense';

    async function renderRecurring() {
        try {
            const recurring = await api.get('/api/recurring');
            const list = $('#recurring-list');
            const empty = $('#no-recurring');

            if (recurring.length === 0) {
                list.innerHTML = '';
                empty.style.display = 'block';
            } else {
                empty.style.display = 'none';
                list.innerHTML = recurring.map(r => {
                    const cat = getCategoryById(r.category_id);
                    const sign = r.type === 'income' ? '+' : '-';
                    return `
                        <div class="tx-row">
                            <div class="tx-icon" style="background:${cat ? cat.color + '22' : '#66622'}">${cat ? cat.icon : '❓'}</div>
                            <div class="tx-info">
                                <div class="tx-desc">${escapeHtml(r.description)}</div>
                                <div class="tx-meta">${cat ? cat.name : 'Outro'} · Dia ${r.day_of_month} de cada mês${r.notes ? ' · ' + escapeHtml(r.notes) : ''}</div>
                            </div>
                            <div class="tx-amount ${r.type}">${sign} ${formatCurrency(r.amount)}</div>
                            <div class="tx-actions">
                                <button class="btn-icon danger" onclick="window._deleteRecurring('${r.id}')" title="Excluir">🗑️</button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } catch (err) {
            showToast('Erro ao carregar recorrências');
        }
    }

    $('#btn-add-recurring')?.addEventListener('click', () => {
        $('#form-recurring').reset();
        recType = 'expense';
        updateRecTypeToggle();
        populateRecCategorySelect();
        openModal('modal-recurring');
    });

    $$('#form-recurring .toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            recType = btn.dataset.rectype;
            updateRecTypeToggle();
            populateRecCategorySelect();
        });
    });

    function updateRecTypeToggle() {
        $$('#form-recurring .toggle-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.rectype === recType);
        });
    }

    function populateRecCategorySelect() {
        const sel = $('#rec-category');
        const cats = categories.filter(c => c.type === recType || c.type === 'both');
        sel.innerHTML = cats.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
    }

    $('#form-recurring')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api.post('/api/recurring', {
                type: recType,
                description: $('#rec-description').value.trim(),
                amount: parseFloat($('#rec-amount').value),
                category_id: $('#rec-category').value,
                day_of_month: parseInt($('#rec-day').value),
                notes: $('#rec-notes').value.trim(),
            });
            showToast('Recorrência criada!');
            closeModal('modal-recurring');
            renderRecurring();
        } catch (err) {
            showToast('Erro: ' + err.message);
        }
    });

    $('#btn-generate-recurring')?.addEventListener('click', async () => {
        try {
            const result = await api.post('/api/recurring/generate', { month: getCurrentMonth() });
            showToast(result.generated > 0 ? `${result.generated} transações geradas!` : 'Todas as recorrências já foram geradas este mês.');
        } catch (err) {
            showToast('Erro: ' + err.message);
        }
    });

    async function deleteRecurring(id) {
        if (!confirm('Excluir esta recorrência?')) return;
        try {
            await api.del(`/api/recurring/${id}`);
            showToast('Recorrência excluída');
            renderRecurring();
        } catch (err) { showToast('Erro: ' + err.message); }
    }
    window._deleteRecurring = deleteRecurring;

    // ===== Charts (Canvas) =====
    function renderCategoryChart(catData) {
        const canvas = $('#chart-categories');
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const total = catData.reduce((s, c) => s + c.total, 0);

        if (catData.length === 0 || total === 0) {
            ctx.fillStyle = '#8b8fa3';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Sem despesas este mês', w / 2, h / 2);
            $('#chart-categories-legend').innerHTML = '';
            return;
        }

        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(cx, cy) - 20;
        let startAngle = -Math.PI / 2;
        const legendItems = [];

        catData.forEach(item => {
            const cat = getCategoryById(item.category_id);
            const color = cat ? cat.color : '#666';
            const slice = (item.total / total) * Math.PI * 2;

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, startAngle, startAngle + slice);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, startAngle, startAngle + slice);
            ctx.closePath();
            ctx.strokeStyle = '#1e2130';
            ctx.lineWidth = 2;
            ctx.stroke();

            startAngle += slice;

            const pct = ((item.total / total) * 100).toFixed(0);
            legendItems.push(`
                <div class="legend-item">
                    <span class="legend-dot" style="background:${color}"></span>
                    ${cat ? cat.icon + ' ' + cat.name : 'Outro'} (${pct}%)
                </div>
            `);
        });

        // Donut hole
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = '#1e2130';
        ctx.fill();

        ctx.fillStyle = '#e4e6f0';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatCurrency(total), cx, cy + 6);

        $('#chart-categories-legend').innerHTML = legendItems.join('');
    }

    function renderMonthlyChart(data) {
        const canvas = $('#chart-monthly');
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expense)), 1);
        const padding = { top: 20, right: 20, bottom: 40, left: 20 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;
        const barGroupW = chartW / data.length;
        const barW = barGroupW * 0.3;

        ctx.strokeStyle = '#2d3048';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();
        }

        data.forEach((d, i) => {
            const x = padding.left + barGroupW * i + barGroupW * 0.15;

            const incomeH = Math.max((d.income / maxVal) * chartH, 0);
            ctx.fillStyle = '#22c55e';
            ctx.beginPath();
            roundedRect(ctx, x, padding.top + chartH - incomeH, barW, incomeH, 4);
            ctx.fill();

            const expenseH = Math.max((d.expense / maxVal) * chartH, 0);
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            roundedRect(ctx, x + barW + 4, padding.top + chartH - expenseH, barW, expenseH, 4);
            ctx.fill();

            ctx.fillStyle = '#8b8fa3';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(d.label, x + barW + 2, h - 12);
        });
    }

    function renderComparisonChart(data) {
        const canvas = $('#chart-comparison');
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expense)), 1);
        const padding = { top: 30, right: 30, bottom: 50, left: 30 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        ctx.strokeStyle = '#2d3048';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();
        }

        function drawLine(values, color) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            values.forEach((v, i) => {
                const x = padding.left + (chartW / (data.length - 1 || 1)) * i;
                const y = padding.top + chartH - (v / maxVal) * chartH;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();

            ctx.fillStyle = color;
            values.forEach((v, i) => {
                const x = padding.left + (chartW / (data.length - 1 || 1)) * i;
                const y = padding.top + chartH - (v / maxVal) * chartH;
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        drawLine(data.map(d => d.income), '#22c55e');
        drawLine(data.map(d => d.expense), '#ef4444');

        ctx.fillStyle = '#8b8fa3';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        data.forEach((d, i) => {
            const x = padding.left + (chartW / (data.length - 1 || 1)) * i;
            ctx.fillText(d.label, x, h - 15);
        });

        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(w - 180, 10, 12, 12);
        ctx.fillStyle = '#e4e6f0';
        ctx.textAlign = 'left';
        ctx.fillText('Receitas', w - 164, 21);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(w - 90, 10, 12, 12);
        ctx.fillStyle = '#e4e6f0';
        ctx.fillText('Despesas', w - 74, 21);
    }

    function renderTopCategories(catData) {
        const container = $('#top-categories');
        if (catData.length === 0) {
            container.innerHTML = '<div class="empty-state">Sem despesas no período</div>';
            return;
        }

        const maxVal = catData[0].total;
        container.innerHTML = catData.slice(0, 8).map(item => {
            const cat = getCategoryById(item.category_id);
            const pct = (item.total / maxVal) * 100;
            return `
                <div class="top-cat-row">
                    <div class="top-cat-label">${cat ? cat.icon : '❓'} ${cat ? escapeHtml(cat.name) : 'Outro'}</div>
                    <div class="top-cat-bar-container">
                        <div class="top-cat-bar" style="width:${pct}%;background:${cat ? cat.color : '#666'}"></div>
                    </div>
                    <div class="top-cat-value">${formatCurrency(item.total)}</div>
                </div>
            `;
        }).join('');
    }

    function roundedRect(ctx, x, y, w, h, r) {
        if (h < 1) { h = 1; y = y + h - 1; }
        r = Math.min(r, h / 2, w / 2);
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
    }

    // ===== Export / Import CSV =====
    $('#btn-export').addEventListener('click', async () => {
        try {
            const txs = await api.get('/api/transactions');
            if (txs.length === 0) { showToast('Nenhuma transação para exportar'); return; }

            const header = 'Tipo,Descrição,Valor,Categoria,Data,Observações';
            const rows = txs.map(t => {
                const cat = getCategoryById(t.category_id);
                return [
                    t.type === 'income' ? 'Receita' : 'Despesa',
                    `"${t.description}"`,
                    t.amount.toFixed(2),
                    cat ? `"${cat.name}"` : '',
                    t.date,
                    `"${t.notes || ''}"`,
                ].join(',');
            });

            const csv = '\uFEFF' + header + '\n' + rows.join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `fintrack-export-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Exportação concluída!');
        } catch (err) {
            showToast('Erro ao exportar');
        }
    });

    $('#btn-import').addEventListener('click', () => $('#file-import').click());
    $('#file-import').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            const lines = ev.target.result.split('\n').filter(l => l.trim());
            if (lines.length < 2) { showToast('Arquivo CSV vazio ou inválido'); return; }

            let imported = 0;
            for (let i = 1; i < lines.length; i++) {
                const parts = parseCSVLine(lines[i]);
                if (parts.length < 5) continue;

                const type = parts[0].toLowerCase().includes('receita') ? 'income' : 'expense';
                const description = parts[1];
                const amount = parseFloat(parts[2]);
                const catName = parts[3];
                const date = parts[4];
                const notes = parts[5] || '';

                if (isNaN(amount) || !date) continue;

                let cat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
                if (!cat) {
                    cat = { id: genId(), name: catName || 'Importado', icon: '📦', color: '#6366f1', type };
                    try {
                        await api.post('/api/categories', cat);
                        categories.push(cat);
                    } catch (err) { /* ignore */ }
                }

                try {
                    await api.post('/api/transactions', { id: genId(), type, description, amount, category_id: cat.id, date, notes });
                    imported++;
                } catch (err) { /* skip */ }
            }

            showToast(`${imported} transações importadas!`);
            refreshCurrentView();
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQuotes = !inQuotes; continue; }
            if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
            current += ch;
        }
        result.push(current.trim());
        return result;
    }

    // ===== Refresh =====
    function refreshCurrentView() {
        const active = $('.nav-btn.active');
        if (active) switchView(active.dataset.view);
    }

    // ===== Logout =====
    $('#btn-logout').addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
    });

    // ===== Month Navigation =====
    $('#btn-prev-month')?.addEventListener('click', () => changeMonth(-1));
    $('#btn-next-month')?.addEventListener('click', () => changeMonth(1));

    // ===== Init =====
    async function init() {
        // Check auth
        try {
            const user = await api.get('/api/auth/me');
            const nameEl = $('#user-name');
            if (nameEl) nameEl.textContent = user.display_name || user.username;
        } catch (err) {
            window.location.href = '/login';
            return;
        }

        const now = new Date();
        $('#header-date').textContent = now.toLocaleDateString('pt-BR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });

        try {
            categories = await api.get('/api/categories');
        } catch (err) {
            showToast('Erro ao conectar com o servidor');
            console.error(err);
        }

        updateMonthLabel();
        renderDashboard();
    }

    init();
})();
