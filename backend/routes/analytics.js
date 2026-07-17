import express from 'express';
import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/analytics/dashboard
// @desc    Get dashboard analytics
// @access  Private (Admin/Agent)
router.get('/dashboard', protect, authorize('admin', 'agent'), async (req, res) => {
  try {
    const now = new Date();

    // Total tickets by status
    const statusAggregation = await Ticket.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Tickets by priority
    const priorityAggregation = await Ticket.aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    // SLA Breaches - tickets open past their deadline
    const slaBreaches = await Ticket.aggregate([
      {
        $match: {
          slaDeadline: { $lt: now },
          status: { $in: ['open', 'in_progress'] }
        }
      },
      {
        $count: 'total'
      }
    ]);

    // Average resolution time per agent
    const agentPerformance = await Ticket.aggregate([
      {
        $match: {
          status: 'resolved',
          resolvedAt: { $exists: true },
          assignedTo: { $ne: null }
        }
      },
      {
        $addFields: {
          resolutionTime: {
            $subtract: ['$resolvedAt', '$createdAt']
          }
        }
      },
      {
        $group: {
          _id: '$assignedTo',
          avgResolutionTime: { $avg: '$resolutionTime' },
          totalResolved: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'agent'
        }
      },
      {
        $unwind: '$agent'
      },
      {
        $project: {
          agentId: '$_id',
          agentName: '$agent.name',
          agentEmail: '$agent.email',
          avgResolutionTime: 1,
          totalResolved: 1
        }
      }
    ]);

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentTickets = await Ticket.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Format data for frontend
    const statusData = statusAggregation.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const priorityData = priorityAggregation.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const formattedAgentPerformance = agentPerformance.map(agent => ({
      agentId: agent.agentId,
      name: agent.agentName,
      email: agent.agentEmail,
      avgResolutionTimeHours: (agent.avgResolutionTime / (1000 * 60 * 60)).toFixed(2),
      totalResolved: agent.totalResolved
    }));

    const formattedRecentActivity = recentTickets.map(day => ({
      date: day._id,
      count: day.count
    }));

    res.json({
      success: true,
      data: {
        ticketsByStatus: statusData,
        ticketsByPriority: priorityData,
        slaBreaches: slaBreaches[0]?.total || 0,
        agentPerformance: formattedAgentPerformance,
        recentActivity: formattedRecentActivity,
        totalTickets: await Ticket.countDocuments(),
        openTickets: await Ticket.countDocuments({ status: { $in: ['open', 'in_progress'] } })
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching analytics' 
    });
  }
});

// @route   GET /api/analytics/sla-report
// @desc    Get detailed SLA breach report
// @access  Private (Admin only)
router.get('/sla-report', protect, authorize('admin'), async (req, res) => {
  try {
    const now = new Date();

    const breachedTickets = await Ticket.find({
      slaDeadline: { $lt: now },
      status: { $in: ['open', 'in_progress'] }
    })
      .populate('customerId', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ slaDeadline: 1 });

    res.json({
      success: true,
      data: {
        totalBreaches: breachedTickets.length,
        tickets: breachedTickets.map(ticket => ({
          id: ticket._id,
          title: ticket.title,
          priority: ticket.priority,
          slaDeadline: ticket.slaDeadline,
          customer: ticket.customerId,
          assignedTo: ticket.assignedTo,
          hoursOverdue: ((now - ticket.slaDeadline) / (1000 * 60 * 60)).toFixed(1)
        }))
      }
    });
  } catch (error) {
    console.error('SLA report error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error generating SLA report' 
    });
  }
});

export default router;
