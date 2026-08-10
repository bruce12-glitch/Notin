import express from 'express';
import { getPublicShare, getPublicShareFile } from '../controllers/shareController.js';

const router = express.Router();

router.get('/:token', getPublicShare);
router.get('/:token/files/:attachmentId', getPublicShareFile);

export default router;
