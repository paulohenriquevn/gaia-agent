// Baseado no config provisionado por review-cycle quality_gates.py — rigor máximo. Tighten-only.
//
// Acréscimo: o config original não registrava parser de TypeScript, então `eslint src/**/*.ts`
// abortava com "all files are ignored" e o gate passava sem analisar uma única linha do projeto,
// que é inteiramente TypeScript. Um gate verde que não roda é pior que um vermelho.
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "modelo/**", "public/**"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      // O projeto roda em Node; sem isto todo `process`/`fetch`/`Buffer` vira no-undef.
      globals: { ...globals.node },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      // `no-unused-vars` do core não entende sintaxe de tipo e acusa nomes de parâmetro
      // em anotações de função. A versão do plugin entende.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",

      // Desligado apenas para TypeScript, conforme recomendação do typescript-eslint: o
      // compilador já resolve identificadores, e a regra do ESLint não enxerga namespaces
      // de tipo globais (`NodeJS.ProcessEnv`), acusando-os como indefinidos.
      "no-undef": "off",
      "no-eval": "error",
      "no-implied-eval": "error",
      eqeqeq: "error",
      "no-cond-assign": "error",
      "no-dupe-keys": "error",
      "no-constant-condition": "error",
      "no-self-compare": "error",
      "no-var": "error",
      "prefer-const": "error",
      complexity: ["error", 10],
      "max-lines-per-function": ["error", { max: 50, skipBlankLines: true, skipComments: true }],
      "max-params": ["error", 6],
      "max-depth": ["error", 4],
    },
  },
];
