import express from 'express';
import { saveFCMToken, testNotification } from './notification.controller.js';
import authMiddleware from '../../core/middleware/authMiddleware.js';

const router = express.Router();

// Save FCM token (requires authentication)
router.post('/token', authMiddleware, saveFCMToken);

// Test sending a notification (can be restricted to admin in production)
router.post('/test-send', authMiddleware, testNotification);

// Notification history APIs
import { getNotifications, markAsRead, markAllAsRead } from './notification.controller.js';

router.get('/', authMiddleware, getNotifications);
router.put('/:id/read', authMiddleware, markAsRead);
router.put('/read-all', authMiddleware, markAllAsRead);

export default router;
