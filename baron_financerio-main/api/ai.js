// ==========================================================================
// Baron Financeiro — Proxy de IA (Vercel Serverless Function)
//
// A chave da Anthropic NUNCA vai para o navegador: ela fica na env var
// ANTHROPIC_API_KEY do projeto na Vercel e é lida apenas aqui no servidor.
//
// COMO CONFIGURAR:
//   1) Vercel → seu projeto → Settings → Environment Variables
//   2) Name: ANTHROPIC_API_KEY   Value: sua chave (sk-ant-...)
//   3) Aplique em Production + Preview + Development e faça um novo deploy
//
// Endpoint: POST /api/ai   body: { action, ...payload }
//   action = "ping"      → verifica se a IA está configurada
//   action = "chat"      → conversa/relatórios (resposta em streaming)
//   action = "insights"  → cards de insight do dashboard (JSON)
//   action = "categorize"→ sugestão de categoria em lote (JSON)
//   action = "document"  → leitura de cupom/nota/boleto/fatura (JSON)
// ==========================================================================

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5";

// Limite defensivo: a Vercel corta requests acima de ~4.5MB.
const MAX_BODY_BYTES = 4_000_000;

// ---------------------------------------------------------------- helpers

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

// Extrai o primeiro bloco de texto de uma resposta da API.
function firstText(message) {
  const block = message.content.find(b => b.type === "text");
  return block ? block.text : "";
}

// Respostas com output_config.format vêm como JSON válido no primeiro bloco de texto.
function parseStructured(message) {
  const text = firstText(message);
  try {
    return JSON.parse(text);
  } catch {
    // Fallback: alguns modelos podem envolver em cercas de código.
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("A IA não retornou um JSON válido.");
  }
}

function mapError(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 401, error: "Chave da Anthropic inválida. Confira ANTHROPIC_API_KEY na Vercel." };
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return { status: 403, error: "A chave configurada não tem permissão para usar este modelo." };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, error: "Limite de uso atingido. Aguarde alguns instantes e tente de novo." };
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { status: 400, error: "Requisição inválida: " + err.message };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 503, error: "Não consegui falar com a Anthropic. Verifique a conexão." };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: err.status || 502, error: err.message };
  }
  return { status: 500, error: err.message || "Erro inesperado no servidor de IA." };
}

// ---------------------------------------------------------------- prompts

const PERSONA = `Você é o assistente financeiro do Baron Financeiro, um app de controle
financeiro pessoal e familiar brasileiro. Fala português do Brasil, de forma direta e
prática, como um contador de confiança — sem jargão desnecessário e sem enrolação.

REGRAS DE OURO
- Trabalhe SOMENTE com os dados fornecidos no contexto. Nunca invente lançamentos,
  valores ou datas. Se um dado não estiver no contexto, diga que não tem essa informação.
- Todos os valores são em Reais (R$). Formate como R$ 1.234,56.
- Datas no formato brasileiro (dd/mm/aaaa) quando falar com o usuário.
- "Competência" é quando o gasto aconteceu; "Pagamento" é quando o dinheiro saiu.
- Lançamentos com categoria do grupo "Transferências" são movimentação entre contas
  próprias: não são receita nem despesa, ignore-os em análises de gasto.
- Status pode ser Pago, Parcial ou Pendente. Pendente/Parcial ainda vai sair do caixa.
- Cartão de crédito: a compra tem data de competência no mês da compra, mas o dinheiro
  sai na data de vencimento da fatura.`;

const CONCISAO = `
COMO RESPONDER
- Comece pela resposta. A primeira frase entrega o número ou a conclusão que a pessoa pediu.
- Detalhe e raciocínio vêm depois, para quem quiser. Seja seletivo: corte o que não muda
  a decisão de quem lê.
- Uma pergunta simples merece uma resposta direta em prosa, não seções e cabeçalhos.
- Use tabelas apenas para listas curtas de fatos enumeráveis; a explicação fica na prosa.
- Escreva frases completas. Nada de abreviações, setas encadeadas ou telegrafês.
- Não repita o contexto de volta para o usuário nem narre o que você vai fazer.`;

// ---------------------------------------------------------------- schemas

