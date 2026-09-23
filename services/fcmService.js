import admin from "firebase-admin";
import fs from "fs";

const fb = admin?.default || admin;
let isFirebaseInitialized = false;

function parseServiceAccount(raw) {
  if (!raw || typeof raw !== "string") return null;
  let str = raw.trim();

  // 1. Check if it is a file path
  if (fs.existsSync(str)) {
    try {
      const fileContent = fs.readFileSync(str, "utf-8");
      return JSON.parse(fileContent);
    } catch (err) {
      console.error("[FCM] Error reading service account file:", err.message);
      return null;
    }
  }

  // 2. Check if it is base64 encoded
  if (!str.startsWith("{") && !str.startsWith('"') && !str.startsWith("'")) {
    try {
      const decoded = Buffer.from(str, "base64").toString("utf-8");
      if (decoded.trim().startsWith("{")) {
        str = decoded.trim();
      }
    } catch {}
  }

  // 3. Strip wrapping quotes if accidentally added in UI
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    str = str.slice(1, -1).trim();
  }

  // 4. Parse JSON
  let parsed = null;
  try {
    parsed = JSON.parse(str);
  } catch {
    try {
      // Handle escaped double quotes and escaped backslashes
      const unescaped = str
        .replace(/\\"/g, '"')
        .replace(/\\\\n/g, "\n")
        .replace(/\\n/g, "\n");
      parsed = JSON.parse(unescaped);
    } catch (err) {
      console.warn("[FCM] JSON parse error on FIREBASE_SERVICE_ACCOUNT:", err.message);
    }
  }

  if (parsed && typeof parsed === "object") {
    // Ensure private_key has real newlines
    if (parsed.private_key && typeof parsed.private_key === "string") {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  }

  return null;
}

function initFirebase() {
  if (fb?.apps?.length > 0) {
    isFirebaseInitialized = true;
    return fb.app();
  }

  try {
    let credential = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const parsedServiceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
      if (parsedServiceAccount) {
        credential = fb.credential.cert(parsedServiceAccount);
      } else {
        console.warn("[FCM] FIREBASE_SERVICE_ACCOUNT env is not a valid JSON string, base64 string, or file path.");
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
