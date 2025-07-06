//IT IS A MIRACLE THAT THIS PIECE OF SHIT WORKS, PLEASE DO NOT TOUCH IT UNLESS YOU KNOW WHAT YOU ARE DOING, EVEN  IF YOU KNOW DON'T TOUCH IT, I BEG YOU!
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig, appId } from './firebase-config.js';

//THE NEXT CODE IS FOR LANGUAGE SWITCHING, IDK HOW OR WHY IT WORKS, BUT IT DOES SO DON'T TOUCH IT, PLEASE!
import { translations } from './lang.js';

let currentLang = 'en';

function t(key) {
    return translations[currentLang][key] || key;
}

document.addEventListener("DOMContentLoaded", () => {
    updateTexts();
});


// Example: update static text on language change
function updateTexts() {
    document.getElementById('coj').textContent = t('coj');
    document.getElementById('yourName').textContent = t('yourName');
    document.getElementById('create-game-btn').textContent = t('createGame');
    document.getElementById('or').textContent = t('or');
    document.getElementById('gameCode').textContent = t('gameCode');
    document.getElementById('join-game-btn').textContent = t('joinGame');
    document.getElementById('loading-view').textContent = t('loading');
    document.getElementById('noPlayers').textContent = t('noPlayers');
    document.getElementById('start-game-btn').textContent = t('startGame');
    document.getElementById('lobby').textContent = t('lobby');
    document.getElementById('shareCode').textContent = t('shareCode');
    document.getElementById('waiting-for-host-text').textContent = t('waitingForHostText');
    document.getElementById('welcome').textContent = t('welcome');
    document.getElementById('youAreTheHost').textContent = t('youAreTheHost');
    document.getElementById('givePrompt').textContent = t('givePrompt');
    document.getElementById('set-theme-btn').textContent = t('setTheme');
    document.getElementById('waitingForTheme').textContent = t('waitingForTheme').replace('${hostName}', localGameState.players[localGameState.hostId]?.name || 'The Host');
    document.getElementById('theme').textContent = t('themeSet').replace('${data.theme}', localGameState.theme || 'No theme set yet');
    document.getElementById('waitingForSubmit').textContent = t('waitingForSubmit');
    document.getElementById('submit').textContent = t('submit').replace('${submittedPlayers}', localGameState.submissions ? Object.keys(localGameState.submissions).length : 0)
        .replace('${totalPlayers}', Object.keys(localGameState.players).length - 1); // Exclude host from total players
    document.getElementById('submitted').textContent = t('submitted');
    document.getElementById('submit-image-btn').textContent = t('submitBtn');
    document.getElementById('guessWho').textContent = t('guessWho');
    document.querySelector('.guess-select option#pSelect').textContent = t('pSelect');
    document.getElementById('submit-guesses-btn').textContent = t('lockIn');
    document.getElementById('guessing').textContent = t('guessing').replace('${hostName}', localGameState.players[localGameState.hostId]?.name || 'The Host');
    document.getElementById('rate').textContent = t('rate');
    document.getElementById('rated').textContent = t('rated');
    document.getElementById('youRate').textContent = t('youRate');
    document.querySelectorAll('.host-guessed').forEach(el => {
        el.innerHTML = t('hostGuessed').replace('${guessedPlayerName}', el.dataset.guessedPlayerName || 'Unknown');
    });
    document.getElementById('yay').textContent = t('yay');
    document.getElementById('nah').textContent = t('nah');
    document.getElementById('submit-ratings-btn').textContent = t('submitRatings');
    document.getElementById('calculate-scores-btn').textContent = t('calculateScores');
    document.getElementById('over').textContent = t('over');
    document.getElementById('finalScores').textContent = t('finalScores');
    document.getElementById('play-again-btn').textContent = t('playAgain');
    document.getElementById('waitingFHTS').textContent = t('waitingFHTS').replace('${hostName}', localGameState.players[localGameState.hostId]?.name || 'The Host');

}

// Listen for language changes
document.getElementById('lang-switcher').addEventListener('change', (e) => {
    currentLang = e.target.value;
    updateTexts();
});

// END OF LANGUAGE SWITCHING CODE?

let app, db, auth, userId, gameUnsubscribe;
let currentGameCode = null;

