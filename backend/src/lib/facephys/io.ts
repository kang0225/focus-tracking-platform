import fs from 'node:fs';
import zlib from 'node:zlib';
import { parseStateJson, type FacePhysState } from './state';

export function loadStateGzip(path: string): FacePhysState {
  const text = zlib.gunzipSync(fs.readFileSync(path)).toString('utf8');
  return parseStateJson(text);
}
