const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');
const { availableParallelism } = require('node:os');
const cluster = require('node:cluster');
const { createAdapter, setupPrimary } = require('@socket.io/cluster-adapter');


if (cluster.isPrimary) {
    const numCPUs = availableParallelism();
    // create one worker per available core
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork({
            PORT: 3000 + i
        });
    }

    // set up the adapter on the primary thread
    return setupPrimary();
}

async function main() {
    const app = express();
    const server = createServer(app);
    const io = new Server(server, {
        connectionStateRecovery: {},
        // set up the adapter on each worker thread
        adapter: createAdapter()
    });
    
    app.get('/:channelName', (req, res) => {
        res.sendFile(join(__dirname, 'index.html'));
    });
    
    var socketChannels = {};
    
    function joinChannel(socket, channelName) {
        socket.join(channelName);
        if (!socketChannels[socket.id]) {
            socketChannels[socket.id] = [];
        }
        socketChannels[socket.id].push(channelName);
        console.log(`Socket ${socket.id} joined channel ${channelName}`);
    }
    
    function leaveChannel(socket, channelName) {
        socket.leave(channelName);
        if (socketChannels[socket.id]) {
            let index = socketChannels[socket.id].indexOf(channelName);
            if (index !== -1) {
                socketChannels[socket.id].splice(index, 1);
            }
        }
        console.log(`Socket ${socket.id} left channel ${channelName}`);
    }
    
    function listChannels(socket) {
        if (socketChannels[socket.id]) {
            console.log(`Channels for socket ${socket.id}:`, socketChannels[socket.id]);
            return socketChannels[socket.id];
        } else {
            console.log(`No channels for socket ${socket.id}`);
            return [];
        }
    }
    
    function listAllChannels() {
        let allChannels = new Set();
    
        for (let id in socketChannels) {
            socketChannels[id].forEach(channel => {
                allChannels.add(channel);
            });
        }
    
        let allChannelsArray = Array.from(allChannels);
        console.log("All unique channels:", allChannelsArray);
        return allChannelsArray;
    }
    
    
    
    io.on('connection', (socket) => {
    
        socket.on('SCheckPseudo', (pseudo) => {
            const usedPseudos = ['Allan'];
    
            if (!usedPseudos.includes(pseudo)) {
                usedPseudos.push(pseudo);
                socket.emit('CPseudoStatus', pseudo);
            } else {
                socket.emit('CPseudoStatus', 'error');
            }
        });
    
        socket.on('SJoin', (channelName) => {
    
            joinChannel(socket, channelName);
    
            socket.on('disconnect', () => {
                console.log(`User left channel: ${channelName}`);
                leaveChannel(socket, channelName);
            });
        });
    
        socket.on('SListChannels', () => {
            let channels = listAllChannels(socket);
            socket.emit('CListChannels', channels);
        });
    
        socket.on('SChat', (data) => {
            io.to(data.channel).emit('CChat', { msg: data.msg, id: socket.id, pseudo: data.pseudo });
        });
    
    });
    
    const port = process.env.PORT;
    
    server.listen(port, () => {
        console.log('server running at http://localhost:'+port);
    });
}


main()
