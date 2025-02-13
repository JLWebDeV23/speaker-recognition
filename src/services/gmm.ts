import GaussianMixtureModel from 'gaussian-mixture-model';

function applyGMM(combinedFeatures) {
  const gmm = new GaussianMixtureModel({
    dimensions: combinedFeatures[0].length,
    components: 16,
    iterations: 200,
  });

  // Fit GMM
  gmm.train(combinedFeatures);

  // Extract means and ensure output dimension is 40
  const means = gmm.means;
  if (means[0].length !== 40) {
    throw new Error('Output vector dimension mismatch');
  }
}

export default applyGMM;
