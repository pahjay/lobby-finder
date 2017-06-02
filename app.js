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


let toBeDeleted = {}; // holds user info for those who disconnect but haven't timed out
let lobbies = {}; // holds all lobbies in the form of lobbies[lobby.id] = lobby
let queues = {};  // holds all queues in the form of queues[queue name] =  []
let activeQueueList = [];   // holds the names of all currently active queue names,
                            // used to iterate through object list
let socketMap = {}; // holds all websocket info in the form of socketMap[user.id]
let roomID = 0; // incrementing int which names the currently active rooms.

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
        this.disconnected = false; // disconnected flag for checking reconnects
        this.lobbyID = null; // lobbyID once user is entered into a lobby
        this.activeQueues = []; // all currently active queues the user is in
    }

    // // // checks if a user exists in their selected queues
    // exists() {
    //     if (queues[queueName] !== undefined) {
    //         let selectedQueue = queues[queueName];
    //         for (let i = 0; i < selectedQueue.length; i++) {
    //             if (this.name === selectedQueue[i].name) {
    //                 this.name = selectedQueue[i].name;
    //                 this.id = selectedQueue[i].id;
    //                 this.lobbyID = selectedQueue[i].lobbyID;
    //                 console.log(this.name + ' already exists, assigning id value');
    //                 return true;
    //             }
    //         }
    //     }
    //     return false;
    // };

    existsInLobby() {
        return lobbies[this.lobbyID] !== undefined;
    };

    existsInQueues() {
        return this.activeQueues.length > 0;
    };

    existsInQueue(queueName) {
        let selectedQueue = queues[queueName];
        if (selectedQueue !== undefined) {
            for (let i = 0; i < selectedQueue.length; i++) {
                if (this.name === selectedQueue[i].name) {
                    console.log(this.name + ' already exists in ' + queueName);
                    this.id = selectedQueue[i].id;
                    this.lobbyID = selectedQueue[i].lobbyID;
                    this.activeQueues = selectedQueue[i].activeQueues;
                    return true;
                }
            }
        }
        return false;
    }



    deleteFromQueues(){
        for (let i = 0; i < this.activeQueues.length; i++) {
            let queueName = this.activeQueues[i];
            let selectedQueue = queues[queueName];
            for (let x = 0; x < selectedQueue.length; x++) {
                let temp = selectedQueue[x].name;
                if (this.name === selectedQueue[x].name) {
                    selectedQueue.splice(x, 1);
                    queues[queueName] = selectedQueue;
                    this.activeQueues.splice(i, 1);
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
        delete lobbies[this.lobbyID].lobbyUsers[this.id];
        console.log(this.name + ' has been deleted from the lobby');
    }

    removeFromActiveQueueList(queueName){
        for (let i = 0; i < this.activeQueues.length; i++) {
            if (queueName === this.activeQueues[i]) {
                this.activeQueues.splice(i, 1);
            }
        }
    }

    // removes users from all queues and lobbies
    delete(){

        // TODO: add queues to user class and remove when lobby is found?
        // TODO: remove users from the toBeDeleted list after removing from queue and/or lobbies.

        if (this.existsInQueues()) {
            this.deleteFromQueues();
        } else if (this.existsInLobby()) {
            this.deleteFromLobby();
        } else {
            console.log('user does not exist in system.');
        }

        delete toBeDeleted[this.name];
        console.log(this.name + ' has been removed from toBeDeleted array');
    };
}

// lobby class
class Lobby {
    constructor() {
        this.id = id_(); // unique id for lobby
        console.log('lobby with an id of ' + this.id +' created.');
        this.lobbyUsers = {}; // array of user objects
        this.room = roomID++; // this is the room these users connect to.
    }

    // assigns lobbyID and pushes to lobby users array
    addUser(user){
        user.lobbyID = this.id;
        this.lobbyUsers[user.id] = user;
    }
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
    console.log('\nuser connected');
    let name = testNames[Math.floor(Math.random() * testNames.length)];
    console.log(name);
    let user = new User(name);
    io.to(socket.id).emit('setParams'); // debug call to automatically set parameters for new user connections

    // called when the user joins a lobby
    socket.on('joinQueue', function(queueName) {
        if (!user.existsInQueue(queueName)) {
            addToQueue(queueName, user, socket);
            user.activeQueues.push(queueName);
        }
    });

    // handles when the user disconnects from the session
    socket.on('disconnect', function() {
        console.log(user.name + ' has disconnected');
        console.log('userID ' + user.id);
        console.log('lobbyID ' + user.lobbyID);

        toBeDeleted[user.name] = user;
        console.log(user.name + ' has been added to the toBeDeleted list.');

        user.disconnected = true;
        setTimeout(function () {
            // delete user from lobby
            // remove user socket from socket map
            if (user.disconnected){
                user.delete();
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
            let lobby = new Lobby();
            for (let x = 0; x < 5; x++) {
                let user = queues[queueName].pop();
                user.removeFromActiveQueueList(queueName);
                let socket = socketMap[user.id];
                lobby.addUser(user);
                socket.join(lobby.room);
                user.deleteFromQueues();
            }
            lobbies[lobby.id] = lobby;
            io.to(lobby.room).emit('alert', lobby.id);
            console.log('lobby successfully created. There are currently ' + Object.keys(lobbies).length + ' in use.');
        }
    }
} setInterval(queueService, 10);

/**
 *
 * @param queue this is the queue query that is created by the user
 * @param user holds the user info
 * @param socket holds the websocket id
 */
function addToQueue(queue, user, socket) {
    if (queues[queue] !== undefined) {
        queues[queue].push(user);
    } else {
        queues[queue] = [user];
        activeQueueList.push(queue);
    }

    // check if user already exists in queue
    socketMap[user.id] = socket;
    console.log('user: ' + user.name + ' was pushed to ' + queue + ' with a size of ' + queues[queue].length);
}