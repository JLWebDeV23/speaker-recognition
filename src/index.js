const audioProcessingConfig = require('./config/config');
const FeatureExtractor = require('./services/audioProcessor');
const path = require('path');
const fs = require('fs');
const { QdrantClient } = require('@qdrant/js-client-rest');
const SpeakerVectorExtractor = require('./services/vector');

const extractor = new SpeakerVectorExtractor();

const CLOUD_URL =
  'https://a562dbf3-0ed5-40da-8ae3-74066e240d5a.us-east4-0.gcp.cloud.qdrant.io';

const KEY = '2wqvMrLcuAQ1hWG57kyO55eYiQvIb_rM9mrSBTn6laRJrzgYVhbRlg';

const COLLECTION = 'audio-fragment-collection';

const client = new QdrantClient({ url: CLOUD_URL, apiKey: KEY });

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
  const totalSpeakers = Object.keys(speakerCounts).length;
  const maxCount = Math.max(...Object.values(speakerCounts));
  const percentage = (maxCount / totalSpeakers) * 100;
  console.log('Most Frequent Speaker Percentage:', percentage.toFixed(2) + '%');
  console.log('Speaker Counts:', speakerCounts);
};

const searchSample = async () => {
  const filePath = './audio3/deepgram-asteria-1736242310333.mp3';

  const wavePath = await FeatureExtractor.convertToWav(filePath);

  const vectors = await extractor.extractFromFile(wavePath);

  const allResults = [];

  // Use the first feature vector for searching
  for (const vector of vectors) {
    // Search for similar vectors in the collection
    const searchResults = await client.search(COLLECTION, {
      vector: vector,
      limit: 1,
    });

    console.log('🔍 Search Results:', searchResults);
    allResults.push(...searchResults);
  }

  countSpeakers(allResults);
};

const upsertSample = async (files) => {
  const audioDir = './audio';

  let i = 0;
  for (const file of files) {
    // console.log('🔍 files:', file);
    const filePath = path.join(audioDir, file);

    const match = file.match(/deepgram-(\w+)-/);

    const speaker = match ? match[1] : 'Unknown';

    // console.log('🔍 speaker:', speaker);
    let wavePath = filePath;

    if (path.extname(filePath).toLowerCase() !== '.wav') {
      wavePath = await FeatureExtractor.convertToWav(filePath);
    }
    // console.log('🦠 wavePath:', wavePath);

    const vectors = await extractor.extractFromFile(wavePath);
    let j = 0;
    const points = [];
    for (const vector of vectors) {
      console.log('🐝 vector:', vector);
      j += 1;
      i += 1;
      points.push({
        id: i,
        vector: vector,
        payload: {
          filename: file,
          speaker: speaker,
          index: j,
        },
      });
      // console.log('🧪 Vector Type:', typeof vector, 'Length:', vector.length);
    }
    continue;
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
    const audioDir = './audio';
    const files = fs.readdirSync(audioDir);

    searchSample();

    // await createCollection();

    // upsertSample(files);
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
