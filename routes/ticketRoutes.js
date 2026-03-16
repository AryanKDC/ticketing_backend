import express from 'express';
import { createTicket, getTickets, getTicketById, updateTicket, deleteTicket, getTicketComments, addTicketComment, assignTicket } from '../controllers/ticketController.js';
import { protect, authorize } from '../middleware/auth.js';
import upload from '../middleware/upload.js';

const router = express.Router();

router.use(protect);

router.post('/', authorize("user", "admin"), upload.array('attachments', 5), createTicket); // Create ticket
router.get('/', getTickets); // Get all tickets (with filters)
router.get('/:id', getTicketById); // Get single ticket (with comments)
router.put('/:id', authorize('admin', 'support'), updateTicket); // Update ticket (admin/support)
router.delete('/:id', authorize('admin'), deleteTicket); // Delete ticket (admin only)
router.put('/:id/assign', authorize('admin', 'support'), assignTicket); // Assign ticket (admin/support)

// Nested comment routes for a specific ticket
router.get('/:ticketId/comments', getTicketComments); // Get comments for a ticket
router.post('/:ticketId/comments', upload.array('attachments', 5), addTicketComment); // Add comment to a ticket

export default router;
