import express from 'express';
import auth from '../middleware/auth.js';
import {
  deleteAttachment,
  ensureAttachmentCapacity,
  getAttachmentFile,
  handleUploadError,
  imageUpload,
  listAttachments,
  uploadImages,
} from '../controllers/attachmentController.js';

const router = express.Router();
router.use(auth);

router.get('/notes/:noteId/attachments', listAttachments);
router.post('/notes/:noteId/attachments', ensureAttachmentCapacity, imageUpload, uploadImages);
router.get('/attachments/:id/file', getAttachmentFile);
router.delete('/attachments/:id', deleteAttachment);
router.use(handleUploadError);

export default router;
