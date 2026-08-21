document.addEventListener("DOMContentLoaded", () => {
  let isPlaying = false;

  const navButtons = document.querySelectorAll(".nav-btn");
  const pages = document.querySelectorAll(".page");
  const cards = document.querySelectorAll(".card");
  const playBtn = document.getElementById("play-btn");
  const playerTitle = document.getElementById("player-title");
  const playerSub = document.getElementById("player-sub");

  // Navigasjon mellom sider via bunnmeny (SPA Logikk)
  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetPageId = button.getAttribute("data-target");

      // Bytt aktiv side
      pages.forEach((page) => page.classList.remove("active"));
      document.getElementById(targetPageId).classList.add("active");

      // Bytt aktiv knapp i bunnmenyen
      navButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
    });
  });

  // Velg og spill av innhold fra kort
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const title = card.getAttribute("data-title");
      const sub = card.getAttribute("data-sub");

      playerTitle.innerText = title;
      playerSub.innerText = sub;

      isPlaying = true;
      playBtn.innerText = "PAUSE";
    });
  });

  // Start / Pause avspilling
  playBtn.addEventListener("click", () => {
    if (playerTitle.innerText === "Ingen lyd valgt") return;

    isPlaying = !isPlaying;
    playBtn.innerText = isPlaying ? "PAUSE" : "PLAY";
  });
});
