import { flattenNestedArray, shapeOfNestedArray, type FacePhysState } from './state';

const STATE_INPUT_RE = /^state_in_(\d+)$/;
const STATE_OUTPUT_RE = /^Identity_(\d+):0$/;

type OrtTensor = {
  type?: string;
  data: ArrayLike<number>;
  dims: number[];
};

type OrtRuntime = {
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => OrtTensor;
};

type OrtSession = {
  inputNames?: string[];
  outputNames?: string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
};

type TensorInput = Float32Array | ArrayLike<number> | {
  data: ArrayLike<number>;
  dims?: number[];
  shape?: number[];
};

export interface FacePhysFrameInput {
  data: ArrayLike<number>;
  dims?: number[];
  shape?: number[];
}

function byCapturedNumber(regex: RegExp) {
  return (left: string, right: string) => Number(regex.exec(left)?.[1] ?? 0) - Number(regex.exec(right)?.[1] ?? 0);
}

function isTensorLike(value: unknown): value is OrtTensor {
  return !!value
    && typeof value === 'object'
    && 'data' in value
    && Array.isArray((value as { dims?: unknown }).dims)
    && 'type' in value;
}

function toFloat32Array(value: ArrayLike<number> | ArrayBufferView): Float32Array {
  if (value instanceof Float32Array) return value;
  if (ArrayBuffer.isView(value)) return Float32Array.from(value as unknown as ArrayLike<number>);
  if (typeof value === 'object' && typeof value.length === 'number') return Float32Array.from(value);
  throw new TypeError('Expected Float32Array, TypedArray, or number array.');
}

function asShape(value?: unknown, fallback?: unknown): number[] | undefined {
  if (Array.isArray(value)) return value.map(Number);
  if (Array.isArray(fallback)) return fallback.map(Number);
  return undefined;
}

export class FacePhysOnnx {
  session: OrtSession;
  ort: OrtRuntime;
  imageInputName: string;
  dtInputName: string;
  outputName: string;
  stateInputNames: string[];
  stateOutputNames: string[];

  constructor(session: OrtSession, ortRuntime: OrtRuntime, names: Partial<{
    imageInputName: string;
    dtInputName: string;
    outputName: string;
    stateInputNames: string[];
    stateOutputNames: string[];
  }> = {}) {
    if (!session) throw new Error('FacePhysOnnx requires an ONNX Runtime InferenceSession.');
    if (!ortRuntime?.Tensor) throw new Error('FacePhysOnnx requires an ONNX Runtime object with Tensor constructor.');

    this.session = session;
    this.ort = ortRuntime;

    const inputNames = [...(session.inputNames ?? [])];
    const outputNames = [...(session.outputNames ?? [])];

    this.imageInputName = names.imageInputName ?? (inputNames.includes('input') ? 'input' : inputNames[0]);
    this.dtInputName = names.dtInputName ?? (inputNames.includes('dt') ? 'dt' : inputNames[1]);
    this.outputName = names.outputName ?? (outputNames.includes('Identity:0')
      ? 'Identity:0'
      : outputNames.find((name) => !STATE_OUTPUT_RE.test(name)) ?? outputNames[0]);

    this.stateInputNames = names.stateInputNames ?? inputNames.filter((name) => STATE_INPUT_RE.test(name)).sort(byCapturedNumber(STATE_INPUT_RE));
    this.stateOutputNames = names.stateOutputNames ?? outputNames.filter((name) => STATE_OUTPUT_RE.test(name)).sort(byCapturedNumber(STATE_OUTPUT_RE));

    if (this.stateOutputNames.length === 0) {
      this.stateOutputNames = outputNames.filter((name) => name !== this.outputName);
    }

    if (this.stateInputNames.length !== this.stateOutputNames.length) {
      throw new Error(`State input/output count mismatch: ${this.stateInputNames.length} inputs, ${this.stateOutputNames.length} outputs.`);
    }
  }

  tensorFromValue(value: TensorInput | OrtTensor, fallbackDims?: number[]): OrtTensor {
    if (isTensorLike(value)) return value;

    if (value && typeof value === 'object' && 'data' in value) {
      const tensorValue = value as { data: ArrayLike<number>; dims?: number[]; shape?: number[] };
      const dims = asShape(tensorValue.dims ?? tensorValue.shape, fallbackDims);
      if (!dims) throw new Error('Tensor-like value is missing dims/shape.');
      return new this.ort.Tensor('float32', toFloat32Array(tensorValue.data), dims);
    }

    if (Array.isArray(value)) {
      const dims = shapeOfNestedArray(value);
      return new this.ort.Tensor('float32', flattenNestedArray(value, dims), dims);
    }

    if (!fallbackDims) throw new Error('Raw tensor input requires fallback dimensions.');
    return new this.ort.Tensor('float32', toFloat32Array(value as ArrayLike<number>), fallbackDims);
  }

  imageTensor(frame: FacePhysFrameInput | OrtTensor, dims?: number[]): OrtTensor {
    if (isTensorLike(frame)) return frame;

    const data = frame && typeof frame === 'object' && 'data' in frame
      ? toFloat32Array(frame.data)
      : toFloat32Array(frame as unknown as ArrayLike<number>);
    const shape = asShape((frame as { dims?: number[]; shape?: number[] })?.dims ?? (frame as { dims?: number[]; shape?: number[] })?.shape, dims);
    if (!shape) throw new Error('Frame input requires dims/shape.');

    let tensorDims: number[];
    if (shape.length === 5) tensorDims = shape;
    else if (shape.length === 4) tensorDims = [1, ...shape];
    else if (shape.length === 3) tensorDims = [1, 1, ...shape];
    else throw new Error(`Expected frame shape [H,W,C], [T,H,W,C], or [B,T,H,W,C]; received [${shape.join(', ')}].`);

    return new this.ort.Tensor('float32', data, tensorDims);
  }

  buildFeeds(frame: FacePhysFrameInput, state: FacePhysState, dt: number): Record<string, OrtTensor> {
    if (!state) throw new Error('State is required. Load weights/state.gz first.');

    const feeds: Record<string, OrtTensor> = {
      [this.imageInputName]: this.imageTensor(frame),
      [this.dtInputName]: new this.ort.Tensor('float32', Float32Array.of(Number(dt)), [1]),
    };

    for (const name of this.stateInputNames) {
      if (!(name in state)) throw new Error(`State is missing '${name}'.`);
      feeds[name] = this.tensorFromValue(state[name]);
    }

    return feeds;
  }

  async runFrame(frame: FacePhysFrameInput, state: FacePhysState, { dt = 1 / 30 } = {}) {
    const outputs = await this.session.run(this.buildFeeds(frame, state, dt));
    const bvpTensor = outputs[this.outputName] ?? outputs[Object.keys(outputs)[0]];
    if (!bvpTensor?.data) throw new Error(`Model output '${this.outputName}' was not returned.`);

    const nextState: FacePhysState = {};
    for (let i = 0; i < this.stateInputNames.length; i += 1) {
      const outName = this.stateOutputNames[i];
      const tensor = outputs[outName];
      if (!tensor) throw new Error(`Model state output '${outName}' was not returned.`);
      nextState[this.stateInputNames[i]] = {
        data: tensor.data instanceof Float32Array ? tensor.data : Float32Array.from(tensor.data),
        dims: [...tensor.dims].map(Number),
      };
    }

    return { value: Number(bvpTensor.data[0]), state: nextState, outputs };
  }
}
