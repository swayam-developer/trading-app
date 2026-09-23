import admin from "firebase-admin";
import fs from "fs";

const fb = admin?.default || admin;
let isFirebaseInitialized = false;

function initFirebase() {
  if (fb?.apps?.length > 0) {
    isFirebaseInitialized = true;
    return fb.app();
  }

  try {
    let credential = null;

    // Check if service account JSON path or string is provided in env
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      if (fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT)) {
        const fileContent = fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT, "utf-8");
        credential = fb.credential.cert(JSON.parse(fileContent));
      } else {
        // Try parsing directly as JSON string
        try {
          const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
          credential = fb.credential.cert(parsed);
        } catch {
          console.warn("[FCM] FIREBASE_SERVICE_ACCOUNT env is not a valid JSON string or file path.");
        }
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      credential = fb.credential.applicationDefault();
    }

    if (credential && fb) {
      fb.initializeApp({
        credential,
        projectId: process.env.FIREBASE_PROJECT_ID || "trading-app-7e76d",
      });
      isFirebaseInitialized = true;
      console.log("[FCM] Firebase Admin SDK initialized successfully.");
    } else {
      console.warn(
        "[FCM] Firebase Service Account not configured. Push notifications will be simulated (no error thrown)."
      );
    }
  } catch (error) {
    console.error("[FCM] Error initializing Firebase Admin SDK:", error.message);
  }
}

// Initial attempt
initFirebase();

/**
 * Send generic push notification to a device token
 */
export async function sendPushNotification(fcmToken, { title, body, data = {} }) {
  if (!fcmToken) {
    return { success: false, reason: "No FCM token provided" };
  }

  if (!isFirebaseInitialized || !fb) {
    console.log(`[FCM SIMULATED] Notification to token: ${fcmToken.slice(0, 12)}... Title: "${title}", Body: "${body}"`);
    return { success: true, simulated: true };
  }

  try {
    const message = {
      token: fcmToken,
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        timestamp: String(Date.now()),
      },
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "default",
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
    };

    const response = await fb.messaging().send(message);
    console.log("[FCM] Successfully sent push notification:", response);
    return { success: true, messageId: response };
  } catch (error) {
    console.error("[FCM] Error sending push notification:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send welcome notification upon registration
 */
export async function sendWelcomeNotification(fcmToken, userName = "Trader") {
  return sendPushNotification(fcmToken, {
    title: "Welcome to Aura Trading! 🚀",
    body: `Hi ${userName}, your account has been created. Start trading stocks and tracking the market!`,
    data: {
      type: "ACCOUNT_CREATED",
    },
  });
}

/**
 * Send login notification upon sign in
 */
export async function sendLoginNotification(fcmToken, userName = "Trader") {
  return sendPushNotification(fcmToken, {
    title: "Security Alert: New Sign-In 🔐",
    body: `Hello ${userName}, a successful login was detected on your Aura Trading account.`,
    data: {
      type: "LOGIN_SUCCESS",
    },
  });
}
