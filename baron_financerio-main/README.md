# Baron Financeiro

Controle financeiro pessoal e familiar, com assistente de IA. Roda de dois jeitos:

| Modo | Como abre | Onde ficam os dados | IA |
|---|---|---|---|
| **Desktop** | abrindo `index.html` direto (`file://`) | `localStorage` + arquivo JSON opcional | desligada |
| **Online** | publicado na Vercel (`https://`) | Supabase, com login | **ligada** |

O app detecta o modo sozinho pelo protocolo da URL. Não existe configuração manual.

---

## Recursos de IA

Cinco recursos, todos usando o Claude por trás:

- **Assistente** — pergunte em português (“para onde foi meu dinheiro esse mês?”, “compare com o mês passado”, “quanto sobra até o fim do mês?”). A IA lê seus lançamentos, contas, cartões e recorrências e responde com os números.
- **Insights no Dashboard** — cards com riscos de caixa, gastos fora do padrão, assinaturas esquecidas e oportunidades de economia. Só roda quando você clica em *Analisar minhas finanças*, e o resultado fica em cache até seus dados mudarem.
- **Ler documento** — foto ou PDF de cupom fiscal, nota, boleto, comprovante ou fatura de cartão vira lançamento. A IA também **identifica sozinha em qual conta ou cartão lançar**, lendo a bandeira, o banco, a forma de pagamento e os últimos dígitos impressos no documento.
- **Revisar categorias** — encontra lançamentos sem categoria ou no balde genérico e sugere a categoria certa, usando o que você já categorizou como referência do seu critério.
- **Organizar plano de contas** — revisa suas categorias e propõe corrigir grafia, juntar duplicatas, mover para o grupo certo e criar o que falta.

Se a IA não estiver configurada, esses pontos simplesmente não aparecem e o app continua funcionando normalmente.

---

## Como a IA aprende

A IA guarda **cada correção que você faz** nos palpites dela: trocou a categoria, trocou a conta. Essas correções vão junto em toda leitura de documento e toda categorização seguinte, com prioridade sobre qualquer regra genérica.

Na prática: você importa um cupom do Bistek, ela chuta a conta Nubank, você troca para Cartão Nubank. Da próxima vez que aparecer um cupom do Bistek pago no crédito, ela já vai direto no cartão.

Em *Configurações → O que a IA já aprendeu* dá para ver a lista e apagar qualquer coisa que ela tenha aprendido errado.

### Modo automático

Desligado por padrão. Quando ligado, a IA **grava sozinha** o que leu — sem abrir a tela de revisão — desde que:

- a leitura do documento tenha a confiança mínima que você configurou;
- ela saiba com essa mesma confiança em qual conta lançar;
- a conta exista de verdade no seu cadastro;
- a soma dos lançamentos bata com o total do documento.

Se qualquer uma dessas condições falhar, ela abre a revisão e pergunta. Toda gravação automática aparece com um botão **Desfazer** que reverte tudo de uma vez, e a última ação continua desfazível em *Configurações* depois.

O limiar tem duas posições: *confiança alta* (recomendado) ou *média ou alta* (mais automático, mais risco de erro passar).

---

## Configurar a IA na Vercel

A chave da Anthropic **nunca vai para o navegador**. Ela fica numa variável de ambiente do projeto e é lida apenas pela função serverless `api/ai.js`.

**1. Pegue uma chave**

Em [console.anthropic.com](https://console.anthropic.com) → *API Keys* → *Create Key*. A chave começa com `sk-ant-`.

**2. Cadastre na Vercel**

Projeto → **Settings** → **Environment Variables**:

| Campo | Valor |
|---|---|
| Name | `ANTHROPIC_API_KEY` |
| Value | sua chave `sk-ant-...` |
| Environments | Production, Preview e Development |

**3. Faça um novo deploy**

Variáveis de ambiente só entram em vigor em builds novos. Um `git push` resolve, ou *Deployments → ⋯ → Redeploy*.

**4. Confira**

Abra o app → **Configurações** → o card *Inteligência Artificial* deve mostrar **Ativa · claude-opus-5**. Se mostrar *Desativada*, o texto abaixo explica o que falta.

---

## Custo

Cada recurso faz uma chamada à API da Anthropic, cobrada por token. Ordem de grandeza no uso pessoal:

| Ação | Custo aproximado |
|---|---|
| Uma pergunta ao assistente | centavos |
| Gerar os insights | centavos |
| Ler um documento | centavos |
| Revisar categorias em lote | centavos |

O que mais pesa é o contexto financeiro enviado junto. Ele já vai resumido: agregados por mês, saldos por conta, contas em aberto e os 350 lançamentos mais recentes — não a base inteira. Os insights são cacheados por assinatura dos dados, então reabrir o Dashboard não gera cobrança nova.

Acompanhe o gasto real em [console.anthropic.com](https://console.anthropic.com) → *Usage*, e defina um limite mensal em *Billing* se quiser um teto rígido.

---

## Privacidade

- A chave da API fica só no servidor da Vercel.
- Ao usar um recurso de IA, um resumo dos seus dados financeiros vai para a API da Anthropic para gerar a resposta.
- O histórico da conversa do assistente fica no `localStorage` do seu dispositivo, não no servidor. Dá para apagar em *Configurações → Limpar histórico do assistente*.
- Os recursos de IA são todos sob demanda: nada é enviado sem você clicar.

---

## Estrutura

```
index.html          layout e todas as views
styles.css          design tokens + componentes
config.js           URL/chave do Supabase e detecção de modo
auth.js             login (modo online)
data.js             Store, migrações e regras de negócio
charts.js           gráficos em SVG, sem dependências
app.js              lógica das views
ai.js               cliente de IA: contexto, chat, insights, documentos
ai-ui.js            interface dos recursos de IA
api/ai.js           função serverless (proxy da Anthropic)
service-worker.js   cache offline do PWA
supabase-schema.sql schema da tabela app_state
```

## Rodar local

```bash
npm install
npx vercel dev      # sobe o app + a função /api/ai
```

Sem o `vercel dev`, qualquer servidor estático serve o app — mas os recursos de IA ficam desligados, porque não existe `/api/ai`.
