let http = require('http');
let express = require('express');
let app = express();
let server = http.createServer(app);
let io = require('socket.io').listen(server);

server.listen(3000);

// for debugging
let testNames = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'theta', 'kappa', 'lambda', 'zeta', 'tau', 'pi'];
let testGames = ['CounterStrikeGlobalOffensive', 'LeagueOfLegends'];
let testParam = ['beginner', 'intermediate'];


let lobbies = {};
let queues = {};
let activeQueueList = [];
let users = []; // this will be replaced once you can choose which game to queue for.
let socketMap = {};
let roomID = 0;

let s4 = function () {
    return Math.floor(Math.random() * 0x10000).toString();
};
let id_ = function () {
    return s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4();
};

// user class
class User {
    constructor(name_) {
        let id = id_();
        this.name = name_;
        this.id = id;
        this.disconnected = false;
        this.lobbyID = null;
    }

    exists(queueName) {
        if (queues[queueName] !== undefined) {
            var selectedQueue = queues[queueName];
            for (let i = 0; i < selectedQueue.length; i++) {
                if (this.name === selectedQueue[i].name) {
                    this.name = selectedQueue[i].name;
                    this.id = selectedQueue[i].id;
                    this.lobbyID = selectedQueue[i].lobbyID;
                    console.log(this.name + ' already exists, assigning id value');
                    return true;
                }
            }
        }
        return false;
    }

    delete(){
        userExistsInQueue = function() {
            for (let i = 0; i < users.length; i++) {
                if (users[i].id === this.id) return true;
            }
            return false;
        };

        // TODO: be able to delete from all relative queues
        // TODO: determine where the queue information will be stored
        // TODO: add queues to user class and remove when lobby is found?
        if (exists()) {
            delete users[this.id];
            console.log(this.name + ' has been deleted from the queue');
        } else if (lobbies[this.lobbyID] !== undefined) {
            delete lobbies[this.lobbyID].lobbyUsers[this.id];
            console.log(Object.keys(lobbies[this.lobbyID].lobbyUsers).length);
            console.log(this.name + ' has been deleted from the lobby');
        } else {
            console.log('user does not exist in system');
        }
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
    socket.on('joinQueue', function(queue) {
        if (!user.exists(queue)) addToQueue(queue, user, socket);
    });

    // handles when the user disconnects from the session
    socket.on('disconnect', function() {
        console.log(user.name + ' has disconnected');
        console.log('userID ' + user.id);
        console.log('lobbyID ' + user.lobbyID);

        user.disconnected = true;
        setTimeout(function () {
            // delete user from lobby
            // remove user socket from socket map
            if (user.disconnected){
                user.delete();
            }
        }, 5000);
    });

});

io.on('joinQueue', function(queue) {
    if (!user.exists(queue)) addToQueue(queue, user, socket);
});

// continuous service which drops the top X amount of players for each game queue into lobbies
// removes those players from other selected game queues if lobby has been found.
function queueService() {
    // iterate through all currently active queues
    for (i = 0; i < activeQueueList.length; i++) {
        if (queues[activeQueueList[i]].length >= 5) {
            let lobby = new Lobby();
            for (x = 0; x < 5; x++) {
                let user = queues[activeQueueList[i]].pop();
                let socket = socketMap[user.id];
                lobby.addUser(user);
                socket.join(lobby.room);
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