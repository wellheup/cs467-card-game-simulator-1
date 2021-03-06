const path = require('path');
const jsdom = require('jsdom');
const express = require('express');
const { Pool } = require('pg');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io').listen(server);
const Datauri = require('datauri');
const querystring = require('querystring'); 
var bodyParser = require('body-parser')

const datauri = new Datauri();
const { JSDOM } = jsdom;

let port = process.env.PORT || 8082;
// URL for the database given in .env file from heroku
const CONNECTION_STRING = process.env.DATABASE_URL || '';
// The server running on a local machine if no .env database url
const IS_LOCAL = CONNECTION_STRING == '';
// Length of time the server will wait to close after making the room
const SERVER_TIMEOUT = 86400000; // 24 hrs
// Info to send to the games about the room
const activeGameRooms = {};

let pool;

if(!IS_LOCAL) {
  // Setting up the postgres database
  pool = new Pool({
    connectionString: CONNECTION_STRING,
    ssl: { rejectUnauthorized: false },
    idleTimeoutMillis: 30000
  });
} else {
  console.log('Running on a local system.');
}

initializeDatabase();

app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: false }))

app.get('/', function (req, res) {  
  let requestedRoom = req.query.roomCode || '';

  if(!IS_LOCAL) {
    // Update activeGameRooms from database
    (async function() {
      let query = {
        text: "SELECT * FROM rooms WHERE room_code = $1",
        values: [requestedRoom]
      };
      const client = await pool.connect();
      await client.query(query, (err, result) => {
        if (err) {
            console.error(err);
            return;
        }
        if(result.rows.length == 0){
          console.log('requestedRoom does not exist');
          activeGameRooms[requestedRoom] = null;
        }
        lobbyRouter(requestedRoom, req, res);
        client.release();
      });
    })().catch( e => { console.error(e) })
  } else {
    lobbyRouter(requestedRoom, req, res);
  }
});

function lobbyRouter(requestedRoom, req, res) {
  // For regular requests to lobby
  if(!requestedRoom || requestedRoom == '') {
    renderHome(res).catch( e => { console.error(e) })
  } 
  // For specific rooms
  else if (activeGameRooms[requestedRoom] && activeGameRooms[requestedRoom].numPlayers < activeGameRooms[requestedRoom].maxPlayers) {
    var nickname = req.query.nickname || '';
    if(nickname != '') {
      const query = querystring.stringify({
        "nickname": nickname
      });
      res.sendFile(__dirname + '/views/index.html', query);
    } 
    else
      res.sendFile(__dirname + '/views/index.html');
  } 
  else {  // The gameroom is not active
    renderHome(res).catch( e => { console.error(e) })
  }
}

async function renderHome(res){
  let query = {
    text: "SELECT * FROM rooms",
    values: []
  };
  if(!IS_LOCAL) {
    const client = await pool.connect();
    await client.query(query)
    .then((result) => {
      Object.keys(activeGameRooms).forEach(key => {
        delete activeGameRooms[key];
      });
      if (result.rows.length == 0) {
        console.log('no results');
      }
      else{
        result.rows.forEach(row => {
          addToActiveGameRooms(row.room_code, row.num_players, row.max_players, row.room_name, row.room_owner, row.game_desc);
        });
      }
      res.render(__dirname + '/views/lobby.ejs', {activeGameRooms: activeGameRooms});
      client.release();
    })
    .catch(e => {
      console.error(e.stack);
      return;
    });
  }
  else{
    res.render(__dirname + '/views/lobby.ejs', {activeGameRooms: activeGameRooms});
  }
}

app.post('/host-a-game', function(req, res) {
  // Make a new roomCode
  var newRoomId = uniqueId();
  // Checks if we already have that room id
  while(activeGameRooms[newRoomId])
    newRoomId = uniqueId();

  let nickname = req.body.nickname || '';
  let maxPlayers = req.body.maxPlayers;
  let roomName = req.body.roomName || nickname + "'s room";
  let roomDesc = req.body.gameDesc || '';

  createRoom(newRoomId, maxPlayers, roomName, nickname, roomDesc).catch( e => { console.error(e) });

  if(nickname != '')
  nickname = '&nickname=' + nickname;

  // Make query to send gameroom info with URL
  const query = querystring.stringify({
      "roomCode": newRoomId
  });
  res.redirect('/?' + query + nickname);
});

