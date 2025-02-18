const WavDecoder = require('wav-decoder');
const Meyda = require('meyda');
const fs = require('fs');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
const { PCA } = require('ml-pca');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegPath);

class FeatureExtractor {
  static async convertToWav(inputPath, outPath) {
    const outputDir = path.join(__dirname, outPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }
    const outputPath = path.join(
      outputDir,
      path.basename(inputPath).replace(/\.[^/.]+$/, '.wav')
    );
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioChannels(1) // Convert to mono
        .audioFrequency(16000) // Downsample to 16kHz
        .toFormat('wav')
        .on('end', () => {
          resolve(outputPath);
        })
        .on('ffmpeg error', (error) => {
          reject(error);
        })
        .save(outputPath);
    });
  }

  static async extractMFCCFeatures(audioPath, config) {
    // console.log('📦 Extracting MFCC features from:', audioPath);
    const buffer = fs.readFileSync(audioPath);
    const audioData = await WavDecoder.decode(buffer);

    // console.log('🔊', audioData);

    const signal = audioData.channelData[0];

    const features = [];
    let startSample = 0;

    while (startSample + config.windowSize <= signal.length) {
      const frame = signal.slice(startSample, startSample + config.windowSize);

      console.log('🔫 frame: ', frame);

      const mfcc = Meyda.extract('mfcc', frame, {
        sampleRate: config.sampleRate,
        bufferSize: config.windowSize,
        numberOfMFCCCoefficients: 20,
      });

      console.log('📀 mfcc: ', mfcc);

      if (mfcc) {
        // Calculate delta coefficients
        const prevMfcc =
          features.length > 0
            ? features[features.length - 1].slice(0, 20)
            : mfcc;
        const delta = mfcc.map((coef, i) => coef - prevMfcc[i]);

        // Combine MFCC and delta coefficients
        features.push([...mfcc, ...delta]);
      }
      // console.log('🔷 features:', features);
      // startSample += config.hopSize;
    }

    // Apply PCA to ensure all vectors have the same dimensions
    const pca = new PCA(features);
    const nComponents = 40; //vector diemension 20 MFCC + 20 Delta
    let reducedFeatures;
    try {
      reducedFeatures = pca.predict(features, { nComponents });
    } catch (error) {
      console.error('Error during PCA prediction:', error);
      console.error('Features:', features);
      console.error('nComponents:', nComponents);
      throw error;
    }
    console.log('🔷 features:');

    return this.applyGMM(reducedFeatures);
  }
}

module.exports = FeatureExtractor;
