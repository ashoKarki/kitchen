import { FirebaseError, getApp, getApps, initializeApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import {
  connectAuthEmulator,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  type Auth
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FirebaseApp } from "firebase/app";

let firestore: Firestore | undefined;
let cloudFunctions: ReturnType<typeof getFunctions> | undefined;
let auth: Auth | undefined;

function requiredConfig(value: string | undefined, key: string): string {
  if (!value) throw new Error(`Missing Firebase configuration: ${key}`);
  return value;
}

function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  const config = {
    apiKey: requiredConfig(process.env.EXPO_PUBLIC_FIREBASE_API_KEY, "EXPO_PUBLIC_FIREBASE_API_KEY"),
    authDomain: requiredConfig(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN, "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: requiredConfig(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, "EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: requiredConfig(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET, "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: requiredConfig(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: requiredConfig(process.env.EXPO_PUBLIC_FIREBASE_APP_ID, "EXPO_PUBLIC_FIREBASE_APP_ID")
  };

  return initializeApp(config);
}

export function getDatabase(): Firestore {
  if (firestore) return firestore;

  const app = getFirebaseApp();
  firestore = getFirestore(app);
  if (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === "true") {
    connectFirestoreEmulator(
      firestore,
      process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ?? "127.0.0.1",
      8080
    );
  }
  return firestore;
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  const app = getFirebaseApp();
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  } catch (error) {
    if (!(error instanceof FirebaseError) || error.code !== "auth/already-initialized") {
      throw error;
    }
    auth = getAuth(app);
  }
  if (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === "true") {
    connectAuthEmulator(
      auth,
      `http://${process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ?? "127.0.0.1"}:9099`,
      { disableWarnings: true }
    );
  }
  return auth;
}

export function getCloudFunctions(): ReturnType<typeof getFunctions> {
  if (!cloudFunctions) {
    getDatabase();
    cloudFunctions = getFunctions(getApp());
    if (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === "true") {
      connectFunctionsEmulator(
        cloudFunctions,
        process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ?? "127.0.0.1",
        5001
      );
    }
  }
  return cloudFunctions;
}
