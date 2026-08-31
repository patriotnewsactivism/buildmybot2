from pathlib import Path

path = Path('components/VoiceAgent/VoiceAgentPage.tsx')
text = path.read_text()

start_fn = text.index('  const startMicrophone = useCallback(async () => {')
block_start = text.index('    const stream = await navigator.mediaDevices.getUserMedia({', start_fn)
block_end_marker = '    streamRef.current = stream;'
block_end = text.index(block_end_marker, block_start) + len(block_end_marker)

replacement = '''    const existingStream = streamRef.current;
    const hasLiveAudioTrack = existingStream
      ?.getAudioTracks()
      .some((track) => track.readyState === 'live');
    const stream = hasLiveAudioTrack
      ? existingStream
      : await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

    if (!stream) {
      throw new Error('No microphone stream is available.');
    }

    streamRef.current = stream;
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      throw new Error('No microphone was found on this device.');
    }
    for (const track of audioTracks) {
      track.enabled = true;
    }'''

text = text[:block_start] + replacement + text[block_end:]

conversation_fn = text.index('  const startConversation = async () => {')
resume_marker = '      await audioContext.resume();'
resume_at = text.index(resume_marker, conversation_fn) + len(resume_marker)

early_capture = '''

      // Open the microphone from the original button tap before any network
      // I/O. Mobile browsers can otherwise connect Gemini successfully while
      // never starting the microphone capture path.
      setStatus('Requesting microphone access');
      const microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const microphoneTracks = microphoneStream.getAudioTracks();
      if (!microphoneTracks.length) {
        for (const track of microphoneStream.getTracks()) track.stop();
        throw new Error('No microphone was found on this device.');
      }
      for (const track of microphoneTracks) {
        track.enabled = true;
      }
      streamRef.current = microphoneStream;
      setStatus('Microphone ready — connecting to Gemini Live');'''

text = text[:resume_at] + early_capture + text[resume_at:]

path.write_text(text)
