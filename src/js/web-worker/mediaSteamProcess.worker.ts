function interpolateArray(data: Float32Array, newSampleRate: number, oldSampleRate: number) {
  const fitCount = Math.round(data.length * (newSampleRate / oldSampleRate));
  const newData = new Float32Array(fitCount);
  const springFactor = (data.length - 1) / (fitCount - 1)
  newData[0] = data[0];
  for (let i = 1; i < fitCount - 1; i++) {
    const tmp = i * springFactor;
    const before = Math.floor(tmp);
    const after = Math.ceil(tmp);
    const atPoint = tmp - before;
    newData[i] = linearInterpolate(data[before], data[after], atPoint);
  }
  newData[fitCount - 1] = data[data.length - 1];
  return newData;
}

function linearInterpolate(before, after, atPoint) {
  return before + (after - before) * atPoint;
}

function floatTo16BitPCM(data: Float32Array): Int16Array {
  let length = data.length;
  let result = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    let item = Math.max(-1, Math.min(1, data[i]));
    item = item < 0 ? item * 0x8000 : item * 0x7FFF;
    result[i] = item;
  };
  return result
}

const ctx: Worker = self as any;

ctx.addEventListener('message', event => {
  const float32Array = event.data.float32Array
  const newSampleRate = event.data.newSampleRate
  const oldSampleRate = event.data.oldSampleRate
  const newSampleRateBuffer = interpolateArray(float32Array, newSampleRate, oldSampleRate)
  const int16PCMBuffer = floatTo16BitPCM(newSampleRateBuffer)
  ctx.postMessage(int16PCMBuffer)
})