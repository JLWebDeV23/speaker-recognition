const audioProcessingConfig = require('./config/config');
const FeatureExtractor = require('./services/audioProcessor');
const path = require('path');
const fs = require('fs');
const { QdrantClient } = require('@qdrant/js-client-rest');
const SpeakerVectorExtractor = require('./services/vector');
const wavChunker = require('./services/wavChunker');
// const SpeakerVectorExtractor = require('./services/speakerVectorExtractor');

const AudioPreprocessor = require('./services/audioPreprocessor');

const extractor = new SpeakerVectorExtractor();
// const preprocessor = new AudioPreprocessor();

const CLOUD_URL =
  'https://a562dbf3-0ed5-40da-8ae3-74066e240d5a.us-east4-0.gcp.cloud.qdrant.io';

const KEY = '2wqvMrLcuAQ1hWG57kyO55eYiQvIb_rM9mrSBTn6laRJrzgYVhbRlg';

const COLLECTION = 'audio-fragment-collection';

const client = new QdrantClient({ url: CLOUD_URL, apiKey: KEY });

async function searchAudioFile(filePath) {
  try {
    // Initialize chunker
    const chunker = new wavChunker({
      chunkDuration: 10,
      minDuration: 1,
      outputDir: '../../audioMix/chunks',
      temporalInterval: 10,
    });

    // Convert MP3 to WAV
    const wavePath = await FeatureExtractor.convertToWav(
      filePath,
      '../../audioMix'
    );

    const chunks = await chunker.chunkWavFile(wavePath);

    const searchResults = [];

    for (const chunk of chunks) {
      try {
        const vectors = await extractor.extractFromFile(chunk.path);

        for (const vector of vectors) {
          const results = await client.search(COLLECTION, {
            vector: vector.mu,
            limit: 1,
          });

          // console.log('🔍 Search Results:', results);

          if (results.length > 0) {
            searchResults.push({
              chunkInfo: chunk,
              matchInfo: results[0],
              vector: vector.mu,
            });
          }
        }
      } catch (error) {
        console.error(`Error processing chunk ${chunk.path}:`, error);
      } finally {
        // Clean up chunk file
        try {
          fs.unlinkSync(chunk.path);
        } catch (err) {
          console.error(`Error removing chunk file ${chunk.path}:`, err);
        }
      }
    }

    const speakerAssignments = analyzeSearchResults(searchResults);

    // Step 4: Upsert chunks with identified speakers
    if (speakerAssignments.length > 0) {
      const points = speakerAssignments.map((assignment, index) => ({
        id: `${path.basename(filePath)}-${assignment.chunkInfo.index}`,
        vector: assignment.vector,
        payload: {
          filename: path.basename(filePath),
          speaker: assignment.matchInfo.payload.speaker,
          chunkIndex: assignment.chunkInfo.index,
          timestamp: assignment.chunkInfo.timestamp,
          startTime: assignment.chunkInfo.startTime,
          duration: assignment.chunkInfo.duration,
          confidence: assignment.matchInfo.score,
          format: assignment.chunkInfo.format,
        },
      }));

      // await client.upsert(COLLECTION, { points });
    }

    return speakerAssignments;
  } catch (error) {
    console.error('Error in search process:', error);
    throw error;
  }
}

function analyzeSearchResults(results) {
  console.log('🍅 Search Results:', results);
  // Group results by chunk and determine most likely speaker
  const processedResults = results.map((result) => {
    return {
      ...result,
      matchInfo: {
        ...result.matchInfo,
        score: result.matchInfo.score || 0,
      },
    };
  });

  // Sort by confidence score
  return processedResults.sort((a, b) => b.matchInfo.score - a.matchInfo.score);
}

const createCollection = async () => {
  await client.createCollection(COLLECTION, {
    vectors: { size: 26, distance: 'Cosine' },
  });
};

const countSpeakers = (results) => {
  const speakerCounts = {};

  results.forEach((result) => {
    const speaker = result.payload.speaker;
    if (speakerCounts[speaker]) {
      speakerCounts[speaker]++;
    } else {
      speakerCounts[speaker] = 1;
    }
  });
  const totalSpeakers = Object.values(speakerCounts).reduce(
    (accumulator, currentValue) => accumulator + currentValue,
    0
  );
  const maxCount = Math.max(...Object.values(speakerCounts));
  console.log('Total Speakers:', totalSpeakers, 'Max Count:', maxCount);
  const percentage = (maxCount / totalSpeakers) * 100;
  console.log('Most Frequent Speaker Percentage:', percentage.toFixed(2) + '%');
  console.log('Speaker Counts:', speakerCounts);
};

const searchSample = async () => {
  const filePath = './audio3/deepgram-asteria-1736242310333.mp3';

  const wavePath = await FeatureExtractor.convertToWav(
    filePath,
    '../../audio3'
  );

  const vectors = await extractor.extractFromFile(wavePath);

  const allResults = [];

  // Use the first feature vector for searching
  for (const vector of vectors) {
    // Search for similar vectors in the collection
    const searchResults = await client.search(COLLECTION, {
      vector: vector.mu,
      limit: 1,
    });

    // console.log('🔍 Search Results:', searchResults);
    allResults.push(...searchResults);
  }

  countSpeakers(allResults);
};

const upsertSample = async (files) => {
  const audioDir = './audio';

  let i = 0;
  for (const file of files) {
    const filePath = path.join(audioDir, file);

    const match = file.match(/deepgram-(\w+)-/);

    const speaker = match ? match[1] : 'Unknown';

    // console.log('🔍 speaker:', speaker);
    let wavePath = filePath;

    if (path.extname(filePath).toLowerCase() !== '.wav') {
      // wavePath = await preprocessor.preprocessAudio(filePath, '../../audioWav');
      wavePath = await FeatureExtractor.convertToWav(
        filePath,
        '../../audioWav'
      );
    }

    // console.log('🔍 wavePath:', wavePath);
    const vectors = await extractor.extractFromFile(wavePath);
    // console.log('🔍 vectors:', vectors.length, vectors);

    let j = 0;
    const points = [];
    for (const vector of vectors) {
      // console.log('🐝 vector:', vector);
      j += 1;
      i += 1;
      points.push({
        id: i,
        vector: vector.mu,
        payload: {
          filename: file,
          speaker: speaker,
          index: j,
        },
      });
      // console.log('🧪 Vector Type:', typeof vector, 'Length:', vector.length);
    }
    // continue;
    try {
      await client.upsert(COLLECTION, {
        points,
      });
    } catch (error) {
      console.error('🔥 Qdrant Upsert Error:', error.response?.data || error);
    }
  }

  console.log('✅All files processed and upserted to the collection.');
};

async function main() {
  try {
    // searchSample();
    // await createCollection();
    // upsertSample(files);
    const result = await searchAudioFile(
      './audioMix/deepgram-angus-1736239269328_4OLn7fpP.mp3'
    );
    console.log('🇹🇼 Chunk File Process Result:', result);
  } catch (error) {
    console.error('Speaker Recognition Error:', error);
  }
}

main();

/**
 * script to visualise the audio data with colors
 */
// {
//   "limit": 1000,
//   "color_by": {
//     "payload": "speaker"
//   },
//   // "vector_name": "your_vector_name",
//   "algorithm": "UMAP"
// }