const SCHEMA_INSIGHTS = {
  type: "object",
  properties: {
    insights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título curto, no máximo 6 palavras." },
          descricao: { type: "string", description: "Uma ou duas frases explicando o achado, com os números concretos." },
          tipo: {
            type: "string",
            enum: ["alerta", "economia", "padrao", "previsao", "positivo"],
            description: "alerta=risco imediato; economia=oportunidade de cortar gasto; padrao=comportamento fora do normal; previsao=projeção futura; positivo=boa notícia."
          },
          severidade: { type: "string", enum: ["alta", "media", "baixa"] },
          valor: { type: "number", description: "Valor em reais associado ao insight. Use 0 quando não houver valor." },
          acao: { type: "string", description: "Sugestão prática de uma frase. String vazia se não houver." }
        },
        required: ["titulo", "descricao", "tipo", "severidade", "valor", "acao"],
        additionalProperties: false
      }
    }
  },
  required: ["insights"],
  additionalProperties: false
};

const SCHEMA_CATEGORIZE = {
  type: "object",
  properties: {
    sugestoes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "O id exato do lançamento recebido no contexto." },
          categoria: { type: "string", description: "Categoria escolhida, exatamente como aparece na lista de categorias existentes." },
          confianca: { type: "string", enum: ["alta", "media", "baixa"] },
          motivo: { type: "string", description: "Justificativa em até 12 palavras." }
        },
        required: ["id", "categoria", "confianca", "motivo"],
        additionalProperties: false
      }
    }
  },
  required: ["sugestoes"],
  additionalProperties: false
};

const SCHEMA_DOCUMENT = {
  type: "object",
  properties: {
    tipo: {
      type: "string",
      enum: ["cupom", "nota_fiscal", "boleto", "fatura_cartao", "comprovante", "extrato", "outro"]
    },
    estabelecimento: { type: "string", description: "Nome do estabelecimento/emissor. Vazio se ilegível." },
    documento: { type: "string", description: "CNPJ, CPF ou número do documento. Vazio se não houver." },
    data: { type: "string", description: "Data do documento em AAAA-MM-DD. Vazio se ilegível." },
    vencimento: { type: "string", description: "Vencimento em AAAA-MM-DD, para boletos e faturas. Vazio se não houver." },
    total: { type: "number", description: "Valor total do documento em reais." },
    confianca: { type: "string", enum: ["alta", "media", "baixa"] },
    observacoes: { type: "string", description: "O que ficou ilegível ou duvidoso. Vazio se estiver tudo claro." },

    formaPagamento: {
      type: "string",
      enum: ["credito", "debito", "pix", "dinheiro", "boleto", "transferencia", "desconhecida"],
      description: "Como foi pago, lido do documento. 'desconhecida' quando o documento não diz."
    },
    contaSugerida: {
      type: "string",
      description: "Nome EXATO de uma das contas/cartões do usuário que deve receber estes lançamentos. String vazia se não der para determinar."
    },
    confiancaConta: {
      type: "string",
      enum: ["alta", "media", "baixa"],
      description: "Quanta certeza você tem da conta escolhida."
    },
    motivoConta: {
      type: "string",
      description: "Em até 12 palavras, que pista do documento levou a essa conta. Vazio se não houver pista."
    },
    finalCartao: {
      type: "string",
      description: "Os 4 últimos dígitos do cartão, se aparecerem no documento. Vazio se não aparecerem."
    },
    statusSugerido: {
      type: "string",
      enum: ["Pago", "Pendente"],
      description: "Pago quando o documento comprova pagamento já feito (cupom, comprovante). Pendente quando é cobrança futura (boleto em aberto, fatura a vencer)."
    },
    itens: {
      type: "array",
      description: "Itens de linha lidos do documento, na ordem em que aparecem.",
      items: {
        type: "object",
        properties: {
          descricao: { type: "string" },
          quantidade: { type: "number", description: "Use 1 quando não informado." },
          valor: { type: "number", description: "Valor total da linha em reais." },
          categoria: { type: "string", description: "Categoria sugerida, da lista de categorias existentes." }
        },
        required: ["descricao", "quantidade", "valor", "categoria"],
        additionalProperties: false
      }
    },
    lancamentos: {
      type: "array",
      description: "Lançamentos prontos para gravar no app. Para um cupom de supermercado, agrupe por categoria. Para um boleto ou fatura, normalmente é um único lançamento.",
      items: {
        type: "object",
        properties: {
          descricao: { type: "string" },
          categoria: { type: "string", description: "Exatamente uma das categorias existentes." },
          valor: { type: "number" },
          data: { type: "string", description: "Data de competência em AAAA-MM-DD." },
          tipo: { type: "string", enum: ["entrada", "saida"] },
          parcelaAtual: { type: "number", description: "Número da parcela. 0 se não for parcelado." },
          parcelaTotal: { type: "number", description: "Total de parcelas. 0 se não for parcelado." }
        },
        required: ["descricao", "categoria", "valor", "data", "tipo", "parcelaAtual", "parcelaTotal"],
        additionalProperties: false
      }
    }
  },
  required: [
    "tipo", "estabelecimento", "documento", "data", "vencimento", "total", "confianca", "observacoes",
    "formaPagamento", "contaSugerida", "confiancaConta", "motivoConta", "finalCartao", "statusSugerido",
    "itens", "lancamentos"
  ],
  additionalProperties: false
};

