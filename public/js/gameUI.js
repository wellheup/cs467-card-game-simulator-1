import { loadCards } from './cards.js';
import { cam, playerNickname } from './game.js';

export var playerRotation = 0, seatSelected = false;

export var seats = {
  ['1']: {
    x: ((window.innerWidth * 0.80) / 2),
    y: 20,
  },
  ['2']: {
    x: (((window.innerWidth * 0.80) / 2) + window.innerWidth) / 2,
    y: (window.innerHeight / 4) - 80,
  },
  ['3']: {
    x: (window.innerWidth * 0.80) - 30,
    y: window.innerHeight / 2,
  },
  ['4']: {
    x: (((window.innerWidth * 0.80) / 2) + window.innerWidth) / 2,
    y: (((window.innerHeight) + (window.innerHeight / 2)) / 2) + 80,
  },
  ['5']: {
    x: (window.innerWidth * 0.80) / 2,
    y: window.innerHeight - 40,
  },
  ['6']: {
    x: ((((window.innerWidth * 0.80) / 2)) / 2) - 80,
    y: (((window.innerHeight) + (window.innerHeight / 2)) / 2) + 80,
  },
  ['7']: {
    x: 40,
    y: window.innerHeight / 2,
  },
  ['8']: {
    x: 40,
    y: (window.innerHeight / 4) - 80,
  },
};

export function loadGameUI(self) {
  loadChat(self);
  loadHelp(self);
  loadMenu(self);
  loadSeats(self);
  loadCards(self);
}

function loadChat(self) {
  // Setup Chat
  $('#chat-form').submit(function(e) {
    e.preventDefault(); // prevents page reloading
    self.socket.emit('chat message', playerNickname + ': ' + $('#chat-msg').val());
    $('#chat-msg').val('');
    return false;
  });

  self.socket.on('chat message', function(msg){
    $('#messages').append($('<li>').text(msg));
  });
}

function loadHelp(self) {
  // jQuery to intereact with Help HTML element
  $('#help-button').click(function() {
    $('#help-area').show();

    self.input.keyboard.on('keyup-ESC', function (event) {
      $('#help-area').hide();
    });

    $('#exit-help').click(function() {
      $('#help-area').hide();
    });
  });
}

function loadMenu(self) {
    // jQuery to  interact with Menu HTML element
    $('#menu-button').click(function() {
      // Show menu element
      $('#menu-area').show();
      $('#user-name').val(playerNickname);
  
      $('#menu-form').submit(function(e) {
        e.preventDefault();
        if($('#background').val() != self.backgroundColor) {
          self.backgroundColor = self.cameras.main.setBackgroundColor($('#background').val());
        }
        if(playerNickname != $('#user-name').val()) {
          self.socket.emit('playerNickname', $('#user-name').val());
        }
      });
  
      self.input.keyboard.on('keyup-ESC', function (event) {
        $('#menu-area').hide();
      });
  
      $('#exit-menu').click(function() {
        $('#menu-area').hide();
      });
    });
}

function loadSeats(self) {

  self.socket.on('seatAssignments', function(serverSeats) {
    for (var x in seats) {
      seats[x].socket = serverSeats[x].socket;
      seats[x].id = serverSeats[x].id;
      seats[x].name = serverSeats[x].name;
      seats[x].available = serverSeats[x].available;
      seats[x].rotation = serverSeats[x].rotation;
      seats[x].transform = serverSeats[x].transform;
    }
    if (seatSelected == false) {
      $('div > button[value = true]').parent().remove(); // prevents duplicate buttons if multiple people are 
      for (var x in seats) {               // selecting seats at the same time 
        addSeat(self, seats[x]);
      }
      selectSeat(self);
    } else {
      $('div > button[value = false').parent().remove();
      for (var x in seats) {
        addSeat(self, seats[x]);
      }
      $('button[value=true]').hide();
    }
  });
}

function selectSeat(self) {
  var seatX, seatY;
  $('div > button').click(function() {
    if ($(this).val() == 'true') {
      $(this).text(playerNickname);
      $(this).val(false);
      // Set camera's angle
      for (var x in seats) {
        if (seats[x].id == $(this).attr('id')) {
          playerRotation = seats[x].rotation;
          seatX = seats[x].x;
          seatY = seats[x].y;
          cam.setAngle(playerRotation);
        }
      }

      self.socket.emit('seatSelected', {
        socket: self.socket.id,
        id: $(this).attr('id'),
        name: $(this).text(),
        available: false,
        playerSpacing: playerRotation,
        x: seatX,
        y: seatY
      });
      seatSelected = true;

      $('button[value=true]').hide();
    }
  });
}

function addSeat(self, seat) {
  self.add.dom(seat.x, seat.y).createFromCache('avatar');
  var openSeat = document.getElementById('player-button');
  openSeat.id = seat.id;
  openSeat.innerText = seat.name;
  openSeat.value = seat.available;
  openSeat.style.transform = 'rotate(' + (360 - seat.rotation).toString() + 'deg)';
}