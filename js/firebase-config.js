// Importer Firebase-moduler
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { 
  getAuth, 
  setPersistence, 
  browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Din Firebase-konfigurasjon
const firebaseConfig = {
  apiKey: "AIzaSyDfJ3IXqeJUkCVcMnPt3ya37Co7Du-f1WU",
  authDomain: "tale-8cadc.firebaseapp.com",
  projectId: "tale-8cadc",
  storageBucket: "tale-8cadc.firebasestorage.app",
  messagingSenderId: "326781333063",
  appId: "1:326781333063:web:c7303967acf8ea79184b62",
  measurementId: "G-W1445B45F4"
};

// Initialiser Firebase
const app = initializeApp(firebaseConfig);

// Eksporter tjenestene slik at du kan bruke dem i andre filer
export const auth = getAuth(app);
export const db = getFirestore(app);

// Sørg for at brukeren forblir innlogget
setPersistence(auth, browserLocalPersistence);

// Analytics (kun på nett)
if (location.protocol.startsWith("http")) {
  getAnalytics(app);
}

console.log("Firebase og Firestore er koblet til Tale!");
