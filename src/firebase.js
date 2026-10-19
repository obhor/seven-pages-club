import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// The Firebase web config is public by design; access is controlled by Firestore rules.
const firebaseConfig = {
  apiKey: 'AIzaSyB4CychUP_vz9yo1UHwJZtiomPdHFVyBBg',
  authDomain: 'pages-book-club.firebaseapp.com',
  projectId: 'pages-book-club',
  storageBucket: 'pages-book-club.firebasestorage.app',
  messagingSenderId: '29592445372',
  appId: '1:29592445372:web:8fff66f5d4a7c065d4cbb9',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
