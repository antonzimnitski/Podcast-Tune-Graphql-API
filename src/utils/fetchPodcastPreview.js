import axios from 'axios';

function prettifyPreviewData(data) {
  return {
    itunesId: data.collectionId,
    title: data.trackName,
    author: data.artistName,
    feedUrl: data.feedUrl,
    artwork: data.artworkUrl600 || data.artworkUrl100,
    categoryIds: data.genreIds
      .filter(id => id !== '26')
      .map(id => ({ itunesId: +id })),
  };
}

const fetchPodcastPreview = async podcastId => {
  const jsonData = await axios.get(
    `https://itunes.apple.com/lookup?id=${podcastId}`
  );

  const { resultCount, results } = jsonData.data;
  if (resultCount === 0) {
    return null;
  }

  const data = prettifyPreviewData(results[0]);
  return data;
};

export default fetchPodcastPreview;