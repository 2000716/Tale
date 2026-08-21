import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  updateDoc, 
  arrayUnion, 
  query, 
  orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDfJ3IXqeJUkCVcMnPt3ya37Co7Du-f1WU",
  authDomain: "tale-8cadc.firebaseapp.com",
  projectId: "tale-8cadc",
  storageBucket: "tale-8cadc.firebasestorage.app",
  messagingSenderId: "326781333063",
  appId: "1:326781333063:web:c7303967acf8ea79184b62"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const sectionsList = document.getElementById("sections-list");
const sectionSelect = document.getElementById("item-section-select");

// Lytter til samlingen "sections" i Firestore
const q = query(collection(db, "sections"), orderBy("order", "asc"));
onSnapshot(q, (snapshot) => {
  sectionsList.innerHTML = "";
  sectionSelect.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const sec = docSnap.data();
    const id = docSnap.id;

    // Fyll ut nedtrekksmeny for å legge til bøker
    const option = document.createElement("option");
    option.value = id;
    option.innerText = `${sec.title} (${sec.page})`;
    sectionSelect.appendChild(option);

    // Fyll ut listen for sletting
    const itemEl = document.createElement("div");
    itemEl.className = "section-list-item";
    itemEl.innerHTML = `
      <div>
        <strong>${sec.title}</strong> <small>(${sec.page} - order: ${sec.order})</small>
        <p style="font-size:0.8rem; color:#94a3b8;">${(sec.items || []).length} elementer</p>
      </div>
      <button class="btn-delete" data-id="${id}">Slett</button>
    `;
    sectionsList.appendChild(itemEl);
  });

  // Legg til slettefunksjon
  document.querySelectorAll(".btn-delete").forEach(btn => {
    btn.onclick = async () => {
      if (confirm("Vil du slette denne seksjonen?")) {
        await deleteDoc(doc(db, "sections", btn.dataset.id));
      }
    };
  });
});

// Skjema 1: Legg til ny Seksjon
document.getElementById("add-section-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("sec-title").value;
  const page = document.getElementById("sec-page").value;
  const order = parseInt(document.getElementById("sec-order").value);

  await addDoc(collection(db, "sections"), {
    title,
    page,
    order,
    items: []
  });

  document.getElementById("sec-title").value = "";
});

// Skjema 2: Legg til Innhold i valgt Seksjon
document.getElementById("add-item-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const sectionId = sectionSelect.value;
  const newItem = {
    title: document.getElementById("item-title").value,
    sub: document.getElementById("item-sub").value,
    icon: document.getElementById("item-icon").value,
    desc: document.getElementById("item-desc").value
  };

  const sectionRef = doc(db, "sections", sectionId);
  await updateDoc(sectionRef, {
    items: arrayUnion(newItem)
  });

  document.getElementById("item-title").value = "";
  document.getElementById("item-sub").value = "";
  document.getElementById("item-desc").value = "";
});
