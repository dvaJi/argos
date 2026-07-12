import { MetricType } from "@argos/shared/presenter";

export const EMBEDDING_TEST_KEY = "sample";

/**
 * Calculate L2 norm (Euclidean norm) of the vector
 * @param vector Input vector
 * @returns
 */
function calcNorm(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
}

/**
 * Determine whether a vector is normalized (L2 norm ≈ 1)
 * @param vector Input vector
 * @param tolerance Floating-point error tolerance, default 1e-3
 * @returns true indicates the vector is normalized
 */
export function isNormalized(vector: number[], tolerance = 1e-3): boolean {
  if (!vector || !Array.isArray(vector) || vector.length === 0) return false;
  if (tolerance < 0) throw new Error("Tolerance must be non-negative");
  if (vector.some((v) => typeof v !== "number" || !isFinite(v))) return false;

  const norm = calcNorm(vector);
  return Math.abs(norm - 1) <= tolerance;
}
/**
 * Normalize a vector
 * @param vector Input vector
 * @returns Normalized vector
 */
export function normalized(vector: number[]): number[] {
  if (!vector || !Array.isArray(vector) || vector.length === 0) {
    throw new Error("Vector cannot be empty");
  }
  const norm = calcNorm(vector);
  if (norm === 0) {
    throw new Error("Cannot normalize zero vector");
  }
  return vector.map((v) => v / norm);
}
/**
 * Always returns a normalized vector
 * @param vector Input vector
 * @param tolerance Floating-point error tolerance, default 1e-3
 * @returns Normalized vector
 * @description Since vector length carries meaning in multimodal (and some RAG) applications, embedding results are not force-normalized; call this explicitly if needed
 */
export function ensureNormalized(vector: number[], tolerance = 1e-3): number[] {
  if (!vector || !Array.isArray(vector) || vector.length === 0) {
    throw new Error("Vector cannot be empty");
  }
  if (tolerance < 0) throw new Error("Tolerance must be non-negative");
  const norm = calcNorm(vector);
  if (norm === 0) {
    throw new Error("Cannot normalize zero vector");
  }
  if (Math.abs(norm - 1) <= tolerance) {
    return vector;
  }
  return vector.map((v) => v / norm);
}

/**
 * Normalize distance returned by similarityQuery into [0,1] confidence
 * @param distance Raw distance
 * @param metric 'cosine' | 'ip'
 * @returns Confidence value in range 0~1
 */
export function normalizeDistance(distance: number, metric: MetricType): number {
  if (metric === "cosine") {
    // cosine distance ∈ [0,1]; 0 means more similar, 1 means less similar
    // confidence = 1 - distance
    const clipped = Math.min(Math.max(distance, 0), 1);
    return 1 - clipped;
  } else if (metric === "ip") {
    // ip distance = -inner_product; may be negative
    // distance < 0 → vector angle < 90°, high similarity
    // distance = 0 → vectors orthogonal, no similarity
    // distance > 0 → vector angle > 90°, opposite directions
    //
    // Use sigmoid to map it to (0,1)
    // Here distance * k adjusts sigmoid steepness; tune scaling factor k based on experience and requirements
    // k = 0.1 → smoother sigmoid
    // k = 0.5 → steeper sigmoid
    const k = 0.04;
    const sigmoid = 1 / (1 + Math.exp(Math.sign(distance) * Math.pow(distance, 2) * k));
    return sigmoid;
  } else {
    throw new Error(`Unsupported metric: ${metric}`);
  }
}

/**
 * Get similarity metric type
 * @param normalized Whether already normalized
 * @returns Similarity metric type
 */
export function getMetric(normalized: boolean): MetricType {
  return normalized ? "cosine" : "ip";
}
