const audioProcessingConfig = {
  sampleRate: 16000,
  mfccFeatures: 20,
  windowSize: 512, // 25ms @ 16kHz → (0.025 * 16000 = 400 samples)
  windowStride: 0.01,
  hopSize: 160, // 10ms @ 16kHz → (0.01 * 16000 = 160 samples)
};

module.exports = audioProcessingConfig;
