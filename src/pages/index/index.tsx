import { Button, View } from '@tarojs/components'
import { Component } from 'react'
import recorderManager from '../../js/recorder/get_recorder_manager'
import './index.scss'

export default class Index extends Component {

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
        <Button onClick={this.startRecord}>开始录音</Button>
        <Button onClick={this.stopRecord}>结束录音</Button>
      </View>
    )
  }
}
