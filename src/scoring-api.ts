/**
 * Cliente da API de avaliação da Unit 4 do Hugging Face Agents Course.
 * Documentação viva: https://agents-course-unit4-scoring.hf.space/docs
 */

import { request as httpRequest } from "./lib/http.ts";

const DEFAULT_BASE_URL = "https://agents-course-unit4-scoring.hf.space";

export interface GaiaQuestion {
  task_id: string;
  question: string;
  Level: string;
  /** Nome do anexo, ou string vazia quando a questão não tem arquivo. */
  file_name: string;
}

export interface SubmittedAnswer {
  task_id: string;
  submitted_answer: string;
}

export interface SubmissionRequest {
  username: string;
  agent_code: string;
  answers: SubmittedAnswer[];
}

export interface SubmissionResult {
  username: string;
  score: number;
  correct_count: number;
  total_attempted: number;
  message: string;
  timestamp: string;
}

/** Falha ao conversar com a API de avaliação. Carrega status e corpo para diagnóstico. */
export class ScoringApiError extends Error {
  readonly route: string;
  readonly status: number;
  readonly body: string;

  constructor(route: string, status: number, body: string) {
    super(`${route} respondeu ${status}: ${body.slice(0, 500)}`);
    this.name = "ScoringApiError";
    this.route = route;
    this.status = status;
    this.body = body;
  }
}

/**
 * O que as ferramentas de anexo realmente precisam.
 *
 * Elas usavam a classe concreta inteira para chamar UM método, e o campo privado tornava
 * o tipo nominal: um dublê estrutural nem compilava (`TS2739: missing baseUrl, getJson`).
 * Era por isso que nenhuma delas tinha teste — o design impedia, não o esquecimento.
 */
export interface TaskFileSource {
  fetchTaskFile(taskId: string): Promise<{ bytes: Uint8Array; contentType: string }>;
}

export class ScoringApi implements TaskFileSource {
  private readonly baseUrl: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /** Lista as 20 questões filtradas da avaliação. */
  async fetchQuestions(): Promise<GaiaQuestion[]> {
    const questions = await this.getJson<GaiaQuestion[]>("/questions");
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new ScoringApiError("/questions", 200, "lista de questões vazia ou malformada");
    }
    return questions;
  }

  /** Baixa o anexo de uma questão como bytes crus. */
  async fetchTaskFile(taskId: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const route = `/files/${taskId}`;
    const response = await httpRequest(`${this.baseUrl}${route}`, { trustedHost: true, timeoutMs: 60_000 });
    if (!response.ok) {
      throw new ScoringApiError(route, response.status, await response.text());
    }
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  /** Envia as respostas para pontuação. Atualiza o leaderboard do curso. */
  async submit(submission: SubmissionRequest): Promise<SubmissionResult> {
    const route = "/submit";
    const response = await httpRequest(`${this.baseUrl}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(submission),
      trustedHost: true,
      timeoutMs: 120_000,
    });
    const body = await response.text();
    if (!response.ok) {
      throw new ScoringApiError(route, response.status, body);
    }
    return JSON.parse(body) as SubmissionResult;
  }

  private async getJson<T>(route: string): Promise<T> {
    const response = await httpRequest(`${this.baseUrl}${route}`, { trustedHost: true, timeoutMs: 60_000 });
    const body = await response.text();
    if (!response.ok) {
      throw new ScoringApiError(route, response.status, body);
    }
    return JSON.parse(body) as T;
  }
}
