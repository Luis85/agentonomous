/**
 * Versioned plain-JSON snapshot of a `TfjsReasoner`'s model — topology +
 * weights + shape manifest + optional column labels. The weight payload is
 * a base64 blob of concatenated `Float32Array`s; `weightsShapes` carries
 * one shape array per tensor so `decodeWeights` can re-slice them.
 *
 * Plain JSON so consumers can `JSON.stringify` it into localStorage without
 * touching tfjs's `tf.io.IOHandler` surface. `version: 1` is reserved for
 * future migration routing if the shape changes.
 *
 * @remarks
 * Encoded bytes preserve host-endian `Float32Array.buffer` layout. All
 * mainstream browsers and Node on every currently-shipping CPU run on
 * little-endian hardware, so round-trips work anywhere in practice; a
 * `TfjsSnapshot` authored on a big-endian machine would not decode
 * correctly on an LE consumer. Not a constraint we enforce; documented
 * here so future migration paths can add an explicit `endianness` field
 * if needed.
 */
export type TfjsSnapshot = {
  version: 1;
  topology: unknown;
  weights: string;
  weightsShapes: readonly (readonly number[])[];
  inputKeys?: readonly string[];
  outputKeys?: readonly string[];
};

/**
 * Concatenate the weight tensors into one base64-encoded `Float32Array`
 * byte payload. Callers round-trip it via `decodeWeights(payload, shapes)`
 * where `shapes` is the matching `weightsShapes` field.
 */
export function encodeWeights(weights: readonly Float32Array[]): string {
  let totalLength = 0;
  for (const w of weights) totalLength += w.length;
  const combined = new Float32Array(totalLength);
  let offset = 0;
  for (const w of weights) {
    combined.set(w, offset);
    offset += w.length;
  }
  const bytes = new Uint8Array(combined.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/**
 * Inverse of `encodeWeights`. `shapes` controls how the flat payload is
 * split: each entry's total element count is carved off the front of the
 * payload. Throws if the shape totals don't match the decoded length.
 */
export function decodeWeights(
  encoded: string,
  shapes: readonly (readonly number[])[],
): Float32Array[] {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const combined = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const result: Float32Array[] = [];
  let offset = 0;
  for (const shape of shapes) {
    const size = shape.reduce((acc, n) => acc * n, 1);
    if (offset + size > combined.length) {
      throw new Error(
        `TfjsSnapshot.decodeWeights: shape ${JSON.stringify(shape)} exceeds remaining payload ` +
          `(${combined.length - offset} floats left, ${size} needed)`,
      );
    }
    result.push(combined.slice(offset, offset + size));
    offset += size;
  }
  if (offset !== combined.length) {
    throw new Error(
      `TfjsSnapshot.decodeWeights: shapes total ${offset} floats but payload has ${combined.length}`,
    );
  }
  return result;
}
