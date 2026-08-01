import { HttpError } from "../../errors.js";
import { EvaluationContractError } from "./scoring-contract.js";
import { ArenaRepositoryError } from "./repository-error.js";
import { ArenaZipError } from "./zip-parser.js";

export function throwPublicArenaError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  if (error instanceof ArenaZipError) throw new HttpError(422, error.message, { code: error.code });
  if (error instanceof EvaluationContractError) {
    throw new HttpError(500, "评分结果暂时不可用", { code: "ARENA_RESULT_INVALID" });
  }
  if (error instanceof ArenaRepositoryError) {
    switch (error.code) {
      case "ARENA_RUN_NOT_FOUND":
        throw new HttpError(404, "评审不存在", { code: error.code });
      case "ARENA_SUBMISSION_NOT_FOUND":
        throw new HttpError(404, "提交不存在", { code: error.code });
      case "ARENA_TEAM_VERSION_NOT_FOUND":
        throw new HttpError(404, "队伍版本不存在", { code: error.code });
      case "ARENA_MODEL_UNAVAILABLE":
        throw new HttpError(503, "评审服务暂时不可用", { code: error.code });
      case "ARENA_CAPTAIN_RUN_LIMIT":
        throw new HttpError(409, "同一时间只能进行一场 Arena 评审", { code: error.code });
      case "ARENA_MODEL_MODE_CHANGED":
        throw new HttpError(409, "评审模式已变化，无法恢复本次评审", { code: error.code });
      case "ARENA_CHECKPOINT_MISSING":
        throw new HttpError(409, "评审进度暂时无法恢复", { code: error.code });
      case "ARENA_RUN_MISMATCH":
        throw new HttpError(409, "评审状态不一致", { code: error.code });
      case "ARENA_TEAM_REQUIRED":
        throw new HttpError(409, "请先创建队伍", { code: error.code });
      case "ARENA_INVALID_CHALLENGE":
        throw new HttpError(422, "赛题版本无效", { code: error.code });
      case "ARENA_SUBMISSION_INVALID":
        throw new HttpError(422, "提交无法通过安全校验", { code: error.code });
      case "ARENA_CHECKPOINT_INVALID":
        throw new HttpError(422, "评审进度无效", { code: error.code });
      case "ARENA_SCORE_MISSING":
        throw new HttpError(409, "评分结果尚未生成", { code: error.code });
      case "ARENA_STANDARD_INVALID":
        throw new HttpError(500, "评分标准暂时不可用", { code: error.code });
      case "ARENA_STORAGE_FAILED":
        throw new HttpError(500, "提交包保存失败", { code: error.code });
      case "ARENA_SCORECARD_FAILED":
        throw new HttpError(500, "成绩卡保存失败", { code: error.code });
      default:
        throw new HttpError(500, "Arena 服务暂时不可用", { code: "ARENA_INTERNAL_ERROR" });
    }
  }
  throw new HttpError(500, "Arena 服务暂时不可用", { code: "ARENA_INTERNAL_ERROR" });
}