const gameDocRef = () => {
    if (!currentGameCode) return null;
    // Corrected Firestore document path segments
    return doc(db, "artifacts", appId, "public", "data", "games", currentGameCode);
}

// --- DOM ELEMENTS ---
const loadingView = document.getElementById('loading-view');
const initialView = document.getElementById('initial-view');
const gameView = document.getElementById('game-view');
const userIdDisplay = document.getElementById('user-id-display');
const playersList = document.getElementById('players-list');
const gameContent = document.getElementById('game-content');
const usernameInput = document.getElementById('username-input');
const gameCodeInput = document.getElementById('game-code-input');
const createGameBtn = document.getElementById('create-game-btn');
const joinGameBtn = document.getElementById('join-game-btn');
const notification = document.getElementById('notification');
const hostAnimationOverlay = document.getElementById('host-animation-overlay');
const playerReel = document.getElementById('player-reel');
const playerReelContainer = document.querySelector('.player-reel-container'); // Get the container for width calculation


// --- UTILITY FUNCTIONS ---
const showView = (view) => {
    loadingView.classList.add('hidden');
    initialView.classList.add('hidden');
    gameView.classList.add('hidden');
    // Ensure the animation overlay is hidden when switching to any main game view
    hostAnimationOverlay.classList.add('hidden');
    hostAnimationOverlay.style.display = 'none'; // Explicitly set display to none
    view.classList.remove('hidden');
    console.log(`Showing view: ${view.id}, Host animation overlay hidden: ${hostAnimationOverlay.classList.contains('hidden')} and display: ${hostAnimationOverlay.style.display}`);
};

const showNotification = (message, isError = false) => {
    notification.textContent = message;
    notification.classList.remove('hidden', 'bg-red-500', 'bg-blue-500');
    notification.classList.add(isError ? 'bg-red-500' : 'bg-blue-500');
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 3000);
};

const generateGameCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// --- GAME STATE & ACTIONS ---
let localGameState = {};

const getInitialGameState = (ownerId, ownerName) => ({
    gameState: 'lobby',
    lobbyOwnerId: ownerId,
    players: {
        [ownerId]: { name: ownerName, score: 0 }
    },
    hostId: null,
    theme: '',
    submissions: {},
    guesses: {},
    ratings: {}
});

const createGame = async () => {
    const username = usernameInput.value.trim();
    if (!userId || !username) {
        showNotification("Please enter a name first.", true);
        return;
    }
    loadingView.classList.remove('hidden');
    initialView.classList.add('hidden');

    currentGameCode = generateGameCode();
    const initialState = getInitialGameState(userId, username);

    try {
        // Create the document on the server
        await setDoc(gameDocRef(), initialState);

        // Manually update the UI for the host immediately after creation
        localGameState = initialState;
        renderLobby(initialState);
        renderPlayers(initialState.players);

        // Now, attach the listener for all future updates (e.g., other players joining)
        listenToGameChanges();
        console.log("Game Created. Initial State:", initialState); // Log
    } catch (error) {
        console.error("Error creating game:", error);
        // More specific error message if it's a permission issue
        if (error.code === 'permission-denied' || error.message.includes('permission denied')) {
            showNotification("Could not create the game. Check Firestore Security Rules for write access.", true);
        } else {
            showNotification("Could not create the game. Please try again.", true);
        }

        // Cleanup on failure
        if (gameUnsubscribe) gameUnsubscribe();
        gameUnsubscribe = null;
        currentGameCode = null;
        showView(initialView);
    }
};

