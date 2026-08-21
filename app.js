document.addEventListener("DOMContentLoaded", () => {
  let isPlaying = false;

  const navButtons = document.querySelectorAll(".nav-btn");
  const pages = document.querySelectorAll(".page");
  const cards = document.querySelectorAll(".card");
  const playBtn = document.getElementById("play-btn");
  const playerTitle = document.getElementById("player-title");
  const playerSub = document.getElementById("player-sub");

  // Navigasjon via bunnmenyen
  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetPageId = button.getAttribute("data-target");

      pages.forEach((page) => page.classList.remove("active"));
      document.getElementById(targetPageId).classList.add("active");

      navButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
    });
  });

  // Velg og spill av innhold
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

  // Toggle Play / Pause
  playBtn.addEventListener("click", () => {
    if (playerTitle.innerText === "Ingen lyd valgt") return;

    isPlaying = !isPlaying;
    playBtn.innerText = isPlaying ? "PAUSE" : "PLAY";
  });
});
