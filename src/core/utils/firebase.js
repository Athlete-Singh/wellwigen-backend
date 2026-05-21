import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin SDK
const initFirebase = () => {
  try {
    if (admin.apps.length > 0) return admin;

    const serviceAccountPath = path.resolve(__dirname, '../../../firebase-service-account.json');
    
    // Check if the service account file exists before initializing
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase Admin SDK initialized successfully.');
    } else {
      console.warn('WARNING: firebase-service-account.json not found. Push notifications will not work until added.');
      // Optionally initialize without credentials for testing environment or using GOOGLE_APPLICATION_CREDENTIALS env var
      // admin.initializeApp(); 
    }
    
    return admin;
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    return null;
  }
};

initFirebase();

/**
 * Send a push notification to specific FCM tokens
 * @param {Array<string>} tokens - Array of FCM tokens to send to
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} data - Additional data payload (optional)
 * @returns {Promise<Object>} Result of the send operation
 */
export const sendPushNotification = async (tokens, title, body, data = {}, options = {}) => {
  try {
    if (!tokens || tokens.length === 0) {
      console.warn('No FCM tokens provided for notification');
      return { success: false, error: 'No tokens provided' };
    }

    if (admin.apps.length === 0) {
      console.warn('Firebase Admin not initialized, cannot send notification');
      return { success: false, error: 'Firebase not initialized' };
    }

    // Filter out invalid tokens
    const validTokens = tokens.filter(t => t && typeof t === 'string' && t.trim() !== '');
    if (validTokens.length === 0) {
       return { success: false, error: 'No valid tokens provided' };
    }

    const message = {
      notification: {
        title,
        body
      },
      data: {
        ...data,
        click_action: data.click_action || 'FLUTTER_NOTIFICATION_CLICK' // Default for some clients, safe to include
      },
      tokens: validTokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    
    // Prune dead tokens
    if (response.failureCount > 0) {
      console.warn(`Failed to send notification to ${response.failureCount} devices.`);
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(validTokens[idx]);
        }
      });
      if (failedTokens.length > 0) {
        import('../../features/user/user.model.js').then(({ default: User }) => {
          User.updateMany({ fcmTokens: { $in: failedTokens } }, { $pull: { fcmTokens: { $in: failedTokens } } }).exec().catch(console.error);
        }).catch(console.error);
        import('../../features/provider/provider.model.js').then(({ default: Provider }) => {
          Provider.updateMany({ fcmTokens: { $in: failedTokens } }, { $pull: { fcmTokens: { $in: failedTokens } } }).exec().catch(console.error);
        }).catch(console.error);
      }
    }

    // Save notification to history
    const { saveToDb = false, recipientId, role = 'user', recipientIds } = options;
    if (saveToDb) {
      import('../../features/notification/notification.model.js').then(({ default: Notification }) => {
        if (recipientIds && recipientIds.length > 0) {
          const docs = recipientIds.map(id => ({ recipientId: id, role, title, body, data }));
          Notification.insertMany(docs).catch(console.error);
        } else if (recipientId) {
          Notification.create({ recipientId, role, title, body, data }).catch(console.error);
        } else {
          Notification.create({ role, title, body, data }).catch(console.error);
        }
      }).catch(console.error);
    }

    return { success: true, response };
  } catch (error) {
    console.error('Error sending push notification:', error);
    return { success: false, error: error.message };
  }
};

export default admin;
