import express from 'express';
import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import { protect, authorize, getClientIP } from '../middleware/auth.js';
import { auditLogger } from '../middleware/audit.js';

const router = express.Router();

// @route   GET /api/tickets
// @desc    Get all tickets (filtered by role)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { status, priority, assignedTo, page = 1, limit = 10 } = req.query;
    
    let query = {};

    // Filter by role
    if (req.user.role === 'customer') {
      query.customerId = req.user._id;
    } else if (req.user.role === 'agent') {
      query.assignedTo = req.user._id;
    }
    // Admin sees all tickets

    // Apply filters
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (assignedTo) query.assignedTo = assignedTo;

    const tickets = await Ticket.find(query)
      .populate('customerId', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Ticket.countDocuments(query);

    res.json({
      success: true,
      data: tickets,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching tickets' });
  }
});

// @route   GET /api/tickets/:id
// @desc    Get single ticket
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('customerId', 'name email')
      .populate('assignedTo', 'name email')
      .populate('conversation.sender', 'name email');

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Check permissions
    if (req.user.role === 'customer' && ticket.customerId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this ticket' });
    }

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching ticket' });
  }
});

// @route   POST /api/tickets
// @desc    Create new ticket
// @access  Private
router.post('/', protect, auditLogger('Ticket'), async (req, res) => {
  try {
    const { title, description, priority } = req.body;

    if (!title || !description) {
      return res.status(400).json({ 
        success: false, 
        message: 'Title and description are required' 
      });
    }

    const ticketPriority = priority || 'medium';
    const slaDeadline = Ticket.calculateSLADeadline(ticketPriority);

    const ticket = await Ticket.create({
      title,
      description,
      priority: ticketPriority,
      customerId: req.user._id,
      slaDeadline,
      conversation: [{
        sender: req.user._id,
        message: description,
        isAiGenerated: false
      }]
    });

    const populatedTicket = await Ticket.findById(ticket._id)
      .populate('customerId', 'name email');

    // Emit socket event (will be handled in server.js)
    if (req.io) {
      req.io.emit('new_ticket', populatedTicket);
    }

    res.status(201).json({
      success: true,
      data: populatedTicket
    });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ success: false, message: 'Server error creating ticket' });
  }
});

// @route   PUT /api/tickets/:id
// @desc    Update ticket
// @access  Private
router.put('/:id', protect, auditLogger('Ticket'), async (req, res) => {
  try {
    const { status, priority, assignedTo, aiDraft, message } = req.body;

    let ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Check permissions
    if (req.user.role === 'customer' && ticket.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this ticket' });
    }

    // Update fields
    if (status) ticket.status = status;
    if (priority) ticket.priority = priority;
    if (assignedTo && req.user.role !== 'customer') ticket.assignedTo = assignedTo;
    if (aiDraft) ticket.aiDraft = aiDraft;

    // Add message to conversation
    if (message) {
      ticket.conversation.push({
        sender: req.user._id,
        message,
        isAiGenerated: req.body.isAiGenerated || false
      });
    }

    // Set resolvedAt when status changes to resolved
    if (status === 'resolved' && ticket.resolvedAt === null) {
      ticket.resolvedAt = new Date();
    }

    await ticket.save();

    const updatedTicket = await Ticket.findById(ticket._id)
      .populate('customerId', 'name email')
      .populate('assignedTo', 'name email')
      .populate('conversation.sender', 'name email');

    // Emit socket event
    if (req.io) {
      req.io.to(`ticket:${req.params.id}`).emit('ticket_updated', updatedTicket);
    }

    res.json({
      success: true,
      data: updatedTicket
    });
  } catch (error) {
    console.error('Update ticket error:', error);
    res.status(500).json({ success: false, message: 'Server error updating ticket' });
  }
});

// @route   DELETE /api/tickets/:id
// @desc    Delete ticket
// @access  Private (Admin only)
router.delete('/:id', protect, authorize('admin'), auditLogger('Ticket'), async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    await ticket.deleteOne();

    // Emit socket event
    if (req.io) {
      req.io.emit('ticket_deleted', { id: req.params.id });
    }

    res.json({
      success: true,
      message: 'Ticket deleted successfully'
    });
  } catch (error) {
    console.error('Delete ticket error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting ticket' });
  }
});

export default router;