// Curadoria do plano de contas: renomear, fundir, reagrupar e criar categorias
const SCHEMA_PLANO = {
  type: "object",
  properties: {
    diagnostico: {
      type: "string",
      description: "Duas ou três frases sobre o estado geral do plano de contas desta pessoa."
    },
    acoes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tipo: {
            type: "string",
            enum: ["renomear", "fundir", "reagrupar", "criar"],
            description: "renomear=corrigir grafia/acento/padronizar; fundir=juntar duplicata em outra que já existe; reagrupar=mudar o grupo do plano de contas; criar=sugerir categoria nova que falta."
          },
          categoria: { type: "string", description: "Categoria alvo, exatamente como aparece hoje. Para 'criar', o nome da nova categoria." },
          destino: { type: "string", description: "Para renomear: o nome novo. Para fundir: a categoria que absorve. Para reagrupar e criar: o grupo do plano de contas. " },
          motivo: { type: "string", description: "Por que vale a pena, em até 15 palavras, citando o que você viu nos dados." },
          confianca: { type: "string", enum: ["alta", "media", "baixa"] },
          lancamentosAfetados: { type: "number", description: "Quantos lançamentos existentes essa mudança toca. 0 para 'criar'." }
        },
        required: ["tipo", "categoria", "destino", "motivo", "confianca", "lancamentosAfetados"],
        additionalProperties: false
      }
    }
  },
  required: ["diagnostico", "acoes"],
  additionalProperties: false
};

// ---------------------------------------------------------------- actions

async function actionChat(client, body, res) {
  const { messages, contexto } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw Object.assign(new Error("Nenhuma mensagem enviada."), { statusCode: 400 });
  }

  const system = [
    {
      type: "text",
      text: `${PERSONA}
${CONCISAO}

O usuário pode pedir relatórios, comparações entre períodos, projeções de saldo,
explicações sobre para onde o dinheiro foi e sugestões de organização. Faça as contas
a partir do contexto e mostre os números que sustentam a conclusão.`
    },
    {
      type: "text",
      text: "DADOS FINANCEIROS DO USUÁRIO (JSON):\n" + JSON.stringify(contexto || {}),
      cache_control: { type: "ephemeral" }
    }
  ];

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no"
  });

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    system,
    output_config: { effort: "medium" },
    messages: messages.map(m => ({ role: m.role, content: String(m.content || "") }))
  });

  stream.on("text", delta => res.write(delta));

  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    res.write("\n\n_Não consigo responder essa pergunta._");
  }
  res.end();
}

async function actionInsights(client, body) {
  const { contexto } = body;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: `${PERSONA}

Sua tarefa: analisar os dados e produzir de 3 a 5 insights que a pessoa ainda NÃO sabe
olhando o dashboard. Priorize, nesta ordem:
1. Riscos imediatos de caixa (saldo que fica negativo, conta vencida, fatura maior que o saldo).
2. Gastos claramente fora do padrão do próprio usuário quando comparados aos meses anteriores.
3. Assinaturas e recorrências que parecem esquecidas ou duplicadas.
4. Oportunidades concretas de economia, com o valor em jogo.
5. Uma boa notícia real, se houver.

Cada insight precisa citar números concretos vindos dos dados. Não produza insight
genérico do tipo "controle seus gastos" — se não houver nada relevante a dizer,
retorne menos insights ou uma lista vazia.`,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: SCHEMA_INSIGHTS }
    },
    messages: [
      {
        role: "user",
        content: "Analise estes dados financeiros e gere os insights:\n\n" + JSON.stringify(contexto || {})
      }
    ]
  });

  return parseStructured(message);
}

