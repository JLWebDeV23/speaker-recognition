const Meyda = require('meyda');
const fs = require('fs');
const wav = require('wav');
const tf = require('@tensorflow/tfjs');
const ffmpeg = require('fluent-ffmpeg');

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
  }

  async extractFromFile(filePath) {
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
        // Convert 16-bit PCM to float32
        const samples = new Float32Array(chunk.length / 2);
        for (let i = 0; i < chunk.length; i += 2) {
          samples[i / 2] = chunk.readInt16LE(i) / 32768.0;
        }
        audioData.push(samples);
      });

      reader.on('end', () => {
        // Concatenate all chunks
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
    // Extract MFCC features
    const features = this.extractFeatures(audioData);
    // console.log('👹 features:', features);

    const normVector = tf.tensor(features).div(tf.norm(features)).arraySync();

    const deltaFeatures = this.computeDelta(normVector);

    // const combineFeature = [...normVector, ...deltaFeatures];
    const combinedFeatures = normVector.map((mfcc, index) =>
      mfcc.concat(deltaFeatures[index])
    );

    // const gmm = new GaussianMixture(16, 200, 1e-4);
    // gmm.fit(combinedFeatures);

    // const result = this.calculateGMM(combinedFeatures);
    return combinedFeatures;
  }

  extractFeatures(audioData) {
    const features = [];

    // Process audio in overlapping windows
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
          // console.log('MFCC Vector Length:', mfcc.mfcc.length);
        }
      }
    }
    console.log('👹 features:', features.length);
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
    console.log('👹 deltaFeatures:', deltaFeatures.length);
    return deltaFeatures;
  }
}

module.exports = SpeakerVectorExtractor;
