import { useEffect, useRef, useState } from 'react'

const TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg']

function clock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// Records a voice note from the microphone. When the person presses Stop,
// the finished recording is handed back through `onRecorded` as a file.
export default function VoiceRecorder({ onRecorded, disabled = false }) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const closedRef = useRef(false)

  const releaseMicrophone = () => streamRef.current?.getTracks().forEach((track) => track.stop())

  useEffect(() => {
    closedRef.current = false
    return () => {
      // The form was closed mid-recording: stop and throw the recording away.
      closedRef.current = true
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (!recording) return undefined
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [recording])

  const start = async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('This browser cannot record voice.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const type = TYPES.find((candidate) => MediaRecorder.isTypeSupported(candidate))
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        releaseMicrophone()
        if (closedRef.current) return
        setRecording(false)
        const mime = (recorder.mimeType || type || 'audio/webm').split(';')[0]
        const blob = new Blob(chunksRef.current, { type: mime })
        if (blob.size) onRecorded(new File([blob], 'voice-note', { type: mime }))
        else setError('Nothing was recorded. Try again.')
      }
      recorderRef.current = recorder
      recorder.start()
      setSeconds(0)
      setRecording(true)
    } catch {
      setError('Could not use the microphone. Allow microphone access for this page and try again.')
    }
  }

  return (
    <div className="recorder">
      {recording ? (
        <>
          <button type="button" className="btn btn--danger" onClick={() => recorderRef.current?.stop()}>
            Stop recording
          </button>
          <span className="recorder-live" role="status">
            <span className="recorder-dot" aria-hidden="true" />
            Recording {clock(seconds)}
          </span>
        </>
      ) : (
        <button type="button" className="btn" disabled={disabled} onClick={start}>
          Record voice note
        </button>
      )}
      {error && <span className="hint error-text">{error}</span>}
    </div>
  )
}
