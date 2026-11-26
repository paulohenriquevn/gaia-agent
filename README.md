# gaia-agent

An agent that answers the GAIA questions of the final assignment of the [Hugging Face Agents Course](https://huggingface.co/learn/agents-course), written in TypeScript with the [LoopZero SDK](https://www.npmjs.com/package/@getloopscale/loopzero-sdk).

**Result: 55% on GAIA level 1.** That is 11 of 20 questions, against a pass mark of 30%.

The number matters less than whether it can be defended. This README says how the agent was built, what went wrong on the way and why a run with a higher score was thrown away.

## Getting started

```bash
git clone https://github.com/paulohenriquevn/gaia-agent
cd gaia-agent
npm install

echo "OPENROUTER_API_KEY=sk-or-v1-..." > .env

npm test          # 125 tests, no network
npm run smoke     # answers ONE question, to check the configuration
npm run eval      # answers all 20 and writes answers.json
npm run submit    # sends answers.json to the course API
```

Needs Node 22.12 or newer. An [OpenRouter](https://openrouter.ai) key is the only mandatory requirement.

## How the agent works

Each question runs in its own disposable agent. Nothing from one question leaks into the next.

When the research does not conclude, the answer is not abandoned. There is a chain of three attempts, because a blank answer is worth exactly zero:

```
1. research with tools        ->  answer checked against sources
2. same model, no tools       ->  some models only conclude when they cannot search
3. model from another family  ->  gets around the first model's content filter and limits
```

### Tools

| Tool | What it is for |
|---|---|
| `wikipedia_search`, `wikipedia_page` | Main source. Official API, which does not block by volume |
| `web_search` | Finds what to read (Brave with `BRAVE_API_KEY`, otherwise DuckDuckGo) |
| `fetch_page` | Reads a page as text and keeps the tables |
| `read_task_file` | Text and code attachments; spreadsheets become CSV |
| `describe_image` | Questions about attached images |
| `transcribe_audio` | Questions about attached audio |
| `youtube_transcript` | Captions with timestamps |
| `run_python` | Arithmetic, counting and code from the question, in an isolated subprocess |

Grading is by exact string equality, so the format weighs as much as the research. The agent ends with `FINAL ANSWER: <value>` and `src/lib/answer.ts` extracts only the value, because the course forbids that marker in the submitted text.

## Configuration

| Variable | Required | Default |
|---|---|---|
| `OPENROUTER_API_KEY` | **yes** | none |
| `MODEL_ID` | no | `openrouter/google/gemini-3-flash-preview` |
| `FALLBACK_MODEL_ID` | no | `openrouter/qwen/qwen3-max` |
| `VISION_MODEL`, `AUDIO_MODEL` | no | `google/gemini-2.5-flash` |
| `BRAVE_API_KEY` | no | without it, search falls back to DuckDuckGo |
| `MAX_ITERATIONS` | no | `30` |
| `CONCURRENCY` | no | `3` |
| `BUDGET_LIMIT_USD` | no | `5` per hour |
| `HF_USERNAME`, `AGENT_CODE_URL` | only to submit | derived from `SPACE_ID` inside the Space |
| `RUN_TOKEN` | only for `/run` | without it the server starts read-only |

A full run costs about US$ 1 with the default model.

## Measuring before submitting

```bash
GROUND_TRUTH_PATH=<answer-key.jsonl> npm run score
```

This grades the answers locally and prints the percentage. Every submission shows up on the course's public leaderboard, so finding out the score only after publishing it is expensive.

The answer key is neither versioned nor read by the agent. It comes in through an environment variable, after the answers have been generated.

## What this project learned by getting it wrong

**An earlier run scored higher and was thrown away.** The agent reached the benchmark's answer key through the `shell` tool, which the runtime registers on every agent by default, with the reference file inside the working directory. The proof: the chess image question answered `Rd5` (correct) and started answering `Rh1+` (wrong) as soon as the access was blocked. The published score is lower and holds up.

**The prompt gave an answer away.** A formatting example used, without anyone noticing, the answer to one of the questions, and it was served to the model on every question. Today `src/prompts.ts` carries the rule that no example may match an answer from the evaluated set.

**The default iteration cap was the bottleneck.** The runtime truncates at 8 tool rounds. A GAIA question spends that just locating the source, and the run ended with no text and no readable error.

**Four questions cannot be answered.** The course API route `GET /files/{task_id}` returns 404 for every attachment, so image, audio, spreadsheet and code are out of reach. The real ceiling is 16, not 20.

## Security

The Python code the agent runs is written by the model from pages read on the web, which is untrusted input. It runs in a subprocess with a minimal environment (without the process's credentials), an output cap and a deadline that kills the process group.

URLs chosen by the model go through SSRF screening, which refuses private, loopback and link-local addresses. Unrestricted tools (`shell`, `memory_search`, `memory_get`) are denied by policy.

`/run` requires `RUN_TOKEN`: the route spends credit and publishes to the leaderboard, so it is disabled by default.

## Built with

**[LoopZero SDK](https://www.npmjs.com/package/@getloopscale/loopzero-sdk)**, a TypeScript SDK and agent runtime with 43 LLM providers on your own keys, MCP, subagents, workflows and an execution sandbox.

From the SDK this project uses `Agent.create` with its own tools, `Tool.create` with Zod schemas, `PermissionPlugin` to deny tools, `Retry.create` with jitter, `Budget` as a spending cap, and the ready-made tools of [`@getloopscale/loopzero-sdk-tools`](https://www.npmjs.com/package/@getloopscale/loopzero-sdk-tools): provider-agnostic search and fetch with SSRF screening.

The 55% was measured on an earlier version of the SDK. It has not been measured again since the move to `@getloopscale/loopzero-sdk` 0.1.0.

## Where the agent runs

The agent runs locally. The code is also published as a [Hugging Face Space](https://huggingface.co/spaces/paulohenriquevn/hf-agents-course-unit4-final), which is `static` because Spaces with Docker, needed for Node.js, require a paid plan.

The `Dockerfile` and the server (`src/server.ts`) are versioned and working. On an account with Docker enabled, a Space with `sdk: docker` and `app_port: 7860` runs the agent inside the Space.

## License

MIT. See [LICENSE](LICENSE). Third-party attributions are in [NOTICE](NOTICE).

The questions come from the [GAIA benchmark](https://huggingface.co/datasets/gaia-benchmark/GAIA) and belong to its authors. No answer key is redistributed here.
