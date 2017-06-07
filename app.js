"use strict";
let http = require('http');
let express = require('express');
let app = express();
let server = http.createServer(app);
let io = require('socket.io').listen(server);

server.listen(3000);
let DC_TIMEOUT_LENGTH = 5000;

// for debugging
let testNames = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'theta', 'kappa', 'lambda', 'zeta', 'tau', 'pi'];
let repeatNames = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];

let userMap = {};
let toBeDeleted = {}; // holds user info for those who disconnect but haven't timed out
let queues = {};  // holds all queues in the form of queues[queue name] =  []
let activeQueueList = [];   // holds the names of all currently active queue names,
let lobbyCount = 0;
let activeUsers = 0;

let s4 = function () {
    return Math.floor(Math.random() * 0x10000).toString();
};
let id_ = function () {
    return s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4();
};

// user class
class User {
    constructor(name_) {
        this.id = id_(); // random string identifier
        this.name = name_; // username
        this.lobby = null; //
        this.sockets = new Set();
        this.activeQueues = []; // all currently active queues the user is in
        this.tabCount = 0;
        this.disconnected = false; // disconnected flag for checking reconnects
    }

    existsInLobby(socket) {
        if (userMap[this.name] !== undefined) {
            if (userMap[this.name].lobby !== null) {
                this.lobby = userMap[this.name].lobby;
                if (socket !== undefined) {
                    userMap[this.name].sockets.add(socket);
                    socket.join(userMap[this.name].lobby);
                }
                return true;
            }
        }
        return false;
    };

    existsInQueues() {
        if (userMap[this.name] !== undefined) {
            if (userMap[this.name].activeQueues.length > 0) {
                return true;
            }
        }
        return false;
    };

    existsInQueue(queueName, socket) {
        let selectedQueue = queues[queueName];
        if (selectedQueue !== undefined) {
            for (let i = 0; i < selectedQueue.length; i++) {
                if (this.name === selectedQueue[i].name) {
                    console.log(this.name + ' already exists in ' + queueName + ' with a tab count of ' + userMap[this.name].tabCount);
                    userMap[this.name].sockets[socket.id] = socket;
                    socket.join(userMap[this.name].lobby);
                    return true;
                }
            }
        }
        return false;
    }

    deleteFromQueues(){
        for (let i = 0; i < userMap[this.name].activeQueues.length; i++) {
            let queueName = userMap[this.name].activeQueues[i];
            let selectedQueue = queues[queueName];
            for (let x = 0; x < selectedQueue.length; x++) {
                if (this.name === selectedQueue[x].name) {
                    selectedQueue.splice(x, 1);
                    queues[queueName] = selectedQueue;
                    userMap[this.name].activeQueues.splice(i, 1);
                    break;
                }
            }
        }

        if (!this.existsInQueues()) {
            console.log(this.name + ' has been successfully removed from all queues.');
        } else {
            console.log('ERROR: ' + this.name + ' has not been removed from all queues.');
        }
    }

    deleteFromLobby(){
        userMap[this.name].lobby = null;
        console.log(this.name + ' has been deleted from lobby.');
    }

    removeFromActiveQueueList(queueName){
        for (let i = 0; i < this.activeQueues.length; i++) {
            if (queueName === this.activeQueues[i]) {
                userMap[this.name].activeQueues.splice(i, 1);
            }
        }
    }

    // removes userMap from all queues and lobbies
    delete(){
        if (this.existsInQueues()) {
            this.deleteFromQueues();
        } else if (this.existsInLobby()) {
            this.deleteFromLobby();
        } else {
            console.log('user does not exist in system.');
        }
        // client map
        delete userMap[this.name];
        activeUsers--;
        console.log('currently ' + activeUsers + ' active users.');
        // delete buffer
        delete toBeDeleted[this.name];
    };
}

// routing
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

// on launch code
server.listen(3000, function(){
    console.log('server is running');
    queueService();
});

// emit connected message to client
io.on('connection', function (socket) {
    // let name = testNames[Math.floor(Math.random() * testNames.length)];
    let name = generateRandomName(5);
    console.log(name + ' has connected.');
    let user = new User(name);
    addToUserMap(user);
    userMap[user.name].sockets[socket.id] = socket;
    io.to(socket.id).emit('setParams'); // debug call to automatically set parameters for new user connections

    // called when the user joins a lobby
    socket.on('joinQueue', function(queueName) {
        if (!user.existsInQueue(queueName, socket) && !user.existsInLobby(socket)) {
            addToQueue(queueName, user, socket);
           userMap[user.name].activeQueues.push(queueName);
        }
    });

    socket.on('chat message', function(message){
        io.to(user.lobby).emit('chat message', message);
    });

    // handles when the user disconnects from the session
    socket.on('disconnect', function() {
        console.log(user.name + ' has disconnected');
        userMap[user.name].sockets.delete(socket.id);
        // console.log('userID ' + userMap[user.name].id);
        // console.log('lobby ' + userMap[user.name].lobby);

        toBeDeleted[user.name] = user;
        // console.log(user.name + ' has been added to the toBeDeleted list.');

        user.disconnected = true;
        setTimeout(function () {
            if (user.disconnected && userMap[user.name].tabCount === 1){
                user.delete();
            } else {
                userMap[user.name].tabCount--;
                console.log(user.name + ': secondary tab detected, ignoring delete call and tab count is now ' + userMap[user.name].tabCount);
                delete toBeDeleted[user.name];
            }
        }, DC_TIMEOUT_LENGTH);
    });

});

// continuous service which drops the top X amount of players for each game queue into lobbies
// removes those players from other selected game queues if lobby has been found.
function queueService() {
    // iterate through all currently active queues
    for (let i = 0; i < activeQueueList.length; i++) {
        var queueName = activeQueueList[i];

        if (queues[queueName].length >= 5) {
            let lobbyName = id_();
            for (let x = 0; x < 5; x++) {
                let user = queues[queueName].pop();
                addUserToLobby(user, lobbyName);
                // since we popped off queue, we need to remove queue from active list manually.
                user.removeFromActiveQueueList(queueName);
                // remove user from trailing queues (also removes remaining queues from active queue list)
                user.deleteFromQueues();

            }
            io.to(lobbyName).emit('alert', lobbyName);
            console.log('\nlobby successfully created. There are currently ' + ++lobbyCount + ' in use.\n');
        }
    }
} setInterval(queueService, 10);

function addUserToLobby(user, lobbyName) {
    userMap[user.name].lobby = lobbyName;
    let sockets = userMap[user.name].sockets;
    let socketKeys = Object.keys(sockets);
    // iterate through all live sockets to handle multiple tabs
    for (let key of socketKeys) {
        let socket = sockets[key];
        socket.join(userMap[user.name].lobby);
    }
}
function addToUserMap(user) {
    if (userMap[user.name] === undefined) {
        userMap[user.name] = user;
        activeUsers++;
    } else {
        user.id = userMap[user.name].id;
        user.lobby = userMap[user.name].lobby;
    }
    userMap[user.name].tabCount++;
}

function addToQueue(queue, user) {
    if (queues[queue] !== undefined) {
        queues[queue].push(user);
    } else {
        queues[queue] = [user];
        activeQueueList.push(queue);
    }
    console.log('user: ' + user.name + ' was pushed to ' + queue + ' with a size of ' + queues[queue].length);
}

function generateRandomName(size) {
    var name = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    for (let i = 0; i < size; i++) {
        name += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return name;
}