const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity, adjust for production
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 4002;

// --- Game State ---
let players = {}; // Stores persistent player data: { id, name, chips }
let deck = [];
let gameState = {
    turnDuration: 30, // seconds
    turnTimerId: null,
    turnTimeRemaining: null,
    currentRoundPlayers: {}, // Stores player data for the current round: { id, name, chips, hand, score, currentBet, isStanding, isBusted }
    dealer: { hand: [], score: 0, isBusted: false },
    turn: null,
    gameInProgress: false,
    bettingOpen: true, // Betting is open by default when server starts or round ends
    minBet: 10,
    maxBet: 500, // Example max bet
    pot: 0, // Total pot for the current round (optional, can calculate from bets)
};

// --- Game Logic ---

// Create a standard 52-card deck
function createDeck() {
    const suits = ['H', 'D', 'C', 'S']; // Hearts, Diamonds, Clubs, Spades
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let newDeck = [];
    for (let suit of suits) {
        for (let value of values) {
            newDeck.push({ suit, value });
        }
    }
    return newDeck;
}

// Shuffle the deck
function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

// Calculate hand value
function calculateHandValue(hand) {
    let value = 0;
    let aceCount = 0;
    for (let card of hand) {
        if (['J', 'Q', 'K'].includes(card.value)) {
            value += 10;
        } else if (card.value === 'A') {
            aceCount += 1;
            value += 11;
        } else {
            value += parseInt(card.value);
        }
    }
    while (value > 21 && aceCount > 0) {
        value -= 10;
        aceCount--;
    }
    return value;
}

// Deals cards and starts the play phase
function dealCardsAndPlay() {
    console.log("Dealing cards and starting play...");
    deck = createDeck();
    shuffleDeck(deck);

    gameState.dealer = { hand: [], score: 0, isBusted: false };
    
    // Deal two cards to each player in currentRoundPlayers
    Object.keys(gameState.currentRoundPlayers).forEach(playerId => {
        const playerInRound = gameState.currentRoundPlayers[playerId];
        playerInRound.hand = [deck.pop(), deck.pop()];
        playerInRound.score = calculateHandValue(playerInRound.hand);
    });

    // Deal one card to the dealer (visible)
    gameState.dealer.hand.push(deck.pop());
    // Second dealer card is dealt in dealerTurn, but let's add a placeholder for it in the deck if needed for consistency
    // gameState.dealer.hand.push({ suit: '?', value: '?' }); // Placeholder for hidden card if UI needs it
    gameState.dealer.score = calculateHandValue(gameState.dealer.hand); 

    // Set the first player's turn (among those who bet)
    const activePlayerIds = Object.keys(gameState.currentRoundPlayers);
    if (activePlayerIds.length > 0) {
        gameState.turn = activePlayerIds[0];
    } else {
        // Should not happen if startGame checks for bets
        console.error("No active players to start the turn with.");
        endGame(); // Or reset
        return;
    }
    
    startPlayerTurnTimer(gameState.turn);
    io.emit('gameState', gameState);
    console.log("Play started. Initial state:", JSON.stringify(gameState, null, 2));
}


