import Taro from "@tarojs/taro"
import { encodeWAV } from "../audioBufferToWav"
import Worker from '../web-worker/mediaSteamProcess.worker'

class RecorderSingleton implements Taro.RecorderManager {

  static recorder: RecorderSingleton

  DefaultOptions = {
    duration: 60000,
    sampleRate: 8000,
    numberOfChannels: 2,
    encodeBitRate: 48000,
    format: 'wav',
    frameSize: 4096,
    audioSource: 'auto'
  }

  leftDataList: Float32Array[] = []
  rightDataList: Float32Array[] = []
  monoDataList: Float32Array[] = []
  totalDuration: number = 0

  /**
   * By default, exports with 16-bit PCM (format: 1). 
   * Will be provided later write format 3 with 32-bit float data.
   * var format = float32 ? 3 : 1
   * 
   * 2021-08-16 by @hanhuipeng
   */
  format: number = 1

  mediaStream: MediaStream
  mediaStreamAudioSourceNode: MediaStreamAudioSourceNode
  scriptProcessorNode: ScriptProcessorNode
  option: Taro.RecorderManager.StartOption
  defaultOption: Taro.RecorderManager.StartOption
  startCallback: (res: Taro.General.CallbackResult) => void
  frameRecordedCallback: Taro.RecorderManager.OnFrameRecordedCallback
  stopCallback: Taro.RecorderManager.OnStopCallback
  currentRecorderSampleRate: number

  isStartRecording = false

  SelfAudioContext = window.AudioContext || window.webkitAudioContext

  dataProcessWorker: Worker = new Worker()

  constructor() {
    this.dataProcessWorker.addEventListener('message', this.mediaSteamDataProcessObserve.bind(this))
  }

  /**
   * 
   * audioSource 指定录音的音频输入源，可通过 window.navigator.mediaDevices.enumerateDevices() 获取当前可用的音频源
   * duration 录音的时长，单位 ms，最大值 600000（10 分钟)
   * encodeBitRate 编码码率 H5端暂不支持
   * format 音频格式  H5端暂不支持，默认wav
   * frameSize 指定帧大小，单位 KB。传入 frameSize 后，每录制指定帧大小的内容后，会回调录制的文件内容，不指定则不会回调。 H5端暂时支持 256, 512, 1024, 2048, 4096, 8192, 16384
   * numberOfChannels 录音通道数
   * sampleRate 采样率
   * 
   * 2021-08-16 by @hanhuipeng
   * 
   * window.navigator.mediaDevices.getUserMedia({audio: options})
   * The sample rate of the AudioContext is set by the browser/device and there is nothing you can do to change it. 
   * 2021-09-09 by @hanhuipeng
   * 
   */
  async start(option: Taro.RecorderManager.StartOption) {
    this.option = option
    const defaultOption = Object.assign(this.DefaultOptions, option)
    this.defaultOption = defaultOption
    const options = {
      deviceId: defaultOption.audioSource === 'auto' ? undefined : defaultOption.audioSource,
      sampleRate: defaultOption.sampleRate,
      channelCount: defaultOption.numberOfChannels
    }
    console.log(options)
    this.resetInitData()
    try {
      this.mediaStream = (await window.navigator.mediaDevices.getUserMedia({ audio: options || true }))
      const audioContext = new this.SelfAudioContext();
      this.mediaStreamAudioSourceNode = audioContext.createMediaStreamSource(this.mediaStream as MediaStream);
      this.scriptProcessorNode = this.createJSNode(audioContext, defaultOption.frameSize, defaultOption.numberOfChannels, defaultOption.numberOfChannels)
      this.scriptProcessorNode.connect(audioContext.destination);
      this.scriptProcessorNode.onaudioprocess = this.onAudioProcess;
      this.mediaStreamAudioSourceNode.connect(this.scriptProcessorNode);
      this.isStartRecording = true
      this.startCallback && this.startCallback({ errMsg: 'record is start!' })
    } catch (error) {
      this.startCallback && this.startCallback({ errMsg: error })
    }
  }

  pause(): void {
    throw new Error("Method not implemented.")
  }

  resume(): void {
    throw new Error("Method not implemented.")
  }

  stop(): void {
    if (!this.isStartRecording) return
    console.log(this.monoDataList)
    this.mediaStream?.getAudioTracks()[0].stop();
    this.mediaStreamAudioSourceNode?.disconnect();
    this.scriptProcessorNode?.disconnect();
    const allData: Float32Array = this.getChannelData()
    const bitDepth = this.format === 3 ? 32 : 16
    const wavBuffer: ArrayBuffer = encodeWAV(allData, this.format, this.currentRecorderSampleRate, this.defaultOption.numberOfChannels!, bitDepth)
    this.stopCallback && this.stopCallback({ duration: this.totalDuration, fileSize: wavBuffer.byteLength, tempFilePath: this.arrayBufferToBase64(wavBuffer) })
  }

