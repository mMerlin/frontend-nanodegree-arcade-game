/*jslint browser: true, indent: 2, maxlen: 82 */
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
 *    Peform 'landedOn' enemy action (check for teeth location)
 *      Some enemies are 'all' teeth
 *  Player moves to deadly terrain (the river, or far bank)
 *    Have invisible enemy sprite, and treat as 'landedOn'
 *    Set low Z, so will land on mobile enemy first
 *  Mobile enemy collides with player sprite
 *    Perform 'smash' enemy action
 *      Variant? of 'landOn'?, but teeth always at the front
 *
 * NOTE: logs are not really enemies.  The river is the enemy.  However
 *  crocodiles act the same as logs, plus they can eat a frog.  Simpler to have
 *  the log (and prizes) as enemies, but without a 'kill' method on collision.
 */

// Wrap the application code in a function to keep it out of the global
// namespace.  Except for the pieces explicitly stored there for other code to
// access.  This does not need to wait for the DOM to be loaded.  It does not
// access any elements directly.  Only on callback by the engine, which does
// need to wait.
(function () {
  'use strict';
  var Enemy, Frog;

  // Enemies our player must avoid
  Enemy = function () {
    // Variables applied to each of our instances go here,
    // we've provided one for you to get started

    // The image/sprite for our enemies, this uses
    // a helper we've provided to easily load images
    this.sprite = 'images/enemy-bug.png';
    this.x = 0;
    this.y = 0;
    this.speed = 0;
  };

  // Update the enemy's position, required method for game
  // Parameter: dt, a time delta between ticks
  Enemy.prototype.update = function (dt) {
    // You should multiply any movement by the dt parameter
    // which will ensure the game runs at the same speed for
    // all computers.
    //TODO: handle 'z' too, for water and submerging turtles
    if (!dt) { return; }//stub for jslint.
    //TODO: either properties of the instance control things like speed, or
    // this should be a super class method that invokes a subclass method
    // to handle variations.
    this.x += this.speed * dt;
  };

  // Draw the enemy on the screen, required method for game
  Enemy.prototype.render = function () {
    ctx.drawImage(Resources.get(this.sprite), this.x, this.y);
  };

  // Now write your own player class
  // This class requires an update(), render() and
  // a handleInput() method.
  Frog = function (icon) {
    this.sprite = icon;
    this.x = 200;
    this.y = 200;
  };

  Frog.prototype.render = function () {
    ctx.drawImage(Resources.get(this.sprite), this.x, this.y);
  };

  Frog.prototype.update = function () {
    return undefined;//TODO: stub
  };

  Frog.prototype.handleInput = function () {
    return undefined;//TODO: stub
  };

  // Now instantiate your objects.
  // Place all enemy objects in an array called allEnemies
  // Place the player object in a variable called player
  window.allEnemies = [];//TODO: Stub
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