io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);

    // Player joins
    socket.on('joinGame', (playerName) => {
        // Prevent joining if game is in dealing/playing phase, but allow if only betting is open
        if (gameState.gameInProgress) { 
            socket.emit('error', 'Game (playing phase) already in progress.');
            return;
        }
        players[socket.id] = { id: socket.id, name: playerName, chips: 1000 };
        console.log(`${playerName} (${socket.id}) joined with 1000 chips.`);
        // Send full player list with chip counts
        io.emit('playerList', Object.values(players).map(p => ({id: p.id, name: p.name, chips: p.chips})));
        // Send current game state (which might just be betting open)
        socket.emit('gameState', gameState); 
    });

    socket.on('placeBet', (betAmount) => {
        if (!gameState.bettingOpen) {
            return socket.emit('error', 'Betting is closed.');
        }
        const player = players[socket.id];
        if (!player) {
            return socket.emit('error', 'Player not found.');
        }
        if (isNaN(betAmount) || betAmount < gameState.minBet || betAmount > gameState.maxBet) {
            return socket.emit('error', `Invalid bet amount. Must be between ${gameState.minBet} and ${gameState.maxBet}.`);
        }
        if (player.chips < betAmount) {
            return socket.emit('error', 'Not enough chips.');
        }

        player.chips -= betAmount; // Deduct chips now
        gameState.currentRoundPlayers[socket.id] = {
            id: socket.id,
            name: player.name,
            chips: player.chips, // Show updated chips for the round
            hand: [],
            score: 0,
            currentBet: betAmount,
            isStanding: false,
            isBusted: false,
        };
        gameState.pot += betAmount;

        console.log(`${player.name} bet ${betAmount}. Remaining chips: ${player.chips}`);
        // Emit playerList first to ensure chip counts are sent promptly
        io.emit('playerList', Object.values(players).map(p => ({id: p.id, name: p.name, chips: p.chips})));
        // Then emit the updated gameState
        io.emit('gameState', gameState);
    });

    // Player starts the game (i.e., confirms bets are in, ready to deal)
    socket.on('startGame', () => {
        // Check if there are any players who have placed bets
        if (Object.keys(gameState.currentRoundPlayers).length === 0) {
            return socket.emit('error', 'No bets placed. Cannot start game.');
        }
        if (gameState.gameInProgress) {
             return socket.emit('error', 'Game already in progress.');
        }

        gameState.bettingOpen = false;
        gameState.gameInProgress = true;
        dealCardsAndPlay(); // New function to handle dealing and game flow
    });

    // Player hits
    socket.on('hit', () => {
        if (gameState.turnTimerId && gameState.turn === socket.id) {
            clearInterval(gameState.turnTimerId);
            gameState.turnTimerId = null;
            gameState.turnTimeRemaining = null;
        }
        if (!gameState.gameInProgress || socket.id !== gameState.turn) return;

        const player = gameState.currentRoundPlayers[socket.id];
        if (player && !player.isStanding && !player.isBusted) {
            player.hand.push(deck.pop());
            player.score = calculateHandValue(player.hand);
            if (player.score > 21) {
                player.isBusted = true;
            }
            // Check if turn should move immediately after bust or wait for stand
            if (player.isBusted || player.score === 21) {
                 // Auto-stand or move to next player if busted
                moveToNextPlayerOrDealer();
            } else {
                 io.emit('gameState', gameState);
            }
        } // Note: moveToNextPlayerOrDealer will emit gameState
    });

    // Player stands
    socket.on('stand', () => {
        if (gameState.turnTimerId && gameState.turn === socket.id) {
            clearInterval(gameState.turnTimerId);
            gameState.turnTimerId = null;
            gameState.turnTimeRemaining = null;
        }
        if (!gameState.gameInProgress || socket.id !== gameState.turn) return;
        
        const player = gameState.currentRoundPlayers[socket.id];
        if (player) {
            player.isStanding = true;
            moveToNextPlayerOrDealer();
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        // Handle player leaving
        const leavingPlayer = players[socket.id];
        if (leavingPlayer) {
            console.log(`${leavingPlayer.name} (${socket.id}) left the game with ${leavingPlayer.chips} chips.`);
        }
        delete players[socket.id];
        delete gameState.currentRoundPlayers[socket.id]; // Remove from current round if they were in it
        
        io.emit('playerList', Object.values(players).map(p => ({id: p.id, name: p.name, chips: p.chips})));

        // If game was in progress and no one is left in the current round, or if betting was open and no one is left in lobby
        if ( (gameState.gameInProgress && Object.keys(gameState.currentRoundPlayers).length === 0) || 
             (!gameState.gameInProgress && gameState.bettingOpen && Object.keys(players).length === 0) ) {
            console.log("All active players left or lobby empty. Resetting game state.");
            gameState.currentRoundPlayers = {};
            gameState.dealer = { hand: [], score: 0, isBusted: false };
            gameState.turn = null;
            gameState.gameInProgress = false;
            gameState.bettingOpen = true; // Ready for new players to join and bet
            gameState.pot = 0;
            io.emit('gameState', gameState);
        } else if (gameState.gameInProgress && socket.id === gameState.turn) {
            // If it was the leaving player's turn, move to next player
            moveToNextPlayerOrDealer();
        }
    }); // End of socket.on('disconnect')
}); // End of io.on('connection')

function moveToNextPlayerOrDealer() {
    const playerIds = Object.keys(gameState.currentRoundPlayers);
    const currentIndex = playerIds.indexOf(gameState.turn);
    let nextPlayerFound = false;

    for (let i = 1; i <= playerIds.length; i++) {
        const nextPlayerId = playerIds[(currentIndex + i) % playerIds.length];
        const nextPlayer = gameState.currentRoundPlayers[nextPlayerId];
        if (nextPlayer && !nextPlayer.isStanding && !nextPlayer.isBusted) {
            gameState.turn = nextPlayerId;
            nextPlayerFound = true;
            break;
        }
    }

    if (!nextPlayerFound) {
        gameState.turn = 'dealer';
        dealerTurn();
    } else {
        // Player's turn continues, restart timer if it was cleared by hit/stand
        // or if it's a new player in moveToNextPlayerOrDealer
        startPlayerTurnTimer(gameState.turn);
        io.emit('gameState', gameState);
    }
}

