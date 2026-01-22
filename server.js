const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

// Game State
let players = {}; 
// Structure: { socketId: { playerNumber: 1 or 2, x: 0, y: 0, health: 10 } }

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Assign Player Slot
    let playerNumber = -1;
    
    // Check if Player 1 is free
    const p1Taken = Object.values(players).find(p => p.playerNumber === 1);
    const p2Taken = Object.values(players).find(p => p.playerNumber === 2);

    if (!p1Taken) {
        playerNumber = 1;
        players[socket.id] = { 
            playerNumber: 1, 
            x: 100, 
            y: 350, 
            health: 10 
        };
    } else if (!p2Taken) {
        playerNumber = 2;
        players[socket.id] = { 
            playerNumber: 2, 
            x: 1210, // Far right side (canvas width - 140)
            y: 350, 
            health: 10 
        };
    } else {
        // Server full (Spectator mode logic could go here)
        socket.emit('serverFull');
        return;
    }

    // Tell the client which player they are
    socket.emit('init', { playerNumber: playerNumber, id: socket.id, players: players });
    
    // Tell everyone else a new player joined
    socket.broadcast.emit('playerJoined', players[socket.id]);

    // Handle Movement Updates
    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            // Broadcast to everyone EXCEPT sender (to prevent lag/jitter on local client)
            socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y });
        }
    });

    // Handle Shooting
    socket.on('shoot', () => {
        // Tell others that this player shot
        io.emit('playerShot', { id: socket.id, playerNumber: players[socket.id].playerNumber });
    });

    // Handle Hit (Client tells server "I got hit")
    socket.on('hit', () => {
        if (players[socket.id]) {
            players[socket.id].health -= 1;
            io.emit('updateHealth', { id: socket.id, health: players[socket.id].health });

            // Check Win Condition
            if (players[socket.id].health <= 0) {
                const winnerNum = players[socket.id].playerNumber === 1 ? 2 : 1;
                io.emit('gameOver', { winner: winnerNum });
                
                // Reset Game Logic after 10 seconds handled by client, 
                // but we need to reset server health stats
                setTimeout(() => {
                    Object.keys(players).forEach(key => {
                        players[key].health = 10;
                        // Reset positions
                        if(players[key].playerNumber === 1) { players[key].x = 100; players[key].y = 350; }
                        if(players[key].playerNumber === 2) { players[key].x = 1210; players[key].y = 350; }
                    });
                    io.emit('resetGame', players);
                }, 10000);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});