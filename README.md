---
title: HF Agents Course — Unit 4 Final Assignment
emoji: 🧠
colorFrom: yellow
colorTo: red
sdk: static
pinned: false
license: mit
---

# Unit 4 — Final Assignment

Agente do desafio final do [Hugging Face Agents Course](https://huggingface.co/learn/agents-course), construído em TypeScript com o [TheoKit SDK](https://theokit.dev).

**Resultado: 55% no GAIA nível 1** — 11 de 20 questões, contra uma nota de corte de 30%.

> O que este repositório tenta mostrar não é o número, e sim que ele é **defensável**: como o agente foi construído, o que deu errado no caminho e por que uma rodada com score maior foi descartada.

---

## Começando

```bash
git clone https://huggingface.co/spaces/paulohenriquevn/hf-agents-course-unit4-final
cd hf-agents-course-unit4-final
npm install

echo "OPENROUTER_API_KEY=sk-or-v1-..." > .env

npm test          # 125 testes, sem rede
npm run smoke     # responde UMA questão, para conferir a configuração
npm run eval      # responde as 20 e grava answers.json
npm run submit    # envia o answers.json para a API do curso
```

Precisa de **Node 22.12+**. Uma chave do [OpenRouter](https://openrouter.ai) é o único requisito obrigatório.

---

## Como o agente funciona

Cada questão roda num agente próprio e descartável. Nada de uma questão vaza para a seguinte.

Quando a pesquisa não conclui, a resposta não é abandonada — há uma cadeia de três tentativas, porque uma questão em branco vale exatamente zero:

```
1. pesquisa com ferramentas   →  resposta verificada contra fontes
2. mesmo modelo, sem tools    →  alguns modelos só concluem quando não podem pesquisar
3. modelo de outra família    →  contorna filtro de conteúdo e limitação do primeiro
```

### As ferramentas

| Ferramenta | Para que serve |
|---|---|
| `wikipedia_search` · `wikipedia_page` | Fonte principal — API oficial, não bloqueia por volume |
| `web_search` | Descobre o que ler (Brave com `BRAVE_API_KEY`, senão DuckDuckGo) |
| `fetch_page` | Lê uma página como texto, preservando tabelas |
| `read_task_file` | Anexos de texto e código; planilhas viram CSV |
| `describe_image` | Perguntas sobre imagens anexadas |
| `transcribe_audio` | Perguntas sobre áudio anexado |
| `youtube_transcript` | Legendas com marcação de tempo |
| `run_python` | Contas, contagens e código do enunciado, em subprocesso isolado |

A nota é por **igualdade exata de string**, então o formato pesa tanto quanto a pesquisa. O agente termina com `FINAL ANSWER: <valor>` e `src/lib/answer.ts` extrai só o valor — o curso proíbe esse marcador no texto submetido.

---

## Configuração

| Variável | Obrigatória | Padrão |
|---|---|---|
| `OPENROUTER_API_KEY` | **sim** | — |
| `MODEL_ID` | não | `openrouter/google/gemini-3-flash-preview` |
| `FALLBACK_MODEL_ID` | não | `openrouter/qwen/qwen3-max` |
| `VISION_MODEL` · `AUDIO_MODEL` | não | `google/gemini-2.5-flash` |
| `BRAVE_API_KEY` | não | sem ela, a busca cai para o DuckDuckGo |
| `MAX_ITERATIONS` | não | `30` |
| `CONCURRENCY` | não | `3` |
| `BUDGET_LIMIT_USD` | não | `5` por hora |
| `HF_USERNAME` · `AGENT_CODE_URL` | só para submeter | derivadas de `SPACE_ID` no Space |
| `RUN_TOKEN` | só para `/run` | sem ela o servidor sobe somente-leitura |

Uma rodada completa custa cerca de **US$ 1** com o modelo padrão.

---

## Medindo antes de submeter

```bash
GROUND_TRUTH_PATH=<gabarito.jsonl> npm run score
```

Corrige as respostas localmente e imprime o percentual. Cada submissão aparece no leaderboard público do curso, então descobrir o score só depois de publicá-lo sai caro.

O gabarito **não** é versionado nem lido pelo agente: entra por variável de ambiente, depois que as respostas já foram geradas.

---

## O que este projeto aprendeu errando

Vale mais que o score:

**Uma rodada anterior pontuou mais — e foi descartada.** O agente alcançava o gabarito do benchmark através da ferramenta `shell`, que o runtime registra em todo agente por padrão, com o arquivo de referência dentro do diretório de trabalho. A prova: a questão da imagem de xadrez respondia `Rd5` (correto) e passou a responder `Rh1+` (errado) assim que o acesso foi bloqueado. O score publicado é menor e sustentável.

**O prompt entregava a resposta.** Um exemplo de formatação usava, sem que ninguém notasse, o gabarito de uma das questões — servido ao modelo em toda pergunta. Hoje `src/prompts.ts` carrega a regra de que nenhum exemplo pode coincidir com resposta do conjunto avaliado.

**O teto padrão de iterações era o gargalo.** O runtime trunca em 8 rodadas de ferramenta; uma questão do GAIA gasta isso só localizando a fonte, e o run terminava sem texto e sem erro legível.

**Quatro questões são irrespondíveis.** A rota `GET /files/{task_id}` da API do curso devolve 404 para todos os anexos, então imagem, áudio, planilha e código ficam fora de alcance. O teto real é 16, não 20.

---

## Segurança

O código Python que o agente executa é escrito pelo modelo a partir de páginas lidas na web — entrada não confiável. Ele roda em subprocesso com ambiente mínimo (sem as credenciais do processo), teto de saída e prazo que encerra o grupo de processos.

URLs escolhidas pelo modelo passam por triagem de SSRF, recusando endereços privados, de loopback e link-local. Ferramentas de acesso irrestrito (`shell`, `memory_search`, `memory_get`) são negadas por política.

`/run` exige `RUN_TOKEN`: a rota gasta crédito e publica no leaderboard, então fica desabilitada por omissão.

---

## Construído com

**[TheoKit SDK](https://theokit.dev)** — SDK TypeScript e runtime de agentes, com 43 provedores de LLM nas suas próprias chaves, MCP, subagentes, workflows e sandbox de execução.

- Site: **[theokit.dev](https://theokit.dev)**
- Código: **[github.com/usetheokit/theokit-sdk](https://github.com/usetheokit/theokit-sdk)**

Deste SDK o projeto usa `Agent.create` com ferramentas próprias, `Tool.create` com schemas Zod, `PermissionPlugin` para negar ferramentas, `Retry.create` com jitter, `Budget` como teto de gasto, e as ferramentas prontas de [`@theokit/sdk-tools`](https://www.npmjs.com/package/@theokit/sdk-tools) — busca agnóstica de provedor e fetch com triagem de SSRF.

Construir este agente também gerou dois relatórios upstream: [theokit-sdk#338](https://github.com/usetheokit/theokit-sdk/issues/338) e [theokit-skill#1](https://github.com/usetheokit/theokit-skill/issues/1).

---

## Onde o agente executa

Este Space é `static`: publica o código e esta página. O agente **roda localmente**, porque Spaces com Docker — necessários para Node.js — exigem plano pago.

O `Dockerfile` e o servidor (`src/server.ts`) estão versionados e funcionais: numa conta com Docker liberado, trocar `sdk: static` por `sdk: docker` mais `app_port: 7860` no cabeçalho deste arquivo faz o agente rodar dentro do próprio Space.

---

## Licença

MIT — ver [LICENSE](LICENSE). Atribuições de terceiros em [NOTICE](NOTICE).

As perguntas vêm do [benchmark GAIA](https://huggingface.co/datasets/gaia-benchmark/GAIA) e pertencem aos seus autores. Nenhum gabarito é redistribuído aqui.
