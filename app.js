let http = require('http');
let express = require('express');
let app = express();
let server = http.createServer(app);
let io = require('socket.io').listen(server);

server.listen(3000);

// for debugging
let testNames = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'theta', 'kappa', 'lambda', 'zeta', 'tau', 'pi'];

let lobbies = {};
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

    exists() {
        for (let i = 0; i < users.length; i++) {
            if (this.name === users[i].name) {
                this.id = users[i].id;
                console.log(this.name + ' already exists, assigning id value');
                return true;
            }
        }
        return false;
    }

    delete(){
        if (lobbies[this.lobbyID] !== null) {
            delete lobbies[this.lobbyID].lobbyUsers[this.id];
            console.log(Object.keys(lobbies[this.lobbyID].lobbyUsers).length);
            console.log(this.name + ' has been deleted from the lobby');
        }
    }
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
    if (!user.exists()) addToQueue(null, user, socket);

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

// continuous service which drops the top X amount of players for each game queue into lobbies
// removes those players from other selected game queues if lobby has been found.
function queueService() {
    if (users.length >= 5){
        let lobby = new Lobby();

        for (i = 0; i < 5; i++) {
            let user = users.pop(); // pop top users off queue and push to lobby
            let socket = socketMap[user.id];
            lobby.addUser(user);
            socket.join(lobby.room);
        }
        lobbies[lobby.id] = lobby;
        console.log('lobby successfully created. There are currently ' + Object.keys(lobbies).length + ' in use.');
        io.to(lobby.room).emit('alert', lobby.id);
    }
} setInterval(queueService, 10);

function addToQueue(queue, user, socket) {
    // check if user already exists in queue
    user.disconnected = false;
    socketMap[user.id] = socket;
    users.push(user);
    console.log('user: ' + user.name + ' was pushed to queue.');
}


// on joinLobby click add user to queue
io.on('joinLobby', function(){
    // user has games attributed to them
    // iterate through each game, and check if queue currently exists for that game
    // if it does, add user to bottom of that list
    // if it does not, alert user that they will be the only one in that list, then create it
});