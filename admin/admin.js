import { db } from "./firebase-config.js";
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const form = document.getElementById("add-section-form");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("sec-title").value;
  const order = parseInt(document.getElementById("sec-order").value, 10);
  const targetPage = document.getElementById("sec-page").value;
  const layout = document.getElementById("sec-layout").value;

  try {
    // Legger til et nytt seksjonsdokument i Firestore
    await addDoc(collection(db, "sections"), {
      title: title,
      order: order,
      targetPages: [targetPage],
      layout: layout,
      items: [
        // Eksempel på start-item
        {
          id: "item_" + Date.now(),
          title: "Eksempel Tittel",
          sub: "Beskrivelse / Forfatter",
          coverUrl: "https://via.placeholder.com/150",
          audioUrl: ""
        }
      ]
    });

    alert("Seksjon lagt til! Sjekk appen din.");
    form.reset();
  } catch (error) {
    console.error("Feil ved lagring til Firestore: ", error);
    alert("Kunne ikke lagre seksjonen.");
  }
});
