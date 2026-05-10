export interface FacePhysStateValue {
  data: Float32Array;
  dims: number[];
}

export type FacePhysState = Record<string, FacePhysStateValue>;

function isPlainTensorLike(value: unknown): value is { data: ArrayLike<number>; dims?: number[]; shape?: number[] } {
  return !!value
    && typeof value === 'object'
    && 'data' in value
    && (Array.isArray((value as { dims?: unknown }).dims) || Array.isArray((value as { shape?: unknown }).shape));
}

export function shapeOfNestedArray(value: unknown): number[] {
  const shape: number[] = [];
  let cursor = value;
  while (Array.isArray(cursor)) {
    shape.push(cursor.length);
    cursor = cursor[0];
  }
  return shape;
}

export function sizeOfShape(shape: number[]): number {
  return shape.reduce((acc, dim) => acc * Number(dim), 1);
}

function fillNestedArray(value: unknown, output: Float32Array, indexRef: { index: number }) {
  if (Array.isArray(value)) {
    for (const item of value) fillNestedArray(item, output, indexRef);
    return;
  }
  output[indexRef.index] = Number(value);
  indexRef.index += 1;
}

export function flattenNestedArray(value: unknown, shape = shapeOfNestedArray(value)): Float32Array {
  const output = new Float32Array(sizeOfShape(shape));
  fillNestedArray(value, output, { index: 0 });
  return output;
}

export function toStateValue(value: unknown): FacePhysStateValue {
  if (isPlainTensorLike(value)) {
    const dims = [...(value.dims ?? value.shape ?? [])].map(Number);
    const data = value.data instanceof Float32Array ? value.data : Float32Array.from(value.data);
    return { data, dims };
  }

  const dims = shapeOfNestedArray(value);
  return { data: flattenNestedArray(value, dims), dims };
}

export function normalizeState(state: Record<string, unknown>): FacePhysState {
  const normalized: FacePhysState = {};
  for (const [name, value] of Object.entries(state)) {
    normalized[name] = toStateValue(value);
  }
  return normalized;
}

export function parseStateJson(text: string): FacePhysState {
  return normalizeState(JSON.parse(text) as Record<string, unknown>);
}

export function cloneState(state: FacePhysState): FacePhysState {
  const cloned: FacePhysState = {};
  for (const [name, value] of Object.entries(state)) {
    cloned[name] = {
      data: new Float32Array(value.data),
      dims: [...value.dims],
    };
  }
  return cloned;
}
