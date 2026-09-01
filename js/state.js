export const globalAudio = new Audio();

export const state = {
  isUserSeeking: false,
  currentUser: null,
  userHistory: {},
  selectedItem: null, // Endret fra {} til null for enklere sjekker
  searchTimeout: null,
  isSignUp: false
};
