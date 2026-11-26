import { feedbackRules } from '../data/race.js';

export function createRaceFeedbackStats() {
  return {
    draftingMs: 0,
    looseSurfaceMs: 0,
    headwindLoad: 0,
    collisionCount: 0,
  };
}

export function summarizeRaceFeedback(stats = {}, cornerScores = [], referenceCorners = []) {
  const draftingMs = Math.max(0, Number(stats.draftingMs) || 0);
  const looseSurfaceMs = Math.max(0, Number(stats.looseSurfaceMs) || 0);
  const headwindLoad = Math.max(0, Number(stats.headwindLoad) || 0);
  const collisionCount = Math.max(0, Number(stats.collisionCount) || 0);
  const cornerLossMs = cornerScores.reduce((total, score, index) => {
    const target = referenceCorners[index];
    const delta = score?.duration != null && target?.duration != null ? score.duration - target.duration : 0;
    return total + Math.max(0, delta);
  }, 0);
  const draftBenefitMs = draftingMs * feedbackRules.draftingBenefit;
  const surfaceLossMs = looseSurfaceMs * feedbackRules.looseSurfaceLoss;
  const windImpactMs = headwindLoad * feedbackRules.headwindLoss;
  const trafficLossMs = collisionCount * feedbackRules.collisionLossMs;
  return {
    draftingMs,
    draftBenefitMs,
    looseSurfaceMs,
    surfaceLossMs,
    headwindLoad,
    windImpactMs,
    collisionCount,
    trafficLossMs,
    cornerLossMs,
    highlights: [
      draftBenefitMs > 40 ? `尾流节省 ${(draftBenefitMs / 1000).toFixed(1)} 秒` : '',
      trafficLossMs > 0 ? `车流损失 ${(trafficLossMs / 1000).toFixed(1)} 秒` : '',
      windImpactMs > 40 ? `逆风影响 ${(windImpactMs / 1000).toFixed(1)} 秒` : '',
      surfaceLossMs > 40 ? `非铺装路面 ${(surfaceLossMs / 1000).toFixed(1)} 秒` : '',
      cornerLossMs > 40 ? `弯道损失 ${(cornerLossMs / 1000).toFixed(1)} 秒` : '',
    ].filter(Boolean),
  };
}
