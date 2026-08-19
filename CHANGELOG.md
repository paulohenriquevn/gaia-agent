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
