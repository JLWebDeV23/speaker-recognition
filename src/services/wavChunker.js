const fs = require('fs');
const wav = require('wav');
const path = require('path');
const { Transform, Readable } = require('stream');

class WavChunker {
  constructor(config = {}) {
    this.config = {
      // Chunk size in seconds
      chunkDuration: config.chunkDuration || 10,
      // Minimum chunk duration in seconds
      minDuration: config.minDuration || 1,
      // Maximum chunks per speaker
      maxChunksPerSpeaker: config.maxChunksPerSpeaker || 100,
      // Output directory for chunks
      outputDir: config.outputDir || './chunks',
      // Temporal sampling interval in seconds
      temporalInterval: config.temporalInterval || 10,
    };

    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  async chunkWavFile(wavePath, speaker) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let chunkIndex = 0;
      let currentDuration = 0;

      const reader = new wav.Reader();
      const fileStream = fs.createReadStream(wavePath);

      // Pipe the file to the WAV reader
      fileStream.pipe(reader);

      reader.on('format', async (format) => {
        const { sampleRate, channels, bitDepth } = format;

        // Calculate bytes per sample and chunk
        const bytesPerSample = (bitDepth / 8) * channels;
        const samplesPerChunk = Math.floor(
          this.config.chunkDuration * sampleRate
        );
        const bytesPerChunk = samplesPerChunk * bytesPerSample;

        let buffer = Buffer.alloc(0);
        let chunkWriter = null;
        let currentChunkPath = null;

        // Create transform stream for chunking
        const chunker = new Transform({
          transform: (chunk, encoding, callback) => {
            buffer = Buffer.concat([buffer, chunk]);

            while (buffer.length >= bytesPerChunk) {
              // Only process chunks at temporal intervals
              if (
                chunkIndex %
                  Math.floor(
                    this.config.temporalInterval / this.config.chunkDuration
                  ) ===
                0
              ) {
                const timestamp = Date.now();
                const chunkFileName = `chunk-${timestamp}-${chunkIndex}.wav`;
                currentChunkPath = path.join(
                  this.config.outputDir,
                  chunkFileName
                );

                chunkWriter = new wav.Writer({
                  sampleRate,
                  channels,
                  bitDepth,
                });

                const chunkData = buffer.slice(0, bytesPerChunk);
                chunkWriter.write(chunkData);
                chunkWriter.end();

                chunks.push({
                  path: currentChunkPath,
                  duration: this.config.chunkDuration,
                  index: chunkIndex,
                  timestamp,
                  startTime: chunkIndex * this.config.chunkDuration,
                  format: {
                    sampleRate,
                    channels,
                    bitDepth,
                  },
                });

                chunkWriter.pipe(fs.createWriteStream(currentChunkPath));
              }

              buffer = buffer.slice(bytesPerChunk);
              chunkIndex++;
            }

            callback();
          },
        });

        // Handle the chunking process
        reader
          .pipe(chunker)
          .on('finish', () => {
            // Process remaining buffer if it meets minimum duration
            const remainingSamples = buffer.length / bytesPerSample;
            const remainingDuration = remainingSamples / sampleRate;

            if (remainingDuration >= this.config.minDuration) {
              const timestamp = Date.now();
              const chunkFileName = `chunk-${timestamp}-${chunkIndex}.wav`;
              const finalChunkPath = path.join(
                this.config.outputDir,
                chunkFileName
              );

              // Create WAV writer for final chunk
              const finalWriter = new wav.Writer({
                sampleRate,
                channels,
                bitDepth,
              });

              finalWriter.write(buffer);
              finalWriter.end();

              // Save final chunk info
              chunks.push({
                path: finalChunkPath,
                duration: remainingDuration,
                index: chunkIndex,
                timestamp,
                startTime: chunkIndex * this.config.chunkDuration,
                format: {
                  sampleRate,
                  channels,
                  bitDepth,
                },
              });

              // Write final chunk to file
              finalWriter.pipe(fs.createWriteStream(finalChunkPath));
            }

            resolve(chunks);
          })
          .on('error', reject);
      });

      reader.on('error', reject);
    });
  }
}

module.exports = WavChunker;
