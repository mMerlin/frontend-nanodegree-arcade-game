/*jslint browser: true, devel: true, todo: true, indent: 2, maxlen: 82 */
/*global Resources, ctx */

/* app.js
 * This file provides the functionality for the active game elements.  That is
 * anything that gets display on (over) the playing field.  This includes the
 * display and any funcational features of each element.  Current elements are
 * player (Frogs) and enemies.  Different enemies have different attributes.
 *
 * Game Events:
 *  Player moves to open (unoccupied) terrain (grass or roadway)
 *  Player moves to terrain already occupied by enemy
 *    Peform 'landedOn' enemy action: in base game, same as smash
 *  Player moves off of playing field
 *  Enemy collides with player sprite
 *    Perform 'smash' enemy action
 * Future Expansion game events:
 *  Player moves to terrain already occupied by enemy
 *    Peform 'landedOn' enemy action (check for teeth location)
 *      Some enemies are 'all' teeth
 *  Player moves to deadly terrain (the river, or far bank)
 *    Have invisible enemy sprite, and treat as 'landedOn'
 *    Set low Z, so will land on mobile enemy first
 *    Currently N/A, since no river to cross
 *  Player moves to terrain occupied by prize
 *  Enemy collides with prize
 *
 * NOTE: logs are not really enemies.  The river is the enemy.  However
 *  crocodiles act the same as logs, plus they can eat a frog.  Simpler to have
 *  the log (and prizes) as enemies, but without a 'kill' method on collision.
 *    Currently N/A, since no river to cross
 */

