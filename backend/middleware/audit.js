import AuditLog from '../models/AuditLog.js';
import { getClientIP } from './auth.js';

export const auditLogger = (resourceType) => {
  return async (req, res, next) => {
    // Store original methods
    const originalJson = res.json;
    const originalSend = res.send;

    // Capture response data
    let responseData = null;

    res.json = function(data) {
      responseData = data;
      return originalJson.call(this, data);
    };

    res.send = function(data) {
      responseData = data;
      return originalSend.call(this, data);
    };

    // Log after response is sent
    res.on('finish', async () => {
      const action = req.method === 'POST' ? 'CREATE' : 
                     req.method === 'PUT' || req.method === 'PATCH' ? 'UPDATE' : 
                     req.method === 'DELETE' ? 'DELETE' : null;

      if (action && req.user) {
        try {
          await AuditLog.create({
            userId: req.user._id,
            action,
            resourceType,
            resourceId: req.params.id || 'N/A',
            changes: {
              method: req.method,
              path: req.path,
              body: req.body,
              response: responseData
            },
            ipAddress: getClientIP(req),
            userAgent: req.get('user-agent')
          });
        } catch (error) {
          console.error('Audit logging failed:', error);
        }
      }
    });

    next();
  };
};
