const express = require('express');
const router = express.Router();
const multer = require('multer');
const { upload, cloudinary } = require('../config/cloudinary');
const { protectAdmin } = require('../middleware/authMiddleware');
const { removeBackground } = require('../services/removeBackground');

// Setup memory storage for intercepting files before upload
const uploadMem = multer({ storage: multer.memoryStorage() });

// All uploads are admin-only to protect the Cloudinary account from abuse.
router.use(protectAdmin);

router.post('/', upload.single('file'), (req, res) => {
  try {
    if (req.file && req.file.path) {
      res.status(200).send(req.file.path);
    } else {
      res.status(400).send({ message: 'No file uploaded' });
    }
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

router.post('/multiple', upload.array('files', 10), (req, res) => {
  try {
    if (req.files && req.files.length > 0) {
      const urls = req.files.map(file => file.path);
      res.status(200).send(urls);
    } else {
      res.status(400).send({ message: 'No files uploaded' });
    }
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// New route specifically for background removal
router.post('/removebg', uploadMem.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).send({ message: 'No file uploaded' });
    }

    // 1. Process image through remove.bg
    const processedBuffer = await removeBackground(
      req.file.buffer, 
      req.file.mimetype, 
      req.file.originalname
    );

    // 2. Upload the processed transparent PNG to Cloudinary using upload_stream
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'chromvault',
        resource_type: 'image',
        format: 'png', // Force PNG for transparency
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return res.status(500).send({ message: 'Failed to upload processed image to storage.' });
        }
        // Return the secure URL
        res.status(200).send(result.secure_url);
      }
    );

    uploadStream.end(processedBuffer);

  } catch (error) {
    console.error('Remove background error:', error);
    res.status(500).send({ message: error.message || 'Failed to process image.' });
  }
});

module.exports = router;
