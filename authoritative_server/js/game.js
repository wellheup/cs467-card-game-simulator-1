const players = {};

const config = {
  type: Phaser.HEADLESS,
  width: 800,
  height: 600,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: {
        y: 0
      }
    }
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  },
  autoFocus: false
};

// Global all objects reference
// This keeps track of object position and other info to send to the users
// This has to be updated with information from the game environment as it 
// is seperate from the game objects
const objectInfoToSend = {};
var overallDepth = 0;

function preload() {
  //this.load.image('ship', 'assets/spaceShips_001.png');
  this.load.atlas('cards', 'assets/atlas/cards.png', 'assets/atlas/cards.json');
}

function create() {
  // For passing this pointer to other functions
  const self = this;

  // Makes this.objects a group of sprites with physics
  // This is the gameScene's group of objects
  this.tableObjects = this.physics.add.group();

  loadCards(self);
  let frames = self.textures.get('cards').getFrameNames();

  // While a connection is made
  io.on('connection', function (socket) {
    console.log('a user connected');

    socket.on('chat message', (msg) => {
      io.emit('chat message', msg);
    });
  
    // Listens for when a user is disconnected
    socket.on('disconnect', function () {
      console.log('user disconnected');
    });

    // Listens for object movement by the player
    socket.on('objectInput', function (inputData) {
      // Finds the object by id
      // tableObjects.getChildren() is based of when the sprites were addded
      // to the group (here it is one off)
      var obj = self.tableObjects.getChildren()[inputData.objectId-1];
      if(obj)
          obj.setPosition(inputData.x, inputData.y);
    });

    // Updates the depth when player picks up a card
    socket.on('objectDepth', function (inputData) {
      overallDepth++; // increases the depth everytime the player picks it up
      objectInfoToSend[inputData.objectId].objectDepth = overallDepth;
    });
    
    // Listens for object movement by the player
    socket.on('objectFlip', function (inputData) {
      objectInfoToSend[inputData.objectId].isFaceUp = inputData.isFaceUp;
    });
  });
}

function update() {
  // Update the object info to send to clients from game objects
  this.tableObjects.getChildren().forEach((object) => {
    objectInfoToSend[object.objectId].x = object.x;
    objectInfoToSend[object.objectId].y = object.y;
  });
  // Sends the card positions to clients
  io.emit('objectUpdates', objectInfoToSend);
}


function loadCards(self) {
  let frames = self.textures.get('cards').getFrameNames();

  let cardNames = ['back', 
    'clubsAce', 'clubs2', 'clubs3', 'clubs4', 'clubs5', 'clubs6', 'clubs7', 'clubs8', 'clubs9', 'clubs10', 'clubsJack', 'clubsQueen', 'clubsKing',
    'diamondsAce', 'diamonds2', 'diamonds3', 'diamonds4', 'diamonds5', 'diamonds6', 'diamonds7','diamonds8', 'diamonds9', 'diamonds10', 'diamondsJack', 'diamondsQueen', 'diamondsKing',
    'heartsAce', 'hearts2', 'hearts3', 'hearts4', 'hearts5', 'hearts6', 'hearts7', 'hearts8', 'hearts9', 'hearts10', 'heartsJack', 'heartsQueen', 'heartsKing',
    'spadesAce', 'spades2', 'spades3', 'spades4', 'spades5', 'spades6', 'spades7', 'spades8', 'spades9', 'spades10', 'spadesJack', 'spadesQueen', 'spadesKing',
    'joker'
  ];

  const xStart = 100;
  const yStart = 100;
  const xSpacing = 35;
  const ySpacing = 200;
  const perRow = 13;

  //add 52 playing cards in order
  for (let i = 1; i <= 52; i++) {
    let nextCard = frames[frames.indexOf(cardNames[i])];
    // Assigns the info to send to clients
    // initial position and information
    objectInfoToSend[i] = {
      x: ((i-1)%perRow) * xSpacing + xStart,
      y: Math.floor((i-1)/perRow) * ySpacing + yStart,
      objectId: i,
      objectName: cardNames[i],
      objectDepth: 0,
      isFaceUp: true  
    };
    addObject(self, objectInfoToSend[i], cardNames[i], nextCard);
  }

  
  //display joker card
  let jokerFrame = frames[frames.indexOf("joker")];
  let jokerId = 53;
  objectInfoToSend[jokerId] = {
    x: ((jokerId-1)%perRow) * xSpacing + xStart,
    y: Math.floor((jokerId-1)/perRow) * ySpacing + yStart,
    objectId: jokerId,
    isFaceUp: true  
  };
  addObject(self, objectInfoToSend[jokerId], cardNames[jokerId], jokerFrame);
 
}

function addObject(self, objectInfo, objectName, frame) {
  // Create object 
  // physics is used for future features
  const object = self.physics.add.sprite(objectInfo.x, objectInfo.y, 'cards', frame);
  // Assign the individual game object an id
  object.objectId = objectInfo.objectId;
  object.name = objectName;
  // Add it to the object group
  self.tableObjects.add(object);
}

const game = new Phaser.Game(config);
window.gameLoaded();