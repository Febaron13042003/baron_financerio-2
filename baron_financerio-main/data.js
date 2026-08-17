// ==========================================================================
// Baron Financeiro — camada de dados (localStorage)
// ==========================================================================

const STORAGE_KEY = "baron_financeiro_v1";
const HANDLE_DB = "baron_financeiro_handles";
const HANDLE_STORE = "handles";

// Mini wrapper sobre IndexedDB para guardar o FileSystemFileHandle
const HandleDB = {
  _db: null,
  _open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(HANDLE_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE);
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },
  async get() {
    try {
      const db = await this._open();
      return await new Promise((res, rej) => {
        const tx = db.transaction(HANDLE_STORE, "readonly");
        const req = tx.objectStore(HANDLE_STORE).get("data");
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => rej(req.error);
      });
    } catch (e) { return null; }
  },
  async set(handle) {
    const db = await this._open();
    return new Promise((res, rej) => {
      const tx = db.transaction(HANDLE_STORE, "readwrite");
      tx.objectStore(HANDLE_STORE).put(handle, "data");
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async clear() {
    try {
      const db = await this._open();
      await new Promise(res => {
        const tx = db.transaction(HANDLE_STORE, "readwrite");
        tx.objectStore(HANDLE_STORE).delete("data");
        tx.oncomplete = res;
        tx.onerror = res;
      });
    } catch (e) { /* ignore */ }
  }
};

const DEFAULT_CATEGORIAS = [
  "Salário","Dividendos","Investimentos","alimentação","Renda extra",
  "assinaturas","lazer","gasolina","Carro","educação","Material de Limpeza",
  "Moveis e Eletros","Seguros","Pagamentos Variaveis","Alimentação Felipe",
  "Aluguel","Luz","Condominio","Gás","Saude/Farmacia","Lazer Gabi","Lazer Felipe",
  "Pet","Roupas e Acessorios","Internet","Imposto","Presentes","Iptu",
  "Estacionamento","Plano de Saúde","Viagem","Uber/Viagem","Produtos de Beleza",
  "Ifood/Restaurante","Estética e Beleza","Maquiagem","Materia Prima",
  "Alimetação Gabi","Emprestimos","Transferências"
];

const DEFAULT_CONTAS = [
  { nome: "Nubank", tipo: "conta" },
  { nome: "Itaú", tipo: "conta" },
  { nome: "Btg", tipo: "conta" },
  { nome: "Btg Investimentos", tipo: "conta" },
  { nome: "Sicoob", tipo: "conta" },
  { nome: "Dinheiro", tipo: "conta" },
  { nome: "Cartão Btg",       tipo: "cartao", diaFechamento: 28, diaVencimento: 5,  contaPagamento: "Btg" },
  { nome: "Cartão Nubank",    tipo: "cartao", diaFechamento: 28, diaVencimento: 10, contaPagamento: "Nubank" },
  { nome: "Cartão Nubank Fe", tipo: "cartao", diaFechamento: 28, diaVencimento: 10, contaPagamento: "Nubank" }
];

// Dados pré-carregados da planilha original (Contas a Pagar)
const SEED_CONTAS_PAGAR = [
  { vencimento: "2026-02-02", conta: "Itaú",            item: "",                    categoria: "Emprestimos",          valor: 0.27 },
  { vencimento: "2026-02-10", conta: "Btg",             item: "Internet",            categoria: "Internet",             valor: 100.00 },
  { vencimento: "2026-02-10", conta: "Btg",             item: "imposto",             categoria: "Imposto",              valor: 80.90 },
  { vencimento: "2026-02-10", conta: "Btg",             item: "Seguro Carro",        categoria: "Seguros",              valor: 254.30 },
  { vencimento: "2026-02-10", conta: "Btg",             item: "carro",               categoria: "Carro",                valor: 1238.50 },
  { vencimento: "2026-02-10", conta: "Nubank",          item: "",                    categoria: "Presentes",            valor: 82.00 },
  { vencimento: "2026-02-10", conta: "Nubank",          item: "",                    categoria: "assinaturas",          valor: 53.90 },
  { vencimento: "2026-02-10", conta: "Nubank",          item: "",                    categoria: "assinaturas",          valor: 2.90 },
  { vencimento: "2026-02-10", conta: "Nubank",          item: "",                    categoria: "assinaturas",          valor: 1.90 },
  { vencimento: "2026-02-15", conta: "Btg",             item: "Luz",                 categoria: "Luz",                  valor: 80.59 },
  { vencimento: "2026-03-05", conta: "Cartão Btg",      item: "",                    categoria: "alimentação",          valor: 96.36 },
  { vencimento: "2026-03-05", conta: "Cartão Btg",      item: "",                    categoria: "Alimetação Gabi",      valor: 15.00 },
  { vencimento: "2026-03-10", conta: "Cartão Nubank Fe",item: "maquina de lavar",    categoria: "Moveis e Eletros",     valor: 296.90 },
  { vencimento: "2026-03-10", conta: "Cartão Nubank Fe",item: "passagens",           categoria: "gasolina",             valor: 55.17 },
  { vencimento: "2026-03-13", conta: "Btg",             item: "Ipva",                categoria: "Carro",                valor: 141.19 },
  { vencimento: "2026-04-10", conta: "Cartão Nubank Fe",item: "maquina de lavar",    categoria: "Moveis e Eletros",     valor: 296.90 },
  { vencimento: "2026-04-13", conta: "Btg",             item: "Ipva",                categoria: "Carro",                valor: 141.19 },
  { vencimento: "2026-05-10", conta: "Cartão Nubank Fe",item: "maquina de lavar",    categoria: "Moveis e Eletros",     valor: 296.90 },
  { vencimento: "2026-05-13", conta: "Btg",             item: "Ipva",                categoria: "Carro",                valor: 141.19 },
  { vencimento: "2026-06-10", conta: "Cartão Nubank Fe",item: "maquina de lavar",    categoria: "Moveis e Eletros",     valor: 296.90 }
];

function buildSeedState() {
  // Converte os contas a pagar em lançamentos "Pendente" (saídas)
  const lancamentos = SEED_CONTAS_PAGAR.map((c, idx) => ({
    id: "seed-" + idx + "-" + Date.now(),
    tipo: "saida",
    dataCompetencia: c.vencimento,
    dataPagamento: c.vencimento,
    descricao: c.item || c.categoria,
    categoria: c.categoria,
    conta: c.conta,
    valor: c.valor,
    status: "Pendente",
    origem: "seed"
  }));

  // Passa pelo migrateState pra já nascer no formato atual: sem isso o estado
  // recém-criado ficava sem gruposCategoria e todas as categorias caíam em
  // "Outros" no plano de contas, no DRE e na análise da IA.
  return migrateState({
    version: 2,
    categorias: [...DEFAULT_CATEGORIAS],
    contas: DEFAULT_CONTAS.map(c => ({ ...c, saldoInicial: 0 })),
    lancamentos,
    recorrencias: [],
    seedApplied: true,
    createdAt: new Date().toISOString()
  });
}

// === Plano de Contas: ordem dos grupos pra exibição ===
const ORDEM_GRUPOS = [
  "Receitas",
  "Despesas Fixas",
  "Despesas Variáveis",
  "Transporte",
  "Saúde",
  "Casa",
  "Pessoal",
  "Lazer/Viagem",
  "Pet",
  "Investimentos",
  "Financeiras",
  "Transferências",
  "Outros"
];

// === Mapa default: categoria -> grupo do plano de contas ===
const DEFAULT_GRUPO_POR_CATEGORIA = {
  // Receitas
  "Salário": "Receitas",
  "Dividendos": "Receitas",
  "Renda extra": "Receitas",
  // Despesas Fixas
  "Aluguel": "Despesas Fixas",
  "Luz": "Despesas Fixas",
  "Internet": "Despesas Fixas",
  "Condominio": "Despesas Fixas",
  "Gás": "Despesas Fixas",
  "Plano de Saúde": "Despesas Fixas",
  "Iptu": "Despesas Fixas",
  "Seguros": "Despesas Fixas",
  "Imposto": "Despesas Fixas",
  "assinaturas": "Despesas Fixas",
  // Despesas Variáveis
  "alimentação": "Despesas Variáveis",
  "Alimentação Felipe": "Despesas Variáveis",
  "Alimetação Gabi": "Despesas Variáveis",
  "Ifood/Restaurante": "Despesas Variáveis",
  "Material de Limpeza": "Despesas Variáveis",
  "Pagamentos Variaveis": "Despesas Variáveis",
  // Transporte
  "gasolina": "Transporte",
  "Carro": "Transporte",
  "Estacionamento": "Transporte",
  "Uber/Viagem": "Transporte",
  // Saúde
  "Saude/Farmacia": "Saúde",
  // Casa
  "Moveis e Eletros": "Casa",
  // Pessoal
  "Roupas e Acessorios": "Pessoal",
  "Produtos de Beleza": "Pessoal",
  "Estética e Beleza": "Pessoal",
  "Maquiagem": "Pessoal",
  "Presentes": "Pessoal",
  "educação": "Pessoal",
  "lazer": "Pessoal",
  "Lazer Gabi": "Pessoal",
  "Lazer Felipe": "Pessoal",
  // Lazer/Viagem
  "Viagem": "Lazer/Viagem",
  // Pet
  "Pet": "Pet",
  // Investimentos
  "Investimentos": "Investimentos",
  "Materia Prima": "Investimentos",
  // Financeiras
  "Emprestimos": "Financeiras",
  // Transferências
  "Transferências": "Transferências"
};

// Determina se o grupo é de receita (entra no DRE como receita)
function grupoEhReceita(grupo) {
  return grupo === "Receitas";
}

// Determina se o grupo é "interno" (não conta no DRE, ex: transferências)
function grupoEhTransferencia(grupo) {
  return grupo === "Transferências";
}

// Migra estado de versoes antigas para a nova
function migrateState(state) {
  if (!state) return state;
  state.version = state.version || 1;
  if (!Array.isArray(state.recorrencias)) state.recorrencias = [];
  if (!state.cnpjMap || typeof state.cnpjMap !== "object") state.cnpjMap = {};
  if (!state.itemMap || typeof state.itemMap !== "object") state.itemMap = {};
  if (!state.gruposCategoria || typeof state.gruposCategoria !== "object") {
    state.gruposCategoria = {};
  }
  // garante que toda categoria tenha um grupo (atribui default se faltar)
  if (Array.isArray(state.categorias)) {
    state.categorias.forEach(c => {
      if (!state.gruposCategoria[c]) {
        state.gruposCategoria[c] = DEFAULT_GRUPO_POR_CATEGORIA[c] || "Outros";
      }
    });
  }
  if (Array.isArray(state.contas)) {
    state.contas.forEach(c => {
      if (typeof c.saldoInicial !== "number") c.saldoInicial = 0;
      if (c.tipo === "cartao") {
        if (typeof c.diaFechamento !== "number") c.diaFechamento = 28;
        if (typeof c.diaVencimento !== "number") c.diaVencimento = 5;
        if (typeof c.contaPagamento !== "string") c.contaPagamento = "";
        if (typeof c.regraFatura !== "string") c.regraFatura = "fechamento";
      }
    });
  }
  // v6: garantir que cada lançamento tenha pagamentos[] e rateios[]
  if (Array.isArray(state.lancamentos)) {
    state.lancamentos.forEach(l => {
      if (!Array.isArray(l.pagamentos)) l.pagamentos = [];
      if (!Array.isArray(l.rateios)) l.rateios = [];
      // Compat: se for "Pago" antigo sem pagamentos[], cria 1 entrada de pagamento total
      if (l.status === "Pago" && l.pagamentos.length === 0 && l.tipo === "saida" && l.origem !== "pagamento-fatura") {
        l.pagamentos.push({
          data: l.dataPagamento || l.dataCompetencia,
          valor: l.valor,
          conta: l.conta
        });
      }
    });
  }
  // v7: memória da IA, configuração de automação e histórico reversível
  if (!state.aiMemoria || typeof state.aiMemoria !== "object") state.aiMemoria = {};
  if (!Array.isArray(state.aiMemoria.correcoes)) state.aiMemoria.correcoes = [];
  if (!state.aiConfig || typeof state.aiConfig !== "object") state.aiConfig = {};
  if (typeof state.aiConfig.autoAplicar !== "boolean") state.aiConfig.autoAplicar = false;
  if (state.aiConfig.limiar !== "alta" && state.aiConfig.limiar !== "media") {
    state.aiConfig.limiar = "alta";
  }
  if (!Array.isArray(state.aiHistorico)) state.aiHistorico = [];

  state.version = 7;
  return state;
}

// Ordem de confiança, pra comparar contra o limiar configurado
const NIVEL_CONFIANCA = { alta: 3, media: 2, baixa: 1 };

function confiancaAtinge(confianca, limiar) {
  return (NIVEL_CONFIANCA[confianca] || 0) >= (NIVEL_CONFIANCA[limiar] || 3);
}

// === Helpers de status com pagamento parcial ===
// Calcula valor pago somando pagamentos[]; mantém compat com status antigo
function valorPagoDe(lanc) {
  if (!lanc) return 0;
  if (Array.isArray(lanc.pagamentos) && lanc.pagamentos.length) {
    return lanc.pagamentos.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  }
  return lanc.status === "Pago" ? (Number(lanc.valor) || 0) : 0;
}

// Calcula status efetivo: "Pago", "Parcial" ou "Pendente"
function statusEfetivo(lanc) {
  if (!lanc) return "Pendente";
  const pago = valorPagoDe(lanc);
  const total = Number(lanc.valor) || 0;
  if (pago >= total - 0.005) return "Pago";
  if (pago > 0.005) return "Parcial";
  return "Pendente";
}

// Saldo devedor (quanto ainda falta pagar)
function saldoDevedor(lanc) {
  return Math.max(0, (Number(lanc.valor) || 0) - valorPagoDe(lanc));
}

// Dicionario padrao de palavras-chave para sugerir categoria
const KEYWORD_CATEGORIA = [
  // ============ ESTABELECIMENTOS ============
  // Supermercados
  { kw: ["carrefour","extra","pao de acucar","assai","atacadao","big ","sams","sams club","sendas","mercado","supermercado","hortifruti","sacolão","sacolao","quitanda","mambo","bistek","walmart","tenda atac","dia "], cat: "alimentação" },
  // Combustivel
  { kw: ["posto","shell","ipiranga","petrobras","raizen","ale ","br dist","auto posto"], cat: "gasolina" },
  // Farmacia
  { kw: ["drogasil","drogaria","farmacia","raia","panvel","nissei","pacheco","pague menos","ultrafarma"], cat: "Saude/Farmacia" },
  // Restaurante
  { kw: ["restaurante","lanchonete","mc donalds","mcdonalds","burger","subway","habibs","kfc","pizzaria","ifood","rappi","outback","spoleto"], cat: "Ifood/Restaurante" },
  // Eletro/Movel
  { kw: ["magazine","magalu","casas bahia","ponto frio","leroy","tok stok","etna","mobly","americanas","amazon","mercado livre","kabum","fastshop","fast shop"], cat: "Moveis e Eletros" },
  // Pet
  { kw: ["petz","petlove","cobasi","veterinaria","veterinario","petshop"], cat: "Pet" },
  // Beleza estabelecimentos
  { kw: ["natura","boticario","sephora","eudora"], cat: "Produtos de Beleza" },
  // Transporte
  { kw: ["uber","99 ","99app","99pop","cabify"], cat: "Uber/Viagem" },
  // Estacionamento
  { kw: ["estaciona","autopark","multipark","sescpark","zonaazul","zona azul"], cat: "Estacionamento" },
  // Companhias de luz
  { kw: ["enel","cemig","light","cpfl","copel","celesc","aes"], cat: "Luz" },
  // Internet
  { kw: ["vivo fibra","claro fibra","oi fibra","tim fibra","sumicity","brisanet"], cat: "Internet" },
  // Assinaturas
  { kw: ["netflix","spotify","disney","prime video","hbo","globoplay","youtube premium","apple.com","crunchy"], cat: "assinaturas" },

  // ============ ITENS / PRODUTOS ============
  // Alimentos
  { kw: ["pao","paes","leite","arroz","feijao","carne","frango","peito","coxa","ovo","ovos","queijo","mussarela","prato","banana","maca","tomate","cebola","alho","alface","cenoura","batata","laranja","mamao","abacate","manga","cha ","cafe","acucar","sal ","oleo","macarrao","biscoito","bolacha","iogurte","manteiga","margarina","creme de leite","leite condensado","chocolate","achocolatado","cereal","aveia","farinha","fuba","mandioca","abobrinha","chuchu","melancia","melao","uva","limao","pepino","pimentao","abobora","milho","ervilha","trigo","amido","ketchup","mostarda","maionese","molho","tempero","caldo","extrato","atum","sardinha","salsicha","linguica","presunto","mortadela","nuggets","hamburguer","bacon"], cat: "alimentação" },
  // Bebidas
  { kw: ["coca cola","cocacola","pepsi","guarana","fanta","sprite","cerveja","vinho","whisky","vodka","cachaca","suco","agua mineral","agua sem gas","agua com gas","refrigerante","brahma","skol","heineken","stella","amstel"], cat: "alimentação" },
  // Limpeza
  { kw: ["detergente","sabao","sabao em po","amaciante","agua sanitaria","lavanderia","lustra","desinfetante","limpa vidro","limpador","bombril","bom bril","veja","cif","alcool","alcool em gel","esponja","saco de lixo","saco lixo","pano","vassoura","rodo","balde","luva","papel toalha","guardanapo","filtro de papel","odorizador"], cat: "Material de Limpeza" },
  // Higiene/Beleza (itens)
  { kw: ["sabonete","creme dental","pasta de dente","escova de dente","fio dental","shampoo","condicionador","desodorante","perfume","colonia","absorvente","papel higienico","fralda","cotonete","lenco","lencos","loção","locao","hidratante","protetor solar","filtro solar","barbeador","gilete","aparelho de barbear","creme de barbear","cera"], cat: "Produtos de Beleza" },
  // Maquiagem
  { kw: ["batom","esmalte","base ","corretivo","rimel","mascara cilios","blush","sombra","delineador","lapis de olho","gloss"], cat: "Maquiagem" },
  // Saude
  { kw: ["dipirona","paracetamol","ibuprofeno","remedio","comprimido","xarope","pomada","band aid","esparadrapo","gase","algodao","soro fisiologico","amoxicilina","omeprazol","losartana","atenolol","aspirina","loratadina"], cat: "Saude/Farmacia" },
  // Pet (itens)
  { kw: ["racao","areia higienica","tapete higienico","petisco","osso","caixa de areia","coleira","guia"], cat: "Pet" },
  // Combustivel itens
  { kw: ["gasolina","etanol","diesel","gnv","arla"], cat: "gasolina" },
];

const STOPWORDS_ITEM = new Set(["1","2","3","4","5","6","7","8","9","0","kg","g","ml","l","un","pc","pacote","pct","cx","caixa","saco","embalagem","unid","unidade","x","de","do","da","com","sem","e"]);

// Normaliza string para comparacao: lowercase + sem acentos
function normalizar(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Extrai uma "chave" do item para o itemMap (palavras significativas)
function chaveItem(descricao) {
  const norm = normalizar(descricao).replace(/[^a-z0-9 ]/g, " ");
  const tokens = norm.split(/\s+/).filter(t => t && t.length >= 3 && !STOPWORDS_ITEM.has(t));
  return tokens.slice(0, 2).join(" "); // primeiras 2 palavras significativas
}

// sugere categoria baseado em descricao (usa cnpjMap, itemMap e dicionario)
function sugerirCategoria(state, descricao, cnpj) {
  // 1) item ja aprendido pelo nome?
  const chave = chaveItem(descricao);
  if (chave && state.itemMap && state.itemMap[chave]) {
    return { cat: state.itemMap[chave], origem: "item-aprendido" };
  }
  // 2) CNPJ ja aprendido? (so vale como sugestao se descricao estiver vazia)
  if (cnpj && state.cnpjMap && state.cnpjMap[cnpj] && !descricao) {
    return { cat: state.cnpjMap[cnpj], origem: "cnpj-aprendido" };
  }
  // 3) dicionario (matching da descricao)
  const d = normalizar(descricao);
  if (d) {
    for (const grupo of KEYWORD_CATEGORIA) {
      for (const k of grupo.kw) {
        if (d.includes(k)) return { cat: grupo.cat, origem: "dicionario" };
      }
    }
  }
  // 4) CNPJ aprendido como fallback
  if (cnpj && state.cnpjMap && state.cnpjMap[cnpj]) {
    return { cat: state.cnpjMap[cnpj], origem: "cnpj-aprendido" };
  }
  return { cat: null, origem: null };
}

// Parse de URL/conteudo de QR code de NFC-e/SAT
// Retorna { chave, uf, ano, mes, cnpj, valor } ou null
function parseQRCupom(input) {
  if (!input) return null;
  const txt = String(input).trim();

  // Procura chave de acesso de 44 digitos em qualquer lugar
  let chave = null;
  // 1) tenta padrao p=NNN... ou pegando 44 digitos consecutivos
  const m1 = txt.match(/[?&]p=([0-9]{44})/);
  if (m1) chave = m1[1];
  if (!chave) {
    // remove caracteres nao numericos e procura sequencia de 44 digitos
    const onlyDigits = txt.replace(/\D/g, "");
    const m2 = onlyDigits.match(/[0-9]{44}/);
    if (m2) chave = m2[0];
  }
  if (!chave || chave.length !== 44) return null;

  const uf = chave.slice(0, 2);
  const aa = chave.slice(2, 4);
  const mm = chave.slice(4, 6);
  const cnpj = chave.slice(6, 20);

  // tenta extrair valor da query (formato GO/RS: p=chave|amb|tok|valor|hash)
  let valor = null;
  const mPipe = txt.match(/[?&]p=[0-9]{44}\|[^|]*\|[^|]*\|([0-9.,]+)/);
  if (mPipe) {
    valor = parseFloat(mPipe[1].replace(",", "."));
    if (isNaN(valor)) valor = null;
  } else {
    // alguns estados colocam &vNF=
    const mV = txt.match(/[?&]vNF=([0-9.,]+)/i);
    if (mV) {
      valor = parseFloat(mV[1].replace(",", "."));
      if (isNaN(valor)) valor = null;
    }
  }

  return {
    chave,
    uf,
    ano: 2000 + parseInt(aa),
    mes: parseInt(mm),
    cnpj,
    cnpjFmt: formatCNPJ(cnpj),
    valor
  };
}

function formatCNPJ(cnpj) {
  if (!cnpj || cnpj.length !== 14) return cnpj || "";
  return cnpj.slice(0,2) + "." + cnpj.slice(2,5) + "." + cnpj.slice(5,8) + "/" + cnpj.slice(8,12) + "-" + cnpj.slice(12,14);
}

// Calcula a data de pagamento (vencimento da fatura) de uma compra no cartão
// com base nos dias de fechamento e vencimento configurados.
//
// Lógica em 2 passos:
//  1) Determinar em qual MÊS DE FECHAMENTO esta compra cai:
//     - Se dia da compra <= dia fech → fatura fecha NESTE mês
//     - Se dia da compra > dia fech → fatura fecha NO PRÓXIMO mês
//  2) Determinar o MÊS DE VENCIMENTO relativo ao fechamento:
//     - Se venc > fech (ex: fech 5, venc 20) → vencimento no MESMO mês do fechamento
//     - Se venc <= fech (ex: fech 28, venc 5) → vencimento no PRÓXIMO mês após o fechamento
function calcDataPagamentoCartao(card, dataCompetenciaISO) {
  if (!dataCompetenciaISO) return dataCompetenciaISO;
  const fech = Math.max(1, Math.min(31, Number(card.diaFechamento) || 28));
  const venc = Math.max(1, Math.min(31, Number(card.diaVencimento) || 5));
  const regra = card.regraFatura || "fechamento"; // "fechamento" ou "competencia"
  const [y, m, d] = dataCompetenciaISO.split("-").map(Number);

  // === Regra alternativa: "competencia" ===
  // Ignora dia de fechamento — todas as compras do mês M caem na fatura do mês M+1
  // (ou seja, compra em qualquer dia de Maio → vence em Junho)
  if (regra === "competencia") {
    let mesVenc = m + 1;
    let anoVenc = y;
    if (mesVenc > 12) { mesVenc = 1; anoVenc++; }
    const lastDay = new Date(anoVenc, mesVenc, 0).getDate();
    const diaFinal = Math.min(venc, lastDay);
    return `${anoVenc}-${String(mesVenc).padStart(2, "0")}-${String(diaFinal).padStart(2, "0")}`;
  }

  // === Regra padrão: por dia de fechamento ===
  // Passo 1: mês/ano do FECHAMENTO da fatura que contém esta compra
  let mesFech = m;
  let anoFech = y;
  if (d > fech) {
    // compra após o dia de fechamento deste mês → fatura do próximo
    mesFech = m + 1;
    if (mesFech > 12) { mesFech = 1; anoFech++; }
  }

  // Passo 2: mês/ano do VENCIMENTO (depende da relação venc vs fech do cartão)
  let mesVenc, anoVenc;
  if (venc > fech) {
    // vencimento é no MESMO mês do fechamento (ex: fech dia 5, venc dia 20)
    mesVenc = mesFech;
    anoVenc = anoFech;
  } else {
    // vencimento é no PRÓXIMO mês após o fechamento (ex: fech dia 28, venc dia 5)
    mesVenc = mesFech + 1;
    anoVenc = anoFech;
    if (mesVenc > 12) { mesVenc = 1; anoVenc++; }
  }

  // Ajusta dia caso não exista no mês (ex: venc dia 31 num mês de 30 dias)
  const lastDay = new Date(anoVenc, mesVenc, 0).getDate();
  const diaFinal = Math.min(venc, lastDay);
  return `${anoVenc}-${String(mesVenc).padStart(2, "0")}-${String(diaFinal).padStart(2, "0")}`;
}

const Store = {
  _state: null,
  _fileHandle: null,     // FileSystemFileHandle quando vinculado
  _fileName: null,
  _saveTimer: null,
  _mode: "local",        // "local" | "remote" — definido em load()
  onStatusChange: null,  // callback(status)

  async load() {
    // === MODO REMOTO (online): le do Supabase ===
    if (typeof IS_ONLINE_MODE !== "undefined" && IS_ONLINE_MODE && typeof RemoteStore !== "undefined" && Auth && Auth.user) {
      this._mode = "remote";
      try {
        this._state = await RemoteStore.load();
        // tambem cacheia no localStorage pra fallback offline
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state)); } catch (e) {}
        this.generateRecurrent();
        return this._state;
      } catch (e) {
        console.error("Falha ao carregar do Supabase, caindo pra cache local:", e);
        this._notify({ kind: "error", msg: "Sem conexão — usando cache local" });
        // continua pro fallback local abaixo
      }
    }

    // === MODO LOCAL (desktop ou fallback) ===
    this._mode = "local";

    // 1) tenta ler do handle vinculado (persiste entre sessoes via IndexedDB)
    const handle = await HandleDB.get();
    if (handle) {
      try {
        const perm = await handle.queryPermission({ mode: "readwrite" });
        if (perm === "granted") {
          await this._adoptHandle(handle, /*silent*/ true);
          if (this._state) return this._state;
        } else {
          // sem permissao por enquanto — precisa interacao do usuario
          this._pendingHandle = handle;
          this._fileName = handle.name;
        }
      } catch (e) {
        console.warn("Falha ao abrir arquivo vinculado:", e);
      }
    }

    // 2) fallback: localStorage
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this._state = buildSeedState();
      this._persist();
    } else {
      try {
        this._state = migrateState(JSON.parse(raw));
        this._persist();
      } catch (e) {
        console.error("Erro ao ler storage, recriando:", e);
        this._state = buildSeedState();
        this._persist();
      }
    }
    // gera lan�amentos das recorrencias ate o mes atual
    this.generateRecurrent();
    return this._state;
  },

  save() { this._persist(); },

  _persist() {
    // sempre cacheia no localStorage (offline-first)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state));
    } catch (e) {
      console.error("localStorage falhou:", e);
      this._notify({ kind: "error", msg: "localStorage bloqueado" });
    }

    // modo remoto: persiste no Supabase com debounce
    if (this._mode === "remote" && typeof RemoteStore !== "undefined") {
      RemoteStore.schedulePersist(this._state);
      return;
    }

    // modo local + arquivo vinculado: grava no arquivo (debounce curto)
    if (this._fileHandle) {
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this._writeFile(), 250);
    }
  },

  async _writeFile() {
    if (!this._fileHandle) return;
    try {
      const perm = await this._fileHandle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        const req = await this._fileHandle.requestPermission({ mode: "readwrite" });
        if (req !== "granted") {
          this._notify({ kind: "error", msg: "Permissão negada no arquivo" });
          return;
        }
      }
      const writable = await this._fileHandle.createWritable();
      await writable.write(JSON.stringify(this._state, null, 2));
      await writable.close();
      this._notify({ kind: "ok", msg: "Salvo em " + this._fileName });
    } catch (e) {
      console.error("Erro gravando arquivo:", e);
      this._notify({ kind: "error", msg: "Falha ao gravar arquivo: " + e.message });
    }
  },

  async _adoptHandle(handle, silent) {
    this._fileHandle = handle;
    this._fileName = handle.name;
    // lê conteúdo do arquivo
    const file = await handle.getFile();
    const text = (await file.text()).trim();
    if (text) {
      try {
        this._state = migrateState(JSON.parse(text));
      } catch (e) {
        throw new Error("Arquivo não é um JSON válido");
      }
    } else {
      // arquivo vazio: usa state atual (ou seed)
      if (!this._state) this._state = buildSeedState();
      await this._writeFile();
    }
    await HandleDB.set(handle);
    if (!silent) this._notify({ kind: "ok", msg: "Vinculado a " + this._fileName });
  },

  async pickFile(mode /* "open" | "create" */) {
    if (!("showOpenFilePicker" in window) || !("showSaveFilePicker" in window)) {
      throw new Error("Seu navegador não suporta File System Access. Use Edge ou Chrome.");
    }
    let handle;
    if (mode === "create") {
      handle = await window.showSaveFilePicker({
        suggestedName: "baron-financeiro.json",
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
      });
    } else {
      const [h] = await window.showOpenFilePicker({
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
      });
      handle = h;
    }
    await this._adoptHandle(handle, false);
    return this._state;
  },

  async reconnectPending() {
    if (!this._pendingHandle) return false;
    const req = await this._pendingHandle.requestPermission({ mode: "readwrite" });
    if (req !== "granted") return false;
    await this._adoptHandle(this._pendingHandle, false);
    this._pendingHandle = null;
    return true;
  },

  async unbindFile() {
    this._fileHandle = null;
    this._fileName = null;
    this._pendingHandle = null;
    await HandleDB.clear();
    this._notify({ kind: "ok", msg: "Arquivo desvinculado" });
  },

  isBound() { return !!this._fileHandle; },
  isPending() { return !!this._pendingHandle; },
  fileName() { return this._fileName; },
  isRemote() { return this._mode === "remote"; },
  mode() { return this._mode; },

  _notify(s) { if (this.onStatusChange) this.onStatusChange(s); },

  get() { return this._state; },

  // ---- Lançamentos ----
  addLancamento(l) {
    l.id = "l-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    this._state.lancamentos.push(l);
    this.save();
    return l;
  },

  updateLancamento(id, patch) {
    const idx = this._state.lancamentos.findIndex(x => x.id === id);
    if (idx === -1) return null;
    this._state.lancamentos[idx] = { ...this._state.lancamentos[idx], ...patch };
    this.save();
    return this._state.lancamentos[idx];
  },

  deleteLancamento(id) {
    this._state.lancamentos = this._state.lancamentos.filter(x => x.id !== id);
    this.save();
  },

  togglePago(id) {
    const l = this._state.lancamentos.find(x => x.id === id);
    if (!l) return;
    if (!Array.isArray(l.pagamentos)) l.pagamentos = [];
    if (statusEfetivo(l) === "Pago") {
      // desfaz: limpa pagamentos e marca como Pendente
      l.pagamentos = [];
      l.status = "Pendente";
    } else {
      // marca como pago integral
      l.pagamentos = [{
        data: l.dataPagamento || new Date().toISOString().slice(0, 10),
        valor: l.valor,
        conta: l.conta
      }];
      l.status = "Pago";
      if (!l.dataPagamento) l.dataPagamento = new Date().toISOString().slice(0, 10);
    }
    this.save();
  },

  // Adiciona um pagamento parcial. Se valor cobre o saldo, marca como Pago.
  pagarParcial(id, valor, dataPagamento, contaPagamento) {
    const l = this._state.lancamentos.find(x => x.id === id);
    if (!l) return null;
    if (!Array.isArray(l.pagamentos)) l.pagamentos = [];
    const v = Number(valor) || 0;
    if (v <= 0) throw new Error("Valor do pagamento deve ser positivo");
    const devedor = saldoDevedor(l);
    if (v > devedor + 0.005) throw new Error(`Valor maior que o devedor (${devedor.toFixed(2)})`);
    l.pagamentos.push({
      data: dataPagamento || new Date().toISOString().slice(0, 10),
      valor: v,
      conta: contaPagamento || l.conta
    });
    l.status = statusEfetivo(l);
    if (l.status === "Pago") {
      l.dataPagamento = dataPagamento || l.dataPagamento;
    }
    this._persist();
    return l;
  },

  // Remove um pagamento (desfaz parcial pelo índice)
  removerPagamento(id, indexPagamento) {
    const l = this._state.lancamentos.find(x => x.id === id);
    if (!l || !Array.isArray(l.pagamentos)) return;
    l.pagamentos.splice(indexPagamento, 1);
    l.status = statusEfetivo(l);
    this._persist();
  },

  // Define rateio (substitui ou limpa). rateios = [{categoria, valor}, ...]
  setRateio(id, rateios) {
    const l = this._state.lancamentos.find(x => x.id === id);
    if (!l) return;
    l.rateios = Array.isArray(rateios) ? rateios.map(r => ({
      categoria: r.categoria,
      valor: Number(r.valor) || 0
    })) : [];
    this._persist();
  },

  // ---- Categorias ----
  addCategoria(nome, grupo) {
    nome = nome.trim();
    if (!nome) return false;
    if (this._state.categorias.some(c => c.toLowerCase() === nome.toLowerCase())) return false;
    this._state.categorias.push(nome);
    if (!this._state.gruposCategoria) this._state.gruposCategoria = {};
    this._state.gruposCategoria[nome] = grupo || DEFAULT_GRUPO_POR_CATEGORIA[nome] || "Outros";
    this.save();
    return true;
  },

  removeCategoria(nome) {
    this._state.categorias = this._state.categorias.filter(c => c !== nome);
    if (this._state.gruposCategoria) delete this._state.gruposCategoria[nome];
    this.save();
  },

  setGrupoCategoria(nomeCategoria, novoGrupo) {
    if (!this._state.gruposCategoria) this._state.gruposCategoria = {};
    this._state.gruposCategoria[nomeCategoria] = novoGrupo || "Outros";
    this._persist();
  },

  // retorna lista [{grupo, categorias[]}] na ordem padrão
  categoriasPorGrupo() {
    const map = new Map();
    ORDEM_GRUPOS.forEach(g => map.set(g, []));
    (this._state.categorias || []).forEach(c => {
      const g = (this._state.gruposCategoria && this._state.gruposCategoria[c]) || "Outros";
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(c);
    });
    // remove grupos vazios
    return [...map.entries()]
      .filter(([_, cats]) => cats.length > 0)
      .map(([grupo, categorias]) => ({ grupo, categorias }));
  },

  // ---- Contas ----
  addConta(nome, tipo) {
    nome = nome.trim();
    if (!nome) return false;
    if (this._state.contas.some(c => c.nome.toLowerCase() === nome.toLowerCase())) return false;
    const novaConta = { nome, tipo: tipo || "conta", saldoInicial: 0 };
    if (tipo === "cartao") {
      novaConta.diaFechamento = 28;
      novaConta.diaVencimento = 5;
      novaConta.contaPagamento = "";
    }
    this._state.contas.push(novaConta);
    this.save();
    return true;
  },

  removeConta(nome) {
    this._state.contas = this._state.contas.filter(c => c.nome !== nome);
    this.save();
  },

  // Transferência entre contas: cria 2 lançamentos linkados (saída + entrada)
  transferir(contaOrigem, contaDestino, valor, data, descricao) {
    const v = Number(valor);
    if (!v || v <= 0) throw new Error("Valor deve ser positivo");
    if (!contaOrigem || !contaDestino) throw new Error("Selecione conta origem e destino");
    if (contaOrigem === contaDestino) throw new Error("Origem e destino devem ser contas diferentes");
    const data_ = data || new Date().toISOString().slice(0, 10);
    const transferId = "tr-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    const desc = descricao && descricao.trim() ? descricao.trim() : null;

    const saida = {
      id: "l-" + Date.now() + "-out-" + Math.random().toString(36).slice(2, 5),
      tipo: "saida",
      descricao: desc || `Transferência → ${contaDestino}`,
      categoria: "Transferências",
      conta: contaOrigem,
      valor: v,
      dataCompetencia: data_,
      dataPagamento: data_,
      status: "Pago",
      origem: "transferencia",
      transferenciaId: transferId,
      contaContraparte: contaDestino,
      pagamentos: [{ data: data_, valor: v, conta: contaOrigem }]
    };
    const entrada = {
      id: "l-" + Date.now() + "-in-" + Math.random().toString(36).slice(2, 5),
      tipo: "entrada",
      descricao: desc || `Transferência ← ${contaOrigem}`,
      categoria: "Transferências",
      conta: contaDestino,
      valor: v,
      dataCompetencia: data_,
      dataPagamento: data_,
      status: "Pago",
      origem: "transferencia",
      transferenciaId: transferId,
      contaContraparte: contaOrigem,
      pagamentos: [{ data: data_, valor: v, conta: contaDestino }]
    };

    this._state.lancamentos.push(saida, entrada);
    this._persist();
    return { saida, entrada, transferId };
  },

  setCartaoConfig(nomeConta, patch) {
    const c = this._state.contas.find(x => x.nome === nomeConta);
    if (!c) return false;
    if (typeof patch.diaFechamento === "number") c.diaFechamento = patch.diaFechamento;
    if (typeof patch.diaVencimento === "number") c.diaVencimento = patch.diaVencimento;
    if (typeof patch.contaPagamento === "string") c.contaPagamento = patch.contaPagamento;
    if (typeof patch.regraFatura === "string") c.regraFatura = patch.regraFatura;
    this._persist();
    return true;
  },

  // Paga (total ou parcialmente) uma fatura de cartão.
  // Distribui o valor proporcionalmente entre os lançamentos da fatura como pagamentos[].
  // O saldo do banco diminui automaticamente porque pagamentos[].conta = banco.
  // Quando todos os lançamentos ficam quitados, status vira "Pago".
  pagarFaturaParcial(cardName, faturaYM, valorPago, contaPagamentoBanco, dataPagamento) {
    const lancsFatura = this._state.lancamentos.filter(l =>
      l.conta === cardName &&
      l.tipo === "saida" &&
      statusEfetivo(l) !== "Pago" &&
      (l.dataPagamento || l.dataCompetencia || "").slice(0, 7) === faturaYM
    );
    if (!lancsFatura.length) {
      throw new Error("Nenhum lançamento pendente nesta fatura");
    }
    const saldoTotalFatura = lancsFatura.reduce((s, l) => s + saldoDevedor(l), 0);
    const v = Number(valorPago) || 0;
    if (v <= 0) throw new Error("Valor inválido");
    if (v > saldoTotalFatura + 0.01) {
      throw new Error(`Valor maior que o saldo devedor (${saldoTotalFatura.toFixed(2)})`);
    }
    if (!contaPagamentoBanco) throw new Error("Escolha a conta bancária de pagamento");

    // Distribui proporcionalmente entre os lançamentos
    let restanteAlocar = v;
    lancsFatura.forEach((l, idx) => {
      if (!Array.isArray(l.pagamentos)) l.pagamentos = [];
      const devedor = saldoDevedor(l);
      let parcela;
      if (idx === lancsFatura.length - 1) {
        // Último: pega o restante (evita centavos perdidos)
        parcela = Math.min(restanteAlocar, devedor);
      } else {
        // Proporcional ao saldo devedor da fatura
        parcela = Math.round((v * devedor / saldoTotalFatura) * 100) / 100;
        parcela = Math.min(parcela, devedor, restanteAlocar);
      }
      if (parcela > 0.005) {
        l.pagamentos.push({
          data: dataPagamento,
          valor: parcela,
          conta: contaPagamentoBanco
        });
        restanteAlocar -= parcela;
        // Atualiza status
        l.status = statusEfetivo(l);
        if (l.status === "Pago") {
          l.dataPagamento = dataPagamento;
          l.pagaPorTransferencia = true;
        }
      }
    });

    this._persist();
    const totalmenteQuitada = lancsFatura.every(l => statusEfetivo(l) === "Pago");
    return {
      count: lancsFatura.length,
      valorPago: v,
      totalmenteQuitada
    };
  },

  // (Mantém compat: paga fatura COMPLETA do jeito antigo, criando 1 saída no banco)
  // Paga uma fatura inteira de cartao com 1 clique:
  // 1) Marca todos os lancamentos pendentes daquela fatura como Pago
  // 2) Opcionalmente cria 1 saida na conta bancaria pelo total (categoria Transferencias)
  pagarFatura(cardName, faturaYM, contaPagamentoBanco, dataPagamento, criarSaidaBanco) {
    const lancsFatura = this._state.lancamentos.filter(l =>
      l.conta === cardName &&
      l.tipo === "saida" &&
      l.status === "Pendente" &&
      (l.dataPagamento || l.dataCompetencia || "").slice(0, 7) === faturaYM
    );
    if (!lancsFatura.length) {
      return { count: 0, total: 0 };
    }
    const total = lancsFatura.reduce((s, l) => s + l.valor, 0);

    // Marca tudo como Pago
    lancsFatura.forEach(l => {
      l.status = "Pago";
      l.dataPagamento = dataPagamento;
      l.pagaPorTransferencia = true;
    });

    // Cria saida no banco que pagou a fatura
    if (criarSaidaBanco && contaPagamentoBanco) {
      this._state.lancamentos.push({
        id: "l-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        tipo: "saida",
        dataCompetencia: dataPagamento,
        dataPagamento: dataPagamento,
        descricao: `Pagamento fatura ${cardName} - ${faturaYM}`,
        categoria: "Transferências",
        conta: contaPagamentoBanco,
        valor: total,
        status: "Pago",
        origem: "pagamento-fatura",
        refCartao: cardName,
        refFaturaYM: faturaYM
      });
    }
    this._persist();
    return { count: lancsFatura.length, total };
  },

  // ---- Aprendizado CNPJ -> categoria ----
  learnCnpjCategoria(cnpj, categoria) {
    if (!cnpj || !categoria) return;
    if (!this._state.cnpjMap) this._state.cnpjMap = {};
    this._state.cnpjMap[cnpj] = categoria;
    this._persist();
  },

  // ---- Aprendizado item -> categoria ----
  learnItem(descricao, categoria) {
    if (!categoria) return;
    const chave = chaveItem(descricao);
    if (!chave) return;
    if (!this._state.itemMap) this._state.itemMap = {};
    this._state.itemMap[chave] = categoria;
    this._persist();
  },

  // ==========================================================
  // Memória da IA
  //
  // Toda vez que o usuário corrige um palpite da IA, a correção
  // fica guardada aqui e volta como contexto na próxima chamada.
  // É isso que faz a IA parar de errar no mesmo lugar.
  // ==========================================================
  registrarCorrecaoIA(correcao) {
    if (!correcao || !correcao.de || !correcao.para) return;
    if (correcao.de === correcao.para) return;
    if (!this._state.aiMemoria) this._state.aiMemoria = { correcoes: [] };
    if (!Array.isArray(this._state.aiMemoria.correcoes)) this._state.aiMemoria.correcoes = [];

    const lista = this._state.aiMemoria.correcoes;

    // Se já existe correção pro mesmo contexto, atualiza em vez de duplicar:
    // vale o que o usuário decidiu por último.
    const chave = `${correcao.tipo}|${(correcao.descricao || "").toLowerCase()}|${correcao.de}`;
    const idx = lista.findIndex(c =>
      `${c.tipo}|${(c.descricao || "").toLowerCase()}|${c.de}` === chave);

    const registro = {
      tipo: correcao.tipo || "categoria",   // "categoria" | "conta"
      descricao: correcao.descricao || "",
      cnpj: correcao.cnpj || "",
      de: correcao.de,
      para: correcao.para,
      quando: new Date().toISOString()
    };

    if (idx >= 0) lista[idx] = registro;
    else lista.push(registro);

    // Teto de 300: além disso o contexto fica caro sem ficar mais útil.
    if (lista.length > 300) this._state.aiMemoria.correcoes = lista.slice(-300);
    this._persist();
  },

  correcoesRecentes(limite = 60) {
    const lista = (this._state.aiMemoria && this._state.aiMemoria.correcoes) || [];
    return lista.slice(-limite);
  },

  // ---- Configuração de automação ----
  getAIConfig() {
    return this._state.aiConfig || { autoAplicar: false, limiar: "alta" };
  },

  setAIConfig(patch) {
    if (!this._state.aiConfig) this._state.aiConfig = { autoAplicar: false, limiar: "alta" };
    Object.assign(this._state.aiConfig, patch);
    this._persist();
    return this._state.aiConfig;
  },

  // ==========================================================
  // Histórico reversível das ações da IA
  //
  // Antes de gravar qualquer coisa em lote, guardamos o que era
  // preciso pra voltar atrás. É o que permite o modo automático
  // sem o usuário ficar refém do palpite da IA.
  // ==========================================================
  registrarAcaoIA({ acao, resumo, criados = [], alterados = [], correcoes = [] }) {
    if (!Array.isArray(this._state.aiHistorico)) this._state.aiHistorico = [];
    this._state.aiHistorico.push({
      id: "ia-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      quando: new Date().toISOString(),
      acao,                 // "documento" | "categorias" | "plano"
      resumo,               // texto curto pra mostrar no botão de desfazer
      criados,              // ids de lançamentos criados
      alterados,            // [{id, antes:{campo:valor}}] pra restaurar
      correcoes             // timestamps das correções aprendidas nesta ação
    });
    // Guardamos só as 10 últimas — desfazer é pra arrependimento recente.
    if (this._state.aiHistorico.length > 10) {
      this._state.aiHistorico = this._state.aiHistorico.slice(-10);
    }
    this._persist();
  },

  ultimaAcaoIA() {
    const h = this._state.aiHistorico || [];
    return h.length ? h[h.length - 1] : null;
  },

  desfazerUltimaAcaoIA() {
    const h = this._state.aiHistorico || [];
    if (!h.length) return null;
    const acao = h.pop();

    // apaga o que foi criado
    if (acao.criados.length) {
      const criados = new Set(acao.criados);
      this._state.lancamentos = this._state.lancamentos.filter(l => !criados.has(l.id));
    }

    // restaura o que foi alterado
    acao.alterados.forEach(({ id, antes }) => {
      const idx = this._state.lancamentos.findIndex(l => l.id === id);
      if (idx >= 0) this._state.lancamentos[idx] = { ...this._state.lancamentos[idx], ...antes };
    });

    // Desfazer também apaga o que a IA "aprendeu" nessa ação: se o palpite
    // estava errado a ponto de você desfazer, ele não deve virar memória.
    if (acao.correcoes && this._state.aiMemoria) {
      this._state.aiMemoria.correcoes = (this._state.aiMemoria.correcoes || [])
        .filter(c => !acao.correcoes.includes(c.quando));
    }

    this.save();
    return acao;
  },

  // ==========================================================
  // Plano de contas — renomear e fundir categorias
  // ==========================================================

  // Renomeia a categoria em todos os lugares que a referenciam.
  // Se o novo nome já existir, isso na prática é uma fusão.
  renomearCategoria(de, para) {
    de = (de || "").trim();
    para = (para || "").trim();
    if (!de || !para || de === para) return false;
    if (!this._state.categorias.includes(de)) return false;

    const jaExiste = this._state.categorias.some(c => c === para);
    if (jaExiste) return this.fundirCategoria(de, para);

    const grupo = (this._state.gruposCategoria || {})[de] || "Outros";
    this._state.categorias = this._state.categorias.map(c => (c === de ? para : c));
    if (this._state.gruposCategoria) {
      delete this._state.gruposCategoria[de];
      this._state.gruposCategoria[para] = grupo;
    }
    this._repontarCategoria(de, para);
    this.save();
    return true;
  },

  // Move tudo de uma categoria para outra e apaga a origem.
  fundirCategoria(de, para) {
    de = (de || "").trim();
    para = (para || "").trim();
    if (!de || !para || de === para) return false;
    if (!this._state.categorias.includes(de)) return false;
    if (!this._state.categorias.includes(para)) return false;

    this._state.categorias = this._state.categorias.filter(c => c !== de);
    if (this._state.gruposCategoria) delete this._state.gruposCategoria[de];
    this._repontarCategoria(de, para);
    this.save();
    return true;
  },

  // Troca a categoria em lançamentos, recorrências e nos mapas de aprendizado
  _repontarCategoria(de, para) {
    (this._state.lancamentos || []).forEach(l => {
      if (l.categoria === de) l.categoria = para;
      (l.rateios || []).forEach(r => { if (r.categoria === de) r.categoria = para; });
    });
    (this._state.recorrencias || []).forEach(r => {
      if (r.categoria === de) r.categoria = para;
    });
    ["cnpjMap", "itemMap"].forEach(mapa => {
      const m = this._state[mapa];
      if (!m) return;
      Object.keys(m).forEach(k => { if (m[k] === de) m[k] = para; });
    });
    (this._state.aiMemoria && this._state.aiMemoria.correcoes || []).forEach(c => {
      if (c.de === de) c.de = para;
      if (c.para === de) c.para = para;
    });
  },

  // ---- Saldo Inicial ----
  setSaldoInicial(nomeConta, valor) {
    const c = this._state.contas.find(x => x.nome === nomeConta);
    if (!c) return false;
    c.saldoInicial = Number(valor) || 0;
    this._persist();
    return true;
  },

  // ---- Recorrencias ----
  addRecorrencia(r) {
    r.id = "r-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    r.ativo = r.ativo !== false;
    r.ultimaGerada = null; // YYYY-MM-DD da ultima ocorrencia gerada
    this._state.recorrencias.push(r);
    this._persist();
    this.generateRecurrent();
    return r;
  },

  updateRecorrencia(id, patch) {
    const i = this._state.recorrencias.findIndex(x => x.id === id);
    if (i === -1) return null;
    this._state.recorrencias[i] = { ...this._state.recorrencias[i], ...patch };
    this._persist();
    return this._state.recorrencias[i];
  },

  deleteRecorrencia(id, removeLancamentos) {
    this._state.recorrencias = this._state.recorrencias.filter(x => x.id !== id);
    if (removeLancamentos) {
      this._state.lancamentos = this._state.lancamentos.filter(l => l.refRecorrencia !== id);
    }
    this._persist();
  },

  toggleRecorrenciaAtiva(id) {
    const r = this._state.recorrencias.find(x => x.id === id);
    if (!r) return;
    r.ativo = !r.ativo;
    this._persist();
  },

  // Gera automaticamente os lan�amentos das recorrencias ate o final do mes corrente
  generateRecurrent() {
    if (!this._state || !Array.isArray(this._state.recorrencias)) return;
    const today = new Date();
    // gera ate o ultimo dia do mes atual + 1 mes (para visualizar o proximo)
    const horizonte = new Date(today.getFullYear(), today.getMonth() + 2, 0);

    let mudou = false;
    this._state.recorrencias.forEach(r => {
      if (!r.ativo) return;
      const inicio = r.inicio ? new Date(r.inicio + "T00:00:00") : new Date();
      const fim = r.fim ? new Date(r.fim + "T00:00:00") : null;
      const ultima = r.ultimaGerada ? new Date(r.ultimaGerada + "T00:00:00") : null;

      let proxima = nextOccurrence(r, ultima || subOneStep(inicio, r.frequencia));

      let safety = 200;
      while (proxima && proxima <= horizonte && safety-- > 0) {
        if (fim && proxima > fim) break;
        if (proxima >= inicio) {
          const dataStr = toISO(proxima);
          // === Calcula data de competência conforme regra escolhida ===
          // competenciaOffset:
          //   0 (default) = mesmo mês do pagamento
          //   -1, -2, -3 = mês(es) ANTES do pagamento (ex: salário trabalhado mês anterior)
          //   1 = 1 mês depois do pagamento
          //   "fixo-inicio" = sempre a data de início da recorrência
          let dataCompetencia = dataStr;
          if (r.competenciaOffset === "fixo-inicio") {
            dataCompetencia = r.inicio || dataStr;
          } else if (typeof r.competenciaOffset === "number" && r.competenciaOffset !== 0) {
            const [y, m, d] = dataStr.split("-").map(Number);
            const dt = new Date(y, m - 1 + r.competenciaOffset, d);
            // Se o dia não existe no mês destino (ex: 31), pega último dia do mês
            const lastDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
            dt.setDate(Math.min(d, lastDay));
            dataCompetencia = toISO(dt);
          }
          // evita duplicar (chave: refRecorrencia + dataPagamento, não competência)
          const dup = this._state.lancamentos.some(l =>
            l.refRecorrencia === r.id && l.dataPagamento === dataStr
          );
          if (!dup) {
            this._state.lancamentos.push({
              id: "l-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
              tipo: r.tipo,
              dataCompetencia,
              dataPagamento: dataStr,
              descricao: r.descricao,
              categoria: r.categoria,
              conta: r.conta,
              valor: Number(r.valor) || 0,
              status: "Pendente",
              origem: "recorrencia",
              refRecorrencia: r.id
            });
            mudou = true;
          }
          r.ultimaGerada = dataStr;
        }
        proxima = nextOccurrence(r, proxima);
      }
    });
    if (mudou) this._persist();
  },

  // ---- Backup / Restore ----
  exportJSON() {
    return JSON.stringify(this._state, null, 2);
  },

  importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.lancamentos)) {
      throw new Error("Arquivo inválido");
    }
    this._state = parsed;
    this._persist();
  },

  reset() {
    localStorage.removeItem(STORAGE_KEY);
    this._state = buildSeedState();
    this._persist();
  },

  reseed() {
    const seed = buildSeedState();
    // adiciona só o que ainda não existe
    seed.lancamentos.forEach(l => {
      const dup = this._state.lancamentos.some(x =>
        x.origem === "seed" &&
        x.dataCompetencia === l.dataCompetencia &&
        x.descricao === l.descricao &&
        Math.abs(x.valor - l.valor) < 0.01
      );
      if (!dup) this._state.lancamentos.push(l);
    });
    // adiciona categorias/contas faltantes
    seed.categorias.forEach(c => {
      if (!this._state.categorias.includes(c)) this._state.categorias.push(c);
    });
    seed.contas.forEach(c => {
      if (!this._state.contas.some(x => x.nome === c.nome)) this._state.contas.push(c);
    });
    this.save();
  }
};

// ---- helpers de data para recorrencias ----
function toISO(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function subOneStep(d, freq) {
  const x = new Date(d);
  if (freq === "semanal") x.setDate(x.getDate() - 7);
  else if (freq === "anual") x.setFullYear(x.getFullYear() - 1);
  else x.setMonth(x.getMonth() - 1);
  return x;
}
function nextOccurrence(r, after) {
  const freq = r.frequencia || "mensal";
  const x = new Date(after);
  if (freq === "semanal") {
    x.setDate(x.getDate() + 7);
    return x;
  }
  if (freq === "anual") {
    x.setFullYear(x.getFullYear() + 1);
    return x;
  }
  // mensal: usa diaMes; se for maior que os dias do proximo mes, usa o ultimo dia
  const dia = Math.max(1, Math.min(31, Number(r.diaMes) || 1));
  let y = x.getFullYear(), m = x.getMonth() + 1;
  if (m > 11) { m = 0; y++; }
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(dia, lastDay));
}