async function actionCategorize(client, body) {
  const { lancamentos, categorias, grupos, exemplos, memoria } = body;
  if (!Array.isArray(lancamentos) || lancamentos.length === 0) {
    return { sugestoes: [] };
  }

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 12000,
    system: `${PERSONA}

Sua tarefa: classificar lançamentos financeiros nas categorias que o usuário JÁ USA.

REGRAS
- Escolha sempre uma categoria da lista de categorias existentes, copiada exatamente
  (mesma grafia, mesmos acentos, mesmas maiúsculas). Nunca invente categoria nova.
- Use os exemplos de lançamentos já classificados pelo usuário como referência principal:
  eles mostram o critério pessoal dele, que vale mais do que o critério "correto" genérico.
- Considere a descrição, o valor, a conta e a data. Compras de supermercado com valor alto
  costumam ser alimentação; valores pequenos e recorrentes no cartão costumam ser assinaturas.
- Marque confiança "baixa" quando a descrição for genérica ou ambígua demais. É melhor
  admitir incerteza do que chutar com confiança alta.
- Retorne uma sugestão para CADA lançamento recebido, usando o id exato.
- As CORREÇÕES ANTERIORES têm prioridade sobre tudo. Se o usuário já corrigiu um palpite
  seu para um estabelecimento parecido, repita a escolha dele e marque confiança "alta".
  Errar de novo no mesmo lugar é o pior resultado possível aqui.`,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA_CATEGORIZE }
    },
    messages: [
      {
        role: "user",
        content:
          "CATEGORIAS EXISTENTES (use exatamente estas):\n" + JSON.stringify(categorias || []) +
          "\n\nGRUPO DE CADA CATEGORIA:\n" + JSON.stringify(grupos || {}) +
          "\n\nEXEMPLOS JÁ CLASSIFICADOS PELO USUÁRIO:\n" + JSON.stringify(exemplos || []) +
          (memoria && memoria.length
            ? "\n\nCORREÇÕES ANTERIORES DO USUÁRIO (prioridade máxima):\n" + JSON.stringify(memoria)
            : "") +
          "\n\nLANÇAMENTOS PARA CLASSIFICAR:\n" + JSON.stringify(lancamentos)
      }
    ]
  });

  return parseStructured(message);
}

async function actionPlano(client, body) {
  const { categorias, grupos, uso, gruposDisponiveis } = body;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 10000,
    system: `${PERSONA}

Sua tarefa: revisar o PLANO DE CONTAS desta pessoa e propor melhorias concretas.
Um plano de contas bom tem nomes consistentes, sem duplicatas e sem categorias mortas.
O plano de contas real das pessoas costuma envelhecer mal: erros de digitação que viraram
categoria permanente, a mesma coisa escrita de três jeitos, e categorias criadas para um
caso específico que nunca mais se repetiu.

O QUE PROCURAR, em ordem de valor

1. **Erros de grafia e acentuação** → ação "renomear".
   Ex.: "Alimetação Gabi" tem um erro de digitação; "Saude/Farmacia", "Emprestimos",
   "Condominio", "Iptu", "Moveis e Eletros", "Roupas e Acessorios" estão sem acento.
   Corrija para o português correto, preservando o sentido que a pessoa deu.

2. **Duplicatas de fato** → ação "fundir".
   Duas categorias que significam a mesma coisa e nunca deveriam ter sido separadas.
   CUIDADO: categorias com nome de pessoa ("Lazer Gabi", "Alimentação Felipe") NÃO são
   duplicatas — são um controle intencional de quem gastou. Nunca funda essas.
   Só proponha fusão quando a diferença for puramente de grafia ou sinônimo exato.

3. **Categoria no grupo errado** → ação "reagrupar".
   Ex.: uma categoria de transporte classificada como "Outros". Use o campo destino
   para o grupo correto, escolhido da lista de grupos disponíveis.

4. **Buraco visível no plano** → ação "criar".
   Só sugira criar quando os dados mostrarem gasto recorrente que hoje cai num balde
   genérico. Não invente categoria que a pessoa não vai usar.

REGRAS
- Trabalhe pelos dados de uso que você recebeu: quantos lançamentos e quanto valor cada
  categoria tem. Uma categoria com 40 lançamentos não deve ser fundida de leve.
- Preencha lancamentosAfetados com o número real vindo dos dados de uso.
- Marque confiança "baixa" quando estiver mexendo em categoria muito usada ou quando a
  intenção da pessoa não estiver clara.
- Não proponha mudança cosmética sem ganho. Se o plano estiver bom, retorne poucas ações
  ou nenhuma, e diga isso no diagnóstico.
- Máximo de 15 ações. Priorize as de maior impacto.`,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: SCHEMA_PLANO }
    },
    messages: [
      {
        role: "user",
        content:
          "GRUPOS DISPONÍVEIS NO PLANO DE CONTAS:\n" + JSON.stringify(gruposDisponiveis || []) +
          "\n\nCATEGORIAS ATUAIS:\n" + JSON.stringify(categorias || []) +
          "\n\nGRUPO DE CADA CATEGORIA:\n" + JSON.stringify(grupos || {}) +
          "\n\nUSO DE CADA CATEGORIA (lançamentos, valor total, primeira e última vez):\n" +
          JSON.stringify(uso || {}) +
          "\n\nRevise este plano de contas."
      }
    ]
  });

  return parseStructured(message);
}

