// ==========================================================================
// Baron Financeiro — lógica principal do app
// ==========================================================================

const App = {
  state: null,
  currentView: "dashboard",
  period: null, // {y, m}
  editingId: null,
  filters: {
    search: "", tipo: "", categoria: "", conta: "", status: "", periodo: "mes"
  },
  contasFilters: { periodo: "30", categoria: "", conta: "", tipo: "saida", cartoes: "agrupado" },

  async init() {
    Store.onStatusChange = (s) => {
      if (s.kind === "ok") toast(s.msg, "success");
      else toast(s.msg, "error");
      this.renderSyncStatus();
    };

    // Se modo online, exige login antes de tudo
    if (typeof IS_ONLINE_MODE !== "undefined" && IS_ONLINE_MODE) {
      try {
        await Auth.requireLogin();
      } catch (e) {
        console.error("Falha no login:", e);
        toast("Erro de autenticação: " + e.message, "error");
        return;
      }
    }

    this.state = await Store.load();
    const now = new Date();
    this.period = { y: now.getFullYear(), m: now.getMonth() + 1 };

    this.bindNav();
    this.bindTopbar();
    this.bindLancamentos();
    this.bindContas();
    this.bindConfig();
    this.bindReports();
    document.getElementById("btn-novo").addEventListener("click", () => {
      this.closeSidebar();
      this.openLancamentoModal();
    });
    document.getElementById("btn-transfer").addEventListener("click", () => {
      this.closeSidebar();
      this.openTransferenciaModal();
    });
    document.getElementById("btn-cupom").addEventListener("click", () => {
      this.closeSidebar();
      this.openCupomModal();
    });
    document.getElementById("btn-nova-recorrencia").addEventListener("click", () => this.openRecorrenciaModal());
    this.bindIA();

    // Botao Sair (so visivel em modo online)
    if (Store.isRemote()) {
      const btn = document.getElementById("btn-signout");
      btn.classList.remove("hidden");
      btn.textContent = `↪ Sair (${(Auth.user?.email || "").split("@")[0]})`;
      btn.addEventListener("click", async () => {
        if (confirm("Deseja sair? Você precisará fazer login novamente.")) {
          await Auth.signOut();
        }
      });
      // ajusta o hint da sidebar
      const hint = document.getElementById("storage-hint");
      if (hint) hint.innerHTML = "☁️ Sincronizado na nuvem";
    }

    this.renderAll();
    this.renderSyncStatus();

    // Se havia um arquivo vinculado mas sem permissão, oferece reconectar
    if (Store.isPending()) {
      this.showReconnectBanner();
    }

    // Descobre se a IA está disponível sem travar o carregamento do app
    AIUI.init().then(() => {
      if (this.currentView === "dashboard") AIUI.renderInsights();
      if (this.currentView === "config") this.renderConfigIA();
    });
  },

  // ---------------- IA ----------------
  bindIA() {
    AIUI.bindAssistente();

    const abrirDoc = () => { this.closeSidebar(); AIUI.openDocumentoModal(); };
    const abrirCat = () => { this.closeSidebar(); AIUI.openCategorizarModal(); };
    const abrirPlano = () => { this.closeSidebar(); AIUI.openPlanoModal(); };

    [
      ["btn-doc-ia", abrirDoc],
      ["dash-doc-ia", abrirDoc],
      ["ai-tool-doc", abrirDoc],
      ["btn-cfg-documento", abrirDoc],
      ["ai-tool-cat", abrirCat],
      ["btn-cfg-categorizar", abrirCat],
      ["ai-tool-plano", abrirPlano],
      ["btn-cfg-plano", abrirPlano],
      ["btn-cfg-memoria", () => AIUI.openMemoriaModal()],
      ["btn-cfg-desfazer", () => { AIUI.desfazerIA(); this.renderConfigIA(); }]
    ].forEach(([id, fn]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", fn);
    });

    // Modo automático
    const sw = document.getElementById("cfg-auto");
    if (sw) {
      sw.addEventListener("click", () => {
        const cfg = Store.setAIConfig({ autoAplicar: !Store.getAIConfig().autoAplicar });
        this.renderConfigIA();
        toast(cfg.autoAplicar
          ? "Modo automático ligado — sempre com botão de desfazer"
          : "Modo automático desligado", "success");
      });
    }
    const limiar = document.getElementById("cfg-limiar");
    if (limiar) {
      limiar.addEventListener("change", e => {
        Store.setAIConfig({ limiar: e.target.value });
        toast("Limiar atualizado", "success");
      });
    }

    const limpar = document.getElementById("btn-cfg-limpar-ia");
    if (limpar) {
      limpar.addEventListener("click", () => {
        if (!confirm("Limpar o histórico do assistente neste dispositivo?")) return;
        AI.clearChat();
        AIUI.renderAssistente();
        toast("Conversa apagada", "success");
      });
    }
  },

  renderSyncStatus() {
    const el = document.getElementById("sync-status");
    if (!el) return;
    if (Store.isRemote()) {
      const email = Auth.user?.email || "";
      el.innerHTML = `<span title="Logado como ${escapeAttr(email)}">☁️ Online</span>`;
      el.className = "sync-status ok";
    } else if (Store.isBound()) {
      el.innerHTML = `<span title="Gravando em ${escapeAttr(Store.fileName())}">💾 ${escapeHtml(Store.fileName())}</span>`;
      el.className = "sync-status ok";
    } else if (Store.isPending()) {
      el.innerHTML = `<button class="btn btn-ghost btn-small" id="btn-reconnect">⚠ Reconectar arquivo</button>`;
      el.className = "sync-status warn";
      document.getElementById("btn-reconnect").addEventListener("click", async () => {
        const ok = await Store.reconnectPending();
        if (ok) { this.state = Store.get(); this.renderAll(); }
      });
    } else {
      el.innerHTML = `<span class="muted small">Salvando no navegador</span>`;
      el.className = "sync-status";
    }
  },

  showReconnectBanner() {
    // destacar config para o usuario saber
  },

  // ---------------- Navegação ----------------
  bindNav() {
    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.addEventListener("click", () => {
        this.goto(btn.dataset.view);
        this.closeSidebar();
      });
    });
    document.querySelectorAll("[data-goto]").forEach(btn => {
      btn.addEventListener("click", () => {
        this.goto(btn.dataset.goto);
        this.closeSidebar();
      });
    });

    // Drawer mobile: hamburger + backdrop
    const toggle = document.getElementById("sidebar-toggle");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (toggle) toggle.addEventListener("click", () => this.toggleSidebar());
    if (backdrop) backdrop.addEventListener("click", () => this.closeSidebar());
  },

  toggleSidebar() {
    const sb = document.querySelector(".sidebar");
    const bd = document.getElementById("sidebar-backdrop");
    if (!sb) return;
    const willOpen = !sb.classList.contains("open");
    sb.classList.toggle("open", willOpen);
    if (bd) bd.classList.toggle("open", willOpen);
  },

  closeSidebar() {
    const sb = document.querySelector(".sidebar");
    const bd = document.getElementById("sidebar-backdrop");
    if (sb) sb.classList.remove("open");
    if (bd) bd.classList.remove("open");
  },

  goto(view) {
    this.currentView = view;
    document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById("view-" + view).classList.remove("hidden");

    const titles = {
      dashboard: ["Dashboard", "Visão geral das suas finanças"],
      lancamentos: ["Lançamentos", "Todas as entradas e saídas"],
      contas: ["Contas a Pagar", "Organize o que está por vencer"],
      cartoes: ["Cartões", "Acompanhe suas faturas"],
      fluxo: ["Fluxo de Caixa", "Saldo atual e previsto de cada conta"],
      fixos: ["Lançamentos Fixos", "Recorrências mensais, semanais e anuais"],
      relatorios: ["Relatórios", "Análise detalhada do seu dinheiro"],
      assistente: ["Assistente", "Pergunte sobre suas finanças em português"],
      config: ["Configurações", "Categorias, contas e backup"]
    };
    const [t, s] = titles[view] || ["", ""];
    document.getElementById("page-title").textContent = t;
    document.getElementById("page-sub").textContent = s;

    this.renderAll();
  },

  // ---------------- Topbar ----------------
  bindTopbar() {
    document.getElementById("prev-month").addEventListener("click", () => this.shiftPeriod(-1));
    document.getElementById("next-month").addEventListener("click", () => this.shiftPeriod(1));
    document.getElementById("btn-backup").addEventListener("click", () => this.exportBackup());
    document.getElementById("btn-restore").addEventListener("click", () => document.getElementById("file-restore").click());
    document.getElementById("file-restore").addEventListener("change", e => this.importBackup(e));
  },

  shiftPeriod(d) {
    this.period.m += d;
    if (this.period.m < 1) { this.period.m = 12; this.period.y--; }
    if (this.period.m > 12) { this.period.m = 1; this.period.y++; }
    this.renderAll();
  },

  periodLabel() {
    const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    return `${meses[this.period.m - 1]} ${this.period.y}`;
  },

  periodLabelShort() {
    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return `${meses[this.period.m - 1]}/${String(this.period.y).slice(2)}`;
  },

  // Label do mês ANTERIOR (pra "Saldo até [mês anterior]")
  periodLabelAnterior() {
    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    let m = this.period.m - 1;
    let y = this.period.y;
    if (m < 1) { m = 12; y--; }
    return `${meses[m - 1]}/${String(y).slice(2)}`;
  },

  // ---------------- Render ----------------
  renderAll() {
    const fullEl = document.querySelector("#period-label .period-full");
    const shortEl = document.querySelector("#period-label .period-short");
    if (fullEl) fullEl.textContent = this.periodLabel();
    if (shortEl) shortEl.textContent = this.periodLabelShort();
    this.populateFilterSelects();

    if (this.currentView === "dashboard") this.renderDashboard();
    else if (this.currentView === "lancamentos") this.renderLancamentos();
    else if (this.currentView === "contas") this.renderContas();
    else if (this.currentView === "cartoes") this.renderCartoes();
    else if (this.currentView === "fluxo") this.renderFluxo();
    else if (this.currentView === "fixos") this.renderFixos();
    else if (this.currentView === "relatorios") this.renderRelatorios();
    else if (this.currentView === "assistente") AIUI.renderAssistente();
    else if (this.currentView === "config") { this.renderConfig(); this.renderConfigIA(); }
  },

  // Mostra no card de Configurações se a IA está ligada, o que ela aprendeu
  // e o estado do modo automático.
  renderConfigIA() {
    const status = document.getElementById("ai-config-status");
    const motivo = document.getElementById("ai-config-motivo");
    if (status) {
      status.textContent = AI.available === true
        ? `Ativa · ${AI.model || "Claude"}`
        : "Desativada";
      status.classList.toggle("status-on", AI.available === true);
    }
    if (motivo) motivo.textContent = AI.motivoIndisponivel();

    const cfg = Store.getAIConfig();

    const sw = document.getElementById("cfg-auto");
    if (sw) {
      sw.classList.toggle("on", cfg.autoAplicar);
      sw.setAttribute("aria-checked", String(cfg.autoAplicar));
    }
    const wrap = document.getElementById("auto-limiar-wrap");
    if (wrap) wrap.classList.toggle("hidden", !cfg.autoAplicar);
    const limiar = document.getElementById("cfg-limiar");
    if (limiar) limiar.value = cfg.limiar;

    const resumo = document.getElementById("ai-memoria-resumo");
    if (resumo) {
      const n = Store.correcoesRecentes(999).length;
      resumo.textContent = n === 0
        ? "Nenhuma correção registrada ainda. Cada vez que você corrigir um palpite dela, ela guarda e não erra de novo."
        : `${n} correç${n === 1 ? "ão registrada" : "ões registradas"}. A IA usa isso em cada novo documento e categorização.`;
    }

    const ultima = Store.ultimaAcaoIA();
    const row = document.getElementById("row-desfazer-ia");
    if (row) row.style.display = ultima ? "" : "none";
    const txt = document.getElementById("ai-ultima-acao");
    if (txt && ultima) txt.textContent = `${ultima.resumo} · ${fmtDate(ultima.quando.slice(0, 10))}`;
  },

  populateFilterSelects() {
    const fCat = document.getElementById("f-categoria");
    const fConta = document.getElementById("f-conta");
    const cfCat = document.getElementById("cf-categoria");
    const cfConta = document.getElementById("cf-conta");

    const fillCat = (sel, sticky) => {
      const v = sticky != null ? sticky : sel.value;
      sel.innerHTML = '<option value="">Todas categorias</option>' +
        this.state.categorias.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
      sel.value = v;
    };
    const fillConta = (sel, sticky) => {
      const v = sticky != null ? sticky : sel.value;
      sel.innerHTML = '<option value="">Todas contas</option>' +
        this.state.contas.map(c => `<option value="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</option>`).join("");
      sel.value = v;
    };
    if (fCat) fillCat(fCat);
    if (fConta) fillConta(fConta);
    if (cfCat) fillCat(cfCat);
    if (cfConta) fillConta(cfConta);
  },

  // ---------------- Dashboard ----------------
  // Estado dos filtros do dashboard (persistidos em memória)
  _dashFilters() {
    if (!this._dashF) this._dashF = { search: "", tipo: "", categoria: "", conta: "", status: "", min: "" };
    return this._dashF;
  },

  _bindDashFilters() {
    if (this._dashFiltersBound) return;
    this._dashFiltersBound = true;
    const f = this._dashFilters();
    const apply = () => { this.renderDashboard(); };
    const tag = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", e => { f[key] = e.target.value; apply(); });
      el.addEventListener("change", e => { f[key] = e.target.value; apply(); });
    };
    tag("dash-search", "search");
    tag("dash-f-tipo", "tipo");
    tag("dash-f-categoria", "categoria");
    tag("dash-f-conta", "conta");
    tag("dash-f-status", "status");
    tag("dash-f-min", "min");
    const btnNovo = document.getElementById("dash-novo-lanc");
    if (btnNovo) btnNovo.addEventListener("click", () => this.openLancamentoModal());
    const btnCupom = document.getElementById("dash-cupom");
    if (btnCupom) btnCupom.addEventListener("click", () => this.openCupomModal());
    const btnClear = document.getElementById("dash-clear-filters");
    if (btnClear) btnClear.addEventListener("click", () => {
      this._dashF = { search: "", tipo: "", categoria: "", conta: "", status: "", min: "" };
      ["dash-search","dash-f-tipo","dash-f-categoria","dash-f-conta","dash-f-status","dash-f-min"].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = "";
      });
      apply();
    });
  },

  // Aplica os filtros do dashboard a uma lista
  _applyDashFilters(list) {
    const f = this._dashFilters();
    const q = (f.search || "").trim().toLowerCase();
    const min = parseFloat(f.min) || 0;
    return list.filter(l => {
      if (f.tipo && l.tipo !== f.tipo) return false;
      if (f.categoria && l.categoria !== f.categoria) return false;
      if (f.conta && l.conta !== f.conta) return false;
      if (f.status) {
        const st = statusEfetivo(l);
        if (st !== f.status) return false;
      }
      if (min > 0 && l.valor < min) return false;
      if (q) {
        const hay = `${l.descricao || ""} ${l.categoria || ""} ${l.conta || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  },

  renderDashboard() {
    this._bindDashFilters();

    // Preenche selects de filtros se vazios
    const fCat = document.getElementById("dash-f-categoria");
    const fConta = document.getElementById("dash-f-conta");
    if (fCat && fCat.options.length <= 1) {
      const sel = fCat.value;
      fCat.innerHTML = '<option value="">Todas categorias</option>' +
        this.state.categorias.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("");
      fCat.value = sel;
    }
    if (fConta && fConta.options.length <= 1) {
      const sel = fConta.value;
      fConta.innerHTML = '<option value="">Todas contas</option>' +
        this.state.contas.map(c => `<option value="${escapeAttr(c.nome)}">${escapeHtml(c.nome)}</option>`).join("");
      fConta.value = sel;
    }

    const periodLabelEl = document.getElementById("dash-period-label");
    if (periodLabelEl) periodLabelEl.textContent = this.periodLabel();
    this._renderDashHero();
    AIUI.renderInsights();
  },

  _renderDashHero() {
    const all = this.state.lancamentos;
    const mes = all.filter(l => this.inPeriod(l.dataCompetencia, this.period));
    const mesFiltrado = this._applyDashFilters(mes);

    const entradas = mesFiltrado.filter(l => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
    const saidas = mesFiltrado.filter(l => l.tipo === "saida" && this.isDespesaReal(l)).reduce((s, l) => s + l.valor, 0);
    const pendente = mesFiltrado.filter(l => l.tipo === "saida" && statusEfetivo(l) !== "Pago" && this.isDespesaReal(l)).reduce((s, l) => s + saldoDevedor(l), 0);
    const pendCount = mesFiltrado.filter(l => l.tipo === "saida" && statusEfetivo(l) !== "Pago" && this.isDespesaReal(l)).length;

    // === Cartões do mês (faturas que vencem neste mês) ===
    const cartoes = this.state.contas.filter(c => c.tipo === "cartao");
    let totalCartoesMes = 0;
    let qtdFaturasMes = 0;
    cartoes.forEach(card => {
      const lancs = this.state.lancamentos.filter(l =>
        l.conta === card.nome && l.tipo === "saida" &&
        statusEfetivo(l) !== "Pago" &&
        this.inPeriod(l.dataPagamento || l.dataCompetencia, this.period)
      );
      const totalCard = lancs.reduce((s, l) => s + saldoDevedor(l), 0);
      if (totalCard > 0) {
        totalCartoesMes += totalCard;
        qtdFaturasMes++;
      }
    });

    // === Hero: saldo previsto ao fim do mês ===
    const contasBanc = this.state.contas.filter(c => c.tipo !== "cartao");
    const saldoAtualTotal = contasBanc.reduce((s, c) => {
      const totEnt = this.state.lancamentos.filter(l => l.conta === c.nome && l.tipo === "entrada").reduce((a, l) => a + valorPagoDe(l), 0);
      const totSai = this.state.lancamentos.filter(l => l.conta === c.nome && l.tipo === "saida").reduce((a, l) => a + valorPagoDe(l), 0);
      return s + (Number(c.saldoInicial) || 0) + totEnt - totSai;
    }, 0);

    // entradas/saídas pendentes do mês (regime de caixa)
    const entradasPendMes = all.filter(l =>
      l.tipo === "entrada" && statusEfetivo(l) !== "Pago" &&
      this.inPeriod(l.dataPagamento || l.dataCompetencia, this.period)
    ).reduce((s, l) => s + saldoDevedor(l), 0);
    const saidasPendMes = all.filter(l =>
      l.tipo === "saida" && statusEfetivo(l) !== "Pago" && this.isDespesaReal(l) &&
      this.inPeriod(l.dataPagamento || l.dataCompetencia, this.period)
    ).reduce((s, l) => s + saldoDevedor(l), 0);
    const saldoPrevistoMes = saldoAtualTotal + entradasPendMes - saidasPendMes;

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText("dash-saldo-final", fmtMoney(saldoPrevistoMes));
    setText("dash-saldo-atual", fmtMoney(saldoAtualTotal));
    setText("dash-pendente-total", fmtMoney(saidasPendMes - entradasPendMes));
    const heroValEl = document.getElementById("dash-saldo-final");
    if (heroValEl) {
      heroValEl.style.color = saldoPrevistoMes >= 0 ? "var(--success)" : "var(--danger)";
    }

    // === KPIs ===
    setText("kpi-entradas", fmtMoney(entradas));
    setText("kpi-entradas-count", `${mesFiltrado.filter(l => l.tipo === "entrada").length} lançamento(s)`);
    setText("kpi-saidas", fmtMoney(saidas));
    setText("kpi-saidas-count", `${mesFiltrado.filter(l => l.tipo === "saida").length} lançamento(s)`);
    setText("kpi-saldo", fmtMoney(entradas - saidas));
    setText("kpi-cartoes", fmtMoney(totalCartoesMes));
    setText("kpi-cartoes-foot", `${qtdFaturasMes} fatura(s) vence(m) no mês`);
    setText("kpi-pendente", fmtMoney(pendente));
    setText("kpi-pendente-count", `${pendCount} a pagar`);

    // tendência 12 meses
    const trend = this.buildTrend12();
    Charts.drawLine(document.getElementById("chart-trend"), trend.map(t => ({
      label: t.label, value: t.entrada - t.saida
    })), { color: "#356854" });

    // categorias do mês (respeita filtros)
    const cats = this.groupByCategoria(mesFiltrado.filter(l => l.tipo === "saida"));
    Charts.drawDonut(document.getElementById("chart-categories"), cats);
    setText("cat-sub", this.periodLabel());

    // próximas contas (respeita filtros, mostra mais que 6 se filtrado)
    const hoje = todayStr();
    const upcomingBase = this._applyDashFilters(all.filter(l =>
      l.tipo === "saida" && statusEfetivo(l) !== "Pago" &&
      (l.dataPagamento || l.dataCompetencia) >= hoje
    ));
    const upcoming = upcomingBase.sort((a, b) => (a.dataPagamento || "").localeCompare(b.dataPagamento || "")).slice(0, 8);
    document.getElementById("list-upcoming").innerHTML = upcoming.length ? upcoming.map(l => {
      const dias = daysUntil(l.dataPagamento);
      const devedor = saldoDevedor(l);
      const isParcial = statusEfetivo(l) === "Parcial";
      return `<div class="list-row">
        <div class="list-main">
          <div class="list-title">${escapeHtml(l.descricao || l.categoria)} ${isParcial ? '<span class="chip chip-parcial" style="margin-left:4px;font-size:10px;">parcial</span>' : ""}</div>
          <div class="list-meta">${fmtDate(l.dataPagamento)} • ${escapeHtml(l.categoria)} • ${escapeHtml(l.conta)}</div>
        </div>
        <div class="list-right">
          <div class="amount-out">${fmtMoney(devedor)}</div>
          <div class="list-meta">${dias === 0 ? "hoje" : (dias < 0 ? `${Math.abs(dias)}d atraso` : `em ${dias}d`)}</div>
        </div>
      </div>`;
    }).join("") : '<div class="empty"><span class="empty-icon">✓</span>Nada pendente por aqui</div>';

    // saldo por conta + faturas dos cartoes
    const saldoConta = this.saldoPorConta();
    const faturasCartao = cartoes.map(c => {
      const total = this.state.lancamentos
        .filter(l => l.conta === c.nome && l.tipo === "saida" && statusEfetivo(l) !== "Pago")
        .reduce((s, l) => s + saldoDevedor(l), 0);
      return { nome: c.nome, total };
    }).filter(c => c.total > 0);

    let listAccountsHtml = "";
    if (saldoConta.length) {
      listAccountsHtml += saldoConta.map(s => `
        <div class="list-row">
          <div class="list-main">
            <div class="list-title">🏦 ${escapeHtml(s.nome)}</div>
            <div class="list-meta">Conta bancária</div>
          </div>
          <div class="list-right ${s.saldo >= 0 ? "amount-in" : "amount-out"}">${fmtMoney(s.saldo)}</div>
        </div>
      `).join("");
    }
    if (faturasCartao.length) {
      listAccountsHtml += faturasCartao.map(s => `
        <div class="list-row">
          <div class="list-main">
            <div class="list-title">💳 ${escapeHtml(s.nome)}</div>
            <div class="list-meta">Cartão — total em aberto</div>
          </div>
          <div class="list-right amount-out">${fmtMoney(s.total)}</div>
        </div>
      `).join("");
    }
    document.getElementById("list-accounts").innerHTML = listAccountsHtml || '<div class="empty">Nenhuma conta com movimentação</div>';

    // últimos lançamentos (respeita filtros)
    const recent = this._applyDashFilters([...all]).sort((a, b) => (b.dataCompetencia || "").localeCompare(a.dataCompetencia || "")).slice(0, 10);
    document.getElementById("list-recent").innerHTML = recent.length ? recent.map(l => `
      <div class="list-row dash-recent-row" data-edit-id="${l.id}" style="cursor:pointer;">
        <div class="list-main">
          <div class="list-title">${escapeHtml(l.descricao || l.categoria)}</div>
          <div class="list-meta">${fmtDate(l.dataCompetencia)} • ${escapeHtml(l.categoria)} • ${escapeHtml(l.conta)} ${statusChipEfetivo(l)}</div>
        </div>
        <div class="list-right ${l.tipo === "entrada" ? "amount-in" : "amount-out"}">${l.tipo === "entrada" ? "+" : "−"} ${fmtMoney(l.valor)}</div>
      </div>
    `).join("") : '<div class="empty">Nenhum lançamento com esses filtros</div>';

    // Click em um lançamento da lista recente → abre edição
    document.querySelectorAll(".dash-recent-row").forEach(row => {
      row.addEventListener("click", () => this.openLancamentoModal(row.dataset.editId));
    });
  },

  // ---------------- Lançamentos ----------------
  bindLancamentos() {
    const f = this.filters;
    document.getElementById("f-search").addEventListener("input", e => { f.search = e.target.value; this.renderLancamentos(); });
    document.getElementById("f-tipo").addEventListener("change", e => { f.tipo = e.target.value; this.renderLancamentos(); });
    document.getElementById("f-categoria").addEventListener("change", e => { f.categoria = e.target.value; this.renderLancamentos(); });
    document.getElementById("f-conta").addEventListener("change", e => { f.conta = e.target.value; this.renderLancamentos(); });
    document.getElementById("f-status").addEventListener("change", e => { f.status = e.target.value; this.renderLancamentos(); });
    document.getElementById("f-periodo").addEventListener("change", e => { f.periodo = e.target.value; this.renderLancamentos(); });
  },

  renderLancamentos() {
    const tbody = document.getElementById("tbody-lancamentos");
    const rows = this.filterLancamentos();

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty"><span class="empty-icon">≡</span>Nenhum lançamento com esses filtros</td></tr>`;
    } else {
      tbody.innerHTML = rows.map(l => {
        const st = statusEfetivo(l);
        const pago = valorPagoDe(l);
        const temRateio = Array.isArray(l.rateios) && l.rateios.length > 0;
        const catLabel = temRateio
          ? `<span class="chip" title="${l.rateios.map(r => `${r.categoria}: ${fmtMoney(r.valor)}`).join(' | ')}">⇆ Rateado (${l.rateios.length})</span>`
          : `<span class="chip">${escapeHtml(l.categoria || "")}</span>`;
        return `
        <tr>
          <td>${fmtDate(l.dataCompetencia)}</td>
          <td>${fmtDate(l.dataPagamento)}</td>
          <td>${escapeHtml(l.descricao || "—")}</td>
          <td>${catLabel}</td>
          <td>${escapeHtml(l.conta || "")}</td>
          <td class="right amount-in">${l.tipo === "entrada" ? fmtMoney(l.valor) : ""}</td>
          <td class="right amount-out">${l.tipo === "saida" ? fmtMoney(l.valor) : ""}</td>
          <td>${statusChipEfetivo(l)}</td>
          <td>
            <div class="row-actions">
              <button class="btn-icon" title="${st === "Pago" ? "Desfazer pagamento" : "Pagar (parcial ou total)"}" data-act="${st === "Pago" ? "pay" : "partial"}" data-id="${l.id}">${st === "Pago" ? "↶" : "💵"}</button>
              <button class="btn-icon" title="Editar" data-act="edit" data-id="${l.id}">✎</button>
              <button class="btn-icon" title="Excluir" data-act="del" data-id="${l.id}">✕</button>
            </div>
          </td>
        </tr>
        `;
      }).join("");

      tbody.querySelectorAll("button[data-act]").forEach(btn => {
        btn.addEventListener("click", () => this.handleRowAction(btn.dataset.act, btn.dataset.id));
      });
    }

    const tEnt = rows.filter(l => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
    const tSai = rows.filter(l => l.tipo === "saida").reduce((s, l) => s + l.valor, 0);
    document.getElementById("foot-entradas").textContent = fmtMoney(tEnt);
    document.getElementById("foot-saidas").textContent = fmtMoney(tSai);
    document.getElementById("foot-saldo").textContent = "Saldo: " + fmtMoney(tEnt - tSai);
  },

  filterLancamentos() {
    const f = this.filters;
    const q = f.search.trim().toLowerCase();
    return this.state.lancamentos.filter(l => {
      if (f.tipo && l.tipo !== f.tipo) return false;
      if (f.categoria && l.categoria !== f.categoria) return false;
      if (f.conta && l.conta !== f.conta) return false;
      if (f.status && l.status !== f.status) return false;
      if (f.periodo === "mes" && !this.inPeriod(l.dataCompetencia, this.period)) return false;
      if (f.periodo === "ano" && new Date(l.dataCompetencia).getFullYear() !== this.period.y) return false;
      if (q) {
        const hay = `${l.descricao || ""} ${l.categoria || ""} ${l.conta || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.dataCompetencia || "").localeCompare(a.dataCompetencia || ""));
  },

  handleRowAction(act, id) {
    if (act === "pay") {
      Store.togglePago(id);
      this.renderAll();
      toast("Status atualizado", "success");
    } else if (act === "partial") {
      this.openPagamentoParcialModal(id);
    } else if (act === "edit") {
      this.openLancamentoModal(id);
    } else if (act === "del") {
      if (confirm("Excluir este lançamento?")) {
        Store.deleteLancamento(id);
        this.renderAll();
        toast("Lançamento excluído", "success");
      }
    }
  },

  // Modal de transferência entre contas
  openTransferenciaModal() {
    const contas = this.state.contas.filter(c => c.tipo !== "cartao");
    if (contas.length < 2) {
      toast("Você precisa de pelo menos 2 contas bancárias pra transferir", "error");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const html = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal" style="max-width:460px;">
          <div class="modal-head">
            <h2>↔ Transferência entre contas</h2>
            <button class="btn-icon" id="modal-close">✕</button>
          </div>
          <form id="transf-form" class="modal-body">
            <div class="form-grid">
              <div class="form-field">
                <label>De (origem)</label>
                <select name="origem" required id="transf-origem">
                  <option value="">Selecione...</option>
                  ${contas.map(c => `<option value="${escapeAttr(c.nome)}">${escapeHtml(c.nome)}</option>`).join("")}
                </select>
              </div>
              <div class="form-field">
                <label>Para (destino)</label>
                <select name="destino" required id="transf-destino">
                  <option value="">Selecione...</option>
                  ${contas.map(c => `<option value="${escapeAttr(c.nome)}">${escapeHtml(c.nome)}</option>`).join("")}
                </select>
              </div>
              <div class="form-field">
                <label>Valor (R$)</label>
                <input type="number" step="0.01" min="0.01" name="valor" required placeholder="0,00">
              </div>
              <div class="form-field">
                <label>Data</label>
                <input type="date" name="data" required value="${today}">
              </div>
              <div class="form-field full">
                <label>Descrição (opcional)</label>
                <input type="text" name="descricao" placeholder="Ex: Reserva mensal, ajuste...">
              </div>
            </div>
            <div class="muted small" style="margin-top:12px;padding:10px;background:#f9fafb;border-radius:8px;">
              💡 Vou criar 2 lançamentos linkados (saída + entrada) com categoria <b>Transferências</b>.
              Não conta como despesa nem receita no DRE — é só movimentação entre suas contas.
            </div>
          </form>
          <div class="modal-foot">
            <button class="btn" id="modal-cancel">Cancelar</button>
            <button class="btn btn-primary" id="modal-save">↔ Confirmar transferência</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("modal-root").innerHTML = html;
    const close = () => { document.getElementById("modal-root").innerHTML = ""; };
    document.getElementById("modal-close").addEventListener("click", close);
    document.getElementById("modal-cancel").addEventListener("click", close);
    document.getElementById("modal-bd").addEventListener("click", e => { if (e.target.id === "modal-bd") close(); });

    document.getElementById("modal-save").addEventListener("click", () => {
      const form = document.getElementById("transf-form");
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      try {
        Store.transferir(
          fd.get("origem"),
          fd.get("destino"),
          parseFloat(fd.get("valor")),
          fd.get("data"),
          fd.get("descricao")
        );
        close();
        this.state = Store.get();
        this.renderAll();
        toast(`Transferência: ${fd.get("origem")} → ${fd.get("destino")}`, "success");
      } catch (e) {
        toast(e.message, "error");
      }
    });
  },

  // Modal de pagamento parcial
  openPagamentoParcialModal(id) {
    const l = this.state.lancamentos.find(x => x.id === id);
    if (!l) return;
    const pago = valorPagoDe(l);
    const devedor = saldoDevedor(l);
    const contasBanc = this.state.contas.filter(c => c.tipo !== "cartao");
    const today = new Date().toISOString().slice(0, 10);

    const histPag = (l.pagamentos || []).map((p, idx) => `
      <div class="cupom-row" style="padding:5px 0;">
        <span class="lbl">${fmtDate(p.data)} • ${escapeHtml(p.conta || "")}</span>
        <span class="val">
          ${fmtMoney(p.valor)}
          <button class="btn-icon" data-rm-pag="${idx}" title="Desfazer este pagamento" style="margin-left:6px;color:var(--danger);">✕</button>
        </span>
      </div>
    `).join("");

    const html = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal" style="max-width:480px;">
          <div class="modal-head">
            <h2>💵 Pagar parcial — ${escapeHtml(l.descricao || l.categoria)}</h2>
            <button class="btn-icon" id="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="cupom-summary" style="margin-bottom:14px;">
              <div class="cupom-row"><span class="lbl">Valor total</span><span class="val">${fmtMoney(l.valor)}</span></div>
              <div class="cupom-row"><span class="lbl">Já pago</span><span class="val amount-in">${fmtMoney(pago)}</span></div>
              <div class="cupom-row"><span class="lbl">Saldo devedor</span><span class="val amount-out" style="font-size:16px;">${fmtMoney(devedor)}</span></div>
            </div>

            ${histPag ? `
              <div style="margin-bottom:14px;">
                <div class="muted small" style="margin-bottom:6px;font-weight:600;">Pagamentos anteriores:</div>
                ${histPag}
              </div>
            ` : ""}

            ${devedor > 0 ? `
              <form id="parcial-form" class="form-grid">
                <div class="form-field">
                  <label>Valor</label>
                  <input type="number" step="0.01" min="0.01" max="${devedor.toFixed(2)}" name="valor" required value="${devedor.toFixed(2)}">
                </div>
                <div class="form-field">
                  <label>Data do pagamento</label>
                  <input type="date" name="data" required value="${today}">
                </div>
                <div class="form-field full">
                  <label>Conta de pagamento</label>
                  <select name="conta" required>
                    ${contasBanc.map(c => `<option value="${escapeAttr(c.nome)}" ${c.nome === l.conta ? "selected" : ""}>${escapeHtml(c.nome)}</option>`).join("")}
                  </select>
                </div>
              </form>
              <div class="muted small" style="margin-top:10px;">
                💡 Você pode pagar parcialmente várias vezes até quitar.
              </div>
            ` : '<div class="empty"><span class="empty-icon">✓</span>Já está totalmente pago</div>'}
          </div>
          <div class="modal-foot">
            <button class="btn" id="modal-cancel">Fechar</button>
            ${devedor > 0 ? `
              <button class="btn btn-ghost" id="btn-quitar" style="color:var(--success);font-weight:600;">Pagar total (${fmtMoney(devedor)})</button>
              <button class="btn btn-primary" id="btn-pagar-parcial">Pagar valor</button>
            ` : ""}
          </div>
        </div>
      </div>
    `;
    document.getElementById("modal-root").innerHTML = html;
    const close = () => { document.getElementById("modal-root").innerHTML = ""; };
    document.getElementById("modal-close").addEventListener("click", close);
    document.getElementById("modal-cancel").addEventListener("click", close);
    document.getElementById("modal-bd").addEventListener("click", e => { if (e.target.id === "modal-bd") close(); });

    // Remover pagamento existente
    document.querySelectorAll("button[data-rm-pag]").forEach(b => {
      b.addEventListener("click", () => {
        if (confirm("Desfazer este pagamento?")) {
          Store.removerPagamento(id, parseInt(b.dataset.rmPag));
          close();
          this.state = Store.get();
          this.renderAll();
          toast("Pagamento removido", "success");
        }
      });
    });

    if (devedor > 0) {
      const submit = (valor) => {
        const form = document.getElementById("parcial-form");
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        try {
          Store.pagarParcial(id, valor, fd.get("data"), fd.get("conta"));
          close();
          this.state = Store.get();
          this.renderAll();
          const novoStatus = statusEfetivo(this.state.lancamentos.find(x => x.id === id));
          toast(novoStatus === "Pago" ? "Pago totalmente!" : `Pagamento parcial registrado (${fmtMoney(valor)})`, "success");
        } catch (e) {
          toast(e.message, "error");
        }
      };
      document.getElementById("btn-pagar-parcial").addEventListener("click", () => {
        const fd = new FormData(document.getElementById("parcial-form"));
        submit(parseFloat(fd.get("valor")) || 0);
      });
      document.getElementById("btn-quitar").addEventListener("click", () => submit(devedor));
    }
  },

  openLancamentoModal(id, seed) {
    const editing = id ? this.state.lancamentos.find(l => l.id === id) : null;
    const tipo = editing ? editing.tipo : (seed?.tipo || "saida");
    const today = new Date().toISOString().slice(0, 10);
    // Seed pra "Salvar e Novo" — mantém alguns campos
    const seedDataComp = !editing && seed?.dataCompetencia ? seed.dataCompetencia : null;
    const seedDataPag = !editing && seed?.dataPagamento ? seed.dataPagamento : null;
    const seedConta = !editing && seed?.conta ? seed.conta : null;

    const html = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal">
          <div class="modal-head">
            <h2>${editing ? "Editar lançamento" : "Novo lançamento"}</h2>
            <button class="btn-icon" id="modal-close" title="Fechar">✕</button>
          </div>
          <form id="lanc-form" class="modal-body">
            <div class="type-toggle" id="type-toggle">
              <button type="button" data-tipo="entrada" class="${tipo === "entrada" ? "active-in" : ""}">Entrada</button>
              <button type="button" data-tipo="saida" class="${tipo === "saida" ? "active-out" : ""}">Saída</button>
            </div>
            <div class="form-grid" style="margin-top:14px;">
              <div class="form-field full">
                <label>Descrição</label>
                <input type="text" name="descricao" value="${escapeAttr(editing?.descricao || "")}" placeholder="Ex: Mercado, Salário, Netflix...">
              </div>
              <div class="form-field">
                <label>Valor (R$)</label>
                <input type="number" step="0.01" min="0" name="valor" required value="${editing?.valor || ""}">
              </div>
              <div class="form-field">
                <label>Categoria <span class="muted small" style="text-transform:none;letter-spacing:0;font-weight:400;">(Plano de Contas)</span></label>
                <select name="categoria" required>
                  <option value="">Selecione...</option>
                  ${Store.categoriasPorGrupo().map(g => `
                    <optgroup label="${escapeAttr(g.grupo)}">
                      ${g.categorias.map(c => `<option value="${escapeAttr(c)}" ${editing?.categoria === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
                    </optgroup>
                  `).join("")}
                </select>
              </div>
              <div class="form-field">
                <label>Conta / Cartão</label>
                <select name="conta" id="lanc-conta" required>
                  <option value="">Selecione...</option>
                  ${this.state.contas.map(c => `<option value="${escapeAttr(c.nome)}" data-tipo="${escapeAttr(c.tipo)}" ${(editing?.conta === c.nome || (!editing && seedConta === c.nome)) ? "selected" : ""}>${escapeHtml(c.nome)}${c.tipo === "cartao" ? " 💳" : ""}</option>`).join("")}
                </select>
              </div>
              <div class="form-field">
                <label>Data de competência <span class="muted small" style="text-transform:none;letter-spacing:0;font-weight:400;">(p/ DRE)</span></label>
                <input type="date" name="dataCompetencia" id="lanc-data-comp" required value="${editing?.dataCompetencia || seedDataComp || today}" ${editing && editing.grupoParcelas ? 'readonly title="Travada — esta parcela faz parte de um grupo. A competência é fixa em todas as parcelas." style="background:#f3f4f6;cursor:not-allowed;"' : ""}>
                ${editing && editing.grupoParcelas ? `<div class="muted small" style="margin-top:3px;color:var(--warning);">🔒 Parcela ${editing.parcelaIndex}/${editing.totalParcelas} — competência travada</div>` : `
                  <select id="lanc-comp-offset" style="margin-top:4px;padding:5px 8px;font-size:11.5px;border:1px solid var(--border);border-radius:7px;font-family:inherit;color:var(--text-muted);background:var(--bg-soft);width:100%;">
                    <option value="manual" selected>↑ Ajustar manualmente acima</option>
                    <option value="0">= Mesmo mês do pagamento</option>
                    <option value="-1">− 1 mês antes do pagamento (salário)</option>
                    <option value="-2">− 2 meses antes do pagamento</option>
                    <option value="-3">− 3 meses antes do pagamento</option>
                    <option value="1">+ 1 mês depois do pagamento</option>
                  </select>
                `}
              </div>
              <div class="form-field">
                <label>Data do pagamento <span class="muted small" style="text-transform:none;letter-spacing:0;font-weight:400;">(p/ Caixa)</span></label>
                <input type="date" name="dataPagamento" id="lanc-data-pag" value="${editing?.dataPagamento || seedDataPag || today}">
              </div>
              <div class="form-field">
                <label>Status <span id="lanc-status-hint" class="muted small" style="text-transform:none;letter-spacing:0;font-weight:400;"></span></label>
                <select name="status" id="lanc-status">
                  <option value="Pendente" ${editing?.status === "Pendente" ? "selected" : ""}>Pendente</option>
                  <option value="Pago" ${(!editing || editing?.status === "Pago") ? "selected" : ""}>Pago</option>
                </select>
              </div>
              <!-- Preview da fatura de cartão (preenchido por JS quando conta é cartão) -->
              <div class="form-field full hidden" id="cartao-preview" style="margin-top:4px;"></div>
              ${!editing ? `
              <div class="form-field">
                <label>Repetir (parcelas)</label>
                <input type="number" name="parcelas" min="1" max="36" value="1">
              </div>` : ""}
            </div>

            <!-- Rateio: divide o lançamento em múltiplos planos de contas -->
            <div class="rateio-section" style="margin-top:14px;">
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--text);cursor:pointer;text-transform:none;letter-spacing:0;">
                <input type="checkbox" id="rateio-toggle" style="width:auto;" ${editing && Array.isArray(editing.rateios) && editing.rateios.length ? "checked" : ""}>
                ⇆ Ratear este lançamento (dividir em vários planos de contas)
              </label>
              <div id="rateio-area" class="rateio-area ${editing && Array.isArray(editing.rateios) && editing.rateios.length ? "" : "hidden"}" style="margin-top:10px;">
                <div class="muted small" style="margin-bottom:6px;">
                  💡 Quando você ratear, a categoria principal é ignorada e o valor total é distribuído entre as categorias abaixo.
                </div>
                <div id="rateio-list"></div>
                <button type="button" class="btn btn-small" id="btn-add-rateio" style="margin-top:6px;">+ Adicionar parte</button>
                <div class="rateio-totals" style="margin-top:8px;display:flex;justify-content:space-between;font-size:12.5px;padding:6px 10px;background:#f9fafb;border-radius:6px;">
                  <span class="muted">Soma do rateio</span>
                  <span><b id="rateio-soma">R$ 0,00</b> <span class="muted">/ ${fmtMoney(editing?.valor || 0)} <span id="rateio-restante"></span></span></span>
                </div>
              </div>
            </div>
          </form>
          <div class="modal-foot">
            ${editing ? '<button class="btn btn-danger" id="modal-delete">Excluir</button>' : ""}
            <button class="btn" id="modal-cancel">Cancelar</button>
            ${!editing ? '<button class="btn" id="modal-save-new" title="Salva este lançamento e abre outro mantendo conta, competência e vencimento">💾+ Salvar e Novo</button>' : ""}
            <button class="btn btn-primary" id="modal-save">Salvar</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("modal-root").innerHTML = html;

    let currentTipo = tipo;
    const toggle = document.getElementById("type-toggle");
    toggle.querySelectorAll("button").forEach(b => {
      b.addEventListener("click", () => {
        currentTipo = b.dataset.tipo;
        toggle.querySelectorAll("button").forEach(x => {
          x.classList.remove("active-in", "active-out");
          if (x.dataset.tipo === currentTipo) x.classList.add(currentTipo === "entrada" ? "active-in" : "active-out");
        });
      });
    });

    // === Rateio ===
    const rateios = editing && Array.isArray(editing.rateios) ? editing.rateios.map(r => ({...r})) : [];
    const valorTotalInp = document.querySelector("input[name='valor']");
    const renderRateio = () => {
      const list = document.getElementById("rateio-list");
      list.innerHTML = rateios.map((r, i) => `
        <div class="rateio-row" data-idx="${i}">
          <select class="rateio-cat">
            <option value="">Categoria...</option>
            ${Store.categoriasPorGrupo().map(g => `
              <optgroup label="${escapeAttr(g.grupo)}">
                ${g.categorias.map(c => `<option value="${escapeAttr(c)}" ${r.categoria === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
              </optgroup>
            `).join("")}
          </select>
          <input type="number" step="0.01" min="0" class="rateio-valor" value="${r.valor || ""}" placeholder="0,00">
          <button type="button" class="btn-icon rateio-del" title="Remover">✕</button>
        </div>
      `).join("");
      list.querySelectorAll(".rateio-row").forEach(row => {
        const idx = parseInt(row.dataset.idx);
        row.querySelector(".rateio-cat").addEventListener("change", e => { rateios[idx].categoria = e.target.value; });
        row.querySelector(".rateio-valor").addEventListener("input", e => {
          rateios[idx].valor = parseFloat(e.target.value) || 0;
          atualizarSomaRateio();
        });
        row.querySelector(".rateio-del").addEventListener("click", () => { rateios.splice(idx, 1); renderRateio(); });
      });
      atualizarSomaRateio();
    };
    const atualizarSomaRateio = () => {
      const soma = rateios.reduce((s, r) => s + (Number(r.valor) || 0), 0);
      const total = parseFloat(valorTotalInp.value) || 0;
      const somaEl = document.getElementById("rateio-soma");
      const restEl = document.getElementById("rateio-restante");
      if (somaEl) {
        somaEl.textContent = fmtMoney(soma);
        somaEl.style.color = Math.abs(soma - total) < 0.005 ? "var(--success)" : "var(--danger)";
      }
      if (restEl) {
        const diff = total - soma;
        restEl.textContent = Math.abs(diff) < 0.005 ? "✓" : `(falta ${fmtMoney(diff)})`;
      }
    };
    document.getElementById("rateio-toggle").addEventListener("change", e => {
      const area = document.getElementById("rateio-area");
      area.classList.toggle("hidden", !e.target.checked);
      if (e.target.checked && rateios.length === 0) {
        rateios.push({ categoria: "", valor: parseFloat(valorTotalInp.value) || 0 });
      }
      renderRateio();
    });
    document.getElementById("btn-add-rateio").addEventListener("click", () => {
      const total = parseFloat(valorTotalInp.value) || 0;
      const somaAtual = rateios.reduce((s, r) => s + (Number(r.valor) || 0), 0);
      rateios.push({ categoria: "", valor: Math.max(0, total - somaAtual) });
      renderRateio();
    });
    valorTotalInp.addEventListener("input", atualizarSomaRateio);
    renderRateio();

    // Quando escolhe Cartão: status fica obrigatoriamente Pendente + dataPagamento auto
    const contaSel = document.getElementById("lanc-conta");
    const statusSel = document.getElementById("lanc-status");
    const statusHint = document.getElementById("lanc-status-hint");
    const dataPagInp = document.getElementById("lanc-data-pag");
    const dataCompInp = document.querySelector("input[name='dataCompetencia']");

    // Flag: usuário já mexeu manualmente no vencimento? Se sim, não auto-sobrescreve
    let userTouchedVencimento = false;
    if (dataPagInp) dataPagInp.addEventListener("input", () => { userTouchedVencimento = true; });

    const cartaoPreview = document.getElementById("cartao-preview");
    const aplicarRegrasCartao = (forceAutoFill) => {
      const sel = contaSel.options[contaSel.selectedIndex];
      const isCartao = sel && sel.dataset.tipo === "cartao";
      if (isCartao) {
        statusSel.value = "Pendente";
        statusSel.disabled = true;
        if (statusHint) statusHint.textContent = "(cartão = sempre pendente até pagar fatura)";
        const card = this.state.contas.find(c => c.nome === contaSel.value);
        if (card && dataCompInp.value && (forceAutoFill || !userTouchedVencimento)) {
          dataPagInp.value = calcDataPagamentoCartao(card, dataCompInp.value);
        }
        dataPagInp.readOnly = false;
        dataPagInp.title = "Sugerido pelo fechamento do cartão. Você pode editar manualmente.";

        // === PREVIEW: explica em que fatura vai cair ===
        if (cartaoPreview && card && dataCompInp.value) {
          const venc = dataPagInp.value;
          const compDate = dataCompInp.value;
          const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
          const [vy, vm] = (venc || "").split("-").map(Number);
          const labelFatura = vm ? `${meses[vm-1]}/${vy}` : "—";
          const regraTxt = (card.regraFatura || "fechamento") === "competencia"
            ? `regra "por mês de competência"`
            : `fech dia ${card.diaFechamento}, venc dia ${card.diaVencimento}`;
          const [cy, cm, cd] = compDate.split("-").map(Number);
          const passouFech = (card.regraFatura !== "competencia") && (cd > (card.diaFechamento || 28));
          const alerta = passouFech
            ? `<div style="color:var(--warning);margin-top:2px;font-weight:600;">⚠ Compra dia ${cd} é DEPOIS do dia ${card.diaFechamento} (fechamento) — vai pra próxima fatura</div>`
            : "";
          cartaoPreview.classList.remove("hidden");
          cartaoPreview.innerHTML = `
            <div style="padding:10px 12px;background:linear-gradient(135deg,#fffbf0 0%,#fef9e7 100%);border:1px solid #fde68a;border-radius:9px;font-size:12.5px;">
              💳 <b>${escapeHtml(card.nome)}</b> — ${escapeHtml(regraTxt)}
              <div style="margin-top:4px;color:var(--text);">
                Esta compra vai cair na <b>Fatura ${escapeHtml(labelFatura)}</b> (vencimento ${fmtDate(venc)})
              </div>
              ${alerta}
              <button type="button" class="btn btn-ghost btn-small" id="btn-edit-cartao-inline" style="margin-top:6px;padding:4px 10px;font-size:11.5px;">⚙ Ajustar fechamento/vencimento</button>
            </div>
          `;
          const btnEdit = document.getElementById("btn-edit-cartao-inline");
          if (btnEdit) btnEdit.addEventListener("click", () => {
            const cardName = card.nome;
            document.getElementById("modal-root").innerHTML = "";
            this.openCartaoConfigModal(cardName);
          });
        }
      } else {
        statusSel.disabled = false;
        if (statusHint) statusHint.textContent = "";
        dataPagInp.readOnly = false;
        dataPagInp.title = "";
        if (cartaoPreview) {
          cartaoPreview.classList.add("hidden");
          cartaoPreview.innerHTML = "";
        }
      }
    };
    // Mudar conta → re-aplica regras E força recalcular (zera o "touched")
    if (contaSel) contaSel.addEventListener("change", () => {
      userTouchedVencimento = false;
      aplicarRegrasCartao(true);
    });
    // Mudar vencimento manualmente → atualizar preview (sem recalcular)
    if (dataPagInp) dataPagInp.addEventListener("change", () => aplicarRegrasCartao(false));
    // Mudar competência → recalcula sugestão (a menos que o usuário tenha tocado no vencimento)
    if (dataCompInp) dataCompInp.addEventListener("change", () => aplicarRegrasCartao(false));
    aplicarRegrasCartao(true); // aplica logo na abertura

    // === Quick offset de competência ===
    const compOffsetSel = document.getElementById("lanc-comp-offset");
    const compInp = document.getElementById("lanc-data-comp");
    const pagInp = document.getElementById("lanc-data-pag");

    const calcCompetenciaFromOffset = (offset) => {
      const pag = pagInp.value;
      if (!pag) return;
      const [y, m, d] = pag.split("-").map(Number);
      const dt = new Date(y, m - 1 + parseInt(offset), d);
      const lastDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
      dt.setDate(Math.min(d, lastDay));
      const novaComp = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      compInp.value = novaComp;
    };

    if (compOffsetSel) {
      compOffsetSel.addEventListener("change", () => {
        if (compOffsetSel.value !== "manual") {
          calcCompetenciaFromOffset(compOffsetSel.value);
        }
      });
      // Se mudar pagamento manualmente, recalcular competência (se offset estiver ativo)
      if (pagInp) pagInp.addEventListener("change", () => {
        if (compOffsetSel.value !== "manual") {
          calcCompetenciaFromOffset(compOffsetSel.value);
        }
      });
      // Se usuário mexer manualmente na competência, voltar para "manual"
      if (compInp) compInp.addEventListener("input", () => {
        if (compOffsetSel.value !== "manual") {
          compOffsetSel.value = "manual";
        }
      });
    }

    const close = () => { document.getElementById("modal-root").innerHTML = ""; };
    document.getElementById("modal-close").addEventListener("click", close);
    document.getElementById("modal-cancel").addEventListener("click", close);
    document.getElementById("modal-bd").addEventListener("click", e => {
      if (e.target.id === "modal-bd") close();
    });

    if (editing) {
      document.getElementById("modal-delete").addEventListener("click", () => {
        if (confirm("Excluir este lançamento?")) {
          Store.deleteLancamento(editing.id);
          close();
          this.renderAll();
          toast("Lançamento excluído", "success");
        }
      });
    }

    const doSave = (saveAndNew) => {
      const form = document.getElementById("lanc-form");
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const contaNome = fd.get("conta");
      const contaObj = this.state.contas.find(c => c.nome === contaNome);
      const dataComp = fd.get("dataCompetencia");
      let dataPag = fd.get("dataPagamento") || dataComp;

      const userTouched = fd.get("dataPagamento") && fd.get("dataPagamento") !== dataComp;
      if (contaObj && contaObj.tipo === "cartao" && !userTouched) {
        dataPag = calcDataPagamentoCartao(contaObj, dataComp);
      }

      let statusFinal = fd.get("status") || "Pendente";
      if (contaObj && contaObj.tipo === "cartao") statusFinal = "Pendente";

      const base = {
        tipo: currentTipo,
        descricao: (fd.get("descricao") || "").toString().trim(),
        categoria: fd.get("categoria"),
        conta: contaNome,
        valor: parseFloat(fd.get("valor")) || 0,
        dataCompetencia: dataComp,
        dataPagamento: dataPag,
        status: statusFinal
      };
      // Valida rateio (se ativado)
      const rateioAtivo = document.getElementById("rateio-toggle")?.checked;
      let rateiosFinal = [];
      if (rateioAtivo && rateios.length) {
        const soma = rateios.reduce((s, r) => s + (Number(r.valor) || 0), 0);
        const total = base.valor;
        if (Math.abs(soma - total) > 0.01) {
          toast(`Soma do rateio (${fmtMoney(soma)}) deve ser igual ao valor total (${fmtMoney(total)})`, "error");
          return;
        }
        const incompleto = rateios.find(r => !r.categoria || !r.valor);
        if (incompleto) {
          toast("Todas as partes do rateio precisam ter categoria e valor", "error");
          return;
        }
        rateiosFinal = rateios.map(r => ({ categoria: r.categoria, valor: Number(r.valor) }));
        base.categoria = rateiosFinal[0].categoria;
      }
      base.rateios = rateiosFinal;

      if (editing) {
        Store.updateLancamento(editing.id, base);
        toast("Lançamento atualizado", "success");
      } else {
        const parcelas = parseInt(fd.get("parcelas")) || 1;
        const baseDataPagamento = (contaObj && contaObj.tipo === "cartao" && !userTouched)
          ? calcDataPagamentoCartao(contaObj, base.dataCompetencia)
          : base.dataPagamento;
        const grupoId = parcelas > 1 ? "grp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7) : null;
        for (let i = 0; i < parcelas; i++) {
          const comp = base.dataCompetencia;
          const pag = addMonths(baseDataPagamento, i);
          const desc = parcelas > 1 ? `${base.descricao} (${i + 1}/${parcelas})` : base.descricao;
          const novoLanc = { ...base, descricao: desc, dataCompetencia: comp, dataPagamento: pag };
          if (grupoId) {
            novoLanc.grupoParcelas = grupoId;
            novoLanc.parcelaIndex = i + 1;
            novoLanc.totalParcelas = parcelas;
          }
          Store.addLancamento(novoLanc);
        }
        toast(parcelas > 1 ? `${parcelas} parcelas criadas (mesma competência: ${fmtDate(base.dataCompetencia)})` : "Lançamento criado", "success");
      }
      close();
      this.state = Store.get();
      this.renderAll();

      // Salvar e Novo: reabre o modal com seed (conta, datas)
      if (saveAndNew && !editing) {
        const seed = {
          tipo: currentTipo,
          conta: base.conta,
          dataCompetencia: base.dataCompetencia,
          dataPagamento: base.dataPagamento
        };
        setTimeout(() => this.openLancamentoModal(null, seed), 50);
      }
    };

    document.getElementById("modal-save").addEventListener("click", () => doSave(false));
    const btnSaveNew = document.getElementById("modal-save-new");
    if (btnSaveNew) btnSaveNew.addEventListener("click", () => doSave(true));
  },

  // ---------------- Contas a Pagar / a Receber ----------------
  bindContas() {
    document.getElementById("cf-periodo").addEventListener("change", e => {
      this.contasFilters.periodo = e.target.value; this.renderContas();
    });
    document.getElementById("cf-categoria").addEventListener("change", e => {
      this.contasFilters.categoria = e.target.value; this.renderContas();
    });
    document.getElementById("cf-conta").addEventListener("change", e => {
      this.contasFilters.conta = e.target.value; this.renderContas();
    });
    const selCartoes = document.getElementById("cf-cartoes");
    if (selCartoes) selCartoes.addEventListener("change", e => {
      this.contasFilters.cartoes = e.target.value; this.renderContas();
    });
    // Toggle Tipo
    document.querySelectorAll(".contas-tipo-btn").forEach(b => {
      b.addEventListener("click", () => {
        this.contasFilters.tipo = b.dataset.tipo;
        document.querySelectorAll(".contas-tipo-btn").forEach(x => x.classList.toggle("active", x === b));
        this.renderContas();
      });
    });
    document.getElementById("btn-nova-conta").addEventListener("click", () => this.openLancamentoModal());
  },

  renderContas() {
    const tbody = document.getElementById("tbody-contas");
    const today = todayStr();
    const f = this.contasFilters;

    // Título dinâmico
    const titleEl = document.getElementById("contas-title");
    if (titleEl) {
      titleEl.textContent = f.tipo === "entrada" ? "Contas a Receber"
                          : f.tipo === "tudo" ? "Contas a Pagar e Receber"
                          : "Contas a Pagar";
    }
    document.querySelectorAll(".contas-tipo-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.tipo === f.tipo);
    });

    // === Filtro por tipo ===
    let items = this.state.lancamentos.filter(l => statusEfetivo(l) !== "Pago");
    if (f.tipo === "saida") items = items.filter(l => l.tipo === "saida");
    else if (f.tipo === "entrada") items = items.filter(l => l.tipo === "entrada");

    if (f.categoria) items = items.filter(l => l.categoria === f.categoria);
    if (f.conta) items = items.filter(l => l.conta === f.conta);

    if (f.periodo === "vencidas") items = items.filter(l => l.dataPagamento < today);
    else if (f.periodo === "7") items = items.filter(l => daysUntil(l.dataPagamento) >= 0 && daysUntil(l.dataPagamento) <= 7);
    else if (f.periodo === "30") items = items.filter(l => daysUntil(l.dataPagamento) >= -30 && daysUntil(l.dataPagamento) <= 30);
    else if (f.periodo === "mes") items = items.filter(l => this.inPeriod(l.dataPagamento, this.period));

    items.sort((a, b) => (a.dataPagamento || "").localeCompare(b.dataPagamento || ""));

    // === Agrupamento de cartões por fatura (se filtro = agrupado) ===
    const cartoesNomes = this.state.contas.filter(c => c.tipo === "cartao").map(c => c.nome);
    const agrupar = f.cartoes === "agrupado";
    let itensCartaoAgrupados = [];
    let itensNormais = items;

    if (agrupar) {
      itensNormais = items.filter(l => !cartoesNomes.includes(l.conta));
      const itensCartao = items.filter(l => cartoesNomes.includes(l.conta));
      // Agrupa por (conta + YM dataPagamento)
      const grupos = new Map();
      itensCartao.forEach(l => {
        const ym = (l.dataPagamento || l.dataCompetencia || "").slice(0, 7);
        const key = `${l.conta}__${ym}`;
        if (!grupos.has(key)) grupos.set(key, {
          conta: l.conta, ym, lancs: [], total: 0, devedor: 0, pago: 0,
          // pega a data de vencimento real (último dia da fatura)
          dataPagamento: l.dataPagamento || l.dataCompetencia
        });
        const g = grupos.get(key);
        g.lancs.push(l);
        g.total += l.valor;
        g.devedor += saldoDevedor(l);
        g.pago += valorPagoDe(l);
        if (l.dataPagamento && l.dataPagamento < g.dataPagamento) g.dataPagamento = l.dataPagamento;
      });
      itensCartaoAgrupados = [...grupos.values()].sort((a, b) => (a.dataPagamento || "").localeCompare(b.dataPagamento || ""));
    }

    if (!itensNormais.length && !itensCartaoAgrupados.length) {
      const labelVazio = f.tipo === "entrada" ? "Nenhuma conta a receber" : f.tipo === "saida" ? "Nenhuma conta a pagar" : "Nenhuma conta pendente";
      tbody.innerHTML = `<tr><td colspan="8" class="empty"><span class="empty-icon">✓</span>${labelVazio}</td></tr>`;
      document.getElementById("foot-contas").textContent = fmtMoney(0);
      return;
    }

    // ====== RENDER ======
    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const fmtYM = ym => { const [y, m] = ym.split("-").map(Number); return meses[m - 1] + "/" + String(y).slice(2); };

    // Combina: faturas agrupadas (vão primeiro com destaque) + lançamentos normais
    let html = "";

    // Faturas de cartão agrupadas
    if (agrupar && itensCartaoAgrupados.length) {
      html += itensCartaoAgrupados.map(g => {
        const d = daysUntil(g.dataPagamento);
        let diasLabel;
        if (d < 0) diasLabel = `<span class="chip chip-vencida">${Math.abs(d)}d atraso</span>`;
        else if (d === 0) diasLabel = `<span class="chip chip-hoje">Hoje</span>`;
        else diasLabel = `<span class="chip">em ${d}d</span>`;
        const parcial = g.pago > 0.005;
        const valorLabel = parcial
          ? `<div style="color:var(--danger);font-weight:700;">${fmtMoney(g.devedor)}</div><div class="muted small" style="margin-top:2px;">de ${fmtMoney(g.total)} • ${fmtMoney(g.pago)} pago</div>`
          : `<div style="font-weight:700;">${fmtMoney(g.devedor)}</div>`;
        return `
          <tr class="fatura-row" data-card="${escapeAttr(g.conta)}" data-ym="${escapeAttr(g.ym)}" title="Clique pra ver os lançamentos">
            <td>${fmtDate(g.dataPagamento)}</td>
            <td>${diasLabel}</td>
            <td><b>💳 Fatura ${escapeHtml(fmtYM(g.ym))}</b><div class="muted small">${g.lancs.length} lançamento${g.lancs.length > 1 ? "s" : ""}</div></td>
            <td><span class="chip">Cartão</span></td>
            <td><b>${escapeHtml(g.conta)}</b></td>
            <td class="right amount-out">${valorLabel}</td>
            <td>${parcial ? '<span class="chip chip-parcial">⏳ Parcial</span>' : '<span class="chip chip-pendente">Pendente</span>'}</td>
            <td>
              <div class="row-actions">
                <button class="btn-icon" title="Pagar fatura (parcial ou total)" data-act="pagar-fatura" data-card="${escapeAttr(g.conta)}" data-ym="${escapeAttr(g.ym)}">💰</button>
                <button class="btn-icon" title="Ver lançamentos da fatura" data-act="ver-fatura" data-card="${escapeAttr(g.conta)}" data-ym="${escapeAttr(g.ym)}">👁</button>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }

    // Lançamentos normais (não-cartão ou cartão individual)
    html += itensNormais.map(l => {
      const d = daysUntil(l.dataPagamento);
      let diasLabel;
      if (d < 0) diasLabel = `<span class="chip chip-vencida">${Math.abs(d)}d atraso</span>`;
      else if (d === 0) diasLabel = `<span class="chip chip-hoje">Hoje</span>`;
      else diasLabel = `<span class="chip">em ${d}d</span>`;

      const st = statusEfetivo(l);
      const pago = valorPagoDe(l);
      const devedor = saldoDevedor(l);
      const isParcial = st === "Parcial";
      const isEntrada = l.tipo === "entrada";
      const valorLabel = isParcial
        ? `<div style="color:${isEntrada ? 'var(--success)' : 'var(--danger)'};font-weight:700;">${fmtMoney(devedor)}</div><div class="muted small" style="margin-top:2px;">de ${fmtMoney(l.valor)} • ${fmtMoney(pago)} ${isEntrada ? "recebido" : "pago"}</div>`
        : fmtMoney(l.valor);
      const rowClass = isParcial ? 'class="row-parcial"' : "";
      const isCartao = cartoesNomes.includes(l.conta);
      return `
        <tr ${rowClass}>
          <td>${fmtDate(l.dataPagamento)}</td>
          <td>${diasLabel}</td>
          <td>${escapeHtml(l.descricao || l.categoria)}</td>
          <td><span class="chip">${escapeHtml(l.categoria)}</span></td>
          <td>${isCartao ? "💳 " : ""}${escapeHtml(l.conta)}</td>
          <td class="right ${isEntrada ? "amount-in" : "amount-out"}">${valorLabel}</td>
          <td>${isParcial ? '<span class="chip chip-parcial">⏳ Parcial</span>' : (isEntrada ? '<span class="chip chip-pendente">A receber</span>' : '<span class="chip chip-pendente">A pagar</span>')}</td>
          <td>
            <div class="row-actions">
              <button class="btn-icon" title="${isParcial ? 'Continuar / ver histórico' : (isEntrada ? 'Receber (parcial ou total)' : 'Pagar (parcial ou total)')}" data-act="partial" data-id="${l.id}">💵</button>
              <button class="btn-icon" title="Editar" data-act="edit" data-id="${l.id}">✎</button>
              <button class="btn-icon" title="Excluir" data-act="del" data-id="${l.id}">✕</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    tbody.innerHTML = html;

    tbody.querySelectorAll("button[data-act]").forEach(btn => {
      const act = btn.dataset.act;
      if (act === "pagar-fatura") {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          this.openPagarFaturaModal(btn.dataset.card, btn.dataset.ym);
        });
      } else if (act === "ver-fatura") {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          this.openExtratoFaturaModal(btn.dataset.card, btn.dataset.ym);
        });
      } else {
        btn.addEventListener("click", () => this.handleRowAction(act, btn.dataset.id));
      }
    });
    // Clicar na linha da fatura abre o extrato
    tbody.querySelectorAll(".fatura-row").forEach(row => {
      row.addEventListener("click", () => {
        this.openExtratoFaturaModal(row.dataset.card, row.dataset.ym);
      });
    });

    // Total do footer (soma todos os devedores)
    let tot = itensNormais.reduce((s, l) => s + saldoDevedor(l), 0);
    tot += itensCartaoAgrupados.reduce((s, g) => s + g.devedor, 0);
    document.getElementById("foot-contas").textContent = fmtMoney(tot);
  },

  // Modal de extrato da fatura (lista lançamentos individuais)
  openExtratoFaturaModal(cardName, faturaYM) {
    const card = this.state.contas.find(c => c.nome === cardName);
    if (!card) return;
    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const [y, m] = faturaYM.split("-").map(Number);
    const labelMes = `${meses[m - 1]}/${y}`;

    const lancs = this.state.lancamentos
      .filter(l => l.conta === cardName && l.tipo === "saida" && statusEfetivo(l) !== "Pago"
        && (l.dataPagamento || l.dataCompetencia || "").slice(0, 7) === faturaYM)
      .sort((a, b) => (a.dataCompetencia || "").localeCompare(b.dataCompetencia || ""));
    const totalDevedor = lancs.reduce((s, l) => s + saldoDevedor(l), 0);

    const html = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal" style="max-width:680px;">
          <div class="modal-head">
            <h2>💳 ${escapeHtml(cardName)} — Fatura ${escapeHtml(labelMes)}</h2>
            <button class="btn-icon" id="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="cupom-summary" style="margin-bottom:14px;">
              <div class="cupom-row"><span class="lbl">Total devedor</span><span class="val" style="font-size:18px;color:var(--danger);">${fmtMoney(totalDevedor)}</span></div>
              <div class="cupom-row"><span class="lbl">Lançamentos</span><span class="val">${lancs.length}</span></div>
            </div>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Compra</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th class="right">Valor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${lancs.map(l => `
                    <tr>
                      <td>${fmtDate(l.dataCompetencia)}</td>
                      <td>${escapeHtml(l.descricao || "—")}</td>
                      <td><span class="chip">${escapeHtml(l.categoria)}</span></td>
                      <td class="right amount-out">${fmtMoney(saldoDevedor(l))}</td>
                      <td>${statusChipEfetivo(l)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn" id="modal-cancel">Fechar</button>
            <button class="btn btn-primary" id="btn-pagar-aqui">💰 Pagar fatura</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("modal-root").innerHTML = html;
    const close = () => { document.getElementById("modal-root").innerHTML = ""; };
    document.getElementById("modal-close").addEventListener("click", close);
    document.getElementById("modal-cancel").addEventListener("click", close);
    document.getElementById("modal-bd").addEventListener("click", e => { if (e.target.id === "modal-bd") close(); });
    document.getElementById("btn-pagar-aqui").addEventListener("click", () => {
      close();
      this.openPagarFaturaModal(cardName, faturaYM);
    });
  },

  // ---------------- Cartões ----------------
  renderCartoes() {
    const cartoes = this.state.contas.filter(c => c.tipo === "cartao");
    const grid = document.getElementById("cards-grid");
    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const fmtYM = ym => { const [y, m] = ym.split("-").map(Number); return meses[m - 1] + "/" + String(y).slice(2); };
    const lancsCartao = this.state.lancamentos.filter(l =>
      l.tipo === "saida" && cartoes.some(c => c.nome === l.conta) && this.inPeriod(l.dataCompetencia, this.period)
    );

    grid.innerHTML = cartoes.length ? cartoes.map(c => {
      const pendentes = this.state.lancamentos.filter(l => l.tipo === "saida" && l.conta === c.nome && l.status === "Pendente");
      const groups = new Map();
      pendentes.forEach(l => {
        const ym = (l.dataPagamento || l.dataCompetencia).slice(0, 7);
        if (!groups.has(ym)) groups.set(ym, { ym, total: 0, count: 0 });
        const g = groups.get(ym);
        g.total += l.valor;
        g.count++;
      });
      const faturas = [...groups.values()].sort((a, b) => a.ym.localeCompare(b.ym));
      const proxima = faturas[0];
      const totalAberto = faturas.reduce((s, f) => s + f.total, 0);
      return `
        <div class="credit-card">
          <div>
            <div class="credit-card-name">${escapeHtml(c.nome)}</div>
            <div class="credit-card-meta">Fecha dia ${c.diaFechamento || 28} • Vence dia ${c.diaVencimento || 5}</div>
          </div>
          <div>
            ${proxima ? `
              <div class="credit-card-amount">${fmtMoney(proxima.total)}</div>
              <div class="credit-card-meta">Próxima fatura • ${fmtYM(proxima.ym)} • ${proxima.count} lanç.</div>
              ${faturas.length > 1 ? `<div class="credit-card-meta" style="margin-top:6px;">+ ${faturas.length - 1} fatura${faturas.length - 1 > 1 ? "s" : ""} futura${faturas.length - 1 > 1 ? "s" : ""} • Total ${fmtMoney(totalAberto)}</div>` : ""}
            ` : `
              <div class="credit-card-amount">${fmtMoney(0)}</div>
              <div class="credit-card-meta">Sem faturas pendentes</div>
            `}
          </div>
        </div>
      `;
    }).join("") : '<div class="empty">Nenhum cartão cadastrado. Adicione em Configurações.</div>';

    const tbody = document.getElementById("tbody-cartoes");
    if (!lancsCartao.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty">Nenhum lançamento de cartão em ${this.periodLabel()}</td></tr>`;
    } else {
      lancsCartao.sort((a, b) => (b.dataCompetencia || "").localeCompare(a.dataCompetencia || ""));
      tbody.innerHTML = lancsCartao.map(l => `
        <tr>
          <td>${fmtDate(l.dataCompetencia)}</td>
          <td>${escapeHtml(l.descricao || l.categoria)}</td>
          <td><span class="chip">${escapeHtml(l.categoria)}</span></td>
          <td>${escapeHtml(l.conta)}</td>
          <td class="right amount-out">${fmtMoney(l.valor)}</td>
          <td>${statusChip(l.status)}</td>
        </tr>
      `).join("");
    }
  },

  // ---------------- Fluxo de Caixa ----------------
  renderFluxo() {
    // Visão UNIFICADA do mês: realizado + previsto numa só, baseada em dataPagamento
    document.getElementById("fluxo-period").textContent =
      `📊 Movimentações de ${this.periodLabel()} (regime de caixa — pagamentos e recebimentos)`;

    const contasBanc = this.state.contas.filter(c => c.tipo !== "cartao");
    const cartoes = this.state.contas.filter(c => c.tipo === "cartao");

    // === DADOS DOS CARTÕES (faturas) ===
    const dadosCartoes = cartoes.map(c => {
      // Considera pendente OU parcial — usa saldoDevedor
      const lancsPend = this.state.lancamentos.filter(l =>
        l.conta === c.nome && l.tipo === "saida" && statusEfetivo(l) !== "Pago"
      );
      const groups = new Map();
      lancsPend.forEach(l => {
        const ym = (l.dataPagamento || l.dataCompetencia).slice(0, 7);
        if (!groups.has(ym)) groups.set(ym, { ym, total: 0, count: 0 });
        const g = groups.get(ym);
        g.total += saldoDevedor(l);
        g.count++;
      });
      const faturas = [...groups.values()].sort((a, b) => a.ym.localeCompare(b.ym));
      const totalAberto = faturas.reduce((s, f) => s + f.total, 0);
      const proxima = faturas[0] || null;
      const futuras = faturas.slice(1);
      return { conta: c, faturas, proxima, futuras, totalAberto };
    });

    // Mapa: nome da conta bancaria -> array de {cartao, total} de faturas a pagar via ela
    // Em modo Previsto: SÓ considera faturas que vencem no mês selecionado
    // Em modo Realizado: irrelevante (cartões não aparecem em modo realizado)
    const periodoYM = `${this.period.y}-${String(this.period.m).padStart(2, "0")}`;
    const faturasPorBanco = new Map();
    dadosCartoes.forEach(d => {
      const pagaVia = d.conta.contaPagamento;
      if (!pagaVia) return;
      // Filtra só faturas do mês selecionado
      const faturaDoMes = d.faturas.find(f => f.ym === periodoYM);
      if (!faturaDoMes || faturaDoMes.total <= 0) return;
      if (!faturasPorBanco.has(pagaVia)) faturasPorBanco.set(pagaVia, []);
      faturasPorBanco.get(pagaVia).push({ cartao: d.conta.nome, total: faturaDoMes.total });
    });

    // === DADOS DAS CONTAS BANCÁRIAS ===
    // Visão unificada: junta realizado (pagos no mês) + previsto (pendentes/parciais com vencimento no mês)
    const somarPagamentos = (contaName, tipoLanc, dentroPeriodo) => {
      let total = 0;
      this.state.lancamentos.forEach(l => {
        if (l.tipo !== tipoLanc) return;
        const pagamentos = Array.isArray(l.pagamentos) && l.pagamentos.length
          ? l.pagamentos
          : (l.status === "Pago" ? [{ data: l.dataPagamento || l.dataCompetencia, valor: l.valor, conta: l.conta }] : []);
        pagamentos.forEach(p => {
          if (p.conta !== contaName) return;
          if (dentroPeriodo && !this.inPeriod(p.data, this.period)) return;
          total += Number(p.valor) || 0;
        });
      });
      return total;
    };

    // Filtra um lançamento pelo período (regime de caixa, baseado em dataPagamento)
    const venceNoPeriodo = (l) => this.inPeriod(l.dataPagamento || l.dataCompetencia, this.period);
    // Soma pagamentos[] cuja data é ANTES do início do período (saldo inicial dinâmico)
    const inicioPeriodo = `${this.period.y}-${String(this.period.m).padStart(2, "0")}-01`;
    const somarPagamentosAntesDe = (contaName, tipoLanc, dataLimite) => {
      let total = 0;
      this.state.lancamentos.forEach(l => {
        if (l.tipo !== tipoLanc) return;
        const pagamentos = Array.isArray(l.pagamentos) && l.pagamentos.length
          ? l.pagamentos
          : (l.status === "Pago" ? [{ data: l.dataPagamento || l.dataCompetencia, valor: l.valor, conta: l.conta }] : []);
        pagamentos.forEach(p => {
          if (p.conta !== contaName) return;
          if ((p.data || "") >= dataLimite) return;
          total += Number(p.valor) || 0;
        });
      });
      return total;
    };

    const dadosContas = contasBanc.map(c => {
      const lancs = this.state.lancamentos.filter(l => l.conta === c.nome);

      // PAGOS no mês (regime de caixa, usa pagamento.data dentro do período)
      const entPagas = somarPagamentos(c.nome, "entrada", true);
      const saiPagas = somarPagamentos(c.nome, "saida", true);

      // PENDENTES/PARCIAIS com vencimento no mês
      const lancsPend = lancs.filter(l => statusEfetivo(l) !== "Pago" && venceNoPeriodo(l));
      const entPend = lancsPend.filter(l => l.tipo === "entrada").reduce((s, l) => s + saldoDevedor(l), 0);
      const saiPend = lancsPend.filter(l => l.tipo === "saida").reduce((s, l) => s + saldoDevedor(l), 0);

      // Saldo até o início do mês (acumulado dos pagamentos anteriores)
      const inicialEstatico = Number(c.saldoInicial) || 0;
      const saldoMesAnterior = inicialEstatico
        + somarPagamentosAntesDe(c.nome, "entrada", inicioPeriodo)
        - somarPagamentosAntesDe(c.nome, "saida", inicioPeriodo);

      // Saldo ATUAL (acumulado real até agora) = inicial + tudo que já foi pago
      const saldoAtual = inicialEstatico
        + somarPagamentos(c.nome, "entrada", false)
        - somarPagamentos(c.nome, "saida", false);

      // Saldo realizado do mês (já efetivado)
      const saldoRealizadoMes = saldoMesAnterior + entPagas - saiPagas;

      // Saldo final previsto = saldo realizado do mês + pendentes do mês − faturas do mês
      const saldoPrevistoSemCartao = saldoRealizadoMes + entPend - saiPend;
      const cartoesAssoc = faturasPorBanco.get(c.nome) || [];
      const totalCartoes = cartoesAssoc.reduce((s, x) => s + x.total, 0);
      const saldoFinal = saldoPrevistoSemCartao - totalCartoes;
      return {
        conta: c,
        inicial: saldoMesAnterior,    // saldo até início do mês
        saldoAtual,                    // posição real hoje
        saldoRealizadoMes,             // saldo após pagos do mês (sem pendentes)
        entPagas, saiPagas, entPend, saiPend,
        saldoPrevistoSemCartao, totalCartoes, cartoesAssoc, saldoFinal
      };
    });

    // === KPIs UNIFICADOS DO MÊS ===
    const totalSaldoAtual = dadosContas.reduce((s, d) => s + d.saldoAtual, 0);
    const totalEntPagas = dadosContas.reduce((s, d) => s + d.entPagas, 0);
    const totalSaiPagas = dadosContas.reduce((s, d) => s + d.saiPagas, 0);
    const totalAReceber = dadosContas.reduce((s, d) => s + d.entPend, 0);
    const totalAPagarContas = dadosContas.reduce((s, d) => s + d.saiPend, 0);
    const totalFaturas = dadosContas.reduce((s, d) => s + d.totalCartoes, 0);
    const totalPagarPend = totalAPagarContas + totalFaturas;
    const totalSaldoFinal = dadosContas.reduce((s, d) => s + d.saldoFinal, 0);

    document.getElementById("fluxo-totais").innerHTML = `
      <div class="kpi kpi-saldo">
        <div class="kpi-label">Saldo atual em contas</div>
        <div class="kpi-value">${fmtMoney(totalSaldoAtual)}</div>
        <div class="kpi-foot muted">Posição real hoje (acumulado)</div>
      </div>
      <div class="kpi kpi-in">
        <div class="kpi-label">Entradas em ${escapeHtml(this.periodLabel())}</div>
        <div class="kpi-value">${fmtMoney(totalEntPagas + totalAReceber)}</div>
        <div class="kpi-foot muted">${fmtMoney(totalEntPagas)} ✓ recebido • ${fmtMoney(totalAReceber)} a receber</div>
      </div>
      <div class="kpi kpi-out">
        <div class="kpi-label">Saídas em ${escapeHtml(this.periodLabel())}</div>
        <div class="kpi-value">${fmtMoney(totalSaiPagas + totalPagarPend)}</div>
        <div class="kpi-foot muted">${fmtMoney(totalSaiPagas)} ✓ pago • ${fmtMoney(totalPagarPend)} a pagar</div>
      </div>
      <div class="kpi kpi-pend">
        <div class="kpi-label">Saldo final previsto</div>
        <div class="kpi-value">${fmtMoney(totalSaldoFinal)}</div>
        <div class="kpi-foot muted">Após pagar/receber tudo do mês</div>
      </div>
    `;

    // === HTML DOS CARDS ===
    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const fmtYM = ym => {
      const [y, m] = ym.split("-").map(Number);
      return meses[m - 1] + "/" + String(y).slice(2);
    };

    const totalCartoes = dadosCartoes.reduce((s, d) => s + d.totalAberto, 0);

    const htmlContas = dadosContas.length ? `
      <div class="fluxo-section">
        <div class="fluxo-section-title">
          <h3>🏦 Contas Bancárias</h3>
          <span class="total">Saldo final previsto: ${fmtMoney(totalSaldoFinal)}</span>
        </div>
        <div class="fluxo-cards">
          ${dadosContas.map(d => {
            const clsF = d.saldoFinal >= 0 ? "pos" : "neg";
            const cartoesHtml = d.cartoesAssoc.length ? `
              <div class="fluxo-mini-list">
                ${d.cartoesAssoc.map(c => `
                  <div class="fluxo-mini-row">
                    <span>💳 ${escapeHtml(c.cartao)}</span>
                    <span class="val out">−${fmtMoney(c.total)}</span>
                  </div>
                `).join("")}
              </div>
            ` : "";
            const semMov = d.entPagas === 0 && d.saiPagas === 0 && d.entPend === 0 && d.saiPend === 0 && d.totalCartoes === 0;
            return `
              <div class="fluxo-card bank">
                <div class="fluxo-card-head">
                  <div class="fluxo-card-icon">🏦</div>
                  <div class="fluxo-card-titles">
                    <div class="fluxo-card-name">${escapeHtml(d.conta.nome)}</div>
                    <div class="fluxo-card-tipo">Saldo atual: <b>${fmtMoney(d.saldoAtual)}</b></div>
                  </div>
                </div>

                <!-- valor principal: saldo FINAL ao fim do MÊS selecionado -->
                <div class="fluxo-card-main">
                  <div class="fluxo-card-saldo ${clsF}">${fmtMoney(d.saldoFinal)}</div>
                  <div class="fluxo-card-saldo-label">Previsto ao final de ${escapeHtml(this.periodLabel())}</div>
                </div>

                <!-- breakdown UNIFICADO do MÊS: realizado + previsto -->
                <div class="fluxo-projecao">
                  <div class="fluxo-projecao-row">
                    <span>Saldo até ${escapeHtml(this.periodLabelAnterior())}</span>
                    <span class="val">${fmtMoney(d.inicial)}</span>
                  </div>
                  ${d.entPagas > 0 ? `
                    <div class="fluxo-projecao-row plus">
                      <span>✓ Recebido em ${escapeHtml(this.periodLabel())}</span>
                      <span class="val in">${fmtMoney(d.entPagas)}</span>
                    </div>
                  ` : ""}
                  ${d.saiPagas > 0 ? `
                    <div class="fluxo-projecao-row minus">
                      <span>✓ Pago em ${escapeHtml(this.periodLabel())}</span>
                      <span class="val out">${fmtMoney(d.saiPagas)}</span>
                    </div>
                  ` : ""}
                  ${d.entPend > 0 ? `
                    <div class="fluxo-projecao-row plus">
                      <span>⏳ A receber em ${escapeHtml(this.periodLabel())}</span>
                      <span class="val in">${fmtMoney(d.entPend)}</span>
                    </div>
                  ` : ""}
                  ${d.saiPend > 0 ? `
                    <div class="fluxo-projecao-row minus">
                      <span>⏳ A pagar em ${escapeHtml(this.periodLabel())}</span>
                      <span class="val out">${fmtMoney(d.saiPend)}</span>
                    </div>
                  ` : ""}
                  ${d.totalCartoes > 0 ? `
                    <div class="fluxo-projecao-row minus">
                      <span>💳 Faturas em ${escapeHtml(this.periodLabel())}</span>
                      <span class="val out">${fmtMoney(d.totalCartoes)}</span>
                    </div>
                    ${cartoesHtml}
                  ` : ""}
                  ${semMov ? `
                    <div class="muted small" style="text-align:center;padding:8px;">Sem movimentação no mês</div>
                  ` : ""}
                </div>

              </div>
            `;
          }).join("")}
        </div>
      </div>
    ` : "";

    const htmlCartoes = !dadosCartoes.length ? "" : `
      <div class="fluxo-section">
        <div class="fluxo-section-title">
          <h3>💳 Cartões de Crédito</h3>
          <span class="total">Total em aberto: ${fmtMoney(totalCartoes)}</span>
        </div>
        <div class="fluxo-cards">
          ${dadosCartoes.map(d => {
            const c = d.conta;
            const futurasHtml = d.futuras.length
              ? d.futuras.map(f => `
                  <div class="fluxo-fatura-row">
                    <span class="lbl">${fmtYM(f.ym)}</span>
                    <span class="val">${fmtMoney(f.total)}</span>
                  </div>
                `).join("")
              : "";
            return `
              <div class="fluxo-card cartao">
                <div class="fluxo-card-head">
                  <div class="fluxo-card-icon">💳</div>
                  <div class="fluxo-card-titles">
                    <div class="fluxo-card-name">${escapeHtml(c.nome)}</div>
                    <div class="fluxo-card-tipo">Fecha dia ${c.diaFechamento || 28} • Vence dia ${c.diaVencimento || 5}</div>
                  </div>
                  <button class="fluxo-card-config" data-edit-card="${escapeAttr(c.nome)}" title="Configurar">⚙</button>
                </div>

                <div class="fluxo-card-main">
                  <div class="fluxo-card-saldo ${d.proxima ? "neg" : "pos"}">${fmtMoney(d.proxima ? d.proxima.total : 0)}</div>
                  <div class="fluxo-card-saldo-label">${d.proxima ? `Próxima fatura • ${fmtYM(d.proxima.ym)} • ${d.proxima.count} lanç.` : "Sem fatura pendente"}</div>
                </div>

                ${d.proxima ? `
                  <button class="btn btn-primary btn-block fluxo-pagar-btn" data-pagar-fatura="${escapeAttr(c.nome)}" data-fatura-ym="${escapeAttr(d.proxima.ym)}">
                    💰 Pagar fatura ${fmtYM(d.proxima.ym)} (${fmtMoney(d.proxima.total)})
                  </button>
                ` : ""}

                ${futurasHtml ? `
                  <div class="fluxo-faturas">
                    <div class="fluxo-stat" style="margin-bottom:4px;">
                      <span class="lbl">Faturas futuras</span>
                    </div>
                    ${d.futuras.map(f => `
                      <div class="fluxo-fatura-row">
                        <span class="lbl">${fmtYM(f.ym)}</span>
                        <span style="display:flex;align-items:center;gap:8px;">
                          <span class="val">${fmtMoney(f.total)}</span>
                          <button class="btn-icon fluxo-pagar-mini" data-pagar-fatura="${escapeAttr(c.nome)}" data-fatura-ym="${escapeAttr(f.ym)}" title="Pagar esta fatura">💰</button>
                        </span>
                      </div>
                    `).join("")}
                  </div>
                ` : ""}

                <div class="fluxo-totalizer">
                  <span class="lbl">Total em aberto</span>
                  <span class="val neg">${fmtMoney(d.totalAberto)}</span>
                </div>

                ${c.contaPagamento
                  ? `<div class="fluxo-paga-via">Pago via: <b>${escapeHtml(c.contaPagamento)}</b></div>`
                  : `<div class="fluxo-paga-via" style="color:var(--warning)">⚠ Defina a conta de pagamento em ⚙</div>`}
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;

    document.getElementById("fluxo-cards").innerHTML = htmlContas + htmlCartoes;

    // botoes de configurar cartao
    document.querySelectorAll("button[data-edit-card]").forEach(btn => {
      btn.addEventListener("click", () => this.openCartaoConfigModal(btn.dataset.editCard));
    });
    // botoes de pagar fatura
    document.querySelectorAll("button[data-pagar-fatura]").forEach(btn => {
      btn.addEventListener("click", () => this.openPagarFaturaModal(btn.dataset.pagarFatura, btn.dataset.faturaYm));
    });

    // Seletor de conta para extrato
    const sel = document.getElementById("fluxo-conta-sel");
    const allOpts = this.state.contas;
    const stickyConta = sel.value || (allOpts[0] && allOpts[0].nome) || "";
    sel.innerHTML = allOpts.map(c => `<option value="${escapeAttr(c.nome)}">${escapeHtml(c.nome)}${c.tipo === "cartao" ? " (cartão)" : ""}</option>`).join("");
    sel.value = stickyConta;
    sel.onchange = () => this.renderFluxoExtrato();
    this.renderFluxoExtrato();
  },

  openCartaoConfigModal(nomeConta) {
    const c = this.state.contas.find(x => x.nome === nomeConta);
    if (!c) return;
    const contasBanc = this.state.contas.filter(x => x.tipo !== "cartao");
    const html = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal" style="max-width:440px;">
          <div class="modal-head">
            <h2>Configurar ${escapeHtml(c.nome)}</h2>
            <button class="btn-icon" id="modal-close">✕</button>
          </div>
          <form id="cart-form" class="modal-body">
            <div class="form-field full" style="margin-bottom:14px;">
              <label>Regra da fatura</label>
              <select name="regraFatura" id="cart-regra">
                <option value="fechamento" ${(c.regraFatura || "fechamento") === "fechamento" ? "selected" : ""}>📅 Por dia de fechamento (padrão do cartão)</option>
                <option value="competencia" ${c.regraFatura === "competencia" ? "selected" : ""}>📆 Por mês de competência (compras de Maio → fatura Maio)</option>
              </select>
              <div class="muted small" style="margin-top:4px;" id="regra-hint">
                <span id="hint-fechamento" ${(c.regraFatura || "fechamento") === "fechamento" ? "" : 'style="display:none"'}>Usa dia de fechamento. Após o fechamento, compras vão pra próxima fatura.</span>
                <span id="hint-competencia" ${c.regraFatura === "competencia" ? "" : 'style="display:none"'}>Ignora o dia de fechamento. Qualquer compra do mês entra na fatura desse mês.</span>
              </div>
            </div>
            <div class="form-grid" id="cart-dias-block">
              <div class="form-field">
                <label>Dia do fechamento</label>
                <input type="number" name="diaFechamento" min="1" max="31" required value="${c.diaFechamento || 28}">
              </div>
              <div class="form-field">
                <label>Dia do vencimento</label>
                <input type="number" name="diaVencimento" min="1" max="31" required value="${c.diaVencimento || 5}">
              </div>
              <div class="form-field full">
                <label>Conta de pagamento (opcional)</label>
                <select name="contaPagamento">
                  <option value="">— Não definido —</option>
                  ${contasBanc.map(x => `<option value="${escapeAttr(x.nome)}" ${c.contaPagamento === x.nome ? "selected" : ""}>${escapeHtml(x.nome)}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="muted small" style="margin-top:12px;" id="cart-explanation"></div>
          </form>
          <div class="modal-foot">
            <button class="btn" id="modal-cancel">Cancelar</button>
            <button class="btn btn-primary" id="modal-save">Salvar</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("modal-root").innerHTML = html;
    const close = () => { document.getElementById("modal-root").innerHTML = ""; };
    document.getElementById("modal-close").addEventListener("click", close);
    document.getElementById("modal-cancel").addEventListener("click", close);
    document.getElementById("modal-bd").addEventListener("click", e => { if (e.target.id === "modal-bd") close(); });
    // Toggle visibilidade do bloco "dias" conforme regra escolhida
    const regraSel = document.getElementById("cart-regra");
    const diasBlock = document.getElementById("cart-dias-block");
    const hintFech = document.getElementById("hint-fechamento");
    const hintComp = document.getElementById("hint-competencia");
    const explainEl = document.getElementById("cart-explanation");
    const atualizarExplain = () => {
      const r = regraSel.value;
      hintFech.style.display = r === "fechamento" ? "" : "none";
      hintComp.style.display = r === "competencia" ? "" : "none";
      const fechV = parseInt(document.querySelector("input[name='diaFechamento']").value) || 28;
      const vencV = parseInt(document.querySelector("input[name='diaVencimento']").value) || 5;
      if (r === "competencia") {
        explainEl.innerHTML = `💡 Toda compra do mês cai na fatura do mesmo mês, que vence dia <b>${vencV}</b> do mês seguinte. O dia de fechamento é ignorado.`;
      } else {
        const vencProxOuMesmo = vencV > fechV ? "no MESMO mês" : "no mês SEGUINTE";
        explainEl.innerHTML = `💡 Compras até o dia <b>${fechV}</b> entram na fatura que vence dia <b>${vencV}</b> ${vencProxOuMesmo} do fechamento. Após o dia ${fechV}, vão pra fatura seguinte.`;
      }
    };
    if (regraSel) regraSel.addEventListener("change", atualizarExplain);
    document.querySelectorAll("input[name='diaFechamento'], input[name='diaVencimento']").forEach(i =>
      i.addEventListener("input", atualizarExplain));
    atualizarExplain();

    document.getElementById("modal-save").addEventListener("click", () => {
      const form = document.getElementById("cart-form");
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      Store.setCartaoConfig(nomeConta, {
        regraFatura: fd.get("regraFatura") || "fechamento",
        diaFechamento: parseInt(fd.get("diaFechamento")),
        diaVencimento: parseInt(fd.get("diaVencimento")),
        contaPagamento: fd.get("contaPagamento") || ""
      });
      close();
      this.renderAll();
      toast("Configuração do cartão atualizada", "success");
    });
  },

  // Modal de "Pagar fatura": com 1 clique marca tudo como Pago + cria saída no banco
  openPagarFaturaModal(cardName, faturaYM) {
    const card = this.state.contas.find(c => c.nome === cardName);
    if (!card) return;

    // Pega lançamentos da fatura (Pendente OU Parcial — exclui só os Pagos)
    const lancsFatura = this.state.lancamentos.filter(l =>
      l.conta === cardName &&
      l.tipo === "saida" &&
      statusEfetivo(l) !== "Pago" &&
      (l.dataPagamento || l.dataCompetencia || "").slice(0, 7) === faturaYM
    );
    // Saldo devedor da fatura (considera pagamentos parciais já feitos)
    const saldoFatura = lancsFatura.reduce((s, l) => s + saldoDevedor(l), 0);
    const totalOriginal = lancsFatura.reduce((s, l) => s + l.valor, 0);
    const jaPago = totalOriginal - saldoFatura;
    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const [y, m] = faturaYM.split("-").map(Number);
    const labelMes = `${meses[m - 1]}/${y}`;

    const contasBanc = this.state.contas.filter(c => c.tipo !== "cartao");
    const venc = card.diaVencimento || 5;
    const lastDay = new Date(y, m, 0).getDate();
    const dataVenc = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(venc, lastDay)).padStart(2, "0")}`;

    const html = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal" style="max-width:480px;">
          <div class="modal-head">
            <h2>💰 Pagar fatura — ${escapeHtml(cardName)}</h2>
            <button class="btn-icon" id="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="cupom-summary" style="margin-bottom:16px;">
              <div class="cupom-row"><span class="lbl">Cartão</span><span class="val">${escapeHtml(cardName)}</span></div>
              <div class="cupom-row"><span class="lbl">Fatura</span><span class="val">${escapeHtml(labelMes)}</span></div>
              <div class="cupom-row"><span class="lbl">Total da fatura</span><span class="val">${fmtMoney(totalOriginal)}</span></div>
              ${jaPago > 0.005 ? `<div class="cupom-row"><span class="lbl">Já pago antes</span><span class="val amount-in">${fmtMoney(jaPago)}</span></div>` : ""}
              <div class="cupom-row"><span class="lbl">Saldo devedor</span><span class="val" style="color:var(--danger);font-size:16px;">${fmtMoney(saldoFatura)}</span></div>
            </div>

            <form id="pagar-form" class="form-grid">
              <div class="form-field">
                <label>Valor a pagar</label>
                <input type="number" step="0.01" min="0.01" max="${saldoFatura.toFixed(2)}" name="valorPago" required value="${saldoFatura.toFixed(2)}" id="pf-valor">
              </div>
              <div class="form-field">
                <label>Data do pagamento</label>
                <input type="date" name="dataPagamento" required value="${dataVenc}">
              </div>
              <div class="form-field full">
                <label>Pago via (conta)</label>
                <select name="contaPagamento" required>
                  ${!card.contaPagamento ? '<option value="">Selecione...</option>' : ""}
                  ${contasBanc.map(c => `<option value="${escapeAttr(c.nome)}" ${card.contaPagamento === c.nome ? "selected" : ""}>${escapeHtml(c.nome)}</option>`).join("")}
                </select>
              </div>
            </form>

            <div class="cf-quickamounts" style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
              <button type="button" class="btn btn-ghost btn-small" data-quick="total">Total (${fmtMoney(saldoFatura)})</button>
              <button type="button" class="btn btn-ghost btn-small" data-quick="50">50%</button>
              <button type="button" class="btn btn-ghost btn-small" data-quick="25">25%</button>
              <button type="button" class="btn btn-ghost btn-small" data-quick="100">R$ 100</button>
              <button type="button" class="btn btn-ghost btn-small" data-quick="500">R$ 500</button>
            </div>

            <div class="muted small" style="margin-top:12px;padding:10px;background:#f9fafb;border-radius:8px;" id="pf-explain">
              💡 Se pagar o total: marca os ${lancsFatura.length} lançamentos como Pago e cria 1 saída no banco.
              Se pagar parcial: distribui proporcionalmente nos lançamentos (ficam Parciais), e gasta o valor escolhido do banco.
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn" id="modal-cancel">Cancelar</button>
            <button class="btn btn-primary" id="modal-confirm">💰 Confirmar</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("modal-root").innerHTML = html;
    const close = () => { document.getElementById("modal-root").innerHTML = ""; };
    document.getElementById("modal-close").addEventListener("click", close);
    document.getElementById("modal-cancel").addEventListener("click", close);
    document.getElementById("modal-bd").addEventListener("click", e => { if (e.target.id === "modal-bd") close(); });

    // Quick amount buttons
    const valInp = document.getElementById("pf-valor");
    document.querySelectorAll("[data-quick]").forEach(b => {
      b.addEventListener("click", () => {
        const q = b.dataset.quick;
        let v;
        if (q === "total") v = saldoFatura;
        else if (q === "50") v = saldoFatura * 0.5;
        else if (q === "25") v = saldoFatura * 0.25;
        else v = Math.min(parseFloat(q), saldoFatura);
        valInp.value = v.toFixed(2);
      });
    });

    document.getElementById("modal-confirm").addEventListener("click", () => {
      const form = document.getElementById("pagar-form");
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const valorPago = parseFloat(fd.get("valorPago")) || 0;
      const contaPag = fd.get("contaPagamento");
      const dataPag = fd.get("dataPagamento");

      try {
        const result = Store.pagarFaturaParcial(cardName, faturaYM, valorPago, contaPag, dataPag);
        close();
        this.state = Store.get();
        this.renderAll();
        if (result.totalmenteQuitada) {
          toast(`Fatura quitada! ${result.count} lançamentos atualizados.`, "success");
        } else {
          toast(`Pagamento parcial: ${fmtMoney(valorPago)}. Saldo restante: ${fmtMoney(saldoFatura - valorPago)}.`, "success");
        }
      } catch (e) {
        toast(e.message, "error");
      }
    });
  },

  renderFluxoExtrato() {
    const sel = document.getElementById("fluxo-conta-sel");
    const conta = sel.value;
    const tbody = document.getElementById("tbody-fluxo");
    const c = this.state.contas.find(x => x.nome === conta);
    if (!c) { tbody.innerHTML = ""; return; }

    const lancs = this.state.lancamentos
      .filter(l => l.conta === conta)
      .sort((a, b) => (a.dataCompetencia || "").localeCompare(b.dataCompetencia || ""));

    let saldo = Number(c.saldoInicial) || 0;
    if (!lancs.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty">Sem movimentações em ${escapeHtml(conta)}. Saldo inicial: ${fmtMoney(saldo)}</td></tr>`;
      return;
    }
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="muted"><i>Saldo inicial</i></td>
        <td class="right bold">${fmtMoney(saldo)}</td>
        <td></td>
      </tr>
    ` + lancs.map(l => {
      if (l.status === "Pago") {
        saldo += l.tipo === "entrada" ? l.valor : -l.valor;
      }
      return `
        <tr ${l.status === "Pendente" ? 'style="opacity:0.65;"' : ""}>
          <td>${fmtDate(l.dataCompetencia)}</td>
          <td>${escapeHtml(l.descricao || "—")}</td>
          <td><span class="chip">${escapeHtml(l.categoria || "")}</span></td>
          <td class="right amount-in">${l.tipo === "entrada" ? fmtMoney(l.valor) : ""}</td>
          <td class="right amount-out">${l.tipo === "saida" ? fmtMoney(l.valor) : ""}</td>
          <td class="right bold">${l.status === "Pago" ? fmtMoney(saldo) : "—"}</td>
          <td>${statusChip(l.status)}</td>
        </tr>
      `;
    }).join("");
  },

  // ---------------- Lançamentos Fixos ----------------
  renderFixos() {
    const root = document.getElementById("recorrencias-list");
    const list = this.state.recorrencias;
    if (!list.length) {
      root.innerHTML = `
        <div class="empty">
          <span class="empty-icon">↻</span>
          Nenhum lançamento fixo cadastrado.<br>
          Clique em <b>"+ Novo lançamento fixo"</b> para começar.
        </div>
      `;
      return;
    }
    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    root.innerHTML = list.map(r => {
      const freqLabel = r.frequencia === "semanal" ? "toda semana"
        : r.frequencia === "anual" ? `todo ano em ${fmtDate(r.inicio).slice(0,5)}`
        : `dia ${r.diaMes} de cada mês`;
      const proximaData = nextOccurrence(r, r.ultimaGerada ? new Date(r.ultimaGerada + "T00:00:00") : new Date(Date.now() - 86400000));
      return `
        <div class="recorrencia-item ${r.ativo ? "" : "inactive"}">
          <div class="recorrencia-info">
            <div class="recorrencia-titulo">${escapeHtml(r.descricao)}</div>
            <div class="recorrencia-meta">
              ${escapeHtml(r.categoria)} • ${escapeHtml(r.conta)} • ${freqLabel}
              ${r.ativo ? ` • próxima: ${fmtDate(toISO(proximaData))}` : " • <i>desativado</i>"}
            </div>
          </div>
          <div class="recorrencia-valor ${r.tipo}">${r.tipo === "entrada" ? "+" : "−"} ${fmtMoney(r.valor)}</div>
          <button class="recorrencia-toggle ${r.ativo ? "on" : ""}" data-id="${r.id}" title="${r.ativo ? "Desativar" : "Ativar"}"></button>
          <div class="row-actions">
            <button class="btn-icon" title="Editar" data-act="edit-r" data-id="${r.id}">✎</button>
            <button class="btn-icon" title="Excluir" data-act="del-r" data-id="${r.id}">✕</button>
          </div>
        </div>
      `;
    }).join("");

    root.querySelectorAll(".recorrencia-toggle").forEach(b => {
      b.addEventListener("click", () => {
        Store.toggleRecorrenciaAtiva(b.dataset.id);
        this.renderAll();
      });
    });
    root.querySelectorAll("button[data-act='edit-r']").forEach(b => {
      b.addEventListener("click", () => this.openRecorrenciaModal(b.dataset.id));
    });
    root.querySelectorAll("button[data-act='del-r']").forEach(b => {
      b.addEventListener("click", () => {
        const r = this.state.recorrencias.find(x => x.id === b.dataset.id);
        if (!r) return;
        if (!confirm(`Excluir o lançamento fixo "${r.descricao}"?\n\nOs lançamentos já gerados por ele também serão removidos.`)) return;
        Store.deleteRecorrencia(b.dataset.id, true);
        this.state = Store.get();
        this.renderAll();
        toast("Lançamento fixo removido", "success");
      });
    });
  },

  openRecorrenciaModal(id) {
    const editing = id ? this.state.recorrencias.find(r => r.id === id) : null;
    const today = new Date();
    const dataInicio = editing?.inicio || todayStr();
    const tipo = editing?.tipo || "saida";
    const frequencia = editing?.frequencia || "mensal";

    const html = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal">
          <div class="modal-head">
            <h2>${editing ? "Editar lançamento fixo" : "Novo lançamento fixo"}</h2>
            <button class="btn-icon" id="modal-close" title="Fechar">✕</button>
          </div>
          <form id="rec-form" class="modal-body">
            <div class="type-toggle" id="rec-type-toggle">
              <button type="button" data-tipo="entrada" class="${tipo === "entrada" ? "active-in" : ""}">Entrada</button>
              <button type="button" data-tipo="saida" class="${tipo === "saida" ? "active-out" : ""}">Saída</button>
            </div>
            <div class="form-grid" style="margin-top:14px;">
              <div class="form-field full">
                <label>Descrição</label>
                <input type="text" name="descricao" required value="${escapeAttr(editing?.descricao || "")}" placeholder="Ex: Salário, Aluguel, Netflix...">
              </div>
              <div class="form-field">
                <label>Valor (R$)</label>
                <input type="number" step="0.01" min="0" name="valor" required value="${editing?.valor || ""}">
              </div>
              <div class="form-field">
                <label>Frequência</label>
                <select name="frequencia" id="rec-freq">
                  <option value="mensal" ${frequencia === "mensal" ? "selected" : ""}>Mensal</option>
                  <option value="semanal" ${frequencia === "semanal" ? "selected" : ""}>Semanal</option>
                  <option value="anual" ${frequencia === "anual" ? "selected" : ""}>Anual</option>
                </select>
              </div>
              <div class="form-field" id="rec-dia-wrap">
                <label>Dia do mês</label>
                <input type="number" name="diaMes" min="1" max="31" value="${editing?.diaMes || today.getDate()}">
              </div>
              <div class="form-field">
                <label>Categoria</label>
                <select name="categoria" required>
                  <option value="">Selecione...</option>
                  ${this.state.categorias.map(c => `<option value="${escapeAttr(c)}" ${editing?.categoria === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
                </select>
              </div>
              <div class="form-field">
                <label>Conta / Cartão</label>
                <select name="conta" required>
                  <option value="">Selecione...</option>
                  ${this.state.contas.map(c => `<option value="${escapeAttr(c.nome)}" ${editing?.conta === c.nome ? "selected" : ""}>${escapeHtml(c.nome)}</option>`).join("")}
                </select>
              </div>
              <div class="form-field">
                <label>Início</label>
                <input type="date" name="inicio" required value="${dataInicio}">
              </div>
              <div class="form-field">
                <label>Fim (opcional)</label>
                <input type="date" name="fim" value="${editing?.fim || ""}">
              </div>
              <div class="form-field full">
                <label>Competência <span class="muted small" style="text-transform:none;letter-spacing:0;font-weight:400;">(p/ DRE)</span></label>
                <select name="competenciaOffset">
                  <option value="0" ${(editing?.competenciaOffset || 0) === 0 ? "selected" : ""}>Mesmo mês do pagamento (padrão)</option>
                  <option value="-1" ${editing?.competenciaOffset === -1 ? "selected" : ""}>1 mês antes do pagamento (ex: salário)</option>
                  <option value="-2" ${editing?.competenciaOffset === -2 ? "selected" : ""}>2 meses antes do pagamento</option>
                  <option value="-3" ${editing?.competenciaOffset === -3 ? "selected" : ""}>3 meses antes do pagamento</option>
                  <option value="1" ${editing?.competenciaOffset === 1 ? "selected" : ""}>1 mês depois do pagamento</option>
                  <option value="fixo-inicio" ${editing?.competenciaOffset === "fixo-inicio" ? "selected" : ""}>Data fixa = data de início (não muda nunca)</option>
                </select>
              </div>
            </div>
            <div class="muted small" style="margin-top:12px;padding:10px;background:#f9fafb;border-radius:8px;">
              💡 <b>Pendente como padrão:</b> os lançamentos são criados como Pendente — basta marcar ✓ ao pagar.
              <br>
              <b>Competência:</b> determina em qual mês o lançamento aparece no DRE. Ex: salário pago em 05/Mai mas trabalho de Abr → escolha "1 mês antes".
            </div>
          </form>
          <div class="modal-foot">
            ${editing ? '<button class="btn btn-danger" id="modal-delete">Excluir</button>' : ""}
            <button class="btn" id="modal-cancel">Cancelar</button>
            <button class="btn btn-primary" id="modal-save">Salvar</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("modal-root").innerHTML = html;

    let currentTipo = tipo;
    const toggle = document.getElementById("rec-type-toggle");
    toggle.querySelectorAll("button").forEach(b => {
      b.addEventListener("click", () => {
        currentTipo = b.dataset.tipo;
        toggle.querySelectorAll("button").forEach(x => {
          x.classList.remove("active-in", "active-out");
          if (x.dataset.tipo === currentTipo) x.classList.add(currentTipo === "entrada" ? "active-in" : "active-out");
        });
      });
    });

    // mostra/esconde dia do mes
    const freqSel = document.getElementById("rec-freq");
    const diaWrap = document.getElementById("rec-dia-wrap");
    const updateDiaVis = () => {
      diaWrap.style.display = freqSel.value === "mensal" ? "" : "none";
    };
    freqSel.addEventListener("change", updateDiaVis);
    updateDiaVis();

    const close = () => { document.getElementById("modal-root").innerHTML = ""; };
    document.getElementById("modal-close").addEventListener("click", close);
    document.getElementById("modal-cancel").addEventListener("click", close);
    document.getElementById("modal-bd").addEventListener("click", e => {
      if (e.target.id === "modal-bd") close();
    });

    if (editing) {
      document.getElementById("modal-delete").addEventListener("click", () => {
        if (confirm("Excluir o lançamento fixo e todos os lançamentos gerados por ele?")) {
          Store.deleteRecorrencia(editing.id, true);
          close();
          this.renderAll();
          toast("Lançamento fixo removido", "success");
        }
      });
    }

    document.getElementById("modal-save").addEventListener("click", () => {
      const form = document.getElementById("rec-form");
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const offsetRaw = fd.get("competenciaOffset");
      const competenciaOffset = offsetRaw === "fixo-inicio" ? "fixo-inicio" : (parseInt(offsetRaw) || 0);
      const data = {
        tipo: currentTipo,
        descricao: (fd.get("descricao") || "").toString().trim(),
        valor: parseFloat(fd.get("valor")) || 0,
        categoria: fd.get("categoria"),
        conta: fd.get("conta"),
        frequencia: fd.get("frequencia"),
        diaMes: parseInt(fd.get("diaMes")) || 1,
        inicio: fd.get("inicio"),
        fim: fd.get("fim") || null,
        competenciaOffset
      };
      if (editing) {
        Store.updateRecorrencia(editing.id, data);
        toast("Lançamento fixo atualizado", "success");
      } else {
        Store.addRecorrencia(data);
        toast("Lançamento fixo criado — vamos gerar as ocorrências", "success");
      }
      close();
      this.state = Store.get();
      this.renderAll();
    });
  },

  // ---------------- Relatórios ----------------
  bindReports() {
    document.getElementById("btn-export-csv").addEventListener("click", () => this.exportCsvCategorias());
  },

  renderDRE() {
    // Considera apenas data de competência (regime de competência)
    // Inclui pagos E pendentes (independente do status)
    // Exclui transferências internas (origem = pagamento-fatura)
    const items = this.state.lancamentos.filter(l =>
      this.inPeriod(l.dataCompetencia, this.period) &&
      this.isDespesaReal(l)
    );

    // Agrupa por grupo do plano de contas (respeita rateios se presentes)
    const porGrupo = new Map();
    const adicionaPart = (categoria, valor, tipo, lanc) => {
      const grupo = (this.state.gruposCategoria && this.state.gruposCategoria[categoria]) || "Outros";
      if (!porGrupo.has(grupo)) porGrupo.set(grupo, { entrada: 0, saida: 0, lancs: [] });
      const g = porGrupo.get(grupo);
      if (tipo === "entrada") g.entrada += valor;
      else g.saida += valor;
      // Cria um "pseudo-lançamento" pra manter listagem por categoria correta
      g.lancs.push({ ...lanc, categoria, valor });
    };
    items.forEach(l => {
      if (Array.isArray(l.rateios) && l.rateios.length > 0) {
        l.rateios.forEach(r => adicionaPart(r.categoria, Number(r.valor) || 0, l.tipo, l));
      } else {
        adicionaPart(l.categoria, l.valor, l.tipo, l);
      }
    });

    // Totais
    let totalReceitas = 0, totalDespesas = 0;
    porGrupo.forEach((v, grupo) => {
      // grupos "Receitas" = receitas; outros = despesas
      if (grupo === "Receitas") totalReceitas += v.entrada;
      else totalDespesas += v.saida;
      // entradas em outros grupos viram "outras receitas"
      if (grupo !== "Receitas" && v.entrada > 0) totalReceitas += v.entrada;
    });
    const resultado = totalReceitas - totalDespesas;

    // Renderiza
    const root = document.getElementById("dre-content");
    if (!items.length) {
      root.innerHTML = `<div class="empty">Sem lançamentos em ${escapeHtml(this.periodLabel())}</div>`;
      return;
    }

    // Ordena grupos: Receitas primeiro, depois despesas (na ordem padrão)
    const ordemDre = ["Receitas", ...this.state.categorias
      ? (typeof ORDEM_GRUPOS !== "undefined" ? ORDEM_GRUPOS : [])
      : []].filter((g, i, a) => a.indexOf(g) === i && g !== "Transferências");

    let html = `
      <div class="dre-totals">
        <div class="dre-total receita">
          <div class="lbl">Receita total</div>
          <div class="val">${fmtMoney(totalReceitas)}</div>
        </div>
        <div class="dre-total despesa">
          <div class="lbl">(−) Despesa total</div>
          <div class="val">${fmtMoney(totalDespesas)}</div>
        </div>
        <div class="dre-total resultado ${resultado >= 0 ? "pos" : "neg"}">
          <div class="lbl">= Resultado</div>
          <div class="val">${fmtMoney(resultado)}</div>
        </div>
      </div>
      <div class="table-wrap" style="margin-top:14px;">
        <table class="data-table dre-table">
          <thead>
            <tr>
              <th>Grupo / Categoria</th>
              <th class="right">Valor</th>
              <th class="right">% do total</th>
            </tr>
          </thead>
          <tbody>
    `;

    ordemDre.forEach(grupo => {
      const g = porGrupo.get(grupo);
      if (!g) return;
      const valGrupo = grupo === "Receitas" ? g.entrada : g.saida + (g.entrada > 0 ? -g.entrada : 0);
      const refTotal = grupo === "Receitas" ? totalReceitas : totalDespesas;
      const ehReceita = grupo === "Receitas";
      const valExibido = ehReceita ? g.entrada : g.saida;
      const pct = refTotal ? (valExibido / refTotal * 100) : 0;
      // Linha do grupo
      html += `
        <tr class="dre-grupo-row ${ehReceita ? "receita" : "despesa"}">
          <td><b>${escapeHtml(grupo)}</b></td>
          <td class="right bold ${ehReceita ? "amount-in" : "amount-out"}">${fmtMoney(valExibido)}</td>
          <td class="right muted small">${pct.toFixed(1)}%</td>
        </tr>
      `;
      // Subcategorias
      const porCat = new Map();
      g.lancs.forEach(l => {
        if ((ehReceita && l.tipo === "entrada") || (!ehReceita && l.tipo === "saida")) {
          porCat.set(l.categoria, (porCat.get(l.categoria) || 0) + l.valor);
        }
      });
      [...porCat.entries()].sort((a, b) => b[1] - a[1]).forEach(([cat, val]) => {
        const pctCat = valExibido ? (val / valExibido * 100) : 0;
        html += `
          <tr class="dre-cat-row dre-clickable" data-categoria="${escapeAttr(cat)}" data-tipo="${ehReceita ? "entrada" : "saida"}" title="Ver lançamentos desta categoria">
            <td style="padding-left:24px;">
              <span class="dre-cat-label">${escapeHtml(cat)}</span>
              <span class="dre-cat-arrow">›</span>
            </td>
            <td class="right ${ehReceita ? "amount-in" : "amount-out"}">${fmtMoney(val)}</td>
            <td class="right muted small">${pctCat.toFixed(1)}%</td>
          </tr>
        `;
      });
    });

    html += `
          </tbody>
          <tfoot>
            <tr class="dre-resultado-row ${resultado >= 0 ? "pos" : "neg"}">
              <td><b>= Resultado do período</b></td>
              <td class="right bold">${fmtMoney(resultado)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
    root.innerHTML = html;

    // Click em uma linha de categoria → abre modal com lançamentos
    root.querySelectorAll(".dre-clickable").forEach(row => {
      row.addEventListener("click", () => {
        this.openDRECategoriaModal(row.dataset.categoria, row.dataset.tipo);
      });
    });

    // Listener export CSV
    const btnExport = document.getElementById("btn-export-dre");
    if (btnExport) {
      btnExport.onclick = () => this.exportCsvDRE(porGrupo, totalReceitas, totalDespesas, resultado);
    }
  },

  // Modal: lista de lançamentos de uma categoria do DRE no período
  openDRECategoriaModal(categoria, tipo) {
    const items = this.state.lancamentos.filter(l => {
      if (l.tipo !== tipo) return false;
      if (!this.inPeriod(l.dataCompetencia, this.period)) return false;
      if (l.origem === "pagamento-fatura") return false;
      // Match exato ou via rateios
      if (l.categoria === categoria) return true;
      if (Array.isArray(l.rateios) && l.rateios.some(r => r.categoria === categoria)) return true;
      return false;
    });

    // Calcula valor exibido (considerando rateios)
    const valoresExibidos = items.map(l => {
      if (Array.isArray(l.rateios) && l.rateios.length) {
        const r = l.rateios.find(x => x.categoria === categoria);
        return r ? Number(r.valor) || 0 : 0;
      }
      return l.valor;
    });
    const total = valoresExibidos.reduce((s, v) => s + v, 0);

    const html = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal" style="max-width:680px;">
          <div class="modal-head">
            <h2>${tipo === "entrada" ? "💰" : "💸"} ${escapeHtml(categoria)} <span class="muted small" style="font-weight:400;">— ${escapeHtml(this.periodLabel())}</span></h2>
            <button class="btn-icon" id="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="cupom-summary" style="margin-bottom:14px;">
              <div class="cupom-row"><span class="lbl">Categoria</span><span class="val">${escapeHtml(categoria)}</span></div>
              <div class="cupom-row"><span class="lbl">Tipo</span><span class="val">${tipo === "entrada" ? "Entrada" : "Saída"}</span></div>
              <div class="cupom-row"><span class="lbl">Período (competência)</span><span class="val">${escapeHtml(this.periodLabel())}</span></div>
              <div class="cupom-row"><span class="lbl">Quantidade</span><span class="val">${items.length} lançamento${items.length === 1 ? "" : "s"}</span></div>
              <div class="cupom-row"><span class="lbl">Total</span><span class="val ${tipo === "entrada" ? "amount-in" : "amount-out"}" style="font-size:16px;font-weight:700;">${fmtMoney(total)}</span></div>
            </div>

            ${items.length ? `
              <div class="table-wrap" style="max-height:400px;overflow-y:auto;">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Compet.</th>
                      <th>Pagto</th>
                      <th>Descrição</th>
                      <th>Conta</th>
                      <th class="right">Valor</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${items.map((l, i) => {
                      const v = valoresExibidos[i];
                      const isRateio = Array.isArray(l.rateios) && l.rateios.length > 0;
                      return `
                        <tr style="cursor:pointer;" data-edit-id="${l.id}">
                          <td>${fmtDate(l.dataCompetencia)}</td>
                          <td>${fmtDate(l.dataPagamento)}</td>
                          <td>${escapeHtml(l.descricao || "—")}${isRateio ? ' <span class="muted small">(rateio)</span>' : ""}</td>
                          <td>${escapeHtml(l.conta || "")}</td>
                          <td class="right ${tipo === "entrada" ? "amount-in" : "amount-out"}">${fmtMoney(v)}${isRateio ? `<div class="muted small">de ${fmtMoney(l.valor)}</div>` : ""}</td>
                          <td>${statusChipEfetivo(l)}</td>
                        </tr>
                      `;
                    }).join("")}
                  </tbody>
                </table>
              </div>
              <div class="muted small" style="margin-top:10px;">
                💡 Clique em uma linha para editar o lançamento.
              </div>
            ` : `<div class="empty"><span class="empty-icon">≡</span>Nenhum lançamento desta categoria em ${escapeHtml(this.periodLabel())}</div>`}
          </div>
          <div class="modal-foot">
            <button class="btn btn-primary" id="modal-cancel">Fechar</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("modal-root").innerHTML = html;
    const close = () => { document.getElementById("modal-root").innerHTML = ""; };
    document.getElementById("modal-close").addEventListener("click", close);
    document.getElementById("modal-cancel").addEventListener("click", close);
    document.getElementById("modal-bd").addEventListener("click", e => { if (e.target.id === "modal-bd") close(); });

    // Click em uma linha → abre modal de edição
    document.querySelectorAll("tr[data-edit-id]").forEach(tr => {
      tr.addEventListener("click", () => {
        close();
        this.openLancamentoModal(tr.dataset.editId);
      });
    });
  },

  exportCsvDRE(porGrupo, totalReceitas, totalDespesas, resultado) {
    const rows = [["Grupo", "Categoria", "Valor"]];
    porGrupo.forEach((g, grupo) => {
      const ehReceita = grupo === "Receitas";
      g.lancs.forEach(l => {
        if ((ehReceita && l.tipo === "entrada") || (!ehReceita && l.tipo === "saida")) {
          rows.push([grupo, l.categoria, l.valor.toFixed(2).replace(".", ",")]);
        }
      });
    });
    rows.push(["", "TOTAL RECEITAS", totalReceitas.toFixed(2).replace(".", ",")]);
    rows.push(["", "TOTAL DESPESAS", totalDespesas.toFixed(2).replace(".", ",")]);
    rows.push(["", "RESULTADO", resultado.toFixed(2).replace(".", ",")]);
    this.downloadCsv(rows, `DRE-${this.period.y}-${String(this.period.m).padStart(2,"0")}.csv`);
  },

  renderRelatorios() {
    // === DRE (Regime de Competência) ===
    this.renderDRE();

    const trend = this.buildTrend12();
    Charts.drawBars(document.getElementById("rep-bars"), trend);

    // saldo acumulado 12 meses
    let acc = 0;
    const line = trend.map(t => {
      acc += t.entrada - t.saida;
      return { label: t.label, value: acc };
    });
    Charts.drawLine(document.getElementById("rep-line"), line, { color: "#0ea5e9" });

    // categorias mês
    const saidas = this.state.lancamentos.filter(l => l.tipo === "saida" && this.inPeriod(l.dataCompetencia, this.period));
    const cats = this.groupByCategoria(saidas);
    const total = cats.reduce((s, c) => s + c.value, 0);
    const tbodyC = document.getElementById("tbody-categorias");
    tbodyC.innerHTML = cats.length ? cats.map((c, i) => {
      const pct = total ? (c.value / total * 100) : 0;
      return `
        <tr>
          <td><span class="chip">${escapeHtml(c.label)}</span></td>
          <td class="right amount-out">${fmtMoney(c.value)}</td>
          <td class="right">${pct.toFixed(1)}%</td>
          <td>
            <div style="background:#f3f4f6;border-radius:4px;height:8px;overflow:hidden;">
              <div style="background:${Charts.palette[i % Charts.palette.length]};width:${pct}%;height:100%;"></div>
            </div>
          </td>
        </tr>
      `;
    }).join("") : `<tr><td colspan="4" class="empty">Sem saídas em ${this.periodLabel()}</td></tr>`;

    // resumo anual
    const tbodyA = document.getElementById("tbody-anual");
    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const anualRows = [];
    let totEnt = 0, totSai = 0;
    for (let m = 1; m <= 12; m++) {
      const items = this.state.lancamentos.filter(l => this.inPeriod(l.dataCompetencia, { y: this.period.y, m }));
      const ent = items.filter(l => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
      const sai = items.filter(l => l.tipo === "saida" && this.isDespesaReal(l)).reduce((s, l) => s + l.valor, 0);
      totEnt += ent; totSai += sai;
      anualRows.push(`
        <tr>
          <td>${meses[m - 1]} / ${this.period.y}</td>
          <td class="right amount-in">${ent ? fmtMoney(ent) : "—"}</td>
          <td class="right amount-out">${sai ? fmtMoney(sai) : "—"}</td>
          <td class="right ${(ent - sai) >= 0 ? "amount-in" : "amount-out"}">${fmtMoney(ent - sai)}</td>
        </tr>
      `);
    }
    anualRows.push(`
      <tr style="background:#fafafa;font-weight:700;">
        <td>Total ${this.period.y}</td>
        <td class="right amount-in">${fmtMoney(totEnt)}</td>
        <td class="right amount-out">${fmtMoney(totSai)}</td>
        <td class="right ${(totEnt - totSai) >= 0 ? "amount-in" : "amount-out"}">${fmtMoney(totEnt - totSai)}</td>
      </tr>
    `);
    tbodyA.innerHTML = anualRows.join("");
  },

  // ---------------- Importar Cupom Fiscal ----------------
  openCupomModal() {
    const supportsBarcode = "BarcodeDetector" in window;
    const html = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal" style="max-width:600px;">
          <div class="modal-head">
            <h2>📷 Importar Cupom Fiscal</h2>
            <button class="btn-icon" id="modal-close">✕</button>
          </div>
          <div class="modal-body" id="cupom-step1">
            <div class="cupom-tabs">
              <button class="cupom-tab active" data-tab="foto">📷 Foto do cupom</button>
              <button class="cupom-tab" data-tab="url">🔗 Colar URL/Chave</button>
            </div>

            <div id="cupom-pane-foto">
              <div class="cupom-dropzone" id="cupom-drop">
                <input type="file" id="cupom-file" accept="image/*" capture="environment" hidden>
                <div class="cupom-dropzone-inner">
                  <div style="font-size:42px;line-height:1;margin-bottom:8px;">📷</div>
                  <div style="font-weight:600;font-size:14px;">Clique para tirar foto ou escolher imagem</div>
                  <div class="muted small" style="margin-top:4px;">O app vai ler o QR code do cupom e extrair os dados</div>
                  ${!supportsBarcode ? '<div class="muted small" style="margin-top:8px;color:var(--warning);">⚠ Seu navegador não suporta leitura automática de QR. Use a aba "Colar URL".</div>' : ""}
                </div>
              </div>
              <div id="cupom-status" class="muted small" style="margin-top:10px;"></div>
            </div>

            <div id="cupom-pane-url" class="hidden">
              <div class="form-field full">
                <label>URL do QR code OU chave de acesso (44 dígitos)</label>
                <textarea id="cupom-url" rows="4" placeholder="Cole aqui a URL que está no QR code, ou os 44 dígitos da chave de acesso..." style="padding:9px 11px;border:1px solid var(--border);border-radius:8px;font-size:12.5px;font-family:monospace;width:100%;resize:vertical;"></textarea>
              </div>
              <button class="btn btn-primary" id="cupom-process-url" style="margin-top:10px;width:100%;">Processar</button>
              <div class="muted small" style="margin-top:10px;">
                💡 Dica: abra o app de câmera do seu celular, aponte pro QR do cupom — copie a URL que aparece e cole aqui.
              </div>
            </div>
          </div>

          <div class="modal-body hidden" id="cupom-step2">
            <div class="cupom-result" id="cupom-result"></div>
          </div>

          <div class="modal-foot">
            <button class="btn" id="modal-cancel">Cancelar</button>
            <button class="btn btn-primary hidden" id="cupom-save">Salvar lançamento</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("modal-root").innerHTML = html;

    const close = () => { document.getElementById("modal-root").innerHTML = ""; };
    document.getElementById("modal-close").addEventListener("click", close);
    document.getElementById("modal-cancel").addEventListener("click", close);
    document.getElementById("modal-bd").addEventListener("click", e => { if (e.target.id === "modal-bd") close(); });

    // Tabs
    document.querySelectorAll(".cupom-tab").forEach(t => {
      t.addEventListener("click", () => {
        document.querySelectorAll(".cupom-tab").forEach(x => x.classList.toggle("active", x === t));
        document.getElementById("cupom-pane-foto").classList.toggle("hidden", t.dataset.tab !== "foto");
        document.getElementById("cupom-pane-url").classList.toggle("hidden", t.dataset.tab !== "url");
      });
    });

    // Drop zone (foto)
    const drop = document.getElementById("cupom-drop");
    const fileInput = document.getElementById("cupom-file");
    drop.addEventListener("click", () => fileInput.click());
    drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("drag"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
    drop.addEventListener("drop", e => {
      e.preventDefault();
      drop.classList.remove("drag");
      if (e.dataTransfer.files[0]) this.handleCupomImage(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener("change", e => {
      if (e.target.files[0]) this.handleCupomImage(e.target.files[0]);
    });

    // URL paste
    document.getElementById("cupom-process-url").addEventListener("click", () => {
      const txt = document.getElementById("cupom-url").value;
      const data = parseQRCupom(txt);
      if (!data) { toast("Não consegui identificar uma chave de acesso de 44 dígitos", "error"); return; }
      this.showCupomStep2(data);
    });
  },

  async handleCupomImage(file) {
    const status = document.getElementById("cupom-status");
    status.textContent = "Lendo imagem...";

    if (!("BarcodeDetector" in window)) {
      status.innerHTML = '<span style="color:var(--danger);">Leitura automática indisponível neste navegador. Use a aba "Colar URL".</span>';
      return;
    }

    try {
      const img = await this._fileToImage(file);
      status.textContent = "Procurando QR code...";
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      const codes = await detector.detect(img);
      if (!codes.length) {
        status.innerHTML = '<span style="color:var(--warning);">⚠ Não encontrei QR code na imagem. Tente uma foto mais nítida ou cole a URL manualmente.</span>';
        return;
      }
      const raw = codes[0].rawValue;
      const data = parseQRCupom(raw);
      if (!data) {
        status.innerHTML = '<span style="color:var(--warning);">⚠ QR encontrado mas não é um cupom fiscal válido (sem chave de 44 dígitos).</span>';
        return;
      }
      status.innerHTML = '<span style="color:var(--success);">✓ Cupom lido com sucesso!</span>';
      setTimeout(() => this.showCupomStep2(data), 300);
    } catch (e) {
      console.error(e);
      status.innerHTML = `<span style="color:var(--danger);">Erro: ${escapeHtml(e.message)}</span>`;
    }
  },

  _fileToImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  showCupomStep2(data) {
    document.getElementById("cupom-step1").classList.add("hidden");
    document.getElementById("cupom-step2").classList.remove("hidden");
    document.getElementById("cupom-save").classList.remove("hidden");

    const today = new Date().toISOString().slice(0, 10);
    const dataCupom = `${data.ano}-${String(data.mes).padStart(2,"0")}-${String(today.slice(8,10))}`;

    // estado interno do step 2
    this._cupomData = data;
    this._cupomItens = []; // [{descricao, valor, categoria}]
    this._cupomModo = "unico"; // "unico" | "itens"

    const html = `
      <div class="cupom-summary">
        <div class="cupom-row"><span class="lbl">CNPJ</span><span class="val mono">${escapeHtml(data.cnpjFmt)}</span></div>
        <div class="cupom-row"><span class="lbl">Emissão</span><span class="val">${String(data.mes).padStart(2,"0")}/${data.ano}</span></div>
        <div class="cupom-row"><span class="lbl">UF</span><span class="val">${escapeHtml(data.uf)}</span></div>
      </div>

      <div class="cupom-tabs" style="margin-top:14px;">
        <button class="cupom-tab active" id="modo-unico">📄 Lançamento único</button>
        <button class="cupom-tab" id="modo-itens">📋 Itemizar (vários itens)</button>
      </div>

      <!-- modo: unico -->
      <div id="cupom-modo-unico">
        <form id="cupom-form-unico" class="form-grid">
          <div class="form-field full">
            <label>Descrição (loja, ou descrição geral)</label>
            <input type="text" name="descricao" required placeholder="Ex: Carrefour Centro" autofocus>
          </div>
          <div class="form-field">
            <label>Valor total (R$)</label>
            <input type="number" step="0.01" min="0" name="valor" required value="${data.valor || ""}" placeholder="0,00">
          </div>
          <div class="form-field">
            <label>Data</label>
            <input type="date" name="dataCompetencia" required value="${dataCupom}">
          </div>
          <div class="form-field">
            <label>Categoria</label>
            <select name="categoria" required>
              <option value="">Selecione...</option>
              ${this.state.categorias.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("")}
            </select>
          </div>
          <div class="form-field">
            <label>Conta / Cartão</label>
            <select name="conta" required>
              <option value="">Selecione...</option>
              ${this.state.contas.map(c => `<option value="${escapeAttr(c.nome)}">${escapeHtml(c.nome)}</option>`).join("")}
            </select>
          </div>
          <div class="form-field">
            <label>Status</label>
            <select name="status">
              <option value="Pago" selected>Pago</option>
              <option value="Pendente">Pendente</option>
            </select>
          </div>
        </form>
      </div>

      <!-- modo: itens -->
      <div id="cupom-modo-itens" class="hidden">
        <div class="form-grid" style="margin-bottom:8px;">
          <div class="form-field">
            <label>Data</label>
            <input type="date" id="itens-data" required value="${dataCupom}">
          </div>
          <div class="form-field">
            <label>Conta / Cartão</label>
            <select id="itens-conta" required>
              <option value="">Selecione...</option>
              ${this.state.contas.map(c => `<option value="${escapeAttr(c.nome)}">${escapeHtml(c.nome)}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="itens-toolbar">
          <button type="button" class="btn btn-small" id="btn-add-item">+ Adicionar item</button>
          <button type="button" class="btn btn-ghost btn-small" id="btn-paste-list" title="Colar lista de uma vez">📋 Colar lista</button>
          <div class="itens-totalizer">
            Total: <b id="itens-total">R$ 0,00</b>
            ${data.valor ? `<span class="muted small" style="margin-left:8px;">/ Cupom: ${fmtMoney(data.valor)}</span>` : ""}
          </div>
        </div>

        <div class="itens-list" id="itens-list">
          <div class="muted small" style="text-align:center;padding:20px;">Nenhum item ainda — clique em "+ Adicionar item" ou "Colar lista"</div>
        </div>
      </div>
    `;
    document.getElementById("cupom-result").innerHTML = html;

    // Sugerir categoria geral pra modo unico
    const sugUnico = sugerirCategoria(this.state, "", data.cnpj);
    if (sugUnico.cat) {
      const sel = document.querySelector("#cupom-form-unico select[name='categoria']");
      if (sel) sel.value = sugUnico.cat;
    }

    // Toggle modos
    document.getElementById("modo-unico").addEventListener("click", () => this._cupomSetModo("unico"));
    document.getElementById("modo-itens").addEventListener("click", () => this._cupomSetModo("itens"));

    // Botoes do modo itens
    document.getElementById("btn-add-item").addEventListener("click", () => this._cupomAddItem({ descricao: "", valor: "", categoria: "" }));
    document.getElementById("btn-paste-list").addEventListener("click", () => this._cupomOpenPasteList());

    // Salvar
    document.getElementById("cupom-save").onclick = () => this._cupomSave();
  },

  _cupomSetModo(modo) {
    this._cupomModo = modo;
    document.getElementById("modo-unico").classList.toggle("active", modo === "unico");
    document.getElementById("modo-itens").classList.toggle("active", modo === "itens");
    document.getElementById("cupom-modo-unico").classList.toggle("hidden", modo !== "unico");
    document.getElementById("cupom-modo-itens").classList.toggle("hidden", modo !== "itens");
  },

  _cupomAddItem(item) {
    this._cupomItens.push(item);
    this._cupomRenderItens();
  },

  _cupomRenderItens() {
    const root = document.getElementById("itens-list");
    if (!this._cupomItens.length) {
      root.innerHTML = `<div class="muted small" style="text-align:center;padding:20px;">Nenhum item ainda — clique em "+ Adicionar item" ou "Colar lista"</div>`;
      this._cupomUpdateTotal();
      return;
    }
    root.innerHTML = this._cupomItens.map((it, i) => `
      <div class="item-row" data-idx="${i}">
        <input type="text" class="item-desc" placeholder="Item (ex: pão francês)" value="${escapeAttr(it.descricao)}">
        <input type="number" step="0.01" min="0" class="item-valor" placeholder="0,00" value="${it.valor !== "" ? it.valor : ""}">
        <select class="item-cat">
          <option value="">Categoria...</option>
          ${this.state.categorias.map(c => `<option value="${escapeAttr(c)}" ${it.categoria === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
        </select>
        <button type="button" class="btn-icon item-del" title="Remover">✕</button>
      </div>
    `).join("");

    root.querySelectorAll(".item-row").forEach(row => {
      const idx = parseInt(row.dataset.idx);
      const inpDesc = row.querySelector(".item-desc");
      const inpVal = row.querySelector(".item-valor");
      const selCat = row.querySelector(".item-cat");

      inpDesc.addEventListener("input", () => {
        this._cupomItens[idx].descricao = inpDesc.value;
        // sugere categoria automatica se o usuario nao escolheu uma
        if (!this._cupomItens[idx].categoria) {
          const sug = sugerirCategoria(this.state, inpDesc.value, this._cupomData?.cnpj);
          if (sug.cat) {
            selCat.value = sug.cat;
            this._cupomItens[idx].categoria = sug.cat;
            row.classList.add("auto-cat");
            setTimeout(() => row.classList.remove("auto-cat"), 800);
          }
        }
      });
      inpVal.addEventListener("input", () => {
        this._cupomItens[idx].valor = inpVal.value;
        this._cupomUpdateTotal();
      });
      selCat.addEventListener("change", () => {
        this._cupomItens[idx].categoria = selCat.value;
      });
      row.querySelector(".item-del").addEventListener("click", () => {
        this._cupomItens.splice(idx, 1);
        this._cupomRenderItens();
      });
    });
    this._cupomUpdateTotal();
  },

  _cupomUpdateTotal() {
    const total = this._cupomItens.reduce((s, it) => s + (parseFloat(it.valor) || 0), 0);
    const el = document.getElementById("itens-total");
    if (el) el.textContent = fmtMoney(total);
    // pinta de vermelho se cupom tem valor e nao bate
    if (this._cupomData?.valor && total > 0) {
      const diff = Math.abs(this._cupomData.valor - total);
      el.style.color = diff < 0.01 ? "var(--success)" : (diff < 1 ? "var(--warning)" : "var(--danger)");
    } else if (el) {
      el.style.color = "";
    }
  },

  _cupomOpenPasteList() {
    // Mini-modal sobreposto pra colar lista de itens
    const html = `
      <div class="modal-backdrop" id="paste-bd" style="z-index:200;">
        <div class="modal" style="max-width:520px;">
          <div class="modal-head">
            <h2>📋 Colar lista de itens</h2>
            <button class="btn-icon" id="paste-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="muted small" style="margin-bottom:8px;">
              Cole uma linha por item. Formato aceito (qualquer um):
              <br><code>pão francês 5,50</code>
              <br><code>pão francês&nbsp;&nbsp;5,50</code>  (separado por tab/espaços)
              <br><code>pão francês;5,50</code>
            </div>
            <textarea id="paste-text" rows="10" style="width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:8px;font-family:monospace;font-size:12.5px;resize:vertical;" placeholder="pão francês 5,50&#10;detergente Ype 8,90&#10;arroz Tio João 25,00"></textarea>
          </div>
          <div class="modal-foot">
            <button class="btn" id="paste-cancel">Cancelar</button>
            <button class="btn btn-primary" id="paste-ok">Adicionar itens</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("modal-root").insertAdjacentHTML("beforeend", html);
    const close = () => document.getElementById("paste-bd")?.remove();
    document.getElementById("paste-close").addEventListener("click", close);
    document.getElementById("paste-cancel").addEventListener("click", close);
    document.getElementById("paste-bd").addEventListener("click", e => { if (e.target.id === "paste-bd") close(); });
    document.getElementById("paste-ok").addEventListener("click", () => {
      const text = document.getElementById("paste-text").value;
      const parsed = this._cupomParsePastedList(text);
      if (!parsed.length) { toast("Nenhum item identificado", "error"); return; }
      parsed.forEach(it => this._cupomItens.push(it));
      this._cupomRenderItens();
      close();
      toast(`${parsed.length} ${parsed.length === 1 ? "item adicionado" : "itens adicionados"}`, "success");
    });
  },

  _cupomParsePastedList(text) {
    if (!text) return [];
    const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    const items = [];
    for (const line of lines) {
      // tenta separar com ; primeiro, depois tab, depois multiplos espacos, depois pegando ultimo numero
      let descricao = "", valorStr = "";

      const semi = line.split(";");
      if (semi.length === 2) {
        descricao = semi[0].trim();
        valorStr = semi[1].trim();
      } else {
        // pega o ULTIMO numero da linha (com virgula ou ponto decimal)
        const m = line.match(/^(.+?)[\s\t]+([\d.,]+)\s*$/);
        if (m) {
          descricao = m[1].trim();
          valorStr = m[2].trim();
        } else {
          descricao = line;
          valorStr = "";
        }
      }

      const valor = valorStr ? parseFloat(valorStr.replace(/\./g, "").replace(",", ".")) : 0;
      if (!descricao) continue;
      const sug = sugerirCategoria(this.state, descricao, this._cupomData?.cnpj);
      items.push({
        descricao,
        valor: isNaN(valor) ? "" : valor,
        categoria: sug.cat || ""
      });
    }
    return items;
  },

  _cupomSave() {
    const data = this._cupomData;
    if (this._cupomModo === "unico") {
      const form = document.getElementById("cupom-form-unico");
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const contaNome = fd.get("conta");
      const contaObj = this.state.contas.find(x => x.nome === contaNome);
      const dataComp = fd.get("dataCompetencia");
      let dataPag = dataComp;
      if (contaObj && contaObj.tipo === "cartao") dataPag = calcDataPagamentoCartao(contaObj, dataComp);
      const lanc = {
        tipo: "saida",
        descricao: (fd.get("descricao") || "").toString().trim(),
        categoria: fd.get("categoria"),
        conta: contaNome,
        valor: parseFloat(fd.get("valor")) || 0,
        dataCompetencia: dataComp,
        dataPagamento: dataPag,
        status: fd.get("status") || "Pago",
        cnpj: data.cnpj,
        chaveAcesso: data.chave
      };
      Store.addLancamento(lanc);
      Store.learnCnpjCategoria(data.cnpj, lanc.categoria);
      document.getElementById("modal-root").innerHTML = "";
      this.state = Store.get();
      this.renderAll();
      toast("Cupom salvo!", "success");
      return;
    }

    // modo itens
    const dataComp = document.getElementById("itens-data").value;
    const contaNome = document.getElementById("itens-conta").value;
    if (!dataComp) { toast("Defina a data", "error"); return; }
    if (!contaNome) { toast("Escolha a conta/cartão", "error"); return; }
    if (!this._cupomItens.length) { toast("Adicione pelo menos um item", "error"); return; }

    const itensValidos = this._cupomItens.filter(it => it.descricao && it.valor && it.categoria);
    if (itensValidos.length !== this._cupomItens.length) {
      if (!confirm(`${this._cupomItens.length - itensValidos.length} item(ns) sem descrição/valor/categoria serão ignorados. Continuar?`)) return;
    }
    if (!itensValidos.length) { toast("Nenhum item válido pra salvar", "error"); return; }

    const contaObj = this.state.contas.find(x => x.nome === contaNome);
    let dataPag = dataComp;
    if (contaObj && contaObj.tipo === "cartao") dataPag = calcDataPagamentoCartao(contaObj, dataComp);

    itensValidos.forEach(it => {
      Store.addLancamento({
        tipo: "saida",
        descricao: it.descricao,
        categoria: it.categoria,
        conta: contaNome,
        valor: parseFloat(it.valor) || 0,
        dataCompetencia: dataComp,
        dataPagamento: dataPag,
        status: "Pago",
        cnpj: data.cnpj,
        chaveAcesso: data.chave
      });
      // aprende item
      Store.learnItem(it.descricao, it.categoria);
    });

    document.getElementById("modal-root").innerHTML = "";
    this.state = Store.get();
    this.renderAll();
    toast(`${itensValidos.length} lançamentos criados!`, "success");
  },

  // ---------------- Configurações ----------------
  bindConfig() {
    document.getElementById("form-cat").addEventListener("submit", e => {
      e.preventDefault();
      const inp = document.getElementById("new-cat");
      const grupoSel = document.getElementById("new-cat-grupo");
      const grupo = grupoSel ? grupoSel.value : "Outros";
      if (Store.addCategoria(inp.value, grupo)) {
        inp.value = "";
        this.renderAll();
        toast(`Categoria adicionada em "${grupo}"`, "success");
      } else {
        toast("Categoria já existe", "error");
      }
    });
    document.getElementById("form-conta").addEventListener("submit", e => {
      e.preventDefault();
      const inp = document.getElementById("new-conta");
      const tipo = document.getElementById("new-conta-tipo").value;
      if (Store.addConta(inp.value, tipo)) {
        inp.value = "";
        this.renderAll();
        toast("Conta adicionada", "success");
      } else {
        toast("Conta já existe", "error");
      }
    });
    document.getElementById("btn-pick-create").addEventListener("click", async () => {
      try { await Store.pickFile("create"); this.state = Store.get(); this.renderAll(); }
      catch (e) { if (e.name !== "AbortError") toast(e.message, "error"); }
    });
    document.getElementById("btn-pick-open").addEventListener("click", async () => {
      try { await Store.pickFile("open"); this.state = Store.get(); this.renderAll(); }
      catch (e) { if (e.name !== "AbortError") toast(e.message, "error"); }
    });
    document.getElementById("btn-unbind").addEventListener("click", async () => {
      if (confirm("Desvincular o arquivo? Os dados atuais continuam no navegador.")) {
        await Store.unbindFile();
        this.renderAll();
      }
    });
    document.getElementById("btn-backup-2").addEventListener("click", () => this.exportBackup());
    document.getElementById("btn-csv-lanc").addEventListener("click", () => this.exportCsvLancamentos());
    document.getElementById("btn-restore-2").addEventListener("click", () => document.getElementById("file-restore").click());
    document.getElementById("btn-reset").addEventListener("click", () => {
      if (confirm("Tem certeza? Isso apaga TODOS os lançamentos, categorias e contas personalizadas.")) {
        Store.reset();
        this.state = Store.get();
        this.renderAll();
        toast("Dados zerados", "success");
      }
    });
    document.getElementById("btn-seed").addEventListener("click", () => {
      Store.reseed();
      this.state = Store.get();
      this.renderAll();
      toast("Dados iniciais recarregados", "success");
    });
  },

  renderConfig() {
    // Status de sync
    const info = document.getElementById("sync-info");
    const rowUnbind = document.getElementById("row-unbind");
    const cardSync = document.getElementById("card-sync");
    if (Store.isRemote()) {
      // Em modo online, esconde o card todo de "vincular arquivo" — o sync é cloud
      if (cardSync) cardSync.style.display = "none";
    } else if (Store.isBound()) {
      info.innerHTML = `<div class="sync-banner ok">💾 Gravando em <b>${escapeHtml(Store.fileName())}</b> — alterações são salvas automaticamente.</div>`;
      rowUnbind.style.display = "";
    } else if (Store.isPending()) {
      info.innerHTML = `<div class="sync-banner warn">⚠ Havia um arquivo vinculado (<b>${escapeHtml(Store.fileName())}</b>) mas o navegador precisa da sua permissão novamente. Clique em "Reconectar arquivo" na barra do topo.</div>`;
      rowUnbind.style.display = "";
    } else {
      info.innerHTML = `<div class="sync-banner">Os dados estão sendo salvos apenas no navegador (localStorage). <b>Recomendado:</b> vincule um arquivo para não depender do navegador.</div>`;
      rowUnbind.style.display = "none";
    }

    const cats = document.getElementById("list-cats");
    const grupos = (typeof ORDEM_GRUPOS !== "undefined" ? ORDEM_GRUPOS : ["Outros"]);
    // Renderiza categorias agrupadas por plano de contas
    const grupoMap = Store.categoriasPorGrupo();
    cats.innerHTML = grupoMap.map(g => `
      <div class="cat-grupo">
        <div class="cat-grupo-title">${escapeHtml(g.grupo)}</div>
        <div class="chips">
          ${g.categorias.map(c => `
            <span class="chip-item">
              ${escapeHtml(c)}
              <select class="cat-grupo-select" data-cat="${escapeAttr(c)}" title="Mover para outro grupo">
                ${grupos.map(gr => `<option value="${escapeAttr(gr)}" ${gr === g.grupo ? "selected" : ""}>${escapeHtml(gr)}</option>`).join("")}
              </select>
              <button data-cat="${escapeAttr(c)}" title="Remover">✕</button>
            </span>
          `).join("")}
        </div>
      </div>
    `).join("");

    cats.querySelectorAll(".cat-grupo-select").forEach(sel => {
      sel.addEventListener("change", () => {
        Store.setGrupoCategoria(sel.dataset.cat, sel.value);
        toast(`"${sel.dataset.cat}" movida para "${sel.value}"`, "success");
        this.renderAll();
      });
    });
    cats.querySelectorAll(".chip-item button").forEach(b => {
      b.addEventListener("click", () => {
        if (confirm(`Remover categoria "${b.dataset.cat}"? Os lançamentos existentes permanecerão.`)) {
          Store.removeCategoria(b.dataset.cat);
          this.renderAll();
        }
      });
    });

    const contas = document.getElementById("list-contas");
    contas.innerHTML = this.state.contas.map(c => `
      <span class="chip-item">${escapeHtml(c.nome)} <span class="chip-type">${c.tipo === "cartao" ? "cartão" : "conta"}</span><button data-conta="${escapeAttr(c.nome)}" title="Remover">✕</button></span>
    `).join("");
    contas.querySelectorAll("button").forEach(b => {
      b.addEventListener("click", () => {
        if (confirm(`Remover "${b.dataset.conta}"?`)) {
          Store.removeConta(b.dataset.conta);
          this.renderAll();
        }
      });
    });
  },

  // ---------------- Backup ----------------
  exportBackup() {
    const data = Store.exportJSON();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `baron-financeiro-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup exportado", "success");
  },

  importBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm("Restaurar este backup vai substituir seus dados atuais. Continuar?")) {
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        Store.importJSON(ev.target.result);
        this.state = Store.get();
        this.renderAll();
        toast("Backup restaurado com sucesso", "success");
      } catch (err) {
        toast("Arquivo inválido: " + err.message, "error");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  },

  exportCsvLancamentos() {
    const header = ["Data Competência","Data Pagamento","Tipo","Descrição","Categoria","Conta","Valor","Status"];
    const rows = this.state.lancamentos.map(l => [
      l.dataCompetencia, l.dataPagamento, l.tipo, l.descricao, l.categoria, l.conta,
      l.valor.toFixed(2).replace(".", ","), l.status
    ]);
    this.downloadCsv([header, ...rows], `lancamentos-${todayStr()}.csv`);
  },

  exportCsvCategorias() {
    const saidas = this.state.lancamentos.filter(l => l.tipo === "saida" && this.inPeriod(l.dataCompetencia, this.period));
    const cats = this.groupByCategoria(saidas);
    const total = cats.reduce((s, c) => s + c.value, 0);
    const rows = cats.map(c => [c.label, c.value.toFixed(2).replace(".", ","), ((c.value / total) * 100).toFixed(1) + "%"]);
    this.downloadCsv([["Categoria", "Valor", "% do total"], ...rows], `categorias-${this.period.y}-${String(this.period.m).padStart(2, "0")}.csv`);
  },

  downloadCsv(rows, filename) {
    const csv = rows.map(r => r.map(c => {
      const s = String(c ?? "");
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast("CSV exportado", "success");
  },

  // ---------------- Helpers ----------------
  inPeriod(dateStr, p) {
    if (!dateStr) return false;
    const d = new Date(dateStr + "T00:00:00");
    return d.getFullYear() === p.y && (d.getMonth() + 1) === p.m;
  },

  buildTrend12() {
    const arr = [];
    let y = this.period.y, m = this.period.m;
    // últimos 12 meses terminando no mês atual
    const start = { y, m };
    start.m -= 11;
    while (start.m < 1) { start.m += 12; start.y--; }

    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    let cy = start.y, cm = start.m;
    for (let i = 0; i < 12; i++) {
      const items = this.state.lancamentos.filter(l => this.inPeriod(l.dataCompetencia, { y: cy, m: cm }));
      const entrada = items.filter(l => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
      const saida = items.filter(l => l.tipo === "saida" && this.isDespesaReal(l)).reduce((s, l) => s + l.valor, 0);
      arr.push({ label: `${meses[cm - 1]}/${String(cy).slice(2)}`, entrada, saida });
      cm++; if (cm > 12) { cm = 1; cy++; }
    }
    return arr;
  },

  groupByCategoria(lancs) {
    const map = new Map();
    lancs.forEach(l => {
      // ignora pagamentos de fatura (sao transferencias entre contas, nao despesa real)
      if (l.origem === "pagamento-fatura") return;
      // Se tem rateio: distribui o valor entre as categorias do rateio
      if (Array.isArray(l.rateios) && l.rateios.length > 0) {
        l.rateios.forEach(r => {
          const k = r.categoria || "(sem categoria)";
          map.set(k, (map.get(k) || 0) + (Number(r.valor) || 0));
        });
      } else {
        const k = l.categoria || "(sem categoria)";
        map.set(k, (map.get(k) || 0) + l.valor);
      }
    });
    return [...map.entries()].map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  },

  // Helper: lançamento conta como despesa/receita real? (exclui transferências internas)
  isDespesaReal(l) {
    return l.origem !== "pagamento-fatura" && l.origem !== "transferencia";
  },

  saldoPorConta() {
    // retorna apenas contas bancarias (cartoes tem logica de fatura separada)
    // soma pagamentos[] de cada lançamento — suporta pagamentos parciais e
    // pagamentos cuja conta é diferente da conta do lançamento (ex: fatura paga via banco)
    const map = new Map();
    this.state.contas
      .filter(c => c.tipo !== "cartao")
      .forEach(c => map.set(c.nome, { nome: c.nome, tipo: c.tipo, saldo: Number(c.saldoInicial) || 0 }));
    this.state.lancamentos.forEach(l => {
      const pagamentos = Array.isArray(l.pagamentos) && l.pagamentos.length
        ? l.pagamentos
        : (l.status === "Pago" ? [{ data: l.dataPagamento || l.dataCompetencia, valor: l.valor, conta: l.conta }] : []);
      pagamentos.forEach(p => {
        const m = map.get(p.conta);
        if (!m) return;
        m.saldo += l.tipo === "entrada" ? (Number(p.valor) || 0) : -(Number(p.valor) || 0);
      });
    });
    return [...map.values()].filter(c => Math.abs(c.saldo) > 0.001);
  }
};

// ----- utils globais -----
function fmtDate(s) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysUntil(dateStr) {
  if (!dateStr) return 0;
  const a = new Date(dateStr + "T00:00:00");
  const b = new Date(todayStr() + "T00:00:00");
  return Math.round((a - b) / 86400000);
}
function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1 + n, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function escapeAttr(s) {
  return String(s || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function statusChip(s) {
  if (s === "Pago") return '<span class="chip chip-pago">Pago</span>';
  if (s === "Parcial") return '<span class="chip chip-parcial">Parcial</span>';
  return '<span class="chip chip-pendente">Pendente</span>';
}

// Chip que considera pagamentos parciais e mostra "Parcial: X / Y"
function statusChipEfetivo(l) {
  const st = statusEfetivo(l);
  if (st === "Pago") return '<span class="chip chip-pago">Pago</span>';
  if (st === "Parcial") {
    const pago = valorPagoDe(l);
    return `<span class="chip chip-parcial" title="Pago ${fmtMoney(pago)} de ${fmtMoney(l.valor)}">Parcial ${fmtMoney(pago)}/${fmtMoney(l.valor)}</span>`;
  }
  return '<span class="chip chip-pendente">Pendente</span>';
}
function toast(msg, kind) {
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = "toast " + (kind === "success" ? "toast-success" : kind === "error" ? "toast-error" : "");
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity 0.3s"; }, 2400);
  setTimeout(() => el.remove(), 2800);
}

// boot
document.addEventListener("DOMContentLoaded", () => App.init());
