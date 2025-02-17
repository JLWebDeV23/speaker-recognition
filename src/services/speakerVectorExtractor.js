const Meyda = require('meyda');
const fs = require('fs');
const wav = require('wav');
const tf = require('@tensorflow/tfjs');
const AudioPreprocessor = require('./audioPreprocessor');

class SpeakerVectorExtractor {
  constructor(options = {}) {
    this.options = {
      sampleRate: 16000, // Standard sample rate for speech 16000Hz
      windowSize: 512, // Power of 2, ~32ms at 16kHz
      hopSize: 256, // 50% overlap
      numMFCC: 20, // Number of MFCC coefficients
      numClusters: 16, // Number of centroids for vector representation
      ...options,
    };
    this.audioPreprocessor = new AudioPreprocessor();
  }

  async extractFromFile(filePath) {
    const humanVoice = await this.audioPreprocessor.processAudio(filePath);

    // if (!humanVoice) {
    //   return null;
    // }
    const audioData = await this.readAudioFile(filePath);

    return this.process(audioData);
  }

  async readAudioFile(filePath) {
    return new Promise((resolve, reject) => {
      const reader = new wav.Reader();
      const audioData = [];

      reader.on('format', (format) => {
        if (format.sampleRate !== this.options.sampleRate) {
          console.warn(
            `Warning: File sample rate (${format.sampleRate}) differs from expected (${this.options.sampleRate})`
          );
        }
      });

      reader.on('data', (chunk) => {
        const samples = new Float32Array(chunk.length / 2);
        for (let i = 0; i < chunk.length; i += 2) {
          samples[i / 2] = chunk.readInt16LE(i) / 32768.0;
        }
        audioData.push(samples);
      });

      reader.on('end', () => {
        const fullData = new Float32Array(
          audioData.reduce((acc, curr) => acc + curr.length, 0)
        );
        let offset = 0;
        audioData.forEach((chunk) => {
          fullData.set(chunk, offset);
          offset += chunk.length;
        });
        resolve(fullData);
      });

      reader.on('error', reject);

      const buffer = fs.readFileSync(filePath);
      reader.write(buffer);
      reader.end();
    });
  }

  process(audioData) {
    const features = this.extractFeatures(audioData);
    const normVector = tf.tensor(features).div(tf.norm(features)).arraySync();
    const deltaFeatures = this.computeDelta(normVector);
    const combinedFeatures = normVector.map((mfcc, index) =>
      mfcc.concat(deltaFeatures[index])
    );
    return combinedFeatures;
  }

  extractFeatures(audioData) {
    const features = [];
    for (
      let i = 0;
      i < audioData.length - this.options.windowSize;
      i += this.options.hopSize
    ) {
      const frame = audioData.slice(i, i + this.options.windowSize);
      if (frame.length === this.options.windowSize) {
        const mfcc = Meyda.extract(['mfcc'], frame, {
          sampleRate: this.options.sampleRate,
          bufferSize: this.options.windowSize,
          numberOfMFCCCoefficients: this.options.numMFCC,
        });
        if (mfcc && mfcc.mfcc) {
          features.push(mfcc.mfcc);
        }
      }
    }
    return features;
  }

  computeDelta(features, N = 2) {
    const numFrames = features.length;
    const numCoeffs = features[0].length;
    const deltaFeatures = [];

    for (let t = 0; t < numFrames; t++) {
      const delta = new Array(numCoeffs).fill(0);
      let denominator = 0;

      for (let n = 1; n <= N; n++) {
        const prevIndex = Math.max(0, t - n);
        const nextIndex = Math.min(numFrames - 1, t + n);

        for (let k = 0; k < numCoeffs; k++) {
          delta[k] += n * (features[nextIndex][k] - features[prevIndex][k]);
        }

        denominator += 2 * n * n;
      }

      for (let k = 0; k < numCoeffs; k++) {
        delta[k] /= denominator;
      }

      deltaFeatures.push(delta);
    }
    return deltaFeatures;
  }
}

module.exports = SpeakerVectorExtractor;
