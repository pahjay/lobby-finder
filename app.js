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

let users = {};
let toBeDeleted = {}; // holds user info for those who disconnect but haven't timed out
let queues = {};  // holds all queues in the form of queues[queue name] =  []
let activeQueueList = [];   // holds the names of all currently active queue names,
let roomID = 0; // incrementing int which names the currently active rooms.
let lobbyCount = 0;
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
        this.socket = null;
        this.activeQueues = []; // all currently active queues the user is in
        this.tabCount = 1;
        this.disconnected = false; // disconnected flag for checking reconnects
    }

    existsInLobby() {
        if (users[this.name] !== undefined) {
            if (users[this.name].lobby !== null) {
                console.log(this.name + ' exists in a lobby.');
                return true;
            }
        }
        return false;
    };

    existsInQueues() {
        if (users[this.name] !== undefined) {
            if (users[this.name].activeQueues.length > 0) {
                return true;
            }
        }
        return false;
    };

    existsInQueue(queueName) {
        let selectedQueue = queues[queueName];
        if (selectedQueue !== undefined) {
            for (let i = 0; i < selectedQueue.length; i++) {
                if (this.name === selectedQueue[i].name) {
                    console.log(this.name + ' already exists in ' + queueName);
                    return true;
                }
            }
        }
        return false;
    }

    deleteFromQueues(){
        for (let i = 0; i < users[this.name].activeQueues.length; i++) {
            let queueName = users[this.name].activeQueues[i];
            let selectedQueue = queues[queueName];
            for (let x = 0; x < selectedQueue.length; x++) {
                if (this.name === selectedQueue[x].name) {
                    selectedQueue.splice(x, 1);
                    queues[queueName] = selectedQueue;
                    users[this.name].activeQueues.splice(i, 1);
                    break;
                }
                // delete user if no active queues left
                if (users[this.name].activeQueues.length === 0) {
                    delete users[this.name];
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
        delete users[this.name];
        console.log(this.name + ' has been deleted from lobby.');
    }

    removeFromActiveQueueList(queueName){
        for (let i = 0; i < this.activeQueues.length; i++) {
            if (queueName === this.activeQueues[i]) {
                users[this.name].activeQueues.splice(i, 1);
            }
        }
    }

    // removes users from all queues and lobbies
    delete(){
        if (this.existsInQueues()) {
            this.deleteFromQueues();
        } else if (this.existsInLobby()) {
            this.deleteFromLobby();
        } else {
            console.log('user does not exist in system.');
        }

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
    let name = testNames[Math.floor(Math.random() * testNames.length)];
    console.log(name + ' has connected.');
    let user = new User(name);
    if (users[user.name] === undefined) users[user.name] = user;
    io.to(socket.id).emit('setParams'); // debug call to automatically set parameters for new user connections

    // called when the user joins a lobby
    socket.on('joinQueue', function(queueName) {
        if (!user.existsInQueue(queueName) && !user.existsInLobby()) {
            addToQueue(queueName, user, socket);
            user.activeQueues.push(queueName);
        }
    });

    // handles when the user disconnects from the session
    socket.on('disconnect', function() {
        console.log(user.name + ' has disconnected');
        console.log('userID ' + user.id);
        console.log('lobby ' + user.lobby);

        toBeDeleted[user.name] = user;
        // console.log(user.name + ' has been added to the toBeDeleted list.');

        user.disconnected = true;
        setTimeout(function () {
            if (user.disconnected){
                user.delete();
            } else {
                console.log('secondary tab detected, ignoring delete call...');
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
                users[user.name].lobby = lobbyName;
                user.removeFromActiveQueueList(queueName);
                let socket = users[user.name].socket;
                socket.join(users[user.name].lobby);
                user.deleteFromQueues();
            }

            io.to(lobbyName).emit('alert', lobbyName);
            console.log('\nlobby successfully created. There are currently ' + ++lobbyCount + ' in use.\n');
        }
    }
} setInterval(queueService, 10);

// iterates through all active queues, if one is empty, erase
function queueManager() {

}

// iterates through all active lobbies, if all users have left the lobby, erase
function lobbyManager() {

}

function addToQueue(queue, user, socket) {
    if (queues[queue] !== undefined) {
        queues[queue].push(user);
    } else {
        queues[queue] = [user];
        activeQueueList.push(queue);
    }

    users[user.name].socket = socket;
    console.log('user: ' + user.name + ' was pushed to ' + queue + ' with a size of ' + queues[queue].length);
}