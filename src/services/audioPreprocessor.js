const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const wav = require('wav');
const Meyda = require('meyda');
const sox = require('sox-audio');
const path = require('path');

class AudioPreprocessor {
  async preprocessAudio(inputPath, outDir) {
    const outputDir = path.join(__dirname, outDir);
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
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(err))
        .run();
    });
  }

  async removeNonSpeech(audioPath) {
    const outputDir = path.join(__dirname, '../../processedAudio');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }
    const outputPath = path.join(
      outputDir,
      'speech_only_' + path.basename(audioPath)
    );
    console.log('outputPath:', outputPath);
    return new Promise((resolve, reject) => {
      const reader = fs.createReadStream(audioPath);
      const writer = fs.createWriteStream(outputPath);
      const vad = sox({
        output: {
          bits: 16,
          rate: 16000,
          channels: 1,
          type: 'wav',
        },
        effects: ['vad', 'reverse', 'vad', 'reverse'],
      });

      reader.pipe(vad).pipe(writer);

      writer.on('finish', () => resolve(outputPath));
      writer.on('error', reject);
    });
  }

  async detectHumanVoice(audioPath) {
    const buffer = fs.readFileSync(audioPath);
    const audioData = wav.decode(buffer);
    const samples = audioData.channelData[0];

    // Todo - Add different test point for feature extraction as it increases computation time and resources
    const features = Meyda.extract(
      ['mfcc', 'spectralCentroid', 'zeroCrossingRate'],
      samples
    );

    if (
      features.mfcc.some((val) => Math.abs(val) > 100) ||
      features.spectralCentroid < 200
    ) {
      // return null; // Not human speech
      console.log('Not human speech');
    }

    return features;
  }

  async processAudio(inputFile) {
    try {
      const processedPath = await this.preprocessAudio(inputFile);

      const speechPath = await this.removeNonSpeech(processedPath);
      if (!speechPath) {
        console.log('No speech detected.');
        // return null;
      }

      const humanVoice = await this.detectHumanVoice(speechPath);
      if (!humanVoice) {
        console.log('Filtered out non-human audio.');
        // return null;
      }

      console.log('Processed human voice successfully!');
      return humanVoice;
    } catch (error) {
      console.error('Error processing audio:', error);
    }
  }
}

module.exports = AudioPreprocessor;