async function actionDocument(client, body) {
  const { arquivo, categorias, contas, hoje, observacao, memoria, cnpjConhecidos } = body;
  if (!arquivo || !arquivo.data || !arquivo.mediaType) {
    throw Object.assign(new Error("Nenhum arquivo enviado."), { statusCode: 400 });
  }

  const isPdf = arquivo.mediaType === "application/pdf";
  const documentoBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: arquivo.data } }
    : { type: "image", source: { type: "base64", media_type: arquivo.mediaType, data: arquivo.data } };

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: `${PERSONA}

Sua tarefa: ler um documento financeiro (cupom fiscal, nota fiscal, boleto, fatura de
cartão, comprovante de pagamento ou extrato) e transformá-lo em lançamentos prontos
para o app.

REGRAS DE LEITURA
- Leia os valores exatamente como estão impressos. Não arredonde e não estime.
- Se um trecho estiver ilegível, deixe o campo vazio e registre isso em "observacoes".
  Nunca preencha um valor que você não conseguiu ler.
- Confira a soma: o total dos lançamentos deve bater com o total do documento. Se não
  bater, diga isso em "observacoes".
- Datas sempre em AAAA-MM-DD. Documentos brasileiros usam dd/mm/aaaa — converta.
- Valores brasileiros usam vírgula decimal: "1.234,56" é 1234.56.

REGRAS DE CATEGORIZAÇÃO
- Toda categoria deve vir da lista de categorias existentes, copiada exatamente.
- Cupom de supermercado ou farmácia: agrupe os itens por categoria e gere um lançamento
  por categoria, com descrição no formato "Estabelecimento — Categoria".
- Boleto, conta de consumo ou comprovante: normalmente um único lançamento.
- Fatura de cartão: um lançamento por compra listada. Se houver parcelamento no formato
  "3/10", preencha parcelaAtual e parcelaTotal.
- Documento de pagamento recebido ou depósito é "entrada"; o resto é "saida".

DESCOBRIR A CONTA OU CARTÃO (campo contaSugerida)
Esta parte importa tanto quanto os valores. O usuário não quer escolher a conta na mão.
Procure no documento, nesta ordem de prioridade:
1. **Nome do banco ou bandeira**: "NUBANK", "BTG", "ITAÚ", "SICOOB", "VISA", "MASTERCARD",
   "ELO". Cruze com a lista de contas do usuário — "Fatura Nubank" combina com o cartão
   dele que tem "Nubank" no nome.
2. **Forma de pagamento impressa no rodapé do cupom**: "CRÉDITO" ou "CARTAO DE CREDITO"
   aponta para um cartão; "DÉBITO" aponta para a conta corrente do mesmo banco;
   "DINHEIRO" aponta para a conta chamada "Dinheiro" se ela existir; "PIX" aponta para
   a conta corrente.
3. **Últimos 4 dígitos do cartão**: preencha finalCartao mesmo que não consiga decidir
   a conta — isso ajuda o usuário a reconhecer.
4. **Correções anteriores do usuário**: se a memória mostra que ele já moveu compras
   deste mesmo estabelecimento para uma conta específica, repita essa escolha. O critério
   dele vale mais que qualquer regra genérica.

Se um documento é uma FATURA DE CARTÃO, contaSugerida é obrigatoriamente o cartão
correspondente — nunca a conta corrente que paga a fatura.

Se nada no documento indicar a conta, deixe contaSugerida vazia e confiancaConta "baixa".
Não chute: uma conta errada bagunça o saldo de duas contas ao mesmo tempo.

STATUS (campo statusSugerido)
- Cupom fiscal, comprovante de pagamento, extrato de compra já feita → "Pago".
- Boleto em aberto, fatura de cartão a vencer, carnê → "Pendente".`,
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: SCHEMA_DOCUMENT }
    },
    messages: [
      {
        role: "user",
        content: [
          documentoBlock,
          {
            type: "text",
            text:
              "Data de hoje: " + (hoje || new Date().toISOString().slice(0, 10)) +
              "\n\nCATEGORIAS EXISTENTES (use exatamente estas):\n" + JSON.stringify(categorias || []) +
              "\n\nCONTAS E CARTÕES DO USUÁRIO:\n" + JSON.stringify(contas || []) +
              (cnpjConhecidos && Object.keys(cnpjConhecidos).length
                ? "\n\nCNPJ → CATEGORIA que este usuário já usou antes:\n" + JSON.stringify(cnpjConhecidos)
                : "") +
              (memoria && memoria.length
                ? "\n\nCORREÇÕES QUE O USUÁRIO JÁ FEZ EM PALPITES ANTERIORES (respeite estas decisões):\n" +
                  JSON.stringify(memoria)
                : "") +
              (observacao ? "\n\nOBSERVAÇÃO DO USUÁRIO SOBRE ESTE DOCUMENTO:\n" + observacao : "") +
              "\n\nExtraia os dados deste documento."
          }
        ]
      }
    ]
  });

  if (message.stop_reason === "refusal") {
    throw Object.assign(new Error("Não consigo processar este documento."), { statusCode: 422 });
  }

  return parseStructured(message);
}

