import express from 'express';
import { createComment, getComments, getCommentById, updateComment, deleteComment } from '../controllers/commentController.js';
import { protect, authorize } from '../middleware/auth.js';
import upload from '../middleware/upload.js';

const router = express.Router();

router.use(protect);

router.post('/', authorize("user", "admin", "support"), upload.array('attachments', 5), createComment); // Create comment
router.get('/', getComments); // Get all comments (filter by ?ticket=<id>)
router.get('/:id', getCommentById); // Get single comment
router.put('/:id', updateComment); // Update comment (author or admin)
router.delete('/:id', authorize('admin'), deleteComment); // Delete comment (admin only)

export default router;