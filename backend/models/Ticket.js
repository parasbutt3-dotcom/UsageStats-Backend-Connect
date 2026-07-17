import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Description is required']
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  slaDeadline: {
    type: Date,
    required: true
  },
  aiDraft: {
    type: String,
    default: null
  },
  conversation: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    isAiGenerated: {
      type: Boolean,
      default: false
    }
  }],
  resolvedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for performance
ticketSchema.index({ status: 1, priority: 1 });
ticketSchema.index({ customerId: 1 });
ticketSchema.index({ assignedTo: 1 });

// Calculate SLA deadline based on priority
ticketSchema.statics.calculateSLADeadline = function(priority) {
  const now = new Date();
  const hoursMap = {
    low: 72,
    medium: 48,
    high: 24,
    urgent: 4
  };
  const hours = hoursMap[priority] || 48;
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
};

export default mongoose.model('Ticket', ticketSchema);
