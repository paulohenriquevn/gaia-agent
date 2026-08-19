# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/) · [Semantic Versioning](https://semver.org/)

## [Unreleased]

### Added
- Agente para o desafio final (Unit 4) do Agents Course, construído com `@theokit/sdk`
- Ferramentas de pesquisa: busca na web e leitura de páginas com tabelas preservadas
- Ferramentas de anexo: leitura de planilhas e código, descrição de imagens e transcrição de áudio
- Ferramenta de execução de Python com timeout rígido, para cálculos e código do benchmark
- Interface web com progresso em tempo real e submissão para a API de avaliação do curso
- Empacotamento como Hugging Face Space via Docker
- Página de apresentação (`index.html`) publicada como Hugging Face Space estático

### Changed
- Space passa a usar SDK `static` em vez de `docker`: SDK Docker exige plano pago na
  conta que hospeda o projeto, então o agente executa localmente e o Space publica o código
- Fallback automático de modelo quando o primário devolve resposta vazia por filtro
  de conteúdo do provider (enunciados como texto invertido disparam o filtro)
- Teste de fumaça (`npm run smoke`) que responde uma questão de ponta a ponta

### Fixed
- Agente não subia por falta de chave: o SDK resolve `apiKey` do campo explícito ou de
  `THEOKIT_API_KEY`, nunca das provider keys — a chave do OpenRouter passa explicitamente
- Descarte do agente com `try/finally` em vez de `await using`, não suportado no Node 22
- Ferramentas `wikipedia_search` e `wikipedia_page` usando a API oficial da Wikipedia,
  que não bloqueia por volume como os buscadores gerais
- Retry com backoff exponencial na busca web, com endpoint alternativo

### Fixed
- Busca web derrubava a questão inteira ao receber 403 por volume de consultas
- Fallback de modelo passa a cobrir também runs que terminam em erro, não só respostas vazias