  resetInitData() {
    this.totalDuration = 0
    this.leftDataList = []
    this.rightDataList = []
    this.monoDataList = []
  }

  mergeArray = (list: Float32Array[]): Float32Array => {
    let length = list.length * list[0]?.length || 0;
    let data = new Float32Array(length),
      offset = 0;
    for (let i = 0; i < list.length; i++) {
      data.set(list[i], offset);
      offset += list[i].length;
    }
    return data;
  }

  interleaveLeftAndRight = (left: Float32Array, right: Float32Array): Float32Array => {
    let totalLength = left.length + right.length;
    let data = new Float32Array(totalLength);
    for (let i = 0; i < left.length; i++) {
      let k = i * 2;
      data[k] = left[i];
      data[k + 1] = right[i];
    }
    return data;
  }

  setChannelData(audioBuffer: AudioBuffer) {
    if (this.defaultOption.numberOfChannels === 2) {
      let leftChannelData = audioBuffer.getChannelData(0),
        rightChannelData = audioBuffer.getChannelData(1);

      this.leftDataList.push(leftChannelData.slice(0));
      this.rightDataList.push(rightChannelData.slice(0));
    } else {
      this.monoDataList.push(audioBuffer.getChannelData(0).slice(0))
    }
  }

  getChannelData() {
    if (this.defaultOption.numberOfChannels === 2) {
      return this.interleaveLeftAndRight(this.mergeArray(this.leftDataList), this.mergeArray(this.rightDataList))
    } else {
      return this.mergeArray(this.monoDataList)
    }
  }

  setTotalDuration(duration: number) {
    this.totalDuration += duration
  }

  onAudioProcess = (event: AudioProcessingEvent) => {
    const audioBuffer = event.inputBuffer;
    this.currentRecorderSampleRate = audioBuffer.sampleRate

    this.setChannelData(audioBuffer)
    this.setTotalDuration(audioBuffer.duration)
    console.log(audioBuffer.getChannelData(0))

    if (Object.prototype.hasOwnProperty.call(this.option, 'frameSize')) {
      this.dataProcessWorker.postMessage({ float32Array: this.defaultOption.numberOfChannels === 2 ? this.interleaveLeftAndRight(audioBuffer.getChannelData(0), audioBuffer.getChannelData(1)) : audioBuffer.getChannelData(0), newSampleRate: this.defaultOption.sampleRate, oldSampleRate: audioBuffer.sampleRate })
    }
  }

  mediaSteamDataProcessObserve(event: MessageEvent) {
    this.frameRecordedCallback && this.frameRecordedCallback({ frameBuffer: event.data.buffer, isLastFrame: false })
  }

  createJSNode(audioContext: AudioContext, bufferSize: number, numberOfInputChannels: number, numberOfOutputChannels: number) {
    let creator = audioContext.createScriptProcessor;
    creator = creator.bind(audioContext);
    return creator(bufferSize, numberOfInputChannels, numberOfOutputChannels);
  }

  arrayBufferToBase64(arrayBuffer: ArrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(arrayBuffer);
    let len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:audio/${this.defaultOption.format};base64,${window.btoa(binary)}`;
  }

  getBlobUrl(arrayBuffer: ArrayBuffer) {
    let blob = new Blob([new Uint8Array(arrayBuffer)], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  onError(callback: Taro.RecorderManager.OnErrorCallback): void {
    throw new Error("Method not implemented.")
  }

  onFrameRecorded(callback: Taro.RecorderManager.OnFrameRecordedCallback): void {
    this.frameRecordedCallback = callback
  }

  onInterruptionBegin(callback: (res: Taro.General.CallbackResult) => void): void {
    throw new Error("Method not implemented.")
  }

  onInterruptionEnd(callback: (res: Taro.General.CallbackResult) => void): void {
    throw new Error("Method not implemented.")
  }

  onPause(callback: (res: Taro.General.CallbackResult) => void): void {
    throw new Error("Method not implemented.")
  }

  onResume(callback: (res: Taro.General.CallbackResult) => void): void {
    throw new Error("Method not implemented.")
  }

  onStart(callback: (res: Taro.General.CallbackResult) => void): void {
    this.startCallback = callback
  }

  onStop(callback: Taro.RecorderManager.OnStopCallback): void {
    this.stopCallback = callback
  }

  static getRecorderSingleton() {
    if (!this.recorder) {
      this.recorder = new RecorderSingleton()
    }
    return this.recorder
  }
}

export default RecorderSingleton.getRecorderSingleton()