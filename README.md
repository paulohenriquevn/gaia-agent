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
| `web_search` | Descobre quais páginas ler (DuckDuckGo, sem API key) |
| `fetch_page` | Lê uma página como texto, preservando tabelas em formato pipe |
| `read_task_file` | Decodifica anexos de texto/código e planilhas (`xlsx` → CSV) |
| `describe_image` | Responde perguntas sobre imagens anexadas (modelo de visão) |
| `transcribe_audio` | Responde perguntas sobre áudio anexado (modelo com entrada de áudio) |
| `youtube_transcript` | Legendas com marcação de tempo, para o que é *dito* num vídeo |
| `run_python` | Aritmética, contagem e execução do código anexado, com timeout rígido |

A pontuação é por **igualdade exata de string**, então o formato da resposta pesa tanto quanto a pesquisa. O agente termina com `FINAL ANSWER: <x>`; `src/lib/answer.ts` extrai o valor e remove o marcador, que o curso proíbe no texto submetido.

## Configuração

| Variável | Obrigatória | Padrão |
|---|---|---|
| `OPENROUTER_API_KEY` | sim | — |
| `MODEL_ID` | não | `openrouter/anthropic/claude-sonnet-4.5` |
| `VISION_MODEL` | não | `google/gemini-2.5-flash` |
| `AUDIO_MODEL` | não | `google/gemini-2.5-flash` |
| `HF_USERNAME` | só fora do Space | derivada de `SPACE_ID` |
| `AGENT_CODE_URL` | só fora do Space | derivada de `SPACE_ID` |
| `CONCURRENCY` | não | `3` |

Dentro de um Space em execução, `HF_USERNAME` e `AGENT_CODE_URL` são derivadas de `SPACE_ID`. Rodando localmente, defina as duas no `.env`.

## Onde o agente executa

Este Space usa o SDK `static`: ele publica o código e uma página de apresentação. O agente **executa localmente**, porque Spaces com SDK Docker — necessários para rodar Node.js — exigem plano pago na conta que hospeda este projeto.

O `Dockerfile` e o servidor web (`src/server.ts`) estão versionados e funcionais: em uma conta com Docker liberado, trocar `sdk: static` por `sdk: docker` mais `app_port: 7860` no cabeçalho deste README faz o agente rodar dentro do próprio Space, sem outra alteração.

## Uso local

```bash
npm install
npm test                 # 33 testes da lógica pura, sem rede
npm run eval             # responde as 20 questões, grava answers.json
npm run submit           # submete o answers.json já gerado
npm run dev              # sobe a interface web em http://localhost:7860
```

`eval` e `submit` são passos separados de propósito: cada submissão aparece no leaderboard público do curso.

## Licença

MIT.
