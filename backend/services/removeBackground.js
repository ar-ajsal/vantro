const API_ENDPOINT = 'https://api.remove.bg/v1.0/removebg';

/**
 * Removes the background of an image using the remove.bg API.
 * @param {Buffer} buffer - The image buffer
 * @param {String} mimetype - The MIME type of the image (e.g., 'image/jpeg')
 * @param {String} filename - The original filename
 * @returns {Promise<Buffer>} - A promise that resolves to the transparent PNG buffer
 */
async function removeBackground(buffer, mimetype, filename) {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    throw new Error('REMOVE_BG_API_KEY environment variable is missing.');
  }

  // Use Node's native FormData and Blob (available in Node 18+)
  const formData = new FormData();
  formData.append('size', 'auto');
  
  // Convert Node Buffer to a Blob for native FormData
  const blob = new Blob([buffer], { type: mimetype });
  formData.append('image_file', blob, filename);

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg = `remove.bg API Error ${response.status}: `;
    try {
      const errJson = JSON.parse(errorText);
      if (errJson.errors && errJson.errors[0]) {
        errorMsg += errJson.errors[0].title;
      } else {
        errorMsg += errorText;
      }
    } catch (e) {
      errorMsg += errorText;
    }
    
    // Check specific status codes to provide better application-level messages
    if (response.status === 402 || response.status === 429) {
      throw new Error('Credit limit exceeded or rate limited on background removal service.');
    } else if (response.status === 403) {
      throw new Error('Invalid background removal API key.');
    } else {
      throw new Error(errorMsg || 'Failed to remove image background.');
    }
  }

  // Convert the response back to a Node Buffer
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = {
  removeBackground
};
