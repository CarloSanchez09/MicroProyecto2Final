import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io(`http://${window.location.hostname}:4002`);

const statusMessages = {
    waiting: "Esperando a que todos apuesten...",
    betting: "¡Apuesta abierta!",
    playing: "Partida en curso...",
    dealer: "El dealer está jugando...",
    gameover: "Fin de la partida",
};

function App() {
    const [playerName, setPlayerName] = useState('');
    const [hasJoined, setHasJoined] = useState(false);
    const [players, setPlayers] = useState([]);
    const [gameState, setGameState] = useState(null);
    const [gameOver, setGameOver] = useState(null);
    const [betAmount, setBetAmount] = useState('10'); // Default bet amount
    const [lastBet, setLastBet] = useState(null); // Para re-apostar
    const [betPlaced, setBetPlaced] = useState(false);
    const [betMessage, setBetMessage] = useState('');
    const [betError, setBetError] = useState('');
    // Estado para saber si el input es válido
    const [betValid, setBetValid] = useState(true);
    // Historial de rondas
    const [history, setHistory] = useState([]);

    useEffect(() => {
        socket.on('playerList', (playerList) => {
            setPlayers(playerList);
        });

        socket.on('gameState', (state) => {
            setGameState(state);
            setGameOver(null); // Reset game over message on new state
            // Reset apuesta si inicia nueva ronda
            if (state && state.bettingOpen) {
                setBetPlaced(false);
                setBetMessage('');
                setBetError('');
            }
        });

        socket.on('gameOver', (results) => {
            setGameOver(results);
            // Añadir al historial
            setHistory(prev => {
                const entry = {
                    dealerScore: results.dealerScore,
                    results: Object.entries(results.results).map(([pid, r]) => ({
                        player: players.find(p => p.id === pid)?.name || 'Jugador',
                        ...r
                    }))
                };
                return [entry, ...prev].slice(0, 3);
            });
        });
        
        socket.on('gameReset', () => {
            setGameState(null);
            setGameOver(null);
        });

        return () => {
            socket.off('playerList');
            socket.off('gameState');
            socket.off('gameOver');
            socket.off('gameReset');
        };
    }, [players]);

    const handleJoinGame = (e) => {
        e.preventDefault();
        if (playerName.trim()) {
            socket.emit('joinGame', playerName);
            setHasJoined(true);
        }
    };

    const handleStartGame = () => {
        socket.emit('startGame');
    };

    const handleHit = () => {
        socket.emit('hit');
    };

    const handleStand = () => {
        socket.emit('stand');
    };

    const handlePlaceBet = () => {
        setBetError('');
        setBetMessage('');
        let amount = parseInt(betAmount);
        const currentPlayer = players.find(p => p.id === socket.id);
        if (!currentPlayer || outOfChips) {
            setBetError('No tienes fichas suficientes para apostar.');
            setBetValid(false);
            return;
        }
        if (betPlaced) {
            setBetError('Ya has apostado en esta ronda. Espera la siguiente.');
            return;
        }
        if (isNaN(amount)) {
            setBetError('Introduce una cantidad válida.');
            setBetValid(false);
            return;
        }
        const min = gameState?.minBet || 10;
        const max = Math.min(gameState?.maxBet || 500, currentPlayer.chips);
        if (amount < min) {
            setBetAmount(min);
            setBetError(`La apuesta mínima es ${min}. Se ajustó automáticamente.`);
            setBetValid(false);
            return;
        }
        if (amount > max) {
            setBetAmount(max);
            setBetError(`No tienes suficientes fichas. Se ajustó al máximo permitido: ${max}.`);
            setBetValid(false);
            return;
        }
        setBetValid(true);
        socket.emit('placeBet', amount);
        setLastBet(amount);
        setBetPlaced(true);
        setBetMessage(`¡Apuesta realizada por ${amount} fichas!`);
    };


    const handleRebet = () => {
        setBetError('');
        setBetMessage('');
        if (betPlaced) {
            setBetError('Ya has apostado en esta ronda. Espera la siguiente.');
            return;
        }
        if (lastBet) {
            setBetAmount(lastBet);
        }
    };

    const handleMaxBet = () => {
        setBetError('');
        setBetMessage('');
        if (betPlaced) {
            setBetError('Ya has apostado en esta ronda. Espera la siguiente.');
            return;
        }
        if (gameState && gameState.maxBet && players.length > 0) {
            const currentPlayer = players.find(p => p.id === socket.id);
            if (currentPlayer) {
                const maxBet = Math.min(gameState.maxBet, currentPlayer.chips);
                setBetAmount(maxBet);
            }
        }
    };


    const renderCard = (card, index) => {
        // Map card value to the Deck of Cards API format (e.g., 10 -> 0)
        const apiValue = card.value === '10' ? '0' : card.value;
        const cardCode = `${apiValue}${card.suit}`;
        const imageUrl = `https://deckofcardsapi.com/static/img/${cardCode}.png`;
        return <img key={index} src={imageUrl} alt={`${card.value} of ${card.suit}`} className="card" draggable={false} />;
    };

    // Mensaje de estado dinámico
    const getStatusMessage = () => {
        if (gameOver) return statusMessages.gameover;
        if (!gameState) return statusMessages.waiting;
        if (gameState.bettingOpen) return statusMessages.betting;
        if (gameState.gameInProgress && gameState.turn) {
            if (gameState.turn === 'dealer') return statusMessages.dealer;
            return statusMessages.playing;
        }
        return statusMessages.waiting;
    };

    // ¿Jugador sin fichas?
    const outOfChips = players.find(p => p.id === socket.id)?.chips === 0;

    // Icono para resultado
    const resultIcon = (result) => {
        if (result === 'Blackjack!' || result === 'Win') return <i className="bi bi-emoji-sunglasses text-success"></i>;
        if (result === 'Push') return <i className="bi bi-emoji-neutral text-secondary"></i>;
        return <i className="bi bi-emoji-frown text-danger"></i>;
    };


    if (!hasJoined) {
        return (
            <div className="container text-center join-container">
                <h1>Blackjack</h1>
                <form onSubmit={handleJoinGame}>
                    <div className="mb-3">
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Enter your name"
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value)}
                        />
                    </div>
                    <button type="submit" className="btn btn-primary">Join Game</button>
                </form>
            </div>
        );
    }

    return (
        <div className="main-flex-layout">
            <div className="sidebar-flex">
                <h1 className="text-center mb-3 glow-title">Blackjack</h1>
                <div className="player-list-sidebar">
                    <h4>Jugadores</h4>
                    <ul className="list-group mb-3">
                        {players.map(p => (
                            <li key={p.id} className={`list-group-item ${p.id === socket.id ? 'active' : ''} ${gameState && gameState.turn === p.id ? 'current-turn' : ''}`}
                                style={gameState && gameState.turn === p.id ? {fontWeight:'bold'} : {}}>
                                {p.name} <span className={`ms-1 badge ${p.id === socket.id ? 'chip-glow' : 'bg-dark'}`}>💰 {p.chips}</span>
                                {gameState && gameState.currentRoundPlayers && gameState.currentRoundPlayers[p.id]?.currentBet > 0 && (
                                    <span className="bet-badge">Apuesta: {gameState.currentRoundPlayers[p.id].currentBet}</span>
                                )}
                                {gameState && gameState.turn === p.id && <span className="badge bg-warning ms-2">TURNO</span>}
                            </li>
                        ))}
                    </ul>

                    {/* Betting UI - Show if betting is open and game not started */}
                    {gameState && gameState.bettingOpen && !gameState.gameInProgress && hasJoined && (
                        <div className="betting-ui-flex">
                            <input 
                                type="number"
                                className={`form-control mb-2 ${betValid ? '' : 'is-invalid'}`}
                                value={betAmount}
                                min={gameState.minBet || 10}
                                max={players.find(p => p.id === socket.id)?.chips || 1000}
                                onChange={(e) => {
                                    let val = parseInt(e.target.value);
                                    const min = gameState?.minBet || 10;
                                    const max = Math.min(gameState.maxBet || 500, players.find(p => p.id === socket.id)?.chips || 1000);
                                    if (isNaN(val) || val < min) val = min;
                                    if (val > max) val = max;
                                    setBetAmount(val);
                                    // Validar input en tiempo real
                                    if (val === '' || isNaN(val) || val < min || val > max) {
                                        setBetValid(false);
                                    } else {
                                        setBetValid(true);
                                    }
                                }}
                                placeholder="Ingresa tu apuesta"
                                disabled={betPlaced || outOfChips}
                            />
                            <button className="btn btn-warning w-100 mb-1" onClick={handlePlaceBet} disabled={betPlaced || !betValid || outOfChips}>Apostar</button>
                            <button className="btn btn-outline-info w-100 mb-1" onClick={() => { handleRebet(); }} disabled={!lastBet || betPlaced || outOfChips}>Re-apostar ({lastBet || 0})</button>
                            <button className="btn btn-outline-success w-100" onClick={handleMaxBet} disabled={betPlaced || outOfChips}>Apuesta Máxima</button>
                            {betMessage && <div className="alert alert-success mt-2">{betMessage}</div>}
                            {betError && <div className="alert alert-danger mt-2">{betError}</div>}
                            {/* Si saldo insuficiente, mensaje */}
                            {(players.find(p => p.id === socket.id)?.chips || 0) < (gameState.minBet || 10) && (
                                <div className="alert alert-warning mt-2">
                                    No tienes suficientes fichas para apostar. Espera la siguiente ronda o pide fichas al administrador.
                                </div>
                            )}
                            {/* Resumen de apuesta */}
                            {betPlaced && (
                                <div className="alert alert-info mt-2">
                                    <strong>Apuesta realizada:</strong> {betAmount} fichas<br/>
                                    <strong>Saldo restante:</strong> {players.find(p => p.id === socket.id)?.chips || 0}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Start Game Button - Show if game not in progress AND betting is NOT open (i.e., after bets or if no betting phase yet) OR if betting is open and current player has placed a bet */}
                    {/* Solo permitir iniciar si todos apostaron */}
                    {!gameState?.gameInProgress && players.length > 0 && hasJoined && (
                        <button 
                            className="btn btn-success mt-3 w-100"
                            onClick={handleStartGame}
                            disabled={gameState?.bettingOpen && (!gameState.currentRoundPlayers || Object.keys(gameState.currentRoundPlayers).length < players.length)}
                        >
                            {gameState?.bettingOpen && (!gameState.currentRoundPlayers || Object.keys(gameState.currentRoundPlayers).length < players.length)
                                ? "Esperando a que todos apuesten..."
                                : "Iniciar Juego"}
                        </button>
                    )}
                </div>
            </div>
            <div className="main-content-flex">
                <div className="text-center mb-2 mt-2">
                    <span className="badge bg-dark fs-5">{getStatusMessage()}</span>
                </div>
                {history.length > 0 && (
                    <div className="history-panel mx-auto mb-2" style={{maxWidth:'600px'}}>
                        <h5>Historial de rondas</h5>
                        <ul className="list-unstyled mb-1">
                            {history.map((h, idx) => (
                                <li key={idx}>
                                    <span className="me-2">Dealer: <strong>{h.dealerScore}</strong></span>
                                    {h.results.map((r, i) => (
                                        <span key={i} className="ms-2">
                                            <strong>{r.player}</strong>: <span className={`badge bg-${r.result === 'Win' || r.result === 'Blackjack!' ? 'success' : r.result === 'Push' ? 'secondary' : 'danger'}`}>{r.result}</span>
                                        </span>
                                    ))}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {gameState && gameState.gameInProgress ? (
                    <div className="game-area">
                        {/* Temporizador de turno */}
                        {gameState.turn === socket.id && gameState.turnTimeRemaining !== null && (
                            <div className="turn-timer alert alert-warning text-center">
                                <strong>¡Tu turno!</strong> Tiempo restante: <span className="badge bg-danger">{gameState.turnTimeRemaining}s</span>
                            </div>
                        )}
                        {gameState.turn !== socket.id && gameState.turn && gameState.currentRoundPlayers && gameState.currentRoundPlayers[gameState.turn] && (
                            <div className="turn-timer alert alert-info text-center">
                                Turno de <strong>{gameState.currentRoundPlayers[gameState.turn].name}</strong>...
                                {gameState.turnTimeRemaining !== null && (
                                    <> ({gameState.turnTimeRemaining}s)</>
                                )}
                            </div>
                        )}
                        {/* Dealer's Hand */}
                        <div className="dealer-area text-center text-white mb-4">
                            <h2>Dealer <i className="bi bi-person-badge"></i> ({gameState.dealer.score > 0 ? gameState.dealer.score : ''})</h2>
                            <div className="hand">
                                {gameState.dealer.hand.map(renderCard)}
                            </div>
                        </div>

                        {/* Players' Hands */}
                        <div className="player-area-container">
                            <div className="row">
                                {gameState.currentRoundPlayers && Object.values(gameState.currentRoundPlayers).map(player => (
                                    <div key={player.id} className={`col-md-6 mb-3 ${gameState.turn === player.id ? 'current-turn' : ''}`}>
                                    <div className={`player-hand-display text-center text-white p-3 ${gameState.turn === player.id ? 'current-turn' : ''}`}
                                        style={gameState.turn === player.id ? {background:'#fffbe71a'} : {}}>
                                        <h5>
                                            {player.name} <span className="chip-glow ms-1">💰 {players.find(p => p.id === player.id)?.chips ?? ''}</span> ({player.score})
                                            {player.currentBet > 0 && <span className="bet-badge ms-2">Apuesta: {player.currentBet}</span>}
                                            {player.isBusted && <span className='text-danger ms-2'>¡BUSTED!</span>} 
                                            {player.isStanding && <span className="ms-2">(Stand)</span>}
                                            {gameState.turn === player.id && <span className="badge bg-warning ms-2">TURNO</span>}
                                        </h5>
                                        <div className="hand">
                                            {player.hand.map(renderCard)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Player Actions */}
                    {/* Player Actions - Show only if game in progress, it's player's turn, and betting is NOT open */}
                    {gameState.gameInProgress && gameState.turn === socket.id && !gameState.bettingOpen && (
                        <div className="actions text-center mt-4">
                            <button className="btn btn-lg btn-primary me-2" onClick={handleHit}>Hit <i className="bi bi-plus-circle"></i></button>
                            <button className="btn btn-lg btn-secondary" onClick={handleStand}>Stand <i className="bi bi-stop-circle"></i></button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="lobby-visual text-center text-white waiting-room p-4">
                    <div className="lobby-icon mb-3">
                        <i className="bi bi-cash-stack display-3 text-warning"></i>
                    </div>
                    <h2 className="mb-2" style={{letterSpacing:'1px', fontWeight:'bold'}}>Sala Blackjack</h2>
                    <div className="mb-3">
                        <span className="badge bg-success fs-6 me-2"><i className="bi bi-people-fill me-1"></i>{players.length} jugador{players.length === 1 ? '' : 'es'} conectado{players.length === 1 ? '' : 's'}</span>
                        {gameState?.bettingOpen && <span className="badge bg-info fs-6"><i className="bi bi-coin me-1"></i>¡Ronda de apuestas abierta!</span>}
                    </div>
                    <p className="lead mb-0" style={{color:'#ffd700'}}>¡Bienvenido! Espera el inicio de la partida o anima a tus amigos a apostar.<br/>Disfruta la experiencia de casino en vivo 🃏</p>
                </div>
            )}
            
            {/* Game Over Modal */}
            {gameOver && (
                <div className="game-over-modal">
                    <div className="game-over-content">
                        <h2><i className="bi bi-trophy-fill text-warning me-2"></i>Fin de la partida</h2>
                        <p><strong>Dealer:</strong> {gameOver.dealerScore}</p>
                        <ul className="list-group">
                           {Object.entries(gameOver.results).map(([playerId, result]) => {
                                const playerName = players.find(p => p.id === playerId)?.name || 'Jugador';
                                return (
                                    <li key={playerId} className="list-group-item">
                                        <strong>{playerName}</strong>: <span className={`badge bg-${result.result === 'Win' || result.result === 'Blackjack!' ? 'success' : result.result === 'Push' ? 'secondary' : 'danger'}`}>{result.result} {resultIcon(result.result)}</span>
                                        <br/>
                                        <span className="bet-badge">Apuesta: {result.bet}</span> <span className="ms-2">Ganancia: <strong>{result.winnings}</strong></span> <span className="ms-2">Nuevo saldo: <strong>{result.newChips}</strong></span>
                                    </li>
                                );
                           })}
                        </ul>
                    </div>
                </div>
            )}

            {/* Si el jugador se queda sin fichas */}
            {outOfChips && (
                <div className="alert alert-danger text-center mt-4">
                    <i className="bi bi-emoji-frown me-2"></i>
                    ¡Te has quedado sin fichas! Espera a que el admin reinicie o reparta más fichas.
                </div>
            )}
        </div>
        </div>
    );
}

export default App;
