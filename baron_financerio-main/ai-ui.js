// ==========================================================================
// Baron Financeiro — Interface dos recursos de IA
//   • Assistente (chat / relatórios em linguagem natural)
//   • Insights automáticos no Dashboard
//   • Importar documento (foto ou PDF → lançamentos)
//   • Revisão de categorias em lote
// ==========================================================================

const AIUI = {
  _docState: null,
  _catState: null,

  async init() {
    AI.loadChat();
    await AI.check();
    this.refreshDisponibilidade();
  },

  // Mostra ou esconde os pontos de entrada de IA conforme a disponibilidade.
  refreshDisponibilidade() {
    const on = AI.available === true;
    document.querySelectorAll("[data-ai-gate]").forEach(el => {
      el.classList.toggle("hidden", !on);
    });
    document.querySelectorAll("[data-ai-gate-off]").forEach(el => {
      el.classList.toggle("hidden", on);
    });
    const aviso = document.getElementById("ai-indisponivel-msg");
    if (aviso && !on) aviso.textContent = AI.motivoIndisponivel();
  },

  // ======================================================== Assistente (chat)

  renderAssistente() {
    const box = document.getElementById("ai-chat-log");
    if (!box) return;

    if (AI.available !== true) {
      box.innerHTML = "";
      return;
    }

    if (!AI.chat.length) {
      box.innerHTML = `
        <div class="ai-welcome">
          <div class="ai-welcome-icon">✦</div>
          <h3>Pergunte o que quiser sobre suas finanças</h3>
          <p class="muted">Eu leio seus lançamentos, contas, cartões e recorrências para responder. Nada sai daqui além do que é preciso para montar a resposta.</p>
          <div class="ai-suggestions">
            ${[
              "Para onde foi meu dinheiro este mês?",
              "Compare este mês com o mês passado",
              "Quanto sobra até o fim do mês?",
              "Quais assinaturas estou pagando?",
              "Onde eu conseguiria cortar gastos?",
              "Tem alguma conta prestes a vencer?"
            ].map(s => `<button class="ai-suggestion" data-pergunta="${escapeAttr(s)}">${escapeHtml(s)}</button>`).join("")}
          </div>
        </div>`;
      box.querySelectorAll(".ai-suggestion").forEach(b => {
        b.addEventListener("click", () => {
          document.getElementById("ai-input").value = b.dataset.pergunta;
          this.enviarPergunta();
        });
      });
      return;
    }

    box.innerHTML = AI.chat.map(m => this._bolhaHtml(m)).join("");
    this._scrollFim();
  },

  _bolhaHtml(m) {
    if (m.role === "user") {
      return `<div class="ai-msg ai-msg-user"><div class="ai-bubble">${escapeHtml(m.content)}</div></div>`;
    }
    return `<div class="ai-msg ai-msg-bot">
      <div class="ai-avatar">✦</div>
      <div class="ai-bubble ai-prose">${aiMarkdown(m.content)}</div>
    </div>`;
  },

  _scrollFim() {
    const box = document.getElementById("ai-chat-log");
    if (box) box.scrollTop = box.scrollHeight;
  },

  bindAssistente() {
    const form = document.getElementById("ai-form");
    if (!form) return;

    form.addEventListener("submit", e => {
      e.preventDefault();
      this.enviarPergunta();
    });

    const input = document.getElementById("ai-input");
    input.addEventListener("keydown", e => {
      // Enter envia; Shift+Enter quebra linha.
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.enviarPergunta();
      }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(160, input.scrollHeight) + "px";
    });

    document.getElementById("ai-clear").addEventListener("click", () => {
      if (!AI.chat.length) return;
      if (!confirm("Limpar toda a conversa?")) return;
      AI.clearChat();
      this.renderAssistente();
    });
  },

  async enviarPergunta() {
    if (AI._busy) return;
    const input = document.getElementById("ai-input");
    const pergunta = input.value.trim();
    if (!pergunta) return;

    if (AI.available !== true) {
      toast(AI.motivoIndisponivel(), "error");
      return;
    }

    input.value = "";
    input.style.height = "auto";

    AI.chat.push({ role: "user", content: pergunta });
    this.renderAssistente();

    const box = document.getElementById("ai-chat-log");
    const placeholder = document.createElement("div");
    placeholder.className = "ai-msg ai-msg-bot";
    placeholder.innerHTML = `<div class="ai-avatar">✦</div>
      <div class="ai-bubble ai-prose"><span class="ai-typing"><i></i><i></i><i></i></span></div>`;
    box.appendChild(placeholder);
    this._scrollFim();

    const alvo = placeholder.querySelector(".ai-bubble");
    AI._busy = true;
    this._setEnviando(true);

    try {
      const resposta = await AI.ask(pergunta, (_delta, full) => {
        alvo.innerHTML = aiMarkdown(full);
        this._scrollFim();
      });
      AI.chat.push({ role: "assistant", content: resposta });
      AI.saveChat();
      this.renderAssistente();
    } catch (err) {
      console.error(err);
      alvo.innerHTML = `<span class="ai-erro">${escapeHtml(err.message)}</span>`;
      // A pergunta fica no histórico visual, mas não vai pro contexto da próxima.
      AI.chat.pop();
      AI.saveChat();
    } finally {
      AI._busy = false;
      this._setEnviando(false);
    }
  },

  _setEnviando(on) {
    const btn = document.getElementById("ai-send");
    if (!btn) return;
    btn.disabled = on;
    btn.innerHTML = on ? '<span class="spinner-sm"></span>' : "↑";
  },

  // ======================================================== Insights

  async renderInsights(forcar = false) {
    const wrap = document.getElementById("dash-insights");
    if (!wrap) return;

    if (AI.available !== true) {
      wrap.classList.add("hidden");
      return;
    }
    wrap.classList.remove("hidden");

    const corpo = document.getElementById("dash-insights-body");
    const cache = forcar ? null : AI.cachedInsights();

    if (cache) {
      this._pintarInsights(cache);
      return;
    }

    if (!forcar) {
      // Sem cache válido e sem pedido explícito: oferece gerar, não gasta token sozinho.
      corpo.innerHTML = `
        <div class="ai-insights-empty">
          <p class="muted">Deixe a IA analisar seus dados e apontar o que merece atenção neste mês.</p>
          <button class="btn btn-primary btn-small" id="ai-gerar-insights">✦ Analisar minhas finanças</button>
        </div>`;
      const btn = document.getElementById("ai-gerar-insights");
      if (btn) btn.addEventListener("click", () => this.renderInsights(true));
      return;
    }

    corpo.innerHTML = `<div class="ai-insights-loading">
      ${[1, 2, 3].map(() => '<div class="skeleton-card"></div>').join("")}
    </div>`;

    try {
      const cache2 = await AI.gerarInsights();
      this._pintarInsights(cache2);
    } catch (err) {
      console.error(err);
      corpo.innerHTML = `<div class="ai-insights-empty">
        <p class="ai-erro">${escapeHtml(err.message)}</p>
        <button class="btn btn-small" id="ai-gerar-insights">Tentar de novo</button>
      </div>`;
      const btn = document.getElementById("ai-gerar-insights");
      if (btn) btn.addEventListener("click", () => this.renderInsights(true));
    }
  },

  _pintarInsights(cache) {
    const corpo = document.getElementById("dash-insights-body");
    const lista = cache.insights || [];

    if (!lista.length) {
      corpo.innerHTML = `<div class="ai-insights-empty">
        <p class="muted">Nada fora do comum nos seus dados agora. Suas finanças estão sob controle.</p>
        <button class="btn btn-ghost btn-small" id="ai-gerar-insights">↻ Analisar de novo</button>
      </div>`;
    } else {
      const icones = { alerta: "⚠", economia: "◎", padrao: "◈", previsao: "◔", positivo: "✓" };
      corpo.innerHTML = `<div class="insight-grid">` + lista.map(i => `
        <article class="insight insight-${escapeAttr(i.tipo)} sev-${escapeAttr(i.severidade)}">
          <div class="insight-top">
            <span class="insight-icon">${icones[i.tipo] || "✦"}</span>
            <h3>${escapeHtml(i.titulo)}</h3>
          </div>
          <p>${escapeHtml(i.descricao)}</p>
          ${Number(i.valor) ? `<div class="insight-valor">${fmtMoney(i.valor)}</div>` : ""}
          ${i.acao ? `<div class="insight-acao">${escapeHtml(i.acao)}</div>` : ""}
        </article>`).join("") + `</div>
        <div class="insight-foot">
          <span class="muted small">Gerado ${this._quandoTexto(cache.geradoEm)}</span>
          <button class="btn btn-ghost btn-small" id="ai-gerar-insights">↻ Atualizar</button>
        </div>`;
    }

    const btn = document.getElementById("ai-gerar-insights");
    if (btn) btn.addEventListener("click", () => this.renderInsights(true));
  },

  _quandoTexto(iso) {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return "agora";
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h}h`;
    return "em " + fmtDate(iso.slice(0, 10));
  },

  // ======================================================== Documento → lançamentos

  openDocumentoModal() {
    if (AI.available !== true) {
      toast(AI.motivoIndisponivel(), "error");
      return;
    }

    this._docState = null;
    document.getElementById("modal-root").innerHTML = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal modal-lg">
          <div class="modal-head">
            <h2><span class="ai-badge">IA</span> Ler documento</h2>
            <button class="btn-icon" id="modal-close" aria-label="Fechar">✕</button>
          </div>

          <div class="modal-body" id="doc-step1">
            <p class="muted small" style="margin:0 0 14px;">
              Envie a foto ou o PDF de um cupom fiscal, nota, boleto, comprovante ou fatura de cartão.
              A IA lê o documento e monta os lançamentos — você revisa tudo antes de salvar.
            </p>

            <div class="dropzone" id="doc-drop" tabindex="0" role="button">
              <input type="file" id="doc-file" accept="image/*,application/pdf" capture="environment" hidden>
              <div class="dropzone-inner">
                <div class="dropzone-icon">📄</div>
                <div class="dropzone-title">Clique para escolher, ou arraste o arquivo aqui</div>
                <div class="muted small">JPG, PNG, WebP ou PDF — até 3,5 MB</div>
              </div>
            </div>

            <div class="form-field full" style="margin-top:14px;">
              <label for="doc-obs">Alguma observação? <span class="muted">(opcional)</span></label>
              <input type="text" id="doc-obs" placeholder="Ex.: paguei no cartão do Btg, dividir com a Gabi...">
            </div>

            <div id="doc-status" class="doc-status"></div>
          </div>

          <div class="modal-body hidden" id="doc-step2"></div>

          <div class="modal-foot">
            <button class="btn" id="modal-cancel">Cancelar</button>
            <button class="btn btn-primary hidden" id="doc-save">Salvar lançamentos</button>
          </div>
        </div>
      </div>`;

    const close = () => { document.getElementById("modal-root").innerHTML = ""; };
    document.getElementById("modal-close").addEventListener("click", close);
    document.getElementById("modal-cancel").addEventListener("click", close);
    document.getElementById("modal-bd").addEventListener("click", e => {
      if (e.target.id === "modal-bd") close();
    });

    const drop = document.getElementById("doc-drop");
    const input = document.getElementById("doc-file");
    drop.addEventListener("click", () => input.click());
    drop.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
    });
    drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("drag"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
    drop.addEventListener("drop", e => {
      e.preventDefault();
      drop.classList.remove("drag");
      if (e.dataTransfer.files[0]) this.processarDocumento(e.dataTransfer.files[0]);
    });
    input.addEventListener("change", e => {
      if (e.target.files[0]) this.processarDocumento(e.target.files[0]);
    });
  },

  async processarDocumento(file) {
    const status = document.getElementById("doc-status");
    const drop = document.getElementById("doc-drop");
    const obs = document.getElementById("doc-obs").value.trim();

    drop.classList.add("busy");
    status.innerHTML = '<span class="spinner-sm"></span> Preparando o arquivo...';

    try {
      const arquivo = await aiPrepararArquivo(file);
      status.innerHTML = '<span class="spinner-sm"></span> A IA está lendo o documento. Isso leva alguns segundos...';

      const resultado = await AI.lerDocumento(arquivo, obs);
      this._docState = { resultado, preview: arquivo.preview || null };

      // Modo automático: se a IA leu tudo com confiança e sabe em que conta
      // lançar, grava direto e oferece desfazer. Na dúvida, abre a revisão.
      if (this._podeAutoAplicarDocumento(resultado)) {
        this._gravarDocumentoAutomatico(resultado);
        return;
      }
      this.mostrarRevisaoDocumento();
    } catch (err) {
      console.error(err);
      status.innerHTML = `<span class="ai-erro">${escapeHtml(err.message)}</span>`;
    } finally {
      drop.classList.remove("busy");
    }
  },

  _podeAutoAplicarDocumento(r) {
    const cfg = Store.getAIConfig();
    if (!cfg.autoAplicar) return false;
    // Precisa saber o que leu, em que conta lançar, e a conta tem que existir.
    if (!confiancaAtinge(r.confianca, cfg.limiar)) return false;
    if (!confiancaAtinge(r.confiancaConta, cfg.limiar)) return false;
    if (!r.contaSugerida || !App.state.contas.some(c => c.nome === r.contaSugerida)) return false;
    if (!(r.lancamentos || []).length) return false;
    // Soma não bater com o total é sinal de leitura incompleta: sempre revisa.
    const soma = r.lancamentos.reduce((s, l) => s + (Number(l.valor) || 0), 0);
    if (Math.abs(soma - (Number(r.total) || 0)) > 0.02) return false;
    return true;
  },

  _gravarDocumentoAutomatico(r) {
    const linhas = r.lancamentos.map(l => ({
      descricao: l.descricao,
      categoria: l.categoria,
      tipo: l.tipo || "saida",
      valor: Number(l.valor) || 0,
      categoriaIA: l.categoria
    }));

    const res = this._commitDocumento({
      linhas,
      conta: r.contaSugerida,
      contaIA: r.contaSugerida,
      dataComp: r.data || todayStr(),
      status: r.statusSugerido || "Pago",
      resultado: r
    });

    document.getElementById("modal-root").innerHTML = "";
    App.state = Store.get();
    App.renderAll();
    this.toastComDesfazer(
      `${res.criados.length} lançamento${res.criados.length === 1 ? "" : "s"} de ${r.estabelecimento || "documento"} em ${r.contaSugerida}`
    );
  },

  // Gravação em si — usada tanto pela revisão manual quanto pelo modo automático.
  _commitDocumento({ linhas, conta, contaIA, dataComp, status, resultado }) {
    const st = App.state;
    const contaObj = st.contas.find(c => c.nome === conta);
    const dataPag = contaObj && contaObj.tipo === "cartao"
      ? calcDataPagamentoCartao(contaObj, dataComp)
      : dataComp;

    const criados = [];
    const correcoes = [];

    // Se o usuário trocou a conta que a IA sugeriu, isso é a correção mais
    // valiosa que existe: da próxima vez ela acerta o cartão sozinha.
    if (contaIA && conta !== contaIA && resultado.estabelecimento) {
      const reg = {
        tipo: "conta",
        descricao: resultado.estabelecimento,
        cnpj: resultado.documento || "",
        de: contaIA,
        para: conta
      };
      Store.registrarCorrecaoIA(reg);
      correcoes.push(reg);
    }

    linhas.forEach(linha => {
      const { descricao, categoria, tipo, valor, categoriaIA } = linha;
      if (!descricao || !categoria || !(valor > 0)) return;

      if (!st.categorias.includes(categoria)) Store.addCategoria(categoria, "Outros");

      const lanc = Store.addLancamento({
        tipo,
        descricao,
        categoria,
        conta,
        valor,
        dataCompetencia: dataComp,
        dataPagamento: dataPag,
        status,
        origem: "ia-documento",
        cnpj: resultado.documento || undefined
      });
      criados.push(lanc.id);

      Store.learnItem(descricao, categoria);
      if (resultado.documento) Store.learnCnpjCategoria(resultado.documento, categoria);

      if (categoriaIA && categoria !== categoriaIA) {
        const reg = { tipo: "categoria", descricao, cnpj: resultado.documento || "", de: categoriaIA, para: categoria };
        Store.registrarCorrecaoIA(reg);
        correcoes.push(reg);
      }
    });

    Store.registrarAcaoIA({
      acao: "documento",
      resumo: `${criados.length} lançamento${criados.length === 1 ? "" : "s"} de ${resultado.estabelecimento || "documento"}`,
      criados,
      alterados: []
    });

    return { criados, correcoes };
  },

  // Toast com botão de desfazer — o contrapeso do modo automático.
  toastComDesfazer(mensagem) {
    const root = document.getElementById("toast-root");
    const el = document.createElement("div");
    el.className = "toast toast-success toast-acao";
    el.innerHTML = `<span>${escapeHtml(mensagem)}</span>
      <button class="toast-undo" type="button">Desfazer</button>`;
    root.appendChild(el);

    let timer = setTimeout(() => el.remove(), 9000);
    el.querySelector(".toast-undo").addEventListener("click", () => {
      clearTimeout(timer);
      el.remove();
      this.desfazerIA();
    });
  },

  desfazerIA() {
    const acao = Store.desfazerUltimaAcaoIA();
    if (!acao) { toast("Não há ação da IA para desfazer", "error"); return; }
    App.state = Store.get();
    App.renderAll();
    toast(`Desfeito: ${acao.resumo}`, "success");
  },

  mostrarRevisaoDocumento() {
    const { resultado, preview } = this._docState;
    document.getElementById("doc-step1").classList.add("hidden");
    const step2 = document.getElementById("doc-step2");
    step2.classList.remove("hidden");
    document.getElementById("doc-save").classList.remove("hidden");

    const st = App.state;
    const tipoLabel = {
      cupom: "Cupom fiscal", nota_fiscal: "Nota fiscal", boleto: "Boleto",
      fatura_cartao: "Fatura de cartão", comprovante: "Comprovante",
      extrato: "Extrato", outro: "Documento"
    }[resultado.tipo] || "Documento";

    const somaLancs = (resultado.lancamentos || []).reduce((s, l) => s + (Number(l.valor) || 0), 0);
    const divergencia = Math.abs(somaLancs - (Number(resultado.total) || 0)) > 0.02;

    // Conta: a que a IA detectou no documento, se existir de verdade.
    // Só cai na primeira conta corrente quando a IA não soube dizer.
    const contaDetectada = resultado.contaSugerida &&
      st.contas.some(c => c.nome === resultado.contaSugerida)
      ? resultado.contaSugerida : "";
    const contaPadrao = contaDetectada ||
      (st.contas.find(c => c.tipo === "conta") || st.contas[0] || {}).nome || "";
    const dataPadrao = resultado.data || todayStr();

    const formaLabel = {
      credito: "crédito", debito: "débito", pix: "PIX", dinheiro: "dinheiro",
      boleto: "boleto", transferencia: "transferência", desconhecida: ""
    }[resultado.formaPagamento] || "";

    step2.innerHTML = `
      <div class="doc-header">
        ${preview ? `<img class="doc-thumb" src="${preview}" alt="Prévia do documento">` : '<div class="doc-thumb doc-thumb-pdf">PDF</div>'}
        <div class="doc-header-info">
          <div class="doc-tipo">${escapeHtml(tipoLabel)}
            <span class="confianca conf-${escapeAttr(resultado.confianca)}">confiança ${escapeHtml(resultado.confianca)}</span>
          </div>
          <div class="doc-estab">${escapeHtml(resultado.estabelecimento || "Emissor não identificado")}</div>
          <div class="doc-meta muted small">
            ${resultado.documento ? escapeHtml(resultado.documento) + " · " : ""}
            ${resultado.data ? fmtDate(resultado.data) : "data não lida"}
            ${resultado.vencimento ? " · vence " + fmtDate(resultado.vencimento) : ""}
            ${formaLabel ? " · pago em " + escapeHtml(formaLabel) : ""}
            ${resultado.finalCartao ? " · final " + escapeHtml(resultado.finalCartao) : ""}
          </div>
          <div class="doc-total">${fmtMoney(resultado.total)}</div>
        </div>
      </div>

      ${contaDetectada ? `
        <div class="doc-detectado">
          <span class="doc-detectado-icone">✦</span>
          <div>
            <strong>Conta identificada: ${escapeHtml(contaDetectada)}</strong>
            <span class="confianca conf-${escapeAttr(resultado.confiancaConta)}">${escapeHtml(resultado.confiancaConta)}</span>
            ${resultado.motivoConta ? `<div class="muted small">${escapeHtml(resultado.motivoConta)}</div>` : ""}
          </div>
        </div>` : `
        <div class="doc-detectado doc-detectado-vazio">
          <span class="doc-detectado-icone">?</span>
          <div>
            <strong>Não consegui identificar a conta</strong>
            <div class="muted small">Escolha abaixo — eu guardo sua escolha e acerto sozinho da próxima vez.</div>
          </div>
        </div>`}

      ${resultado.observacoes ? `<div class="doc-aviso">⚠ ${escapeHtml(resultado.observacoes)}</div>` : ""}
      ${divergencia ? `<div class="doc-aviso doc-aviso-alerta">⚠ A soma dos lançamentos (${fmtMoney(somaLancs)}) não bate com o total do documento (${fmtMoney(resultado.total)}). Confira antes de salvar.</div>` : ""}

      <div class="doc-globais">
        <div class="form-field">
          <label for="doc-conta">Conta / cartão</label>
          <select id="doc-conta">
            ${st.contas.map(c => `<option value="${escapeAttr(c.nome)}" ${c.nome === contaPadrao ? "selected" : ""}>${escapeHtml(c.nome)}${c.tipo === "cartao" ? " (cartão)" : ""}</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label for="doc-data">Data de competência</label>
          <input type="date" id="doc-data" value="${escapeAttr(dataPadrao)}">
        </div>
        <div class="form-field">
          <label for="doc-status-sel">Status</label>
          <select id="doc-status-sel">
            <option value="Pago" ${resultado.statusSugerido !== "Pendente" ? "selected" : ""}>Pago</option>
            <option value="Pendente" ${resultado.statusSugerido === "Pendente" ? "selected" : ""}>Pendente</option>
          </select>
        </div>
      </div>

      <div class="doc-lista-head">
        <h3>Lançamentos propostos</h3>
        <span class="muted small" id="doc-contagem"></span>
      </div>

      <div class="doc-lancamentos" id="doc-lancamentos"></div>

      ${(resultado.itens || []).length ? `
        <details class="doc-itens">
          <summary>Ver os ${resultado.itens.length} itens lidos do documento</summary>
          <div class="table-wrap">
            <table class="data-table compact">
              <thead><tr><th>Item</th><th class="right">Qtd</th><th class="right">Valor</th><th>Categoria sugerida</th></tr></thead>
              <tbody>
                ${resultado.itens.map(it => `<tr>
                  <td>${escapeHtml(it.descricao)}</td>
                  <td class="right">${it.quantidade || 1}</td>
                  <td class="right">${fmtMoney(it.valor)}</td>
                  <td>${escapeHtml(it.categoria || "—")}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </details>` : ""}
    `;

    this._renderLinhasDocumento();

    document.getElementById("doc-save").addEventListener("click", () => this.salvarDocumento());
  },

  _renderLinhasDocumento() {
    const st = App.state;
    const lancs = this._docState.resultado.lancamentos || [];
    const wrap = document.getElementById("doc-lancamentos");

    if (!lancs.length) {
      wrap.innerHTML = '<p class="muted">A IA não conseguiu montar nenhum lançamento a partir deste documento.</p>';
      document.getElementById("doc-save").classList.add("hidden");
      return;
    }

    wrap.innerHTML = lancs.map((l, idx) => {
      const catValida = st.categorias.includes(l.categoria);
      return `
      <div class="doc-linha" data-idx="${idx}">
        <label class="doc-check">
          <input type="checkbox" checked data-role="incluir">
        </label>
        <input type="text" class="doc-in doc-in-desc" data-role="descricao" value="${escapeAttr(l.descricao)}" placeholder="Descrição">
        <select class="doc-in" data-role="categoria">
          ${st.categorias.map(c => `<option value="${escapeAttr(c)}" ${c === l.categoria ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
          ${catValida ? "" : `<option value="${escapeAttr(l.categoria)}" selected>${escapeHtml(l.categoria)} (nova)</option>`}
        </select>
        <select class="doc-in doc-in-tipo" data-role="tipo">
          <option value="saida" ${l.tipo !== "entrada" ? "selected" : ""}>Saída</option>
          <option value="entrada" ${l.tipo === "entrada" ? "selected" : ""}>Entrada</option>
        </select>
        <input type="number" step="0.01" min="0" class="doc-in doc-in-valor" data-role="valor" value="${Number(l.valor) || 0}">
        <button class="btn-icon doc-remove" data-role="remover" title="Remover linha">✕</button>
      </div>`;
    }).join("");

    wrap.querySelectorAll('[data-role="remover"]').forEach(b => {
      b.addEventListener("click", e => {
        const linha = e.target.closest(".doc-linha");
        const cb = linha.querySelector('[data-role="incluir"]');
        cb.checked = !cb.checked;
        linha.classList.toggle("excluida", !cb.checked);
        this._atualizarContagemDoc();
      });
    });
    wrap.querySelectorAll('[data-role="incluir"], [data-role="valor"]').forEach(el => {
      el.addEventListener("change", () => {
        const linha = el.closest(".doc-linha");
        linha.classList.toggle("excluida", !linha.querySelector('[data-role="incluir"]').checked);
        this._atualizarContagemDoc();
      });
    });

    this._atualizarContagemDoc();
  },

  _atualizarContagemDoc() {
    const linhas = [...document.querySelectorAll(".doc-linha")];
    const ativas = linhas.filter(l => l.querySelector('[data-role="incluir"]').checked);
    const soma = ativas.reduce((s, l) => s + (parseFloat(l.querySelector('[data-role="valor"]').value) || 0), 0);
    const el = document.getElementById("doc-contagem");
    if (el) el.textContent = `${ativas.length} de ${linhas.length} · total ${fmtMoney(soma)}`;
  },

  salvarDocumento() {
    const resultado = this._docState.resultado;
    const conta = document.getElementById("doc-conta").value;
    const dataComp = document.getElementById("doc-data").value;
    const status = document.getElementById("doc-status-sel").value;

    if (!dataComp) { toast("Defina a data de competência", "error"); return; }
    if (!conta) { toast("Escolha a conta ou cartão", "error"); return; }

    const linhasDom = [...document.querySelectorAll(".doc-linha")]
      .filter(l => l.querySelector('[data-role="incluir"]').checked);

    if (!linhasDom.length) { toast("Selecione ao menos um lançamento", "error"); return; }

    // Guarda o que a IA tinha proposto, pra saber o que você corrigiu.
    const propostas = resultado.lancamentos || [];
    const linhas = linhasDom.map(linha => {
      const idx = Number(linha.dataset.idx);
      return {
        descricao: linha.querySelector('[data-role="descricao"]').value.trim(),
        categoria: linha.querySelector('[data-role="categoria"]').value,
        tipo: linha.querySelector('[data-role="tipo"]').value,
        valor: parseFloat(linha.querySelector('[data-role="valor"]').value) || 0,
        categoriaIA: propostas[idx] ? propostas[idx].categoria : ""
      };
    });

    const res = this._commitDocumento({
      linhas,
      conta,
      contaIA: resultado.contaSugerida || "",
      dataComp,
      status,
      resultado
    });

    document.getElementById("modal-root").innerHTML = "";
    App.state = Store.get();
    App.renderAll();

    const n = res.criados.length;
    const aprendeu = res.correcoes.length;
    this.toastComDesfazer(
      `${n} lançamento${n === 1 ? "" : "s"} criado${n === 1 ? "" : "s"}` +
      (aprendeu ? ` · aprendi ${aprendeu} correç${aprendeu === 1 ? "ão" : "ões"}` : "")
    );
  },

  // ======================================================== Categorização em lote

  async openCategorizarModal() {
    if (AI.available !== true) {
      toast(AI.motivoIndisponivel(), "error");
      return;
    }

    const pendentes = AI.lancamentosParaRevisar();
    if (!pendentes.length) {
      toast("Todos os lançamentos já têm uma categoria específica", "success");
      return;
    }

    document.getElementById("modal-root").innerHTML = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal modal-lg">
          <div class="modal-head">
            <h2><span class="ai-badge">IA</span> Revisar categorias</h2>
            <button class="btn-icon" id="modal-close" aria-label="Fechar">✕</button>
          </div>
          <div class="modal-body" id="cat-body">
            <div class="ai-loading-block">
              <span class="spinner"></span>
              <p>Analisando ${pendentes.length} lançamento${pendentes.length === 1 ? "" : "s"} sem categoria definida...</p>
              <p class="muted small">A IA usa os lançamentos que você já categorizou como referência do seu critério.</p>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn" id="modal-cancel">Cancelar</button>
            <button class="btn btn-primary hidden" id="cat-apply">Aplicar selecionados</button>
          </div>
        </div>
      </div>`;

    const close = () => { document.getElementById("modal-root").innerHTML = ""; };
    document.getElementById("modal-close").addEventListener("click", close);
    document.getElementById("modal-cancel").addEventListener("click", close);
    document.getElementById("modal-bd").addEventListener("click", e => {
      if (e.target.id === "modal-bd") close();
    });

    try {
      const sugestoes = await AI.sugerirCategorias(pendentes);
      this._catState = { pendentes, sugestoes };
      this._renderSugestoesCategoria();
    } catch (err) {
      console.error(err);
      const body = document.getElementById("cat-body");
      if (body) body.innerHTML = `<p class="ai-erro">${escapeHtml(err.message)}</p>`;
    }
  },

  _renderSugestoesCategoria() {
    const st = App.state;
    const { pendentes, sugestoes } = this._catState;
    const porId = Object.fromEntries(pendentes.map(l => [l.id, l]));

    const linhas = sugestoes
      .filter(s => porId[s.id] && st.categorias.includes(s.categoria))
      .filter(s => s.categoria !== porId[s.id].categoria);

    const body = document.getElementById("cat-body");

    if (!linhas.length) {
      body.innerHTML = '<p class="muted">A IA não encontrou nenhuma categoria melhor do que a atual para esses lançamentos.</p>';
      return;
    }

    body.innerHTML = `
      <p class="muted small" style="margin:0 0 12px;">
        ${linhas.length} sugest${linhas.length === 1 ? "ão" : "ões"} de mudança. Desmarque o que não quiser aplicar.
      </p>
      <div class="cat-toolbar">
        <button class="btn btn-ghost btn-small" id="cat-all">Marcar todos</button>
        <button class="btn btn-ghost btn-small" id="cat-none">Desmarcar todos</button>
        <button class="btn btn-ghost btn-small" id="cat-alta">Só confiança alta</button>
      </div>
      <div class="cat-lista">
        ${linhas.map(s => {
          const l = porId[s.id];
          return `
          <label class="cat-linha conf-${escapeAttr(s.confianca)}" data-id="${escapeAttr(s.id)}">
            <input type="checkbox" checked data-conf="${escapeAttr(s.confianca)}">
            <div class="cat-info">
              <div class="cat-desc">${escapeHtml(l.descricao || "(sem descrição)")}</div>
              <div class="cat-meta muted small">${fmtDate(l.dataCompetencia)} · ${escapeHtml(l.conta)} · ${fmtMoney(l.valor)}</div>
              <div class="cat-motivo muted small">${escapeHtml(s.motivo)}</div>
            </div>
            <div class="cat-mudanca">
              <span class="cat-de">${escapeHtml(l.categoria || "sem categoria")}</span>
              <span class="cat-seta">→</span>
              <span class="cat-para">${escapeHtml(s.categoria)}</span>
              <span class="confianca conf-${escapeAttr(s.confianca)}">${escapeHtml(s.confianca)}</span>
            </div>
          </label>`;
        }).join("")}
      </div>`;

    document.getElementById("cat-apply").classList.remove("hidden");

    const boxes = () => [...document.querySelectorAll(".cat-linha input")];
    document.getElementById("cat-all").addEventListener("click", () => boxes().forEach(b => b.checked = true));
    document.getElementById("cat-none").addEventListener("click", () => boxes().forEach(b => b.checked = false));
    document.getElementById("cat-alta").addEventListener("click", () =>
      boxes().forEach(b => b.checked = b.dataset.conf === "alta"));

    document.getElementById("cat-apply").addEventListener("click", () => {
      const mapa = Object.fromEntries(linhas.map(s => [s.id, s.categoria]));
      const selecionados = boxes()
        .filter(b => b.checked)
        .map(b => b.closest(".cat-linha").dataset.id)
        .filter(id => mapa[id]);
      this._aplicarCategorias(selecionados, mapa, porId);
      document.getElementById("modal-root").innerHTML = "";
    });
  },

  // Aplica as recategorizações guardando o estado anterior, pra dar desfazer.
  _aplicarCategorias(ids, mapa, porId) {
    const alterados = [];
    ids.forEach(id => {
      const l = porId[id];
      if (!l) return;
      alterados.push({ id, antes: { categoria: l.categoria } });
      Store.updateLancamento(id, { categoria: mapa[id] });
      if (l.descricao) Store.learnItem(l.descricao, mapa[id]);
    });

    if (!alterados.length) { toast("Nada foi alterado", "error"); return 0; }

    Store.registrarAcaoIA({
      acao: "categorias",
      resumo: `${alterados.length} lançamento${alterados.length === 1 ? "" : "s"} recategorizado${alterados.length === 1 ? "" : "s"}`,
      criados: [],
      alterados
    });

    App.state = Store.get();
    App.renderAll();
    this.toastComDesfazer(
      alterados.length === 1 ? "1 lançamento recategorizado" : `${alterados.length} lançamentos recategorizados`
    );
    return alterados.length;
  },

  // ======================================================== Memória

  // Mostra o que a IA aprendeu com você. Serve para conferir — e para apagar
  // uma lição errada que ela tenha tirado de uma correção acidental.
  openMemoriaModal() {
    const correcoes = Store.correcoesRecentes(999).slice().reverse();

    document.getElementById("modal-root").innerHTML = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal modal-lg">
          <div class="modal-head">
            <h2><span class="ai-badge">IA</span> O que a IA aprendeu com você</h2>
            <button class="btn-icon" id="modal-close" aria-label="Fechar">✕</button>
          </div>
          <div class="modal-body">
            ${correcoes.length === 0 ? `
              <div class="empty-state">
                <div class="empty-icon">✦</div>
                <h3>Ainda não aprendi nada</h3>
                <p class="muted">Quando você corrigir uma categoria ou conta que eu sugeri, eu registro aqui e passo a acertar sozinha nas próximas vezes.</p>
              </div>` : `
              <p class="muted small" style="margin:0 0 12px;">
                ${correcoes.length} correç${correcoes.length === 1 ? "ão" : "ões"}.
                Vão junto em cada leitura de documento e categorização. Apague o que estiver errado.
              </p>
              <div class="cat-lista">
                ${correcoes.map((c, i) => `
                  <div class="mem-linha" data-idx="${i}">
                    <span class="mem-tipo mem-${escapeAttr(c.tipo)}">${c.tipo === "conta" ? "conta" : "categoria"}</span>
                    <div class="mem-info">
                      <div class="mem-desc">${escapeHtml(c.descricao || "(sem descrição)")}</div>
                      <div class="cat-mudanca">
                        <span class="cat-de">${escapeHtml(c.de)}</span>
                        <span class="cat-seta">→</span>
                        <span class="cat-para">${escapeHtml(c.para)}</span>
                      </div>
                    </div>
                    <button class="btn-icon mem-del" title="Esquecer esta correção">✕</button>
                  </div>`).join("")}
              </div>`}
          </div>
          <div class="modal-foot">
            ${correcoes.length ? '<button class="btn btn-danger" id="mem-limpar">Esquecer tudo</button>' : ""}
            <button class="btn" id="modal-cancel">Fechar</button>
          </div>
        </div>
      </div>`;

    const close = () => { document.getElementById("modal-root").innerHTML = ""; App.renderConfigIA(); };
    document.getElementById("modal-close").addEventListener("click", close);
    document.getElementById("modal-cancel").addEventListener("click", close);
    document.getElementById("modal-bd").addEventListener("click", e => {
      if (e.target.id === "modal-bd") close();
    });

    document.querySelectorAll(".mem-del").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.closest(".mem-linha").dataset.idx);
        const alvo = correcoes[idx];
        const st = App.state;
        st.aiMemoria.correcoes = st.aiMemoria.correcoes.filter(c => c.quando !== alvo.quando);
        Store.save();
        this.openMemoriaModal();
        toast("Correção esquecida", "success");
      });
    });

    const limpar = document.getElementById("mem-limpar");
    if (limpar) {
      limpar.addEventListener("click", () => {
        if (!confirm("Apagar tudo que a IA aprendeu com suas correções?")) return;
        App.state.aiMemoria.correcoes = [];
        Store.save();
        this.openMemoriaModal();
        toast("Memória apagada", "success");
      });
    }
  },

  // ======================================================== Plano de contas

  async openPlanoModal() {
    if (AI.available !== true) {
      toast(AI.motivoIndisponivel(), "error");
      return;
    }

    document.getElementById("modal-root").innerHTML = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal modal-lg">
          <div class="modal-head">
            <h2><span class="ai-badge">IA</span> Organizar plano de contas</h2>
            <button class="btn-icon" id="modal-close" aria-label="Fechar">✕</button>
          </div>
          <div class="modal-body" id="plano-body">
            <div class="ai-loading-block">
              <span class="spinner"></span>
              <p>Revisando suas ${App.state.categorias.length} categorias...</p>
              <p class="muted small">Procurando nomes com erro, duplicatas e categorias no grupo errado.</p>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn" id="modal-cancel">Cancelar</button>
            <button class="btn btn-primary hidden" id="plano-apply">Aplicar selecionados</button>
          </div>
        </div>
      </div>`;

    const close = () => { document.getElementById("modal-root").innerHTML = ""; };
    document.getElementById("modal-close").addEventListener("click", close);
    document.getElementById("modal-cancel").addEventListener("click", close);
    document.getElementById("modal-bd").addEventListener("click", e => {
      if (e.target.id === "modal-bd") close();
    });

    try {
      const plano = await AI.revisarPlanoDeContas();
      this._planoState = plano;
      this._renderPlano();
    } catch (err) {
      console.error(err);
      const body = document.getElementById("plano-body");
      if (body) body.innerHTML = `<p class="ai-erro">${escapeHtml(err.message)}</p>`;
    }
  },

  _renderPlano() {
    const st = App.state;
    const { diagnostico, acoes } = this._planoState;
    const body = document.getElementById("plano-body");

    // Descarta ação que não faz sentido no estado atual dos dados.
    const validas = acoes.filter(a => {
      if (a.tipo === "criar") return !st.categorias.includes(a.categoria);
      if (!st.categorias.includes(a.categoria)) return false;
      if (a.tipo === "fundir") return st.categorias.includes(a.destino) && a.destino !== a.categoria;
      if (a.tipo === "renomear") return a.destino && a.destino !== a.categoria;
      if (a.tipo === "reagrupar") return a.destino && (st.gruposCategoria || {})[a.categoria] !== a.destino;
      return false;
    });

    if (!validas.length) {
      body.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">✓</div>
          <h3>Seu plano de contas está em ordem</h3>
          <p class="muted">${escapeHtml(diagnostico || "Não encontrei nomes com erro, duplicatas nem categorias no grupo errado.")}</p>
        </div>`;
      return;
    }

    const rotulo = {
      renomear: ["Corrigir nome", "→"],
      fundir: ["Juntar", "→"],
      reagrupar: ["Mover de grupo", "→"],
      criar: ["Criar", "em"]
    };

    body.innerHTML = `
      ${diagnostico ? `<p class="plano-diag">${escapeHtml(diagnostico)}</p>` : ""}
      <div class="cat-toolbar">
        <button class="btn btn-ghost btn-small" id="plano-all">Marcar todos</button>
        <button class="btn btn-ghost btn-small" id="plano-none">Desmarcar todos</button>
        <button class="btn btn-ghost btn-small" id="plano-alta">Só confiança alta</button>
      </div>
      <div class="cat-lista">
        ${validas.map((a, i) => `
          <label class="plano-linha" data-idx="${i}">
            <input type="checkbox" ${a.confianca === "baixa" ? "" : "checked"} data-conf="${escapeAttr(a.confianca)}">
            <div class="plano-info">
              <div class="plano-acao">
                <span class="plano-tag plano-${escapeAttr(a.tipo)}">${rotulo[a.tipo][0]}</span>
                <span class="plano-de">${escapeHtml(a.categoria)}</span>
                <span class="cat-seta">${rotulo[a.tipo][1]}</span>
                <span class="plano-para">${escapeHtml(a.destino)}</span>
              </div>
              <div class="muted small">${escapeHtml(a.motivo)}</div>
            </div>
            <div class="plano-lado">
              ${a.lancamentosAfetados > 0
                ? `<span class="plano-afetados">${a.lancamentosAfetados} lanç.</span>` : ""}
              <span class="confianca conf-${escapeAttr(a.confianca)}">${escapeHtml(a.confianca)}</span>
            </div>
          </label>`).join("")}
      </div>
      <p class="muted small" style="margin:12px 0 0;">
        Renomear e juntar altera os lançamentos existentes junto. Dá para desfazer só a criação
        de categorias — mudanças de nome precisam ser refeitas na mão, então confira antes.
      </p>`;

    document.getElementById("plano-apply").classList.remove("hidden");

    const boxes = () => [...document.querySelectorAll(".plano-linha input")];
    document.getElementById("plano-all").addEventListener("click", () => boxes().forEach(b => b.checked = true));
    document.getElementById("plano-none").addEventListener("click", () => boxes().forEach(b => b.checked = false));
    document.getElementById("plano-alta").addEventListener("click", () =>
      boxes().forEach(b => b.checked = b.dataset.conf === "alta"));

    document.getElementById("plano-apply").addEventListener("click", () => {
      const escolhidas = boxes()
        .filter(b => b.checked)
        .map(b => validas[Number(b.closest(".plano-linha").dataset.idx)]);

      if (!escolhidas.length) { toast("Selecione ao menos uma mudança", "error"); return; }

      const pesadas = escolhidas.filter(a => a.tipo === "fundir" && a.lancamentosAfetados > 0);
      if (pesadas.length) {
        const total = pesadas.reduce((s, a) => s + a.lancamentosAfetados, 0);
        if (!confirm(`${pesadas.length} fusão(ões) vão mover ${total} lançamento(s) para outra categoria. Continuar?`)) return;
      }

      let n = 0;
      // Reagrupar e criar primeiro: renomear/fundir mudam os nomes de referência.
      const ordem = { reagrupar: 0, criar: 1, renomear: 2, fundir: 3 };
      escolhidas.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]).forEach(a => {
        let ok = false;
        if (a.tipo === "reagrupar") { Store.setGrupoCategoria(a.categoria, a.destino); ok = true; }
        else if (a.tipo === "criar") ok = Store.addCategoria(a.categoria, a.destino);
        else if (a.tipo === "renomear") ok = Store.renomearCategoria(a.categoria, a.destino);
        else if (a.tipo === "fundir") ok = Store.fundirCategoria(a.categoria, a.destino);
        if (ok) n++;
      });

      document.getElementById("modal-root").innerHTML = "";
      App.state = Store.get();
      App.renderAll();
      toast(n === 1 ? "1 mudança aplicada no plano de contas" : `${n} mudanças aplicadas no plano de contas`, "success");
    });
  }
};