// ---------------------------------------------------------------- handler

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST." });
    return;
  }

  const client = getClient();
  const body = req.body || {};
  const action = body.action;

  // "ping" responde mesmo sem chave configurada — é assim que o app descobre
  // se deve mostrar ou esconder os recursos de IA.
  if (action === "ping") {
    sendJson(res, 200, { ok: !!client, model: MODEL });
    return;
  }

  if (!client) {
    sendJson(res, 503, {
      error: "IA não configurada. Defina a variável de ambiente ANTHROPIC_API_KEY nas configurações do projeto na Vercel e faça um novo deploy."
    });
    return;
  }

  const rawSize = Number(req.headers["content-length"] || 0);
  if (rawSize > MAX_BODY_BYTES) {
    sendJson(res, 413, { error: "Arquivo grande demais. Tente uma foto menor ou um PDF mais leve." });
    return;
  }

  try {
    switch (action) {
      case "chat":
        await actionChat(client, body, res);
        return;
      case "insights":
        sendJson(res, 200, await actionInsights(client, body));
        return;
      case "categorize":
        sendJson(res, 200, await actionCategorize(client, body));
        return;
      case "plano":
        sendJson(res, 200, await actionPlano(client, body));
        return;
      case "document":
        sendJson(res, 200, await actionDocument(client, body));
        return;
      default:
        sendJson(res, 400, { error: "Ação desconhecida: " + action });
        return;
    }
  } catch (err) {
    console.error("[api/ai]", action, err);
    // No streaming os headers já foram enviados; só dá pra avisar no corpo.
    if (res.headersSent) {
      res.write("\n\n[erro] " + (err.message || "falha ao gerar a resposta"));
      res.end();
      return;
    }
    const mapped = err.statusCode
      ? { status: err.statusCode, error: err.message }
      : mapError(err);
    sendJson(res, mapped.status, { error: mapped.error });
  }
}
