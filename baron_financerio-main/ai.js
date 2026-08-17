// ==========================================================================
// Baron Financeiro — Camada de IA (cliente)
//
// Toda chamada passa pelo proxy /api/ai que roda na Vercel. A chave da
// Anthropic fica só no servidor — o navegador nunca vê a chave.
//
// Em modo desktop (file://) não existe /api, então os recursos de IA ficam
// desligados e o app avisa o usuário em vez de quebrar.
// ==========================================================================

const AI_ENDPOINT = "/api/ai";
const AI_CHAT_KEY = "baron_ai_chat_v1";
const AI_INSIGHTS_KEY = "baron_ai_insights_v1";

const AI = {
  available: null,   // null = ainda não verificado, true/false depois do ping
  model: null,
  _checking: null,
  chat: [],          // [{role:"user"|"assistant", content}]
  _busy: false,

  // ------------------------------------------------------------ disponibilidade

  async check() {
    if (this._checking) return this._checking;

    // file:// nunca tem função serverless
    if (!location.protocol.startsWith("http")) {
      this.available = false;
      this.reason = "offline";
      return false;
    }

    this._checking = (async () => {
      try {
        const r = await fetch(AI_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ping" })
        });
        if (!r.ok) {
          this.available = false;
          this.reason = r.status === 404 ? "sem-endpoint" : "erro";
          return false;
        }
        const data = await r.json();
        this.available = !!data.ok;
        this.model = data.model || null;
        this.reason = data.ok ? null : "sem-chave";
        return this.available;
      } catch {
        this.available = false;
        this.reason = "sem-endpoint";
        return false;
      }
    })();

    return this._checking;
  },

  motivoIndisponivel() {
    switch (this.reason) {
      case "offline":
        return "Os recursos de IA precisam do app publicado na Vercel. Abrindo o arquivo direto no navegador (modo desktop), eles ficam desligados.";
      case "sem-chave":
        return "Falta configurar a chave. Na Vercel, vá em Settings → Environment Variables, crie ANTHROPIC_API_KEY com a sua chave da Anthropic e faça um novo deploy.";
      case "sem-endpoint":
        return "Não encontrei a função /api/ai. Verifique se o arquivo api/ai.js foi enviado no deploy.";
      default:
        return "A IA está indisponível no momento. Tente novamente em instantes.";
    }
  },

  // ------------------------------------------------------------ transporte

  async _post(payload) {
    const r = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!r.ok) {
      throw new Error((data && data.error) || `Falha na IA (HTTP ${r.status})`);
    }
    if (!data) throw new Error("Resposta inesperada do servidor de IA.");
    return data;
  },

  // Faz a chamada de chat e vai entregando os pedaços de texto via onDelta.
  async _stream(payload, onDelta) {
    const r = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const text = await r.text();
      let msg = `Falha na IA (HTTP ${r.status})`;
      try { msg = JSON.parse(text).error || msg; } catch { /* corpo não-JSON */ }
      throw new Error(msg);
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      full += chunk;
      onDelta(chunk, full);
    }
    return full;
  },

  // ------------------------------------------------------------ contexto

  // Monta um resumo compacto dos dados. Não manda tudo: manda o que responde
  // as perguntas que as pessoas realmente fazem, com um teto de tamanho.
  buildContext(opts = {}) {
    const st = App.state;
    if (!st || !App.period) return {};

    const maxLancs = opts.maxLancamentos || 350;
    const p = App.period;
    const ymAtual = `${p.y}-${String(p.m).padStart(2, "0")}`;
    const hoje = todayStr();

    const grupos = st.gruposCategoria || {};
    const ehTransfer = l => grupoEhTransferencia(grupos[l.categoria] || "Outros");

    // --- Agregados por mês (24 meses, competência) ---
    const porMes = {};
    st.lancamentos.forEach(l => {
      if (ehTransfer(l)) return;
      const ym = (l.dataCompetencia || "").slice(0, 7);
      if (!ym) return;
      if (!porMes[ym]) porMes[ym] = { mes: ym, entradas: 0, saidas: 0, qtd: 0 };
      const v = Number(l.valor) || 0;
      if (l.tipo === "entrada") porMes[ym].entradas += v;
      else porMes[ym].saidas += v;
      porMes[ym].qtd++;
    });
    const meses = Object.values(porMes)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-24)
      .map(m => ({
        mes: m.mes,
        entradas: round2(m.entradas),
        saidas: round2(m.saidas),
        saldo: round2(m.entradas - m.saidas),
        lancamentos: m.qtd
      }));

    // --- Gastos por categoria: mês atual e 3 meses anteriores ---
    const catPorMes = {};
    st.lancamentos.forEach(l => {
      if (l.tipo !== "saida" || ehTransfer(l)) return;
      const ym = (l.dataCompetencia || "").slice(0, 7);
      if (!ym) return;
      if (!catPorMes[ym]) catPorMes[ym] = {};
      catPorMes[ym][l.categoria] = round2((catPorMes[ym][l.categoria] || 0) + (Number(l.valor) || 0));
    });
    const ultimos4 = Object.keys(catPorMes).sort().slice(-4);
    const gastosPorCategoria = {};
    ultimos4.forEach(ym => { gastosPorCategoria[ym] = catPorMes[ym]; });

    // --- Saldos por conta ---
    const saldos = typeof App.saldoPorConta === "function" ? App.saldoPorConta() : {};
    const contas = st.contas.map(c => {
      const base = {
        nome: c.nome,
        tipo: c.tipo,
        saldoInicial: round2(c.saldoInicial || 0),
        saldoAtual: round2(saldos[c.nome] != null ? saldos[c.nome] : (c.saldoInicial || 0))
      };
      if (c.tipo === "cartao") {
        base.diaFechamento = c.diaFechamento;
        base.diaVencimento = c.diaVencimento;
        base.contaPagamento = c.contaPagamento || "";
      }
      return base;
    });

    // --- Contas a pagar / receber em aberto ---
    const emAberto = st.lancamentos
      .filter(l => statusEfetivo(l) !== "Pago")
      .sort((a, b) => (a.dataPagamento || "").localeCompare(b.dataPagamento || ""))
      .slice(0, 120)
      .map(l => ({
        descricao: l.descricao,
        categoria: l.categoria,
        conta: l.conta,
        tipo: l.tipo,
        vencimento: l.dataPagamento || l.dataCompetencia,
        valorTotal: round2(l.valor),
        saldoDevedor: round2(saldoDevedor(l)),
        status: statusEfetivo(l),
        diasParaVencer: daysUntil(l.dataPagamento || l.dataCompetencia)
      }));

    // --- Lançamentos recentes (detalhe pra IA raciocinar) ---
    const lancamentos = st.lancamentos
      .slice()
      .sort((a, b) => (b.dataCompetencia || "").localeCompare(a.dataCompetencia || ""))
      .slice(0, maxLancs)
      .map(l => ({
        id: l.id,
        data: l.dataCompetencia,
        pagamento: l.dataPagamento,
        descricao: l.descricao,
        categoria: l.categoria,
        grupo: grupos[l.categoria] || "Outros",
        conta: l.conta,
        tipo: l.tipo,
        valor: round2(l.valor),
        status: statusEfetivo(l)
      }));

    // --- Recorrências (assinaturas, contas fixas) ---
    const recorrencias = (st.recorrencias || []).map(r => ({
      descricao: r.descricao,
      categoria: r.categoria,
      conta: r.conta,
      tipo: r.tipo,
      valor: round2(r.valor),
      frequencia: r.frequencia,
      ativa: r.ativa !== false
    }));

    return {
      hoje,
      periodoSelecionado: ymAtual,
      periodoLabel: App.periodLabel(),
      categorias: st.categorias,
      gruposCategoria: grupos,
      contas,
      resumoMensal: meses,
      gastosPorCategoria,
      emAberto,
      recorrencias,
      lancamentosRecentes: lancamentos,
      totalLancamentosNaBase: st.lancamentos.length
    };
  },

  // Assinatura leve dos dados: se não mudou, não precisa gerar insight de novo.
  contextFingerprint() {
    const st = App.state;
    if (!st || !App.period) return "";
    const total = st.lancamentos.length;
    const soma = st.lancamentos.reduce((s, l) => s + (Number(l.valor) || 0), 0);
    const pagos = st.lancamentos.filter(l => statusEfetivo(l) === "Pago").length;
    return `${App.period.y}-${App.period.m}|${total}|${pagos}|${soma.toFixed(2)}`;
  },

  // ------------------------------------------------------------ chat

  loadChat() {
    try {
      const raw = localStorage.getItem(AI_CHAT_KEY);
      this.chat = raw ? JSON.parse(raw) : [];
    } catch {
      this.chat = [];
    }
    if (!Array.isArray(this.chat)) this.chat = [];
  },

  saveChat() {
    try {
      // Guarda só as últimas 40 mensagens pra não estourar o localStorage
      localStorage.setItem(AI_CHAT_KEY, JSON.stringify(this.chat.slice(-40)));
    } catch { /* localStorage cheio: segue sem persistir */ }
  },

  clearChat() {
    this.chat = [];
    try { localStorage.removeItem(AI_CHAT_KEY); } catch { /* ignora */ }
  },

  async ask(pergunta, onDelta) {
    // Só as últimas 12 mensagens vão como histórico — o contexto financeiro
    // já carrega o peso, e conversas longas ficam caras à toa.
    const historico = this.chat.slice(-12).map(m => ({ role: m.role, content: m.content }));
    historico.push({ role: "user", content: pergunta });

    return this._stream({
      action: "chat",
      messages: historico,
      contexto: this.buildContext()
    }, onDelta);
  },

  // ------------------------------------------------------------ insights

  cachedInsights() {
    try {
      const raw = localStorage.getItem(AI_INSIGHTS_KEY);
      if (!raw) return null;
      const cache = JSON.parse(raw);
      if (cache.fingerprint !== this.contextFingerprint()) return null;
      return cache;
    } catch {
      return null;
    }
  },

  async gerarInsights() {
    const data = await this._post({
      action: "insights",
      contexto: this.buildContext({ maxLancamentos: 250 })
    });
    const cache = {
      fingerprint: this.contextFingerprint(),
      geradoEm: new Date().toISOString(),
      insights: Array.isArray(data.insights) ? data.insights : []
    };
    try { localStorage.setItem(AI_INSIGHTS_KEY, JSON.stringify(cache)); } catch { /* ignora */ }
    return cache;
  },

  // ------------------------------------------------------------ categorização

  // Lançamentos que valem revisar: sem categoria, ou no balde genérico.
  lancamentosParaRevisar(limite = 60) {
    const st = App.state;
    if (!st) return [];
    const genericas = new Set(["", "Outros", "Pagamentos Variaveis", "Sem categoria"]);
    return st.lancamentos
      .filter(l => genericas.has(l.categoria || "") || !st.categorias.includes(l.categoria))
      .sort((a, b) => (b.dataCompetencia || "").localeCompare(a.dataCompetencia || ""))
      .slice(0, limite);
  },

  // Amostra do que o usuário já classificou — é o que ensina o critério dele.
  exemplosClassificados(limite = 80) {
    const st = App.state;
    if (!st) return [];
    const porCategoria = {};
    st.lancamentos
      .slice()
      .sort((a, b) => (b.dataCompetencia || "").localeCompare(a.dataCompetencia || ""))
      .forEach(l => {
        if (!l.descricao || !l.categoria) return;
        if (!porCategoria[l.categoria]) porCategoria[l.categoria] = [];
        if (porCategoria[l.categoria].length < 3) {
          porCategoria[l.categoria].push({
            descricao: l.descricao,
            valor: round2(l.valor),
            conta: l.conta,
            categoria: l.categoria
          });
        }
      });
    return Object.values(porCategoria).flat().slice(0, limite);
  },

  // Correções que o usuário já fez em palpites anteriores. É a memória que
  // faz a IA parar de errar no mesmo lugar duas vezes.
  memoria(limite = 60) {
    return Store.correcoesRecentes(limite).map(c => ({
      tipo: c.tipo,
      descricao: c.descricao,
      de: c.de,
      para: c.para
    }));
  },

  async sugerirCategorias(lancs) {
    const st = App.state;
    const data = await this._post({
      action: "categorize",
      categorias: st.categorias,
      grupos: st.gruposCategoria || {},
      exemplos: this.exemplosClassificados(),
      memoria: this.memoria(),
      lancamentos: lancs.map(l => ({
        id: l.id,
        descricao: l.descricao || "",
        valor: round2(l.valor),
        conta: l.conta,
        tipo: l.tipo,
        data: l.dataCompetencia,
        categoriaAtual: l.categoria || ""
      }))
    });
    return Array.isArray(data.sugestoes) ? data.sugestoes : [];
  },

  // ------------------------------------------------------------ documentos

  async lerDocumento(arquivo, observacao) {
    const st = App.state;
    return this._post({
      action: "document",
      arquivo,
      observacao: observacao || "",
      hoje: todayStr(),
      categorias: st.categorias,
      // O tipo e o banco de pagamento ajudam a IA a casar "Fatura Nubank"
      // com o cartão certo em vez da conta corrente.
      contas: st.contas.map(c => ({
        nome: c.nome,
        tipo: c.tipo,
        contaPagamento: c.contaPagamento || ""
      })),
      cnpjConhecidos: st.cnpjMap || {},
      memoria: this.memoria()
    });
  },

  // ------------------------------------------------------------ plano de contas

  // Quanto cada categoria é usada de fato: é isso que separa uma duplicata
  // esquecida de uma categoria que a pessoa usa toda semana.
  usoDasCategorias() {
    const st = App.state;
    const uso = {};
    st.categorias.forEach(c => {
      uso[c] = { lancamentos: 0, total: 0, primeira: "", ultima: "" };
    });
    st.lancamentos.forEach(l => {
      const u = uso[l.categoria];
      if (!u) return;
      u.lancamentos++;
      u.total = round2(u.total + (Number(l.valor) || 0));
      const d = l.dataCompetencia || "";
      if (d && (!u.primeira || d < u.primeira)) u.primeira = d;
      if (d && (!u.ultima || d > u.ultima)) u.ultima = d;
    });
    return uso;
  },

  async revisarPlanoDeContas() {
    const st = App.state;
    const data = await this._post({
      action: "plano",
      categorias: st.categorias,
      grupos: st.gruposCategoria || {},
      gruposDisponiveis: typeof ORDEM_GRUPOS !== "undefined" ? ORDEM_GRUPOS : [],
      uso: this.usoDasCategorias()
    });
    return {
      diagnostico: data.diagnostico || "",
      acoes: Array.isArray(data.acoes) ? data.acoes : []
    };
  }
};

