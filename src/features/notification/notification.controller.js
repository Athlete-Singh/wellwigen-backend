import User from '../user/user.model.js';
import Vendor from '../vendor/vendor.model.js';
import Provider from '../provider/provider.model.js';
import Notification from './notification.model.js';
import { sendPushNotification } from '../../core/utils/firebase.js';

export const saveFCMToken = async (req, res) => {
  try {
    const { token, type } = req.body; // type can be 'user', 'vendor', 'provider'
    const userId = req.user.id || req.user._id; // Accommodate different token structures

    if (!token) {
      return res.status(400).json({ success: false, message: 'FCM token is required' });
    }

    let ModelToUpdate;
    if (type === 'vendor') {
      ModelToUpdate = Vendor;
    } else if (type === 'provider') {
      ModelToUpdate = Provider;
    } else {
      ModelToUpdate = User;
    }

    const updatedDocument = await ModelToUpdate.findByIdAndUpdate(
      userId,
      { $addToSet: { fcmTokens: token } }, // $addToSet prevents duplicates
      { new: true }
    );

    if (!updatedDocument) {
      return res.status(404).json({ success: false, message: 'User/Vendor/Provider not found' });
    }

    res.status(200).json({ success: true, message: 'FCM token saved successfully' });
  } catch (error) {
    console.error('Error saving FCM token:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const testNotification = async (req, res) => {
  try {
    const { userId, title, body, data, type } = req.body;
    
    if (!userId || !title || !body) {
       return res.status(400).json({ success: false, message: 'userId, title, and body are required' });
    }

    let ModelToSearch;
    if (type === 'vendor') {
      ModelToSearch = Vendor;
    } else if (type === 'provider') {
      ModelToSearch = Provider;
    } else {
      ModelToSearch = User;
    }

    const document = await ModelToSearch.findById(userId);
    
    if (!document) {
      return res.status(404).json({ success: false, message: 'User/Vendor/Provider not found' });
    }

    if (!document.fcmTokens || document.fcmTokens.length === 0) {
      return res.status(400).json({ success: false, message: 'No FCM tokens found for this user' });
    }

    const result = await sendPushNotification(document.fcmTokens, title, body, data);

    if (result.success) {
      res.status(200).json({ success: true, message: 'Notification sent successfully', response: result.response });
    } else {
      res.status(500).json({ success: false, message: 'Failed to send notification', error: result.error });
    }
  } catch (error) {
    console.error('Error in testNotification:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    // We should also fetch global broadcasts where role === req.user.role or 'all'
    // For simplicity, fetch all where recipientId is userId, or recipientId is null and role matches user's role
    const userRole = req.user.role || req.user.type || 'user';
    const notifications = await Notification.find({
      $or: [
        { recipientId: userId },
        { recipientId: { $exists: false }, role: { $in: [userRole.toLowerCase(), 'all'] } }
      ]
    }).sort({ createdAt: -1 }).limit(50);

    res.status(200).json({ success: true, notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findByIdAndUpdate(id, { isRead: true }, { new: true });
    res.status(200).json({ success: true, notification });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    await Notification.updateMany({ recipientId: userId, isRead: false }, { isRead: true });
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