function dealerTurn() {
    console.log("Dealer's turn.");
    // If dealer had a placeholder for 2nd card, remove it before drawing actual
    // gameState.dealer.hand = gameState.dealer.hand.filter(card => card.value !== '?');
    gameState.dealer.hand.push(deck.pop()); // Deal second card now
    gameState.dealer.score = calculateHandValue(gameState.dealer.hand);
    io.emit('gameState', gameState); // Show dealer's full hand

    const performDealerHit = () => {
        if (gameState.dealer.score < 17 && !gameState.dealer.isBusted) {
            console.log("Dealer hits.");
            gameState.dealer.hand.push(deck.pop());
            gameState.dealer.score = calculateHandValue(gameState.dealer.hand);
            if (gameState.dealer.score > 21) {
                gameState.dealer.isBusted = true;
                console.log("Dealer busts.");
            }
            io.emit('gameState', gameState);
            setTimeout(performDealerHit, 1000); // Next action after 1s
        } else {
            console.log("Dealer stands or is busted. Score:", gameState.dealer.score);
            endGame();
        }
    };
    setTimeout(performDealerHit, 1000); // Start dealer's actions after 1s
}

function endGame() {
    gameState.gameInProgress = false;
    gameState.turn = null;
    
    const gameResults = {};
    const dealerScore = gameState.dealer.score;
    const dealerBusted = gameState.dealer.isBusted;

    Object.values(gameState.currentRoundPlayers).forEach(playerInRound => {
        const playerGlobal = players[playerInRound.id]; // Get global player object for chips
        let resultText = '';
        let winnings = 0;

        if (playerInRound.isBusted) {
            resultText = 'Bust';
            // Bet already deducted, so chips are correct for loss
        } else {
            const isBlackjack = playerInRound.score === 21 && playerInRound.hand.length === 2;
            if (dealerBusted) {
                resultText = isBlackjack ? 'Blackjack!' : 'Win';
                winnings = isBlackjack ? playerInRound.currentBet * 1.5 : playerInRound.currentBet;
                playerGlobal.chips += playerInRound.currentBet + winnings;
            } else if (playerInRound.score > dealerScore) {
                resultText = isBlackjack ? 'Blackjack!' : 'Win';
                winnings = isBlackjack ? playerInRound.currentBet * 1.5 : playerInRound.currentBet;
                playerGlobal.chips += playerInRound.currentBet + winnings;
            } else if (playerInRound.score < dealerScore) {
                resultText = 'Lose';
            } else { // Push
                resultText = 'Push';
                playerGlobal.chips += playerInRound.currentBet; // Return bet
            }
        }
        gameResults[playerInRound.id] = {
            result: resultText,
            bet: playerInRound.currentBet,
            winnings: winnings,
            newChips: playerGlobal.chips
        };
    });

    io.emit('gameOver', { 
        results: gameResults, 
        dealerHand: gameState.dealer.hand, 
        dealerScore: gameState.dealer.score 
    });
    console.log("Game over. Results:", gameResults);

    // Reset for next betting round
    setTimeout(() => {
        gameState.currentRoundPlayers = {};
        gameState.dealer = { hand: [], score: 0, isBusted: false };
        gameState.turn = null;
        gameState.gameInProgress = false;
        gameState.bettingOpen = true;
        gameState.pot = 0;
        
        io.emit('gameState', gameState); // Send new state for betting phase
        // Update player list with latest chip counts
        io.emit('playerList', Object.values(players).map(p => ({id: p.id, name: p.name, chips: p.chips}))); 
        console.log("New betting round started. Current players in lobby:", Object.keys(players).length);
    }, 7000); // 7 seconds before new betting round
}


function startPlayerTurnTimer(playerId) {
    if (gameState.turnTimerId) {
        clearInterval(gameState.turnTimerId);
    }
    if (!playerId || playerId === 'dealer' || !gameState.currentRoundPlayers[playerId]) {
        gameState.turnTimeRemaining = null;
        gameState.turnTimerId = null;
        io.emit('gameState', gameState); // Ensure frontend knows timer is off
        return;
    }

    gameState.turnTimeRemaining = gameState.turnDuration;
    console.log(`Starting timer for ${gameState.currentRoundPlayers[playerId]?.name} (${playerId}). Time: ${gameState.turnTimeRemaining}s`);

    gameState.turnTimerId = setInterval(() => {
        if (gameState.turn === playerId && gameState.gameInProgress) {
            gameState.turnTimeRemaining--;
            // console.log(`Time remaining for ${playerId}: ${gameState.turnTimeRemaining}`);
            if (gameState.turnTimeRemaining <= 0) {
                clearInterval(gameState.turnTimerId);
                gameState.turnTimerId = null;
                console.log(`Time up for ${gameState.currentRoundPlayers[playerId]?.name}. Auto-standing.`);
                if (gameState.currentRoundPlayers[playerId]) {
                    gameState.currentRoundPlayers[playerId].isStanding = true;
                }
                moveToNextPlayerOrDealer(); // This will emit gameState
            } else {
                io.emit('gameState', gameState); // Emit updated time remaining
            }
        } else {
            // If turn changed or game ended, clear this timer
            clearInterval(gameState.turnTimerId);
            gameState.turnTimerId = null;
            gameState.turnTimeRemaining = null;
            // console.log("Timer cleared because turn changed or game ended.");
            io.emit('gameState', gameState); // Ensure frontend knows timer is off
        }
    }, 1000);
    io.emit('gameState', gameState); // Emit initial state with timer running
}

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