const joinGameWithCode = async () => {
    const username = usernameInput.value.trim();
    const code = gameCodeInput.value.trim().toUpperCase();

    if (!username) {
        showNotification("Please enter your name.", true);
        return;
    }
    if (!code || code.length !== 6) {
        showNotification("Please enter a valid 6-digit game code.", true);
        return;
    }

    loadingView.classList.remove('hidden');
    initialView.classList.add('hidden');

    currentGameCode = code;
    const docRef = gameDocRef();

    try {
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
            showNotification("Game code not found. Please check the code and try again.", true);
            currentGameCode = null;
            showView(initialView);
            loadingView.classList.add('hidden');
            return;
        }

        // Get current game data to ensure we don't overwrite existing players or lobbyOwnerId
        const currentData = docSnap.data();
        let updatedPlayers = { ...currentData.players }; // Copy existing players
        updatedPlayers[userId] = { name: username, score: 0 }; // Add/update current user

        // Ensure lobbyOwnerId is preserved - it should already be there from creation
        const lobbyOwner = currentData.lobbyOwnerId;

        // Now, attach listener
        listenToGameChanges();

        // Update the document with the merged players and preserved lobbyOwnerId
        await updateDoc(docRef, {
            players: updatedPlayers,
            lobbyOwnerId: lobbyOwner // Explicitly preserve lobbyOwnerId
        });
        console.log("Player Joined. Player Update:", { userId, username }); // Log

    } catch (error) {
        console.error("Error joining game:", error);
        showNotification("Error joining game. Please try again.", true);
        currentGameCode = null;
        showView(initialView);
    }
};

