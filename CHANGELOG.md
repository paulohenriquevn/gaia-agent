# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/) · [Semantic Versioning](https://semver.org/)

## [Unreleased]

### Changed
- The agent now runs on `@getloopscale/loopzero-sdk` and `@getloopscale/loopzero-sdk-tools` 0.1.0. The runtime state directory is `.loopzero/`, and the SDK reads `LOOPZERO_API_KEY` where it used to read its previous variable. The 55% score was measured before this change and has not been measured again. (#3)

### Added
- Agente para o desafio final (Unit 4) do Agents Course, construído com `@getloopscale/loopzero-sdk`
- Ferramentas de pesquisa: busca na web e leitura de páginas com tabelas preservadas
- Ferramentas de anexo: leitura de planilhas e código, descrição de imagens e transcrição de áudio
- Ferramenta de execução de Python com timeout rígido, para cálculos e código do benchmark
- Interface web com progresso em tempo real e submissão para a API de avaliação do curso
- Empacotamento como Hugging Face Space via Docker
- Página de apresentação (`index.html`) publicada como Hugging Face Space estático

### Changed
- Space passa a usar SDK `static` em vez de `docker`: SDK Docker exige plano pago na
- Fallback automático de modelo quando o primário devolve resposta vazia por filtro
- Teste de fumaça (`npm run smoke`) que responde uma questão de ponta a ponta

### Fixed
- Agente não subia por falta de chave: o SDK resolve `apiKey` do campo explícito ou de
- Descarte do agente com `try/finally` em vez de `await using`, não suportado no Node 22
- Ferramentas `wikipedia_search` e `wikipedia_page` usando a API oficial da Wikipedia,
- Retry com backoff exponencial na busca web, com endpoint alternativo
- Busca web derrubava a questão inteira ao receber 403 por volume de consultas
- Fallback de modelo passa a cobrir também runs que terminam em erro, não só respostas vazias
- Benchmark local (`npm run score`) que corrige as respostas contra um gabarito antes
- Classificação de falha do provider: crédito esgotado e chave inválida abortam a
- Causa real do erro do provider agora é capturada do evento de status; antes a
- Teto de iterações por questão configurável (`MAX_ITERATIONS`, padrão 30); o padrão do
- Verificação de disponibilidade das fontes no início da rodada: ferramenta de fonte
- `web_search` passa a ser a ferramenta de `@getloopscale/loopzero-sdk-tools`, com backend injetado
- Ferramenta que lançava exceção derrubava o run inteiro após poucas falhas; agora toda
- Runs truncados no teto de iterações são sinalizados em vez de virarem resposta vazia
- Segredos do processo deixam de ser expostos ao código Python executado pelo agente,
  que é escrito pelo modelo a partir de páginas lidas na web
- Leitura de página passa a recusar endereços internos, de loopback e link-local
- Toda chamada de rede ganha prazo; antes uma requisição podia prender um worker
- Prazo do subprocesso Python passa a encerrar o grupo de processos e a resolver sempre
- Resposta final passa a usar o último marcador; com o primeiro, um modelo que se
  corrigia tinha o rascunho descartado submetido
- Normalização da resposta e correção local passam a compartilhar a mesma regra, que
  havia divergido e inflava o score estimado
- `/run` passa a exigir token; antes gastava crédito e publicava sem autenticação
- Servidor deixa de ficar preso em 409 quando o cliente aborta a execução
- Servidor passa a sondar as fontes, como os demais entrypoints
- Falha fatal preserva as respostas já obtidas em vez de descartar a rodada inteira
- Ferramentas de acesso irrestrito (`shell`, `memory_search`, `memory_get`) negadas via
  `PermissionPlugin` do SDK: o runtime local as registra em todo agente, mesmo quando o
  consumidor passa apenas ferramentas próprias
