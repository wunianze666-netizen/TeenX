import { ArenaModelError } from "./model-provider.js";
import { ArenaRepositoryError } from "./repository-error.js";
import { EvaluationContractError } from "./scoring-contract.js";
import { ArenaZipError } from "./zip-parser.js";

export interface PublicArenaFailure {
  code: string;
  message: string;
}

export function projectArenaRunFailure(error: unknown): PublicArenaFailure {
  if (error instanceof ArenaModelError) {
    if (error.code === "ARENA_MODEL_TIMEOUT") return { code: error.code, message: "评审模型等待超时，已安全停止" };
    if (error.code === "ARENA_MODEL_UNAVAILABLE") return { code: error.code, message: "评审服务暂时不可用" };
    return { code: error.code, message: "评审模型未能返回有效结果" };
  }
  if (error instanceof EvaluationContractError) {
    return { code: "ARENA_CONTRACT_FAILED", message: "评分结果未通过完整性校验，本次不生成成绩" };
  }
  if (error instanceof ArenaZipError || error instanceof ArenaRepositoryError) {
    return { code: "ARENA_SUBMISSION_INVALID", message: "提交包无法通过安全校验" };
  }
  return { code: "ARENA_EVALUATION_FAILED", message: "本次评审未能完成，请稍后重试" };
}