const startGame = async () => {
    const playerIds = Object.keys(localGameState.players);
    if (playerIds.length < 2) {
        showNotification("You need at least 2 players to start!", true);
        return;
    }

    const randomHostId = playerIds[Math.floor(Math.random() * playerIds.length)];
    const playersArray = Object.entries(localGameState.players).map(([id, player]) => ({ id, name: player.name }));

    hostAnimationOverlay.classList.remove('hidden');
    hostAnimationOverlay.style.display = 'flex'; // Explicitly show overlay
    playerReel.innerHTML = ''; // Clear previous reel items

    const itemWidth = 170; // player-reel-item min-width (150px) + margin (20px total)
    const reelContainerWidth = playerReelContainer.offsetWidth;
    const centerOffset = (reelContainerWidth / 2) - (itemWidth / 2);

    // Create a very long reel for continuous spinning effect
    const totalPlayersInReel = playersArray.length;
    const numFullSpins = 10; // Ensure many full rotations
    const extendedPlayers = [];
    for (let i = 0; i < numFullSpins * totalPlayersInReel + playersArray.length * 2; i++) {
        extendedPlayers.push(playersArray[i % totalPlayersInReel]);
    }

    // Find the *last* instance of the target host in the extended reel to ensure it lands after a long spin
    // This makes the animation feel like it's "searching" for the host.
    let targetReelIndex = -1;
    for (let i = extendedPlayers.length - 1; i >= 0; i--) {
        if (extendedPlayers[i].id === randomHostId) {
            targetReelIndex = i;
            break;
        }
    }
    // Fallback if target not found (shouldn't happen with enough repeats)
    if (targetReelIndex === -1) {
        targetReelIndex = extendedPlayers.findIndex(item => item.id === randomHostId);
    }


    // Populate the reel with the extended player list
    extendedPlayers.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-reel-item';
        playerDiv.dataset.playerId = player.id;
        playerDiv.textContent = player.name;
        playerReel.appendChild(playerDiv);
    });

    // Calculate the final transform position to center the target item
    const finalTranslateX = -(targetReelIndex * itemWidth) + centerOffset;

    // Reset transition and apply the long ease-out transition
    playerReel.style.transition = 'none'; // Remove any previous transition
    playerReel.style.transform = `translateX(0px)`; // Start from 0

    // Force reflow to ensure the transform:0 is applied before transition is set
    playerReel.offsetWidth;

    playerReel.style.transition = 'transform 6s cubic-bezier(0.25, 0.1, 0.25, 1.0)'; // Longer, smoother ease-out
    playerReel.style.transform = `translateX(${finalTranslateX}px)`; // Move to final position

    // After the transition completes, update Firestore and hide overlay
    setTimeout(async () => {
        // Highlight the selected host in the reel
        const selectedItem = playerReel.querySelector(`.player-reel-item[data-player-id="${randomHostId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }

        // Update Firestore with the chosen host
        await updateDoc(gameDocRef(), {
            gameState: 'theme_setting',
            hostId: randomHostId
        });

        // Small delay before hiding overlay to let user see the final selection
        setTimeout(() => {
            hostAnimationOverlay.classList.add('hidden');
            hostAnimationOverlay.style.display = 'none'; // Explicitly hide overlay
            playerReel.style.transition = 'none'; // Reset transition for next spin
            playerReel.style.transform = 'translateX(0)'; // Reset transform for next spin
            if (selectedItem) selectedItem.classList.remove('selected'); // Remove highlight
        }, 1500); // Wait a bit after highlighting
    }, 6000); // This should match the CSS transition duration (6s)
};

const setTheme = async () => {
    const themeInput = document.getElementById('theme-input');
    const theme = themeInput.value.trim();
    if (theme) {
        await updateDoc(gameDocRef(), {
            theme: theme,
            gameState: 'submission'
        });
    } else {
        showNotification("Please enter a theme.", true);
    }
};

const submitImage = async () => {
    const imageUrlInput = document.getElementById('image-url-input');
    const url = imageUrlInput.value.trim();
    if (url) {
        try {
            new URL(url);
            const submissionUpdate = {
                [`submissions.${userId}`]: { imageUrl: url, submitter: userId }
            };
            await updateDoc(gameDocRef(), submissionUpdate);
        } catch (_) {
            showNotification("Please enter a valid image URL.", true);
        }
    } else {
        showNotification("Please enter an image URL.", true);
    }
};

const submitGuesses = async () => {
    const guesses = {};
    const guessSelects = document.querySelectorAll('.guess-select');
    let allGuessed = true;
    guessSelects.forEach(select => {
        const submitterId = select.dataset.submitter;
        if(select.value) {
            guesses[submitterId] = select.value;
        } else {
            allGuessed = false;
        }
    });

    if(!allGuessed){
        showNotification("Please make a guess for every image.", true);
        return;
    }

    await updateDoc(gameDocRef(), {
        guesses: guesses,
        gameState: 'rating'
    });
};

const submitRatings = async () => {
    const ratings = localGameState.ratings || {};
    const newRatingsForUser = {}; // Store ratings for the current user in this round
    const ratingButtons = document.querySelectorAll('.rating-btn.bg-blue-600');

    ratingButtons.forEach(button => {
        const submitterId = button.dataset.submitter;
        newRatingsForUser[submitterId] = true;
    });

    // Update the document with the current user's ratings for this round
    await updateDoc(gameDocRef(), {
        [`ratings.${userId}`]: newRatingsForUser
    });
};

const calculateScoresAndEndRound = async () => {
    const { players, hostId, submissions, guesses, ratings } = localGameState;
    const newScores = {};

    for (const pId in players) {
        newScores[pId] = players[pId].score || 0;
    }

    // Host scores for correct guesses
    for (const submitterId in guesses) {
        if (guesses[submitterId] === submitterId) {
            newScores[hostId] = (newScores[hostId] || 0) + 10;
        }
    }

    // Calculate total ratings for each submission
    const totalRatings = {};
    for (const submitterId in submissions) {
        totalRatings[submitterId] = 0;
    }

    for (const raterId in ratings) {
        for (const ratedId in ratings[raterId]) {
            if (ratings[raterId][ratedId]) {
                totalRatings[ratedId]++;
            }
        }
    }

    // Players (non-host) score for their submissions being rated
    for(const submitterId in totalRatings){
        if(players[submitterId] && submitterId !== hostId){
            newScores[submitterId] = (newScores[submitterId] || 0) + (totalRatings[submitterId] * 50);
        }
    }

    const updatedPlayers = { ...players };
    for(const pId in newScores){
        updatedPlayers[pId] = { ...updatedPlayers[pId], score: newScores[pId] };
    }

    await updateDoc(gameDocRef(), {
        players: updatedPlayers,
        gameState: 'results'
    });
};

const playAgain = async () => {
    const playerScores = localGameState.players;
    const newState = getInitialGameState(localGameState.lobbyOwnerId, localGameState.players[localGameState.lobbyOwnerId].name);
    newState.players = playerScores; // Preserve scores for the new round
    // Reset other game state properties for a new round
    newState.hostId = null;
    newState.theme = '';
    newState.submissions = {};
    newState.guesses = {};
    newState.ratings = {};

    await setDoc(gameDocRef(), newState); // Overwrite with new initial state
};

// --- UI RENDERING ---
const renderPlayers = (players) => {
    playersList.innerHTML = '';
    if (!players || Object.keys(players).length === 0) {
        playersList.innerHTML = '<p id="noPlayers" class="text-gray-400">No players yet...</p>';
        return;
    }
    console.log("Rendering Players. Current localGameState.lobbyOwnerId:", localGameState.lobbyOwnerId); // Log
    Object.entries(players).forEach(([pId, player]) => {
        const isLobbyOwner = pId === localGameState.lobbyOwnerId;
        const isYou = pId === userId;
        const playerEl = document.createElement('div');
        playerEl.className = 'bg-gray-700 p-3 rounded-lg text-center border border-gray-600';
        playerEl.innerHTML = `
                    <p class="font-semibold text-white">${player.name} ${isLobbyOwner ? '👑' : ''} ${isYou ? '(You)' : ''}</p>
                    <p class="text-gray-300">Score: ${player.score || 0}</p>
                `;
        playersList.appendChild(playerEl);
    });
};

const renderLobby = (data) => {
    showView(gameView);
    const isLobbyOwner = data.lobbyOwnerId === userId;
    console.log("Rendering Lobby. data.lobbyOwnerId:", data.lobbyOwnerId, "Current userId:", userId, "Is Lobby Owner:", isLobbyOwner); // Log
    const content = `
                <div class="text-center">
                    <h2 id="lobby" class="text-3xl font-bold mb-4 text-white">Lobby</h2>
                    <p id="shareCode" class="text-lg text-gray-400 mb-2">Share this code with your friends:</p>
                    <div class="bg-gray-900 text-white text-4xl font-bold tracking-widest p-4 rounded-lg inline-block mb-6 border border-gray-700">${currentGameCode}</div>
                    <p id="waiting-for-host-text" class="text-lg text-gray-300 mb-6 ${isLobbyOwner ? 'hidden' : ''}">Waiting for the Lobby Host to start the game.</p>
                    <button id="start-game-btn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-lg text-xl transition duration-300 shadow-lg ${!isLobbyOwner ? 'hidden' : ''}">Start Game</button>
                </div>
            `;
    gameContent.innerHTML = content;
    setTimeout(() => {
        updateTexts();
    }, 0);
};

const renderThemeSetting = (data) => {
    showView(gameView);
    let content = '';
    if (data.hostId === userId) {
        content = `
                    <h2 id="youAreTheHost" class="text-2xl font-bold mb-4 text-center text-white">You are the Round Host!</h2>
                    <p id="givePrompt" class="text-lg mb-6 text-center text-gray-300">Give the players a prompt</p>
                    <input id="theme-input" type="text" placeholder="e.g., a funny image..." class="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 text-white">
                    <button id="set-theme-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-md">Set Theme</button>
                `;
    } else {
        const hostName = data.players[data.hostId]?.name || 'The Host';
        content = `<h2 id="waitingForTheme" class="text-2xl font-bold mb-4 text-center animate-pulse text-gray-300">Waiting for ${hostName} to set a theme...</h2>`;
    }
    gameContent.innerHTML = content;
};

const renderSubmission = (data) => {
    showView(gameView);
    let content = '';
    if (data.hostId === userId) {
        const submittedPlayers = Object.keys(data.submissions).length;
        const totalPlayers = Object.keys(data.players).length - 1; // Host doesn't submit
        content = `
                    <h2 id="theme" class="text-2xl font-bold mb-2 text-center text-white">Theme: "${data.theme}"</h2>
                    <p id="waitingForSubmit" class="text-lg mb-6 text-center text-gray-300">Waiting for players to submit their images...</p>
                    <p id="submit" class="text-xl font-bold text-center animate-pulse text-white">${submittedPlayers} / ${totalPlayers} submitted</p>
                `;
    } else {
        if (data.submissions[userId]) {
            content = `
                        <h2 id="theme" class="text-2xl font-bold mb-2 text-center text-white">Theme: "${data.theme}"</h2>
                        <p id="submitted" class="text-lg mb-4 text-center text-gray-300">Your submission is in! Waiting for others...</p>
                        <img src="${data.submissions[userId].imageUrl}" class="max-w-xs mx-auto rounded-lg shadow-lg border border-gray-600" onerror="this.onerror=null;this.src='https://placehold.co/400x300/334155/e2e8f0?text=Invalid+Image';">
                    `;
        } else {
            content = `
                        <h2 id="theme" class="text-2xl font-bold mb-2 text-center text-white">Theme: "${data.theme}"</h2>
                        <p class="text-lg mb-4 text-center text-gray-300">Find an image on the web that fits the theme and paste the URL below.</p>
                        <input id="image-url-input" type="url" placeholder="https://example.com/image.png" class="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 text-white">
                        <button id="submit-image-btn" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-md">Submit Image</button>
                    `;
        }
    }
    gameContent.innerHTML = content;
};

const renderGuessing = (data) => {
    showView(gameView);
    let content = `<h2 id="theme" class="text-2xl font-bold mb-4 text-center text-white">Theme: "${data.theme}"</h2>`;
    // Filter out the host from the list of players to guess
    const playersToGuess = Object.values(data.players).filter(p => p.name !== data.players[data.hostId].name);

    if (data.hostId === userId) {
        content += `<p id="guessWho" class="text-lg mb-6 text-center text-gray-300">Guess who submitted which image!</p>`;
        const submissionsGrid = document.createElement('div');
        submissionsGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';

        Object.values(data.submissions).forEach(({ imageUrl, submitter }) => {
            const options = playersToGuess.map(p => {
                const pId = Object.keys(data.players).find(key => data.players[key] === p);
                return `<option value="${pId}">${p.name}</option>`
            }).join('');

            submissionsGrid.innerHTML += `
                        <div class="bg-gray-800 p-4 rounded-lg shadow-lg flex flex-col items-center border border-gray-700">
                            <img src="${imageUrl}" class="w-full h-48 object-contain rounded-md mb-4 border border-gray-600" onerror="this.onerror=null;this.src='https://placehold.co/400x300/334155/e2e8f0?text=Invalid+Image';">
                            <select data-submitter="${submitter}" class="guess-select w-full p-2 rounded-lg bg-gray-700 border border-gray-600 focus:outline-none text-white">
                                <option id="pSelect" value="">Select a player...</option>
                                ${options}
                            </select>
                        </div>
                    `;
        });
        content += submissionsGrid.outerHTML;
        content += `<button id="submit-guesses-btn" class="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-md">Lock In Guesses</button>`;
    } else {
        const hostName = data.players[data.hostId]?.name || 'The Host';
        content += `<p id="guessing" class="text-lg mb-6 text-center text-gray-300 animate-pulse">${hostName} is guessing...</p>`;
        const submissionsGrid = document.createElement('div');
        submissionsGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
        Object.values(data.submissions).forEach(({ imageUrl }) => {
            submissionsGrid.innerHTML += `
                        <div class="bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700">
                            <img src="${imageUrl}" class="w-full h-48 object-contain rounded-md border border-gray-600" onerror="this.onerror=null;this.src='https://placehold.co/400x300/334155/e2e8f0?text=Invalid+Image';">
                        </div>
                    `;
        });
        content += submissionsGrid.outerHTML;
    }
    gameContent.innerHTML = content;
};

const renderRating = (data) => {
    showView(gameView);
    let content = `<h2 id="theme" class="text-2xl font-bold mb-4 text-center text-white">Theme: "${data.theme}"</h2>`;

    if (data.hostId === userId) {
        content += `<p id="rate" class="text-lg mb-6 text-center text-gray-300">Waiting for other players to rate the submissions.</p>`;
    } else {
        if(data.ratings && data.ratings[userId]){
            content += `<p id="rated" class="text-lg mb-6 text-center text-gray-300">Thanks for rating! Waiting for others...</p>`;
        } else {
            content += `<p id="youRate" class="text-lg mb-6 text-center text-gray-300">Rate your favorite submissions! (You can't rate your own)</p>`;
        }
    }

    const submissionsGrid = document.createElement('div');
    submissionsGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';

    Object.values(data.submissions).forEach(({ imageUrl, submitter }) => {
        const guessedPlayerId = data.guesses[submitter];
        const guessedPlayerName = data.players[guessedPlayerId]?.name || 'Unknown';
        const isCorrect = guessedPlayerId === submitter;

        let guessResultHtml = `<p id="hostGuessed" class="text-center mt-2 text-sm text-gray-300">Host guessed: <span class="font-bold">${guessedPlayerName}</span></p>`;
        if(isCorrect){
            guessResultHtml += `<p id="yay" class="text-center text-green-400 font-bold">CORRECT!</p>`;
        } else {
            guessResultHtml += `<p id="nah" class="text-center text-red-400 font-bold">WRONG!</p>`;
        }

        let ratingButtonHtml = '';
        // Only show rating button if current user is not the host AND has not rated yet AND it's not their own submission
        if (data.hostId !== userId && submitter !== userId && !(data.ratings && data.ratings[userId])) {
            ratingButtonHtml = `<button data-submitter="${submitter}" class="rating-btn mt-4 w-full bg-gray-600 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300 shadow-sm">Like</button>`;
        }
        // If the user has already rated, show a disabled button or just no button
        else if (data.hostId !== userId && submitter !== userId && (data.ratings && data.ratings[userId] && data.ratings[userId][submitter])) {
            ratingButtonHtml = `<button disabled class="mt-4 w-full bg-blue-700 text-white font-bold py-2 px-4 rounded-lg opacity-50 cursor-not-allowed">Liked!</button>`;
        }


        submissionsGrid.innerHTML += `
                    <div class="bg-gray-800 p-4 rounded-lg shadow-lg flex flex-col border border-gray-700">
                        <img src="${imageUrl}" class="w-full h-48 object-contain rounded-md mb-2 border border-gray-600" onerror="this.onerror=null;this.src='https://placehold.co/400x300/334155/e2e8f0?text=Invalid+Image';">
                        <p class="text-center mt-auto text-xs text-gray-400">Submitted by: ${data.players[submitter].name}</p>
                        ${guessResultHtml}
                        ${ratingButtonHtml}
                    </div>
                `;
    });
    content += submissionsGrid.outerHTML;

    // Show submit ratings button only if current user is not host and hasn't submitted ratings yet
    if (data.hostId !== userId && !(data.ratings && data.ratings[userId])) {
        content += `<button id="submit-ratings-btn" class="w-full mt-8 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-md">Submit Ratings</button>`;
    } else if (data.hostId === userId && Object.keys(data.ratings || {}).length === Object.keys(data.players).filter(id => id !== data.hostId).length) {
        // If host and all non-host players have rated, show a button to calculate scores.
        content += `<button id="calculate-scores-btn" class="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-md">Calculate Scores</button>`;
    }


    gameContent.innerHTML = content;
};

const renderResults = (data) => {
    showView(gameView);
    let content = `<h2 id="over" class="text-2xl font-bold mb-6 text-center text-white">Round Over!</h2>`;
    content += `<h3 id="finalScores" class="text-xl font-semibold mb-4 text-center text-white">Final Scores</h3>`;
    const sortedPlayers = Object.values(data.players).sort((a, b) => (b.score || 0) - (a.score || 0));

    const scoresList = document.createElement('div');
    scoresList.className = 'space-y-3 max-w-md mx-auto';
    sortedPlayers.forEach((player, index) => {
        scoresList.innerHTML += `
                    <div class="bg-gray-800 p-4 rounded-lg flex justify-between items-center shadow-lg border border-gray-700">
                        <span class="text-lg font-bold ${index === 0 ? 'text-yellow-400' : 'text-white'}">${index + 1}. ${player.name}</span>
                        <span class="text-xl font-semibold text-white">${player.score || 0}</span>
                    </div>
                `;
    });

    content += scoresList.outerHTML;
    // Only lobby owner can initiate play again
    if (userId === data.hostId) {
        content += `<button id="play-again-btn" class="w-full max-w-md mx-auto mt-8 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-md">Play Again</button>`;
    } else {
        content += `<p id="waitingFHTS" class="text-lg text-gray-300 mt-8 text-center">Waiting for the Lobby Host to start a new round...</p>`;
    }
    gameContent.innerHTML = content;
};

// --- MAIN GAME LOOP (via onSnapshot) ---
const handleGameStateChange = (data) => {
    if (hostAnimationOverlay && !hostAnimationOverlay.classList.contains('hidden')) {
        hostAnimationOverlay.classList.add('hidden');
        hostAnimationOverlay.style.display = 'none';
    }
    console.log("--- Game State Changed ---"); // Log
    console.log("Current Tab User ID:", userId); // Log
    console.log("Received Data:", data); // Log

    if (!data) {
        showNotification("Game not found or has been deleted.", true);
        if (gameUnsubscribe) gameUnsubscribe();
        gameUnsubscribe = null;
        currentGameCode = null;
        showView(initialView);
        renderPlayers({});
        return;
    }

    localGameState = data;
    console.log("localGameState after update:", localGameState); // Log
    console.log("Lobby Owner ID (from data):", data?.lobbyOwnerId); // Log
    console.log("Players (from data):", data?.players); // Log

    renderPlayers(data.players || {});

    // Only update UI if animation is not active
    if (hostAnimationOverlay.classList.contains('hidden')) {
        switch (data.gameState) {
            case 'lobby':
                renderLobby(data);
                break;
            case 'theme_setting':
                renderThemeSetting(data);
                break;
            case 'submission':
                renderSubmission(data);
                const allSubmitted = Object.keys(data.submissions).length >= Object.keys(data.players).length - 1;
                if (allSubmitted && userId === data.lobbyOwnerId) {
                    updateDoc(gameDocRef(), { gameState: 'guessing' });
                }
                break;
            case 'guessing':
                renderGuessing(data);
                break;
            case 'rating':
                renderRating(data);
                const nonHostPlayers = Object.keys(data.players).filter(id => id !== data.hostId).length;
                const allRated = data.ratings && Object.keys(data.ratings).length >= nonHostPlayers;
                if (allRated && userId === data.hostId) {
                    // Host will see a "Calculate Scores" button
                }
                break;
            case 'results':
                renderResults(data);
                break;
            default:
                showView(initialView);
        }
    }
};

const listenToGameChanges = () => {
    if (gameUnsubscribe) gameUnsubscribe();
    const docRef = gameDocRef();
    if (!docRef) return;

    gameUnsubscribe = onSnapshot(docRef, (doc) => {
        handleGameStateChange(doc.data());
    }, (error) => {
        console.error("Snapshot listener error:", error);
        handleGameStateChange(null);
    });
};

// --- EVENT LISTENERS ---
document.addEventListener('click', (e) => {
    if (e.target.id === 'start-game-btn') startGame();
    if (e.target.id === 'set-theme-btn') setTheme();
    if (e.target.id === 'submit-image-btn') submitImage();
    if (e.target.id === 'submit-guesses-btn') submitGuesses();
    if (e.target.id === 'submit-ratings-btn') submitRatings();
    if (e.target.id === 'calculate-scores-btn') calculateScoresAndEndRound(); // New button for host
    if (e.target.id === 'play-again-btn') playAgain();
    if (e.target.classList.contains('rating-btn')) {
        // Toggle selection for rating buttons
        e.target.classList.toggle('bg-gray-600');
        e.target.classList.toggle('bg-blue-600');
    }
});

createGameBtn.addEventListener('click', createGame);
joinGameBtn.addEventListener('click', joinGameWithCode);

// --- AUTHENTICATION & STARTUP ---
window.onload = async () => {
    // Check for Firebase config. If not present, display an error.
    if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
        document.body.innerHTML = '<div class="text-white text-center p-8 bg-red-800 rounded-lg mx-auto max-w-md mt-20">Error: Firebase configuration is incomplete. Please ensure all required fields (apiKey, authDomain, projectId) are set.</div>';
        return;
    }

    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                userIdDisplay.textContent = `Your ID: ${userId}`;
                console.log("Current User ID:", userId); // Log
                showView(initialView); // Once authenticated, show initial game options
                loadingView.classList.add('hidden');
            } else {
                // Keep loading view if not authenticated yet
                showView(loadingView);
            }
        });

        // Attempt to sign in with custom token if available, otherwise anonymously
        const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
        if (token) {
            await signInWithCustomToken(auth, token);
        } else {
            await signInAnonymously(auth);
        }

    } catch (error) {
        console.error("Initialization Error:", error);
        document.body.innerHTML = `<div class="text-white text-center p-8 bg-red-800 rounded-lg mx-auto max-w-md mt-20">Error initializing the application: ${error.message}. Please check your Firebase setup.</div>`;
    }
    updateTexts();
    while (true) {
        updateTexts();
    }
};
