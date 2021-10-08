import { Button, View } from '@tarojs/components'
import { Component } from 'react'
import recorderManager from '../../js/recorder/get_recorder_manager'
import './index.scss'

export default class Index extends Component {

  state = {
    recorderAudioSrc: ''
  }

  componentWillMount() { }

  componentDidMount() { }

  componentWillUnmount() { }

  componentDidShow() { }

  componentDidHide() { }

  startRecord() {
    recorderManager.onStart((res) => {
      console.log(res);
    })
    recorderManager.onFrameRecorded((res) => {
      console.log(res);
    })
    recorderManager.onStop((res) => {
      console.log(res);
      this.setState({recorderAudioSrc: res.tempFilePath})
    })
    recorderManager.start({
      sampleRate: 16000,
      numberOfChannels: 2,
      frameSize: 4096
    })
  }

  stopRecord() {
    recorderManager.stop()
  }

  render() {
    return (
      <View className='index'>
        <Button onClick={this.startRecord.bind(this)}>开始录音</Button>
        <Button onClick={this.stopRecord.bind(this)}>结束录音</Button>
        <audio controls src={this.state.recorderAudioSrc}></audio>
      </View>
    )
  }
}
