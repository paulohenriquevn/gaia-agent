---
title: GAIA Final Agent
emoji: 🧠
colorFrom: yellow
colorTo: red
sdk: static
pinned: false
license: mit
---

# GAIA Final Agent

Agente para o desafio final (Unit 4) do [Hugging Face Agents Course](https://huggingface.co/learn/agents-course), construído com [`@theokit/sdk`](https://www.npmjs.com/package/@theokit/sdk) em TypeScript.

Responde às 20 questões de nível 1 do GAIA servidas pela API de avaliação do curso e submete o resultado para pontuação. O gate do certificado é **30%** — 6 de 20 respostas corretas.

## Como funciona

Cada questão roda num agente próprio e descartável, com um conjunto fixo de ferramentas. Contexto de uma questão nunca contamina a seguinte.

| Ferramenta | Para que serve |
|---|---|
| `wikipedia_search` / `wikipedia_page` | Fonte principal: API oficial da Wikipedia, que não bloqueia por volume |
| `web_search` | Descobre quais páginas ler (Brave com `BRAVE_API_KEY`, senão DuckDuckGo) |
| `fetch_page` | Lê uma página como texto, preservando tabelas em formato pipe |
| `read_task_file` | Decodifica anexos de texto/código e planilhas (`xlsx` → CSV) |
| `describe_image` | Responde perguntas sobre imagens anexadas (modelo de visão) |
| `transcribe_audio` | Responde perguntas sobre áudio anexado (modelo com entrada de áudio) |
| `youtube_transcript` | Legendas com marcação de tempo, para o que é *dito* num vídeo |
| `run_python` | Aritmética, contagem e execução do código anexado, em subprocesso isolado |

A pontuação é por **igualdade exata de string**, então o formato da resposta pesa tanto quanto a pesquisa. O agente termina com `FINAL ANSWER: <x>`; `src/lib/answer.ts` extrai o valor e remove o marcador, que o curso proíbe no texto submetido.

## Configuração

| Variável | Obrigatória | Padrão |
|---|---|---|
| `OPENROUTER_API_KEY` | sim | — |
| `MODEL_ID` | não | `openrouter/anthropic/claude-sonnet-5` |
| `VISION_MODEL` | não | `google/gemini-2.5-flash` |
| `AUDIO_MODEL` | não | `google/gemini-2.5-flash` |
| `HF_USERNAME` | só fora do Space | derivada de `SPACE_ID` |
| `AGENT_CODE_URL` | só fora do Space | derivada de `SPACE_ID` |
| `FALLBACK_MODEL_ID` | não | `openrouter/google/gemini-3-flash-preview` |
| `BRAVE_API_KEY` | não | — (sem ela, a busca cai para o DuckDuckGo) |
| `MAX_ITERATIONS` | não | `30` |
| `CONCURRENCY` | não | `3` |
| `RUN_TOKEN` | só para `/run` | — (sem ela o servidor sobe somente-leitura) |

Dentro de um Space em execução, `HF_USERNAME` e `AGENT_CODE_URL` são derivadas de `SPACE_ID`. Rodando localmente, defina as duas no `.env`.

## Onde o agente executa

Este Space usa o SDK `static`: ele publica o código e uma página de apresentação. O agente **executa localmente**, porque Spaces com SDK Docker — necessários para rodar Node.js — exigem plano pago na conta que hospeda este projeto.

O `Dockerfile` e o servidor web (`src/server.ts`) estão versionados e funcionais: em uma conta com Docker liberado, trocar `sdk: static` por `sdk: docker` mais `app_port: 7860` no cabeçalho deste README faz o agente rodar dentro do próprio Space, sem outra alteração.

## Uso local

```bash
npm install
npm test                 # 114 testes: lógica pura e fronteiras (subprocesso, HTTP)
npm run eval             # responde as 20 questões, grava answers.json
npm run submit           # submete o answers.json já gerado
npm run smoke [task_id]  # responde uma questão só, para validar a configuração
npm run dev              # sobe a interface web em http://localhost:7860

GROUND_TRUTH_PATH=<gabarito.jsonl> npm run score   # mede o score antes de submeter
```

`npm run score` corrige as respostas contra um gabarito local e imprime o percentual.
O gabarito não é versionado nem lido pelo agente: entra por `GROUND_TRUTH_PATH`, depois
que as respostas já foram geradas.

`eval` e `submit` são passos separados de propósito: cada submissão aparece no leaderboard público do curso.

## Segurança

O código Python executado pelo agente é escrito pelo modelo a partir de páginas lidas na
web, então roda em subprocesso com ambiente mínimo — sem as credenciais do processo — e
com prazo que encerra o grupo de processos. As URLs que o modelo escolhe passam por
triagem de SSRF, recusando endereços privados, de loopback e link-local.

`/run` exige `RUN_TOKEN`: a rota gasta crédito do provider e publica no leaderboard do
curso, então fica desabilitada por omissão.

## Licença

MIT — ver [LICENSE](LICENSE). Atribuições de terceiros em [NOTICE](NOTICE).