// ==========================================================================
// Helpers de arquivo — preparam a imagem/PDF pra enviar ao proxy
// ==========================================================================

// A Vercel corta requests acima de ~4.5MB, então imagens grandes são
// redimensionadas no navegador antes de subir. 2000px no lado maior é bem
// mais do que um cupom precisa e continua legível.
const AI_MAX_DIM = 2000;
const AI_MAX_BYTES = 3_500_000;

async function aiPrepararArquivo(file) {
  if (file.type === "application/pdf") {
    if (file.size > AI_MAX_BYTES) {
      throw new Error("Este PDF tem mais de 3,5 MB. Tente um arquivo menor ou envie uma foto da página.");
    }
    return { mediaType: "application/pdf", data: await aiFileToBase64(file), nome: file.name, tamanho: file.size };
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Formato não suportado. Envie uma imagem (JPG/PNG/WebP) ou um PDF.");
  }

  const img = await aiFileToImage(file);
  const escala = Math.min(1, AI_MAX_DIM / Math.max(img.width, img.height));
  const w = Math.round(img.width * escala);
  const h = Math.round(img.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  // Vai baixando a qualidade até caber no limite de payload.
  let qualidade = 0.85;
  let dataUrl = canvas.toDataURL("image/jpeg", qualidade);
  while (dataUrl.length > AI_MAX_BYTES && qualidade > 0.4) {
    qualidade -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", qualidade);
  }
  if (dataUrl.length > AI_MAX_BYTES) {
    throw new Error("Imagem grande demais mesmo depois de comprimir. Tente enfoquar só o cupom.");
  }

  return {
    mediaType: "image/jpeg",
    data: dataUrl.split(",")[1],
    nome: file.name,
    tamanho: dataUrl.length,
    preview: dataUrl
  };
}

function aiFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function aiFileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Não consegui abrir a imagem."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

// ==========================================================================
// Markdown mínimo — o suficiente pro que o assistente escreve
// ==========================================================================

function aiMarkdown(src) {
  const inline = (s) =>
    escapeHtml(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:)!?]|$)/g, "$1<em>$2</em>");

  const linhas = String(src || "").replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;

  while (i < linhas.length) {
    const linha = linhas[i];

    // Tabela: | a | b |  seguida de | --- | --- |
    if (/^\s*\|.*\|\s*$/.test(linha) && /^\s*\|[\s:|-]+\|\s*$/.test(linhas[i + 1] || "")) {
      const celulas = l => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const head = celulas(linha);
      i += 2;
      const corpo = [];
      while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])) {
        corpo.push(celulas(linhas[i]));
        i++;
      }
      out.push(
        '<div class="ai-table-wrap"><table class="ai-table"><thead><tr>' +
        head.map(c => `<th>${inline(c)}</th>`).join("") +
        "</tr></thead><tbody>" +
        corpo.map(r => "<tr>" + r.map(c => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") +
        "</tbody></table></div>"
      );
      continue;
    }

    // Cabeçalho
    const h = linha.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const nivel = Math.min(6, h[1].length + 2);
      out.push(`<h${nivel}>${inline(h[2])}</h${nivel}>`);
      i++;
      continue;
    }

    // Lista (com marcador ou numerada)
    if (/^\s*([-*•]|\d+\.)\s+/.test(linha)) {
      const numerada = /^\s*\d+\.\s+/.test(linha);
      const itens = [];
      while (i < linhas.length && /^\s*([-*•]|\d+\.)\s+/.test(linhas[i])) {
        itens.push(linhas[i].replace(/^\s*([-*•]|\d+\.)\s+/, ""));
        i++;
      }
      const tag = numerada ? "ol" : "ul";
      out.push(`<${tag}>` + itens.map(t => `<li>${inline(t)}</li>`).join("") + `</${tag}>`);
      continue;
    }

    // Linha em branco
    if (!linha.trim()) { i++; continue; }

    // Parágrafo (junta linhas seguidas)
    const par = [];
    while (
      i < linhas.length &&
      linhas[i].trim() &&
      !/^\s*([-*•]|\d+\.)\s+/.test(linhas[i]) &&
      !/^#{1,4}\s/.test(linhas[i]) &&
      !/^\s*\|.*\|\s*$/.test(linhas[i])
    ) {
      par.push(linhas[i]);
      i++;
    }
    out.push(`<p>${inline(par.join(" "))}</p>`);
  }

  return out.join("");
}