// Wrap the application code in a function to keep it out of the global
// namespace.  Except for the pieces explicitly stored there for other code to
// access.  This does not need to wait for the DOM to be loaded.  It does not
// access any elements directly.  Only on callback by the engine, which does
// need to wait.
(function () {
  'use strict';
  var Enemy, Frog;

  /**
   * Reset the current transform to the identity transformation
   *
   * NOTE: it might be better to use an inverse tranform operation (translate
   *   then scale), instead of setting to identity: if other processing wants
   *   to do their own transforms.  Like a straight translate to scroll the
   *   playing field vertically.
   */
  function setIdTransform() {
    this.setTransform(1, 0, 0, 1, 0, 0);
  }// ./function setIdTransform()

  /**
   * Set the transform needed to flip the playing field coordinates horizontally
   */
  function setFlipTransform() {
    // scale(-1, 1) === transform(-1, 0, 0, 1, 0, 0)
    // w = 505;//Width of the playfield (colWidth*numCols)
    // translate(-w, 0) === transform(1, 0, 0, 1, -w, 0)
    // http://bucephalus.org/text/CanvasHandbook/CanvasHandbook.html#fn22
    // combined => transform(-1, 0, 0, 1, -w, 0)
    this.setTransform(-1, 0, 0, 1, 505, 0);//width of play field
    // var calcTransform = composeTransform(
    //   [-1, 0, 0, 1, 0, 0],
    //   [1, 0, 0, 1, -w, 0]//testing seems to use w, not -w
    // );
  }// ./function setFlipTransform()

  // Enemies our player must avoid.  Pseudoclassical pattern
  Enemy = function (icon, gridRow, speed) {

    // The image/sprite for the enemy instance.  This looks like (and originally
    // was) a URL, but in this context is a key to the cached resource
    this.sprite = icon;
    this.row = gridRow;
    // Pixels per second
    this.speed = speed;
    /* Once placed, all current enemies stay on a specific grid row.  Convert
     * the gridRow (top (water) = 0) to a pixel position based on the grid row
     * height, plus an offset to account for internal tile positioning
     * differences.
     */
    this.y = (gridRow * 83) - 20;//rowHeight
    this.x = -101;//Just off the edge of the playing field (-colWdith)
    this.flip = false;
    if (speed < 0) {
      // need to use a horizontally flipped sprite
      // scale(-1,1) == transform(-1,0,0,1,0,0)
      // translate(-505,0) == transform(1,0,0,1,-505,0)//-505===field width
      // combined => transform(-1, 0, 0, 1, -171, 0)
      // http://bucephalus.org/text/CanvasHandbook/CanvasHandbook.html#fn22
      this.flip = true;
      this.speed = -this.speed;
      //this.trnsfrm = composeTransform(
      //  [-1, 0, 0, 1, 0, 0], [1, 0, 0, 1, -505, 0]
      //);
    }
    //Engine.field never created
    //Engine.field.rowHeight === 83;
    //Engine.field.tileHeight - Engine.field.rowHeight
    //  extra, but spread across top and bottom
    /* The sprite is the same height as the field grid tiles, but the bottom
     * padding is not the same, so need to use an offset to align with the
     * visible grid tiles.
     */
  };// function Enemy(icon, gridRow, speed)

  // Update the enemy's position, required method for game
  // Parameter: dt, a time delta between ticks
  Enemy.prototype.update = function (dt) {
    // You should multiply any movement by the dt parameter
    // which will ensure the game runs at the same speed for
    // all computers.
    //TODO: either properties of the instance control things like speed, or
    // this should be a super class method that invokes a subclass method
    // to handle variations.
    this.x += (this.speed * dt);
  };// ./function Enemy.prototype.update(dt)

  // Draw the enemy on the screen, required method for game
  Enemy.prototype.render = function () {
    //TODO: skip drawing if fully off the (visible) playing field
    if (this.flip) {// flip the coordinates to display the sprite
      setFlipTransform.call(ctx);
    }
    ctx.drawImage(Resources.get(this.sprite), this.x, this.y);
    if (this.flip) {// reset to the default transfrom, so the next draw works
      setIdTransform.call(ctx);
    }
  };// ./function Enemy.prototype.render()

  // The player.  Pseudoclassical pattern
  Frog = function (icon) {
    this.sprite = icon;
    this.x = 2 * 101;//col 2 * field.colWidth
    this.y = (5 * 83) - 30;//row 5 * field.rowHeight
  };// /.function Frog.constructor(icon);

  /**
   * For the current game frame, draw the player icon at the proper location on
   * the playing field.
   */
  Frog.prototype.render = function () {
    ctx.drawImage(Resources.get(this.sprite), this.x, this.y);
  };// ./function Frog.prototype.render()

  /**
   * For the current game frame, update the player’s position on the playing
   * field.
   *
   * NOTE: for the base project, the player position never changes based on the
   * time or frame.  It only changes when an input command is received, so there
   * is nothing to do here.  If expand the project to get to the river crossing,
   * then the player x position needs to be updated each frame to match the
   * item / enemy it is riding on.  With an offset that was initially set when
   * landing on the item.  Offset changes on command inputs.
   */
  Frog.prototype.update = function () {
    return undefined;
  };// ./function Frog.prototype.update()

  /**
   * Respond to position change commands
   */
  Frog.prototype.handleInput = function (cmd) {
    var i;//DEBUG
    switch (cmd) {
    case 'left':
      this.x -= 101;//field.colWidth
      break;
    case 'right':
      this.x += 101;
      break;
    case 'up':
      this.y -= 83;//field.rowHeight
      break;
    case 'down':
      this.y += 83;//field.rowHeight
      break;
    }
    //TODO: add limit checks for edge of field: die
    // might be 'automaic', based on collision logic?
    // DEBUG loop
    console.log('bugs');
    for (i = 0; i < window.allEnemies.length; i += 1) {
      console.log(window.allEnemies[i].x);
    }
  };

  // Now instantiate your objects.
  // Place all enemy objects in an array called allEnemies
  // Place the player object in a variable called player
  window.allEnemies = [
    new Enemy('images/enemy-bug.png', 1, 80),
    new Enemy('images/enemy-bug.png', 2, -40),
    new Enemy('images/enemy-bug.png', 3, 40)
  ];//TODO: Stub
  window.player = new Frog('images/char-boy.png');



  // This listens for key presses and sends the keys to your
  // Player.handleInput() method. You don't need to modify this.
  document.addEventListener('keyup', function (e) {
    var allowedKeys = {
      37: 'left',
      38: 'up',
      39: 'right',
      40: 'down'
    };

    window.player.handleInput(allowedKeys[e.keyCode]);
  });
}());
