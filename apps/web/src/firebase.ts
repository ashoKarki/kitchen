import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import type { Functions } from "firebase/functions";
import type { Firestore } from "firebase/firestore";

let firestore: Firestore | undefined;
let cloudFunctions: Functions | undefined;
let auth: Auth | undefined;

function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Missing Firebase configuration: ${missing.join(", ")}`);
  }

  return initializeApp(config);
}

export function getDatabase(): Firestore {
  if (firestore) return firestore;

  firestore = getFirestore(getFirebaseApp());
  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true") {
    connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  }
  return firestore;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
    if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true") {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    }
  }
  return auth;
}

export function getCloudFunctions(): Functions {
  if (!cloudFunctions) {
    getDatabase();
    cloudFunctions = getFunctions(getApp());
    if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true") {
      connectFunctionsEmulator(cloudFunctions, "127.0.0.1", 5001);
    }
  }
  return cloudFunctions;
}