// You must catch this async function for example: createRoom(**,**)).catch( e => { console.error(e) });
async function createRoom(roomCode, maxPlayers, roomName, roomOwner, gameDesc) {
  if(!IS_LOCAL) {
    const query = {
      text: 'INSERT INTO rooms (room_code, num_players, max_players, room_name, room_owner, game_desc) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      values: [roomCode, 0, maxPlayers, roomName, roomOwner, gameDesc]
    };
    const client = await pool.connect();
    await client
      .query(query)
      .then(res =>{
        const r = res.rows[0];
        addToActiveGameRooms(r.room_code, r.num_players, r.max_players, 
          r.room_name, r.room_owner, r.game_desc)
        setupAuthoritativePhaser(activeGameRooms[roomCode]);
      })
      .catch(e => console.error(e.stack));
    client.release();
  }
  else{
    addToActiveGameRooms(roomCode, 0, maxPlayers, roomName, roomOwner, gameDesc);
    setupAuthoritativePhaser(activeGameRooms[roomCode]);
  }
}

function addToActiveGameRooms(roomCode, numPlayers, maxPlayers, roomName, roomOwner, gameDesc){
  activeGameRooms[roomCode] = {
    roomCode: roomCode,
    numPlayers: numPlayers,
    maxPlayers: maxPlayers,
    roomName: roomName,
    roomOwner: roomOwner,
    gameDesc: gameDesc
  };
}

// You must catch this async function for example: deleteRoom(**).catch( e => { console.error(e) });
async function deleteRoom(roomCode) {
  activeGameRooms[roomCode] = null;
  if(!IS_LOCAL) {
    var query = {
      text: "DELETE FROM rooms WHERE room_code = $1", 
      values: [roomCode]
    };
    const client = await pool.connect();
    await client.query(query)
      .catch(e => console.error(e.stack));
    client.release();
  }
}

// Starts a new gameServer
function setupAuthoritativePhaser(roomInfo) {
  if(roomInfo && roomInfo.roomCode) {
    // Add to the room's socket io namespace
    let room_io = io.of('/' + roomInfo.roomCode);
    // Run a JSDOM script for the server game engine
    JSDOM.fromFile(path.join(__dirname, 'authoritative_server/room_host.html'), {
      // To run the scripts in the html file
      runScripts: "dangerously",
      // Also load supported external resources
      resources: "usable",
      // So requestAnimatinFrame events fire
      pretendToBeVisual: true
    }).then((dom) => {

      dom.window.URL.createObjectURL = (blob) => {
        if (blob){
          return datauri.format(blob.type, blob[Object.getOwnPropertySymbols(blob)[0]]._buffer).content;
        }
      };
      dom.window.URL.revokeObjectURL = (objectURL) => {};
      
      // Pass objects to auth game.js
      dom.window.io = room_io;        // Pass the socket io namespace name
      dom.window.IS_LOCAL = IS_LOCAL; // Let game.js know if it's running locally
      dom.window.pool = pool;         // Pass the pool for the database
      dom.window.roomInfo = roomInfo; // Pass room info to the server instance
      dom.window.numPlayers = 0;
      console.log('Server ' + roomInfo.roomName + ' started with code ' + roomInfo.roomCode +'.');

      // Simple shutdown timer so the server doesn't stay on forever
      var timer = setTimeout(function() {
        console.log('Server ' + roomInfo.roomName + ' stopped.');
        deleteRoom(roomInfo.roomCode).catch( e => { console.error(e) });
        dom.window.close();
      }, SERVER_TIMEOUT); 
    }).catch((error) => { console.log(error.message); });
  } else {
    console.log('Cannot start server because there is no room info.');
  }
}


// create a uniqueId to assign to clients on auth
const uniqueId = function () {
  return Math.random().toString(36).substr(4);
};

function initializeDatabase() {
  var query = 
    "DROP TABLE IF EXISTS players; "+
    "DROP TABLE IF EXISTS rooms; "+
    "CREATE TABLE rooms (" +
      "room_id serial PRIMARY KEY, "+
      "room_code VARCHAR (20) NOT NULL, "+
      "num_players INTEGER NOT NULL, "+
      "max_players INTEGER NOT NULL, "+
      "room_name VARCHAR (20), "+ 
      "room_owner VARCHAR (20), "+ //user who initiated room
      "game_desc TEXT"+ //string description of game in room
    "); ";
    // Not using players table but maybe in the future
    //"CREATE TABLE players (player_id serial PRIMARY KEY, player_name VARCHAR (50) NOT NULL, player_color VARCHAR (20), room INTEGER REFERENCES rooms);"
  (async function() {
    if(!IS_LOCAL) {
      const client = await pool.connect()
      await client.query(query)
      client.release()
    }
  })().catch( e => { console.error(e) }).then(() => {
    // -----------  For testing  ------------------
    createRoom('testing', 8, "Test Room", "Admin", "Freestyle ").catch( e => { console.error(e) });
    //createRoom('testing2', 8).catch( e => { console.error(e) });
    //----------------------------------------------
  });
}

server.listen(port, function () {
  console.log(`Listening on port ${server.address().port}`);
});