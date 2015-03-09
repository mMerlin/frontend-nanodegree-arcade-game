/*jslint browser: true, devel: true, todo: true, indent: 2, maxlen: 82 */
/*global Resources, CustomEvent */

/* app.js
 * This file provides the functionality for the active game elements.  That is
 * anything that gets displayed on (over) the playing field.  This includes the
 * display and any functional features of each element.  Current elements are
 * player (Avatar) and enemies.  Different enemies have different attributes.
 *
 * Game Events:
 *  Player moves to open (unoccupied) terrain (grass or roadway)
 *  Player moves to terrain already occupied by enemy
 *    Perform 'landedOn' enemy action: in base game, same as smash
 *  Player moves off of playing field
 *  Enemy collides with player sprite
 *    Perform 'smash' enemy action
 * Future Expansion game events:
 *  Player moves to terrain already occupied by enemy
 *    Perform 'landedOn' enemy action (check for teeth location)
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
  var Sprite, STATE_ENUM, froggerInstance, app, engineNs;

  /**
   * Create a nested set of objects, (only) if any level(s) do not already exist
   *
   * Ref: http://elegantcode.com/2011/01/26/basic-javascript-part-8-namespaces/
   *
   * @param {string} namespaceString
   */
  function namespace(namespaceString) {
    var i, parts, parent, currentPart, length;
    parts = namespaceString.split('.');
    parent = window;
    currentPart = '';

    for (i = 0, length = parts.length; i < length; i += 1) {
      currentPart = parts[i];
      parent[currentPart] = parent[currentPart] || {};
      parent = parent[currentPart];
    }

    return parent;
  }// ./function namespace(namespaceString)

  /**
   * Create a custom event with fall back that works in IE (11 at least)
   *
   * @param {string} evName  The name for the custom event
   * @param {Object} evObj   The properties to include in the event details.
   * @returns {CustomEvent}
   */
  function makeCustomEvent(evName, evObj) {
    var cstEvnt;
    //IE11 fails on the 'standard' new CustomEvent() with 'Object doesn't
    //support this action'.  Provide a fall back.
    try {
      cstEvnt = new CustomEvent(evName, { detail : evObj });
    } catch (e) {
      cstEvnt = document.createEvent("CustomEvent");
      cstEvnt.initCustomEvent(evName, false, false, evObj);
    }
    return cstEvnt;
  }// ./function makeCustomEvent(evName, evObj)


  ///////////////////////////////////////////
  // Create Sprite (pseudoclassical) Class //
  ///////////////////////////////////////////

  /**
   * Pseudoclassical Class to hold information about sprite images that will be
   * placed and managed as part of the application.
   *
   * Wrap the creation of the class constructor function in an anonymous
   * function, to provide hiding of (class) private data and methods in the
   * function scope.
   *
   * @return {Function} Sprite class constructor
   */
  Sprite = (function () {
    // Private data for the class, accessible only be methods defined in the
    // current function scope
    var lastId, Sprite;

    // Shared functions that do not really belong in the prototype.  Using
    // (class private) function closure scope instead.

    //The last used ID (serial number) for created Sprite instances.
    lastId = 0;

    /**
     * Get the next available (unique) Sprite serial number
     *
     * @return {Integer} Sprite serial number
     */
    function getNextId() {
      lastId += 1;
      return lastId;
    }// ./function getNextId()

    /**
     * Constructor function for application sprite
     *
     * A Pseudoclassical Class, using private data and methods,
     * to hold information about sprite images that will
     * be placed and managed as part of the application.
     *
     * NOTE: None of the constructor parameters are required to be able to
     *  initially create an instance of a Sprite.  However, they will all need to
     *  be filled in before the sprite can actually be displayed.
     *
     * @param {string} imgRsrc       URL for the image file, which in this
     *                    context is the key to the cached image resource.
     * @param {Number} spriteX       x coordinate of the sprite
     * @param {Number} spriteY       y coordinate of the sprite
     * @param {Object} spriteCanvas  The CanvasRenderingContext2D to display the
     *                    sprite on.
     * @return {Object} Sprite instance
     */
    Sprite = function (imgRsrc, spriteX, spriteY, spriteContext) {
      this.private = {};// (psuedo) private storage for class instances
      // If want 'real' private data, this could be stored in an object in the
      // class private data area, and looked up based on the (unique) id.

      this.id = getNextId();
      this.sprite = imgRsrc;
      // Coordinate information for the (image for) the sprite within the
      // containing application canvas.
      this.position = {
        "x" : spriteX,
        "y" : spriteY,
        "flipped" : false
      };

      // Storing the context in the Sprite instance supports having multiple
      // canvases in a single application, and gets rid of the need for a
      // global reference
      this.context = spriteContext;
    };// ./function Sprite(imgRsrc, spriteX, spriteY, spriteContext)

    // Return the constructor function, with the linked function scope extras
    return Sprite;
  }());// ./function Sprite()

  // Add the needed shared class method functions to the prototype

  /**
   * Set the transform needed to flip the playing field coordinates horizontally
   *
   * @return {undefined}
   */
  Sprite.prototype.setFlipTransform = function (offset) {
    // scale(-1, 1) === transform(-1, 0, 0, 1, 0, 0)//horizontal flip
    // w = this.context.canvas.width;
    // translate(-w, 0) === transform(1, 0, 0, 1, -w, 0)
    // http://bucephalus.org/text/CanvasHandbook/CanvasHandbook.html#fn22
    // combined => transform(-1, 0, 0, 1, -w, 0)
    this.context.setTransform(-1, 0, 0, 1, offset, 0);
    // var calcTransform = composeTransform(
    //   [-1, 0, 0, 1, 0, 0],
    //   [1, 0, 0, 1, -w, 0]
    // );
  };// ./function Sprite.prototype.setFlipTransform(offset)

  /**
   * Display the sprite on its canvas
   *
   * @return {undefined}
   */
  Sprite.prototype.render = function () {
    // TODO: skip (just return) if completely outside of the visible
    // canvas area
    // Handle reversing the coordinate system, to display the graphic image
    // flipped horizontally
    if (this.position.flipped) {
      this.context.save();
      // The 'simplest' horizontal flip uses offset cell.width with draw at -.x
      // To reduce code duplication, using offset cell.width + 2 * .x, and
      // draw at .x, so the draw is the same for either case
      this.setFlipTransform(this.cell.width + 2 * this.position.x);
    }
    this.context.drawImage(Resources.get(this.sprite),
      this.position.x, this.position.y
      );
    if (this.position.flipped) {// Undo the swapped coordinate system
      this.context.restore();
    }
  };// ./function Sprite.prototype.render()

  // /**
  //  * Do the sprite coordinates make it (at least partially) visible on the
  //  * canvas?
  //  *
  //  * @return {boolean}
  //  */
  // Sprite.prototype.isOnCanvas = function () {
  //   return (
  //     this.position.x > 0 - /* (sprite width - left padding) */ &&
  //     this.position.y > 0 - /* (sprite height - top padding) */ &&
  //     this.position.x < this.context.canvas.width &&
  //     this.position.y < this.context.canvas.height );
  // };// ./function Sprite.prototype.isOnCanvas()


  ////////////////////////////////////////////////
  // Create Enemy (pseudoclassical) [sub]Class //
  ////////////////////////////////////////////////

  // Shared functions that do not really belong in the prototype.  Using
  // function closure scope instead.

  /**
   * Set the sprite speed, and adjust the orientation based on movement direction
   *
   * Enemy class speed property setter function
   *
   * @param {Number} newSpeed     Pixels per Second
   * @return {Number}
   */
  function setSpeed(newSpeed) {
    this.private.speed = newSpeed;
    this.position.flipped = false;
    if (newSpeed < 0) {
      // need to use a horizontally flipped sprite.  Or place (done here) on
      // the canvas using a horizontally flipped coordinate system.
      this.position.flipped = true;
    }
    return this.private.speed;
  }// ./function setSpeed(newSpeed)

  /**
   * Enemy class speed property getter function
   *
   * This will always be non-negative.  Reverse direction speeds are indicated
   * by this.position.flipped being true.
   * TODO: verify? changing the transform ?plus? set placement coordinate to 0
   * might work, and would simplify collision detection with flipped sprites
   *
   * @return {Number}
   */
  function getSpeed() {
    return this.private.speed;
  }// ./function getSpeed()

  /**
   * Convert the logical grid column number to a canvas x (pixel) coordinate.
   *
   * Enemy class column property setter function
   *
   * @param {Integer} colNumber   The grid column for the sprite
   * @return {Integer}
   */
  function setColumn(colNum) {
    this.private.column = colNum;
    this.position.x = (colNum * this.cell.width) + this.colOffset;
    return this.private.column;
  }// ./function setColumn(colNum)

  /**
   * Enemy class column property getter function
   *
   * This may not be accurate.  It is the value that was previously set, but
   * sprite movement could have altered the position away from the column.
   *
   * @return {Number}
   */
  function getColumn() {
    return this.private.column;
  }// ./function getColumn()

  /**
   * Convert the logical grid row number to a canvas y (pixel) coordinate.
   *
   * Enemy class row property setter function
   *
   * @param {Integer} rowNumber   The grid row for the sprite
   * @return {Integer}
   */
  function setRow(rowNum) {
    this.private.row = rowNum;
    this.position.y = (rowNum * this.cell.height) + this.rowOffset;
    return this.private.row;
  }// ./function setRow(rowNum)

  /**
   * Enemy class row property getter function
   *
   * This may not be accurate.  It is the value that was previously set, but
   * sprite movement could have altered the position away from the row.
   *
   * @return {Number}
   */
  function getRow() {
    return this.private.row;
  }// ./function getRow()

  /**
   * Enemy sprite class constructor function
   *
   * A Pseudoclassical subClass (of Sprite) to hold information about enemy
   * sprites the avatar must avoid.
   *
   * @param {string} imgRsrc      URL for the image file, which in this context
   *                    is the key to the cached image resource.
   * @param {Integer} gridRow     The logical grid row for the instance
   * @param {Integer} ofstVert    The vertical (pixel) offset from the grid row
   * @param {Number} speed        The sprite movement speed (pixels/second)
   * @param {Object} cvsContext The CanvasRenderingContext2D to display the
   *                    sprite on.
   * @param {Object} gridCell     Dimensions for a single cell on the grid
   * @return {Object} Enemy instance
   */
  function Enemy(imgRsrc, gridRow, ofstVert, speed, cvsContext, gridCell) {
    Sprite.call(this, imgRsrc, undefined, undefined, cvsContext);

    // Add get and set for properties where setting has side effects
    Object.defineProperty(this, "speed", {
      set : setSpeed,
      get : getSpeed
    });
    Object.defineProperty(this, "col", {
      set : setColumn,
      get : getColumn
    });
    Object.defineProperty(this, "row", {
      set : setRow,
      get : getRow
    });

    if (gridCell) {
      this.cell = gridCell;
    } else {
      this.cell = { height : 0, width : 0 };
    }

    // Once placed, all current enemies stay on a specific grid row.
    this.rowOffset = ofstVert || 0;
    this.row = gridRow || 0;
    // Always start an enemy sprite one grid column off (before the) canvas.
    // With enemy sprite image tiles that are the same width as a grid column,
    // that will place them just off of the visible canvas.
    this.colOffset = 0;
    this.col = -1;
    this.speed = speed || 0;// Pixels per second
  }// ./function Enemy(imgRsrc, gridRow, ofstVert, speed, cvsContext, gridCell)
  Enemy.prototype = Object.create(Sprite.prototype);
  Enemy.prototype.constructor = Enemy;

  /**
   * Update the sprite position based on the speed and elapsed time.
   *
   * (Current) Enemies only move horizontally, so only the x position is
   * changing.
   *
   * @param {Number} dt   Delta Time (since previous update) in seconds
   * @return {undefined}
   */
  Enemy.prototype.update = function (dt) {
    this.position.x += (this.speed * dt);// standard distance formula: Δs=v*Δt
  };// ./function Enemy.prototype.update(dt)

  /**
   * Do the sprite coordinates make it (at least partially) visible on the canvas
   *
   * For the way the class is used, the sprite is always on the canvas
   * vertically.  Just need to check the x coordinate.
   *
   * @return {boolean}
   */
  Enemy.prototype.isOnCanvas = function () {
    // .x > (0 - (.cell.width - .colOffset))
    // .x > (.colOffset - .cell.width)
    var offsetX = this.position.x - this.colOffset;
    return (
      (offsetX > -this.cell.width) &&
      (offsetX < this.context.canvas.width)
    );
      // this.position.x > (this.colOffset - this.cell.width) &&
      // this.position.x < (this.context.canvas.width + this.colOffset) &&
  };// ./function Enemy.prototype.isOnCanvas()

  /**
   * Has the sprite moved off of the canvas (is no longer visible)
   *
   * NOTE: This is NOT the reverse of .isOnCanvas.  Only sprites that are beyond
   * the far end of the canvas (based on movement direction) will return true
   * here.  Sprites that have not started across the canvas, or currently on
   * the canvas, will return false.
   *
   * @return {boolean}
   */
  Enemy.prototype.isOffEnd = function () {
    // if (this.position.flipped) {
    if (this.speed < 0) {
      return (this.position.x - this.colOffset <= -this.cell.width);
    }
    return (this.position.x - this.colOffset >= this.context.canvas.width);
  };// ./function prototype.isOffEnd()


  ////////////////////////////////////////////////
  // Create Avatar (pseudoclassical) [sub]Class //
  ////////////////////////////////////////////////

  /**
   * Player avatar class constructor function
   *
   * A Pseudoclassical subClass (of Enemy) to hold information about a player
   * avatar that will be placed and managed as part of the application (game).
   *
   * @param {string} imgRsrc      URL for the image file, which in this context
   *                    is the key to the cached image resource.
   * @param {Integer} gridRow     The logical grid row for the instance
   * @param {Integer} gridCol     The logical grid column for the instance
   * @param {Integer} ofstVert    The vertical (pixel) offset from the grid row
   * @param {Integer} ofstHoriz   The horizontal (pixel) offset from the grid
   *                              column
   * @param {Object} cvsContext The CanvasRenderingContext2D to display the
   *                    sprite on.
   * @param {Object} gridCell     Dimensions for a single cell on the grid
   * @return {Object} Avatar instance
   */
  function Avatar(imgRsrc, gridRow, gridCol, ofstVert, ofstHoriz, cvsContext,
      gridCell
      ) {
    Enemy.call(this, imgRsrc, gridRow, ofstVert, undefined, cvsContext, gridCell);
    this.pendingCommand = null;
    this.colOffset = ofstHoriz;
    this.col = gridCol;
    this.sleeping = true;// Avatar does not respond to commands while sleeping
  }// ./function Avatar(imgRsrc, gridRow, gridCol, ofstVert, ofstHoriz,
  //      cvsContext, gridCell)
  Avatar.prototype = Object.create(Enemy.prototype);
  Avatar.prototype.constructor = Avatar;

  /**
   * Respond to position change commands
   *
   * @param {string} cmd A movement command
   * @return {undefined}
   */
  Avatar.prototype.handleInput = function (cmd) {
    // var i;//DEBUG
    // Save the command until ready to update for the next animation frame.
    // Commands are NOT queued.  If multiple commands arrive in the same frame,
    // only the last one will get processed.
    this.pendingCommand = cmd;
    console.log((new Date()).toISOString() +
      ' reached handleInput: cmd = "' + cmd + '".'
      );
    // DEBUG loop
    // console.log('bugs');
    // for (i = 0; i < engineNs.allEnemies.length; i += 1) {
    //   console.log(engineNs.allEnemies[i].position.x);
    // }
  };// ./function Avatar.prototype.handleInput(cmd)

  /**
   * Update the avatar position on the canvas.
   *
   * This is based on movement commands received by this.handleInput, but the
   * actual updates are done here, to keep synchronized with the animation
   * frames.  This overrides the method of the same name 'inherited' from Enemy
   * through the prototype chain.
   *
   * @return {undefined}
   */
  Avatar.prototype.update = function () {
    var appEvent;
    // Process any pending (movement) command, passing anything else to the
    // application.
    if (this.pendingCommand) {
      console.log((new Date()).toISOString() +
        ' reached update; pending command: cmd = "' + this.pendingCommand +
        '".'
        );
      switch (this.pendingCommand) {
      case 'left':
        if (!this.sleeping) {
          this.col -= 1;
        }
        break;
      case 'right':
        if (!this.sleeping) {
          this.col += 1;
        }
        break;
      case 'up':
        if (!this.sleeping) {
          this.row -= 1;
        }
        break;
      case 'down':
        if (!this.sleeping) {
          this.row += 1;
        }
        break;
      default:
        // Just pass the command along to the main application.  *We* do not need
        // to know anything about it.
        console.log((new Date()).toISOString() +
          ' update passing pending command: cmd = "' + this.pendingCommand +
          '" to application'
          );
        appEvent = makeCustomEvent("ApplicationCommand", {
          message : "Application Event received",
          command : this.pendingCommand
        });
        document.dispatchEvent(appEvent);
        break;
      }// ./switch (this.pendingCommand)

      if (!this.sleeping) {// debug
        console.log((new Date()).toISOString() +
          ' pending command: cmd = "' + this.pendingCommand +
          '" processed in update'
          );
      }
      // Always clear any pending command.  Commands not queued while they are
      // not being processed.
      this.pendingCommand = null;
    }// ./if (this.pendingCommand)
    //TODO: add limit checks for edge of field: die
    // might be 'automatic', based on collision logic?
  };// ./function Avatar.prototype.update()

  /**
   * Setup any 'death throes' for the Avatar
   *
   * @return {undefined}
   */
  Avatar.prototype.die = function (cause) {
    // TODO: stub
    // Save any internal state before changing to show the death throes
    // change icon? animate? spin and shrink?
    // ?? just hide the avatar, and use another sprite for that ??
    this.livingSprite = this.sprite;
    console.log('Avatar died ' + cause);
  };// ./function Avatar.prototype.die(cause)

  /**
   * Restore to 'normal' conditions after death throes finished
   *
   * @return {undefined}
   */
  Avatar.prototype.resurrect = function () {
    // TODO: stub
    // restore any (internal) changes made to show the death throes
    this.sprite = this.livingSprite;
    console.log('Avatar resurrected');
  };// ./function Avatar.prototype.resurrect()


  ////////////////////////////////////////////
  // Create Frogger (pseudoclassical) Class //
  ////////////////////////////////////////////

  // Internal shared, helper, utility, modularizing functions and data that do
  // not really belong in the prototypes.  Using function closure scope instead.

  // Internal constants
  STATE_ENUM = {
    "waiting" : "waiting",
    "dieing" : "Avatar dieing",
    "resurrect" : "resurrect",
    "newlevel" : "new level",
    "running" : "running"
  };

  /**
   * Get the 1 based level number to use when showing it to the user
   *
   * @return {Integer}
   */
  function getLevel() {
    return this.lvlIndex + 1;
  }// ./function getLevel()

  /**
   * Frogger class state property getter function
   *
   * Return the state from the (conceptually) private property
   *
   * @return {string}
   */
  function getState() {
    return this.private.state;
  }// ./function getState()

  /**
   * Change the application state, and update dependant properties. to match
   *
   * Frogger class state property setter function
   *
   * @param {string} newState   The destination state from STATE_ENUM
   * @return {string}
   */
  function setState(newState) {
    var prevState;
    console.log((new Date()).toISOString() + ' changing state: "' +
      this.private.state + '" ==> "' + newState + '"'
      );
    prevState = this.private.state;// if any logic needs to know the state path
    this.private.state = newState;//TODO: add validation before setting?
    this.elapsedTimes.state = 0;
    switch (newState) {
    case STATE_ENUM.waiting:
      this.elapsedTimes.level = 0.0001;// Enough to trigger initial pattern change
      break;
    case STATE_ENUM.running:
      this.tracker.scrollMessage = false;
      this.player.sleeping = false;
      break;
    case STATE_ENUM.newlevel:
      this.lvlIndex += 1;
      // TODO: handle (better) if this.lvlIndex >= max configured levels
      if (this.lvlIndex >= this.APP_CONFIG.enemy.levels.length) {
        throw new Error('Game broken, no level ' + this.level + ' configuration');
      }
      // Set timeout value (for the state), then switch to running?
      this.state = STATE_ENUM.waiting;
      break;
    case STATE_ENUM.dieing:
      this.player.die(this.reason);
      this.elapsedTimes.level = 0;
      //this.finiteState.next = STATE_ENUM.resurrect;
      //this.finiteState.delay = 5;//seconds for death throes
      // = this.APP_CONFIG. ? .displayDeath;
      break;
    case STATE_ENUM.resurrect:
      this.player.resurrect();
      this.lives -= 1;
      if (this.lives <= 0) {
        throw new Error('Not Implemented: game over');
      }
      // - space to start message ? game over? start game over in above
      this.state = STATE_ENUM.waiting;
      break;
    // case STATE_ENUM.otherRecognized:
    //   states that do not need any extra processing
    //   .paused ?
    //   break;
    default:
      throw new Error('Unknown target state: ' + newState +
        '; from state = "' + prevState + '"'
        );
      // break;
    }
    if (prevState === STATE_ENUM.running) {
      this.player.sleeping = true;
    }
    console.log((new Date()).toISOString() + ' changed state: "' +
      prevState + '" ==> "' + this.private.state + '"'
      );
    return this.private.state;
  }// ./function setState(newState)

  /**
   * Advance internal application time values based on the current state
   *
   * @param {Number} deltaTime    Seconds elapsed since previous frame processed
   * @return {undefined}
   */
  function manageTime(deltaTime) {
    // Always up the time for the current state.  It is not actually used for
    // most states, but will never conflict.  Anywhere it WOULD conflict gets
    // its own separate property in this.elapsedTimes
    this.elapsedTimes.state += deltaTime;
    if (this.state === STATE_ENUM.running) {
      // Only increase the elapsed level time when the application is running
      this.elapsedTimes.level += deltaTime;
    }
  }

  // Store the single actual instance of the application class
  froggerInstance = false;
  // TODO: wrap the Frogger class constructor and the froggerInstance instance
  // variable in another function that returns the (inner) Frogger function.
  // Same structure as the Sprite function, using the private 'class scope'
  // (function closure scope) data area to hold the instance reference.

  // more closure scope properties for the PaceCar (inner) Class

  /**
   * PaceCar class message property getter function
   *
   * @return {string}
   */
  function getMessage() {
    return this.private.message;
  }// ./function getMessage()

  /**
   * Set the message text to be display in the HUD status line
   *
   * PaceCar class message property setter function
   *
   * @param {string} message    The message content
   * @return {string}
   */
  function setMessage(message) {
    this.private.message = message;// Immutable
    // Setup to start displaying the new message
    this.scrollMessage = true;
    this.position.x = this.context.canvas.width;
    this.scrollEnd = this.position.x;

    return this.private.message;
  }

  /**
   * Class to control the application and operations sequence
   *
   * @return {Object} Application instance
   */
  function Frogger() {
    var that;
    this.private = {};// (psuedo) private storage for class instances

    // Reasonably robust singleton class pattern implementation
    if (froggerInstance) {
      return froggerInstance;
    }
    froggerInstance = this;

    // Create a function closure scope tag to allow the inner functions to get
    // back into the right context, when invoked with a different context.
    that = this;

    ///////////////////////////////////////////////////////////
    // Definition of functions for the 'inner' PACEcAR class //
    ///////////////////////////////////////////////////////////

    /* NOTE: With the current application structure, only a single instance of
     * the (singleton) Frogger class should ever need to be created.  That
     * should avoid the memory leak associated with getting a new copy of all
     * locally defined functions each time the Frogger function is called.  It
     * should only happen once, so only a single copy of the PaceCar related
     * functions should ever be created.
     */

    // TODO: Verify logic: inner class
    /**
     * Tracking sprite: allow application to interface with animation engine
     *
     * A Pseudoclassical subClass (of Sprite) used to pick up elapsed time
     * information, and as a hook to display time, level, score, lives, and
     * other dynamic information as the game Progresses.
     *
     * @param {Object} spriteCanvas The CanvasRenderingContext2D to display the
     *                    information on.
     * @return {Object} PaceCar instance
     */
    function PaceCar(cvsContext) {
      // Access outer function Frogger constructor 'this' context through 'that'
      Sprite.call(this, that.APP_CONFIG.enemy.spriteTile, 0,
        undefined, cvsContext);
      this.speed = 0;// Not using the setter from Enemy
      this.scrollMessage = false;
      // Automatically update dependant properties on state changes
      Object.defineProperty(this, "message", {
        get : getMessage,
        set : setMessage
      });

    }// ./function PaceCar(cvsContext)
    PaceCar.prototype = Object.create(Enemy.prototype);
    PaceCar.prototype.constructor = PaceCar;

    /**
     * Update game state based on the elapsed time in the animation engine
     *
     * @param {Number} deltaTime  (Fractional) seconds since previous update
     * @return {undefined}
     */
    PaceCar.prototype.update = function (deltaTime) {
      // Access outer function Frogger constructor 'this' context through 'that'
      that.next(deltaTime);
      // Update the instance position as well, to handle scrolling HUD messages
      if (this.scrollMessage) {
        if (this.scrollEnd < 0) {
          // Message has scrolled off of the canvas
          this.scrollMessage = false;
          this.position.x = this.context.canvas.width;
          this.scrollEnd = this.position.x;
        } else {
          this.position.x += this.message.speed * deltaTime;
        }
        //TODO: add logic to change the message occasionally
      }
    };// ./function PaceCar.prototype.update(deltaTime)

    /**
     * Handle display of non-sprite information as a HUD overlay.
     *
     * This overrides the superclass render function.  This sub-classed sprite
     * does not need to display 'itself'
     *
     * @return {undefined}
     */
    PaceCar.prototype.render = function () {
      var ctx, hud, segWidths, tm, tmStr;
      // Access outer function Frogger constructor 'this' context through 'that'

      /**
       * Helper function to place a piece of constant text based on a descriptor
       * block
       *
       * @param {Object} block Properties define what and where to place the text
       * @param {Integer} yPos The vertical position to place the text
       * @return {Integer}
       */
      function placeLabel(block, yPos) {
        var calcWidth;
        this.save();
        // Apply (cascading) overrides
        if (block.baseline) {
          this.textBaseline = block.baseline;
        }
        if (block.font) {
          this.font = block.font;
        }
        if (block.style) {
          this.fillStyle = block.style;
        }
        this.fillText(block.text, block.left, yPos, block.maxWidth);
        // Get the space actually used when the label is drawn
        calcWidth = Math.min(this.measureText(block.text).width, block.maxWidth);
        this.restore();
        return calcWidth;
      }// ./function placeLabel(block, yPos)

      /**
       * Helper function to place calculated text based on a descriptor block
       *
       * This calculates the space used by, and the location of preceding and
       * following label text, then applies margin information to calculate where
       * to place the text, and what width limit to apply.
       *
       * @param {string|Integer} val value to be drawn as text
       * @param {Object} desc     Placement properties for val
       * @param {Object} startX   Ending position for the preceding label
       * @param {Object} endX     Starting position the following label
       * @param {Integer} yPos    The vertical position to place the text
       * @return {undefined}
       */
      function placeValue(val, desc, startX, endX, yPos) {
        var leftX, rightX, maxWidth, placeX;
        this.textAlign = desc.align;
        leftX = startX + desc.margin.left;
        rightX = endX - desc.margin.right;
        maxWidth = rightX - leftX;
        if (desc.align === 'right') {
          placeX = rightX;
        } else if (desc.align === 'center') {
          placeX = leftX + (maxWidth / 2);
        } else {// 'left', or any unrecognized alignment
          placeX = leftX;
        }
        this.fillText(val, placeX, yPos, maxWidth);
      }// ./function placeValue(val, desc, prev, next, yPos)

      ctx = this.context;
      ctx.save();

      hud = that.APP_CONFIG.hud;

      // Clear the top and bottom 'transparent' information areas
      ctx.clearRect(0, 0, ctx.canvas.width, hud.headline.height);
      ctx.clearRect(0, ctx.canvas.height - hud.statusline.height,
        ctx.canvas.width, ctx.canvas.height);

      // Setup the base placement information
      // It appears that Google Chrome handles baseline more like bottom, instead
      // of alphabetic.  At least for (the result of) "Lucida Console, Monaco,
      // monospace".  The displayed text was being raised a few pixels relative
      // to the labels, which were using "Tahoma, Geneva, sans-serif", or
      // "Times New Roman, Times, serif"
      // ctx.textBaseline = 'ideographic';
      // ctx.textBaseline = 'bottom';
      ctx.textBaseline = 'alphabetic';
      ctx.font = hud.headline.labelsfont;
      ctx.fillStyle = hud.labels.style;
      // For the current 'placeValue' positioning logic to work, the labels
      // need to stay left aligned.  No alignment overrides done in placeLabel
      ctx.textAlign = 'left';

      segWidths = {};
      // TODO: IDEA: change the time label colour (style) based on time remaining
      // stl = styleCalc(that.currentSettings.levelTime, that.elapsedTimes.level);
      // green>>yellow>>red
      segWidths.time = placeLabel.call(ctx, hud.labels.time, hud.headline.baseY);
      segWidths.level = placeLabel.call(ctx, hud.labels.level,
        hud.headline.baseY
        );
      segWidths.score = placeLabel.call(ctx, hud.labels.score,
        hud.headline.baseY
        );

      if (!this.scrollMessage) {
        // Only put 'static' information on the status line when not scrolling
        ctx.font = hud.statusline.labelsfont;
        segWidths.lives = placeLabel.call(ctx, hud.labels.lives,
          ctx.canvas.height + hud.statusline.baseY
          );
      }

      ctx.font = hud.headline.valuesfont;
      ctx.fillStyle = hud.values.style;

      tm = that.currentSettings.levelTime - that.elapsedTimes.level;
      tmStr = Number(tm).toFixed(1);
      //zfStr = (tm < 99.5) ? ('00' + tmStr).slice(-4) : tmStr;//leading zeros
      placeValue.call(ctx, tmStr, hud.values.time,
        hud.labels.time.left + segWidths.time,
        hud.labels.level.left, hud.headline.baseY
        );
      placeValue.call(ctx, that.level, hud.values.level,
        hud.labels.level.left + segWidths.level,
        hud.labels.score.left, hud.headline.baseY
        );
      placeValue.call(ctx, that.score, hud.values.score,
        hud.labels.score.left + segWidths.score,
        ctx.canvas.width, hud.headline.baseY
        );

      if (this.scrollMessage) {
        ctx.font = hud.statusline.messagesfont;
        ctx.fillStyle = this.message.style;
        ctx.textAlign = 'left';
        ctx.fillText(this.message.text, this.position.x,
          hud.statusline.baseY + ctx.canvas.height
          );
        segWidths.scroll = ctx.measureText(this.message.text).width;
        this.scrollEnd = this.position.x + segWidths.scroll;
        if (this.message.repeat) {
          // NOTE: this is only handling right to left scrolling??
          if (this.scrollEnd < 0) {
            this.position.x = this.scrollEnd + this.message.gap;
          }
          while (this.scrollEnd + this.message.gap < ctx.canvas.width) {
            ctx.fillText(this.message.text, this.scrollEnd + this.message.gap,
              hud.statusline.baseY + ctx.canvas.height
              );
            this.scrollEnd += (this.message.gap + segWidths.scroll);
          }
        }
      } else {
        // No message is currently being scrolled, so show that 'static' data
        ctx.font = hud.statusline.valuesfont;
        placeValue.call(ctx, that.lives, hud.values.lives,
          hud.labels.lives.left + segWidths.lives,
          ctx.canvas.width, hud.statusline.baseY + ctx.canvas.height
          );
      }

      ctx.restore();

    };// .function PaceCar.prototype.render()

    /////////////////////////////////////////////
    // End definitions for PaceCar inner class //
    /////////////////////////////////////////////

    // Build (or potentially load) the application layout and configuration
    // information

    /* Populate a configuration object to be shared with / passed to the
     * animation engine.  This includes the resources that are to be [pre]
     * loaded.  Set is this up as a JSON object structure that could potentially
     * be loaded from an external file / resource.
     * This is intended to be constant information.  None of the contents are
     * are expected to be modified after the initial create / load.
     *
     *  canvas : {Object}     Information about the grid used for the game
     *                        playing field
     *  gridRows : {Integer}  base playing field grid height
     *  gridCols : {Integer}  base playing field grid width
     *  gridCells : {Array}   URLs of resources to build the base playing field:
     *                        Each image is repeated to fill the row; top row is
     *                        water, followed by three rows of stone, then 2
     *                        rows of grass.
     *  cellSize : {Object}   width 101 pixels; height 83 pixels
     *  tileSize : {Object}   all used tiles are 171 x 101 pixels, with at least
     *                        some transparent area at the top.
     *  Padding : {Object}    An extra 20 pixels is (to be) added to the bottom
     *                        of the canvas; all other padding is 0.
     *  ResourceTiles : {Array} Additional image resources to be preloaded.
     */
    this.GAME_BOARD = {
      "canvas" : {
        "gridRows" : 6,
        "gridCols" : 5,
        "gridCells" : [
          "images/water-block.png",
          "images/stone-block.png",
          "images/stone-block.png",
          "images/stone-block.png",
          "images/grass-block.png",
          "images/grass-block.png"
        ],
        "cellSize" : {
          "height" : 83,
          "width" : 101
        },
        "tileSize" : {
          "height" : 171,
          "width" : 101
        },
        "padding" : {
          "left" : 0,
          "top" : 0,
          "right" : 0,
          "bottom" : 20
        },
        "resourceTiles" : [
          "images/enemy-bug.png",
          "images/char-boy.png"
        ]
      }
    };// ./GAME_BOARD = {};
    /* Populate object properties with a bunch of constants needed by the
     * running application, where they can all be referenced and maintained in a
     * single location.
     * This is intended to be constant information.  None of the contents are
     * are expected to be modified after the initial create / load.
     * Many of the described properties are optional.  Unspecified Values carry
     * forward from the previous level information.  Delta values can be used
     * in place of explicit values in many places.
     *
     * enemy {Object}
     *   spriteTile {string}  URL / resource key for all(?) enemy icons
     *   vertialOffset {Integer} Offset (pixels) to align to playing field grid
     *   maxSprites {Array}   Maximum number of enemy sprites that will be
     *                        needed simultaneously for each row.  This includes
     *                        The number that can be (partially) visible, plus
     *                        one off canvas (queued).  (Manually) calculated
     *                        from: (minimum number of distance values where the
     *                        sum > canvas width - one sprite width) +1
     *   topRow {Integer}     The first gird row (zero based) that enemies can
     *                        travel on.
     *   levels {Array}       One {Object} entry per game level
     *                    ??  need a way to continue past configured levels ??
     *     length {Number}    The actual length of time (seconds) allowed to
     *                        complete the level (without dieing)
     *     delta {Object}     Values to adjust from previous level settings
     *       length {Number}  Change from previous level length
     *     rows {Array}       One {Array} entry per enemy (travelled) grid row
     *       {Array}          One {Object} entry per movement pattern used for
     *                        the level, row, and pattern
     *   reset {Object}       Pattern reset properties for every row, at the
     *                        start of each level.  Used for "CurrentPatterns"
     *     expires {Number}   The time tick the pattern is no longer valid
     *     currentPattern {Integer} The index for the current active pattern
     *     head {Integer}     The index to the first (front) sprite for the row
     *                        in the circular queue in this.enemySprites[row]
     *     tail {Integer}     The index to the last (back, queued) sprite for
     *                        the row.  Ref as this.enemySprites[row][.tail]
     *     speed {Number}     Sprite movement rate in pixels per second
     *     distances {Array of Number} Circular buffer of distances (sprite
     *                        lengths) between successive sprites for the pattern
     *     nxtDistance {Integer} Index of the next distance[] to use
     *     cntDistances {Integer} distances[].length
     *     seconds {Number}   Time in seconds that the pattern lasts
     * enemy.levels[].rows[][] {Object} The 'rules' for a single pattern
     *   seconds {Number}     How long the pattern lasts (once started)
     *   startDistance {Number} Pixel offset from last enemy in previous
     *                        pattern.  Zero will overlay on the last active
     *                        enemy:
     *                        CAUTION: possible undesired visual effect if that
     *                        active enemy is visible and the speed changes
     *   speed {Integer} Pixels per second movement for this pattern
     *   distance {Array of Number} Distance (in pixels) between enemy
     *                        sprites.  Repeats if run out before the pattern
     *                        run time ends.
     *   delta {Object}       Values to adjust from the previous pattern settings
     *     seconds {Number}   Change from previous pattern seconds
     *     startDistance {Number} Change from previous pattern startDistance
     *     speed {Integer}    Change from previous pattern speed
     *     distance {Array of Number} Changes to previous pattern distances
     * player {Object}        Configuration information for player avatar
     *   spriteTile {string}  URL for (initial) player avatar sprite
     *   start {Object}       Player settings for the start of game and level
     *     row {Integer}      The grid row to start from for each level
     *     col {Integer}      The grid column to start from for each level
     *     lives {Integer}    The number of lives at the start of the game
     * hud {Object}
     *   headline {Object}    Configuration for drawing text at canvas top
     *     baseY {Integer}    Pixel offset from top of canvas for text drawing
     *     height {Integer}   Pixel height of text area (for clearing)
     *     labelsfont {string} Font to use when drawing labels
     *     valuesfont {string} Font to use when drawing values
     *   statusline {Object}  Configuration for drawing text at canvas bottom
     *     baseY {Integer}    Pixel offset from bottom of canvas for text drawing
     *     height {Integer}   Pixel height of text area (for clearing)
     *     labelsfont {string} Font to use when drawing labels
     *     valuesfont {string} Font to use when drawing values
     *     messagesfont {string} Font to use when drawing (scrolling) messages
     *     templates {Object} Configuration for individual scrolling messages
     *       each_added_property {Object} One property per scrolling messages
     *         text {string}  (base) message text
     *         speed {Number} Message scrolling speed (pixels/second)
     *         style {string} Text (drawing) style for message
     *         repeat {boolean} Repeat message (infinite loop)
     *         gap {Number}   Separation (pixels) between repeated messages
     *   labels {Object}      Configuration for drawing labels
     *     style {string}     (base) text (drawing) style for labels
     *     each_label_property {Object} One property per drawn label
     *       style {string}   (override) text (drawing) style for label
     *       text {string}    Label text content
     *       left {Integer}   left padding for label
     *       maxWidth {Integer} maximum drawing width (pixels) to use drawing
     *   values {Object}      Configuration for drawing labels
     *     font {string}      Font to use when drawing values
     *     style {string}     text (drawing) style for values
     *     each_label_property {Object} One property per drawn value
     *       align {string}   Text align to use when drawing value
     *       margin {Object}  Margins to use when drawing the value
     *         left {Integer} Left margin
     *         right {Integer} Right margin
     */
    this.APP_CONFIG = {
      "enemy" : {
        "spriteTile" : "images/enemy-bug.png",
        "verticalOffset" : -20,
        "maxSprites" : [3, 4, 4],
        "topRow" : 1,
        "levels" : [
          {
            "length" : 10,
            "rows" : [
              [
                {
                  "seconds" : 60,
                  "startDistance" : 0,
                  "speed" : 80,
                  "distances" : [1, 6]
                }
              ],
              [
                {
                  "seconds" : 60,
                  "startDistance" : 0,
                  "speed" : -40,
                  "distances" : [-2.8, -2.8, -2.8, -5.6]
                }
              ],
              [
                {
                  "seconds" : 60,
                  "startDistance" : 0,
                  "speed" : 40,
                  "distances" : [2.8, 2.8, 2.8, 5.6]
                }
              ]
            ]
          }
        ],
        "reset" : {
          "expires" : { "writable": true, "configurable": true, "value": 0 },
          "currentPattern" :
            { "writable": true, "configurable": true, "value": -1 },
          "head" : { "writable": true, "configurable": true, "value": 0 },
          "tail" : { "writable": true, "configurable": true, "value": 1 },
          "speed" : { "writable": true, "configurable": true, "value": 0 },
          "distances" : { "writable": true, "configurable": true, "value": [] },
          "nxtDistance" : { "writable": true, "configurable": true, "value": 0 },
          "cntDistances" :
            { "writable": true, "configurable": true, "value": 0 },
          "seconds" : { "writable": true, "configurable": true, "value": 0 }
        }
      },
      "player" : {
        "spriteTile" : "images/char-boy.png",
        "start" : {
          "row" : 5,
          "col" : 2,
          "lives" : 5
        },
        "verticalOffset" : -30,
        "horizontalOffset" : 0
      },
      "hud" : {
        "headline" : {
          "baseY" : 40,
          "height" : 50,
          "labelsfont" : "18pt Tahoma, Geneva, sans-serif",
          "valuesfont" : "32pt Lucida Console, Monaco, monospace"
        },
        "statusline" : {
          "baseY" : -3,
          "height" : 20,
          "labelsfont" : "12pt Tahoma, Geneva, sans-serif",
          "valuesfont" : "14pt Lucida Console, Monaco, monospace",
          "messagesfont" : "12pt Times New Roman, Times, serif",
          "templates" : {
            "start" : {
              "text" : "Press SPACE key to start",
              "speed" : -30,
              "style" : "red",
              "repeat" : true,
              "gap" : 150
            }
          }
        },
        "labels" : {
          "style" : "yellow",
          "time" : {
            "style" : "green",
            "text" : "Time:",
            "left" : 10,
            "maxWidth" : 65
          },
          "level" : {
            "text" : "Level:",
            "left" : 195,
            "maxWidth" : 70
          },
          "score" : {
            "text" : "Score:",
            "left" : 330,
            "maxWidth" : 75
          },
          "lives" : {
            "text" : "Lives:",
            "left" : 50,
            "maxWidth" : 150
          }
        },
        "values" : {
          "font" : "32pt Lucida Console, Monaco, monospace",
          "style" : "black",
          "time" : {
            "align" : "right",
            "margin" : {
              "left" : 5,
              "right" : 15
            }
          },
          "level" : {
            "align" : "left",
            "margin" : {
              "left" : 5,
              "right" : 10
            }
          },
          "score" : {
            "align" : "left",
            "margin" : {
              "left" : 5,
              "right" : 10
            }
          },
          "lives" : {
            "align" : "left",
            "margin" : {
              "left" : 3,
              "right" : 10
            }
          }
        }
      }
    };// ./APP_CONFIG = {}

    // Create read-only 'level' calculated property
    Object.defineProperty(this, "level", {
      get : getLevel
    });// get level() { return this.lvlIndex + 1; }

    // Automatically update dependant properties on state changes
    Object.defineProperty(this, "state", {
      set : setState,
      get : getState
    });

    this.lvlIndex = -1; //So first init will get to level 0
    this.score = 0;
    this.lives = this.APP_CONFIG.player.start.lives;
    this.currentSettings = {
      "levelTime" : 0
    };
    this.limits = {};
    this.elapsedTimes = {};
    this.tracker = new PaceCar();
    this.state = STATE_ENUM.waiting;

    // add a dummy enemy object to the start of the list.  Use to:
    // - check for collisions
    // - stop enemies that have gone off canvas
    // - start enemies that are due to enter the canvas
    //   - gridCol = -1; gridColToX(); speed = getSpeed(gridRow, level, time);
    //   - there should always be at least 2 active enemies per row:??
    //     - one visible / front, and one queued
    //     - with large separation distance, only one?
    //       - previous has gone off of the screen and been stopped
    //       - next is queued/active, but not on the screen yet; next will be
    //         queued when this one goes visible.
    // - pre_update callback?

    console.log((new Date()).toISOString() + ' waiting for engineReady');
    // Setup a callback, so that details can be filled in when the Animation
    // has things setup
    document.addEventListener('engineReady', function (e) {
      console.log((new Date()).toISOString() + ' caught engineReady event');
      // Access outer function Frogger constructor 'this' context through
      // closure scope 'that'
      that.start(e.detail.context);
    });

  }// ./function Frogger()

  /**
   * Get the index for the last (trailing) enemy sprite in a row
   *
   * NOTE: In some situations, the calculated index will be for a sprite that
   * has already moved off of the visible canvas, and is ready to be recycled.
   *
   * @param {Integer} row     The row (index) number to locate the sprite in
   * @return {Integer}
   */
  Frogger.prototype.lastVisible = function (row) {
    var spriteIndex;
    spriteIndex = this.currentPatterns[row].tail - 1;
    if (spriteIndex < 0) {
      spriteIndex = this.APP_CONFIG.enemy.maxSprites[row] - 1;
    }
    return spriteIndex;
  };// ./function Frogger.prototype.lastVisible(row)

  /**
   * Include one recycled sprite into the active portion of the circular buffer
   *
   * @param {Integer} row     The row (index) number to locate the sprite in
   * @return {undefined}
   */
  Frogger.prototype.addSprite = function (row) {
    var rowState;
    rowState = this.currentPatterns[row];

    //rowState.tail = (rowState.tail + 1) % this.APP_CONFIG.enemy.maxSprites[row];
    rowState.tail += 1;
    if (rowState.tail >= this.APP_CONFIG.enemy.maxSprites[row]) {
      rowState.tail = 0;
    }

    // If there is reason to add another sprite at the end of the circular
    // buffer, and the sprite at the head of the buffer has exited the visible
    // playing field, it should be safe to recycle.
    if (this.enemySprites[row][rowState.head].isOffEnd()) {
      this.recycleSprite(row);
    }

    if (rowState.tail === rowState.head) {
      throw new Error('maxSprites value for row ' + row +
        ' too small for level ' + this.level
        );
    }
  };// ./function Frogger.prototype.addSprite(row)

  /**
   * Cycle through the circular buffer of distances for the active pattern
   *
   * @param {Integer} row     The row (index) number the distances are for
   * @return {Integer}
   */
  Frogger.prototype.nextDistance = function (row) {
    var rowState, distance;
    rowState = this.currentPatterns[row];

    // The separation / following distance (sprite lengths) for the next enemy
    // sprite
    distance = rowState.distances[rowState.nxtDistance];

    // Point to the new next distance
    // rowState.nxtDistance = (rowState.nxtDistance + 1) % rowState.cntDistances);
    rowState.nxtDistance += 1;
    if (rowState.nxtDistance >= rowState.cntDistances) {
      rowState.nxtDistance = 0;
    }

    return distance;
  };// ./function Frogger.prototype.nextDistance(row)

  /**
   * Remove the sprite from the head of the circular buffer
   *
   * @param {Integer} row     The row (index) number to the sprite is on
   * @return {undefined}
   */
  Frogger.prototype.recycleSprite = function (row) {
    var rowState;
    rowState = this.currentPatterns[row];

    // Stop and queue the sprite
    this.enemySprites[row][rowState.head].speed = 0;
    this.enemySprites[row][rowState.head].position.x = this.limits.offLeftX;

    // Change the front sprite to the next one in the buffer.
    //rowState.head = (rowState.head + 1) % this.APP_CONFIG.enemy.maxSprites[row];
    rowState.head += 1;
    if (rowState.head >= this.APP_CONFIG.enemy.maxSprites[row]) {
      rowState.head = 0;
    }
  };// ./function Frogger.prototype.recycleSprite(row)

  /**
   * Handle a player requested command
   *
   * @param {Object} request   The request to be processed
   * @return {undefined}
   */
  Frogger.prototype.handleCommand = function (request) {
    console.log((new Date()).toISOString() + ' reached Frogger.handleCommand');
    switch (request.command) {
    case 'space':
      // Ignore the request unless currently waiting
      // TODO: other cases to not ignore? abort 'dieing' animation?
      if (this.state === STATE_ENUM.waiting) {
        this.state = STATE_ENUM.running;
      }
      break;
    }
  };// ./function Frogger.prototype.handleStart()

  /**
   * Set the initial game state for the start of a level
   *
   * QUERY: Should this be a (function scope) helper function, instead of a
   *  shared prototype function? private vs possible inherit and override?
   * @return {undefined}
   */
  Frogger.prototype.initLevel = function () {
    var lvlConfig, row, sprite;
    console.log((new Date()).toISOString() + ' reached Frogger.initLevel');
    this.state = STATE_ENUM.newlevel;
    lvlConfig = this.APP_CONFIG.enemy.levels[this.lvlIndex];

    if (lvlConfig.length) {
      this.currentSettings.levelTime = lvlConfig.length;
    }
    if (lvlConfig.delta) {
      if (lvlConfig.delta.length) {
        this.currentSettings.levelTime += lvlConfig.delta.length;
      }
    }

    // Build the initial level pattern configuration for each enemy row.  See
    // this.APP_CONFIG.enemy.reset for entry property descriptions.
    delete this.currentPatterns;
    this.currentPatterns = [];
    // Potentially, different levels could have different numbers of rows active?
    // All possible active rows (and sprites) always exists: set pattern for any
    // inactive rows to keep speed zero and off screen.
    for (row = 0; row < this.APP_CONFIG.enemy.maxSprites.length; row += 1) {
      // Fill in an initial dummy pattern that will be immediately updated with
      // the first actual pattern from lvlConfig.rows
      this.currentPatterns.push(Object.create(null, this.APP_CONFIG.enemy.reset));
      // Get all sprites stopped and positioned so that the first update will
      // start the first pattern for the level
      for (sprite = 0; sprite < this.APP_CONFIG.enemy.maxSprites[row];
          sprite += 1
          ) {
        this.enemySprites[row][sprite].speed = 0;
        this.enemySprites[row][sprite].position.x = this.limits.offLeftX;
      }
      // Move the first sprite for each row to just after the canvas
      // NOTE: speed is always zero here, so no difference for negative speed
      this.enemySprites[row][0].position.x = this.limits.offRightX;
    }

    // Move the player avatar back to the starting location
    this.player.col = this.APP_CONFIG.player.start.col;
    this.player.row = this.APP_CONFIG.player.start.row;
  };// ./function Frogger.prototype.initLevel()

  /**
   * Create and initialize all game entities, and finish the initial
   * configuration
   *
   * Executed when 'engineReady' event received
   *
   * @param {Object} cvsContext    CanvasRenderingContext2D to display the
   *                    sprites on.
   * @return {undefined}
   */
  Frogger.prototype.start = function (cvsContext) {
    var that, gridCell, cfg, row, sprite, rowSprites;
    console.log((new Date()).toISOString() + ' reached Frogger.start');

    // Create a function closure scope tag to allow the inner functions to get
    // back into the right context, when invoked with a different context.
    that = this;

    /* Create all of the enemy instances that should be needed to run the
     * whole game into a 2D array (Array of arrays).  This will be correct,
     * assuming that the "maxSprites" configuration values were filled in
     * correctly.
     * Create them all initially stopped (speed=0), and just off (before)
     * the visible canvas.
     * Preallocate all, means the frame rate should not decrease as more are
     *   added for higher levels
     *   - could still dynamically add as needed
     */
    gridCell = app.game.GAME_BOARD.canvas.cellSize;
    cfg = this.APP_CONFIG.enemy;
    this.enemySprites = [];
    for (row = 0; row < cfg.maxSprites.length; row += 1) {
      rowSprites = [];
      for (sprite = 0; sprite < cfg.maxSprites[row]; sprite += 1) {
        rowSprites.push(
          new Enemy(cfg.spriteTile, row + cfg.topRow,
            cfg.verticalOffset, 0, cvsContext, gridCell
            )
        );
      }
      // Add the sprites for [row] to the collected sprites array
      this.enemySprites.push(rowSprites);
    }
    // Grab the x coordinates that corresponds to column -1, and the first grid
    // column after the visible grid, to check when sprites are not yet, or
    // no longer, visible.
    this.limits.offLeftX = this.enemySprites[0][0].position.x;
    this.enemySprites[0][0].col = this.GAME_BOARD.canvas.gridCols;
    this.limits.offRightX = this.enemySprites[0][0].position.x;

    cfg = this.APP_CONFIG.player;
    this.player = new Avatar(cfg.spriteTile, cfg.start.row, cfg.start.col,
      cfg.verticalOffset, cfg.horizontalOffset, cvsContext, gridCell
      );

    // Fill in the CanvasRenderingContext2D for the tracker.
    this.tracker.context = cvsContext;
    // Fill in the (base) position for scrolling messages (bottom of canvas)
    this.tracker.position.y = cvsContext.canvas.height;
    // Start the 'press space' message scrolling
    this.tracker.message = this.APP_CONFIG.hud.statusline.templates.start;

    // Setup the game state for the current (first = 0) level
    this.initLevel();

    // TODO: more
    // How to (cleanly) get the first pattern started?
    // - 'jump' to position(s) on canvas?
    // - 'zoom' with compressed time?
    // - 'fade in'?
    // - start at column -1, and continue (no time advance)
    //   - lock out controls till in position, so no 'open field' to start?
    // - initial load one enemy per row, positioned just page the width of the
    //   canvas (IE just finished the pass, no longer visible).  Set the
    //   startDistance for the first pattern to be >= the canvas width
    //   - make that 2 enemies per row? One just off each side of the canvas,
    //     so the 'general' rule of updating the queued enemy can be applied
    //     get rid of special case handling on the update checks for the very
    //     first time.  All handled by the pre-load, using straight
    //     configuration, without needing any startup tests.
    // Level handling:
    // - things that could change between levels
    //   - time limit
    //   - pattern speed(s)
    //   - pattern
    //   - scoring
    //   - enemy collision contact area
    //   - player collision contact area
    //   - prizes
    //     - prize function: score bonus; time bonus, slow enemy, reduce enemy
    //       and/or player 'hit' size

    // Place all enemy objects in an array called allEnemies
    // Place the player object in a variable called player
    engineNs.allEnemies = [];
    // Add the tracking instance as the first enemy, so that it gets a chance
    // to run first on any animation frame updates.  It can safely update
    // sprite information, and have the changes take effect in the same frame.
    engineNs.allEnemies.push(this.tracker);
    for (row = 0; row < this.APP_CONFIG.enemy.maxSprites.length; row += 1) {
      for (sprite = 0; sprite < this.APP_CONFIG.enemy.maxSprites[row];
          sprite += 1
          ) {
        engineNs.allEnemies.push(this.enemySprites[row][sprite]);
      }
    }
    engineNs.player = this.player;

    // TODO:
    // - Add extra keycodes: space to start game: pause?; other?
    // This listens for key presses and sends the keys to your
    // Player.handleInput() method. You don't need to modify this.
    document.addEventListener('keyup', function (e) {
      var allowedKeys = {
        32: 'space',
        37: 'left',
        38: 'up',
        39: 'right',
        40: 'down'
      };
      console.log((new Date()).toISOString() +
        ' caught keyup event: keycode = ' + e.keyCode
        );

      // Access outer function Frogger constructor 'this' context through 'that'
      that.player.handleInput(allowedKeys[e.keyCode]);
    });
    document.addEventListener('ApplicationCommand', function (e) {
      console.log((new Date()).toISOString() +
        ' caught ApplicationCommand event'
        );
      console.log(e.detail);
      // Access outer function Frogger constructor 'this' context through
      // closure scope 'that'
      that.handleCommand(e.detail);
    });
  };// ./function Frogger.prototype.start(cvsContext)

  /**
   * Position and activate the first (leading) sprite in a pattern
   *
   * Scenarios:
   *  Level Startup: 2 sprites in cycle, both stopped
   *  Same direction as previous, new spacing and/or speed
   *  reverse direction
   *
   * @param {Integer} rowIndex      The pattern row number
   * @param {Number} startDistance  The distance from old to new pattern
   * @return {undefined}
   */
  Frogger.prototype.initPattern = function (rowIndex, startDistance) {
    var sprites, pattern;
    pattern = this.currentPatterns[rowIndex];
    sprites = this.enemySprites[rowIndex];

    // This needs to be smarter to handle more of the intended cases.  For now,
    // just get it setup for the base case of one pattern per level, but add
    // sanity checks to make sure that is REALLY the scenario.
    if ((startDistance !== 0) ||
        (pattern.head !== 0) ||
        (pattern.tail !== 1) ||
        (sprites[pattern.tail].speed !== 0) ||
        (sprites[pattern.head].speed !== 0) ||
        (this.lastVisible(rowIndex) !== pattern.head)
        ) {
      throw new Error('unknown pattern change combination for level ' +
        this.level
        );
    }

    // startDistance === 0; replace existing sprite settings
    // sprites[vSprite].isOffEnd(); use pattern.tail
    sprites[pattern.tail].speed = pattern.speed;
    if (pattern.speed < 0) {
      sprites[pattern.tail].position.x = this.limits.offRightX;
    } else {
      sprites[pattern.tail].position.x = this.limits.offLeftX;
    }

    // TODO: 'intelligence' for switching patterns
    //  - make sure to keep enough info around for case where the distance
    //    can leave the whole row blank for awhile.
    //  - differences if speed changes
  };// ./function Frogger.prototype.initPattern(rowIndex, startDistance)

  /**
   * Change to next movement pattern when an active pattern expires
   *
   * Patterns typically change at the start of each level, but they CAN also
   * change mid-level.
   *
   * @return {undefined}
   */
  Frogger.prototype.cycleEnemyPatterns = function () {
    var lvlConfig, row, rowConfig, rowState, ptrnConfig;
    lvlConfig = this.APP_CONFIG.enemy.levels[this.lvlIndex];

    for (row = 0; row < this.currentPatterns.length; row += 1) {
      rowState = this.currentPatterns[row];
      // hpd idea: include/use rowState.expired boolean, set by .next? (when
      // app.state changes to 'waiting', AND currently patternIdx = -1 ?)
      if (this.elapsedTimes.level >= rowState.expires) {
        rowConfig = lvlConfig.rows[row];
        console.log('End pattern @' + rowState.expires + ' for level ' +
          this.level + ', row ' + row
          );
        // Index into rowConfig for the active pattern, increment and wrap to
        // zero when >= .length
        // rowState.currentPattern = incrementAndWrap(
        //   rowState.currentPattern, rowConfig.length
        // );
        // rowState.currentPattern = (rowState.currentPattern + 1) %
        //   rowConfig.length;
        rowState.currentPattern += 1;
        if (rowState.currentPattern >= rowConfig.length) {
          rowState.currentPattern = 0;
        }
        // Get the (immutable) configuration for the new pattern
        ptrnConfig = rowConfig[rowState.currentPattern];

        // Update the active pattern with information from the configuration.
        // All properties are optional.  Any not specified will be carried over
        // from the previous pattern.
        if (ptrnConfig.speed) {// If the speed changes for this pattern
          // zero would be 'falsey', but that is not really a valid speed for
          // a real pattern anyway.
          rowState.speed = ptrnConfig.speed;
        }
        if (ptrnConfig.distances) {// if the sprite spacing changes
          // TODO: decision: does the 'immutable' configuration need to be cloned
          //    or is is 'safe' to just reference it in place?
          // rowState.distances = ptrnConfig.distances.slice(0);
          rowState.distances = ptrnConfig.distances;
          rowState.cntDistances = rowState.distances.length;
        }
        if (ptrnConfig.seconds) {
          rowState.seconds = ptrnConfig.seconds;
        }
        // NOTE: Design decision: Do not adjust for the actual elapsed time.
        // rowState.expires = this.elapsedTimes.level + rowState.seconds;
        // Set the time when the new pattern ends, and the following one starts
        rowState.expires += rowState.seconds;

        // Activate the first (leading) sprite in the new pattern
        this.initPattern(row, ptrnConfig.startDistance);

      }// ./if (this.elapsedTimes.level >= rowState.expires)
    }// ./for (row = 0; row < this.currentPatterns.length; row += 1)
  };// ./function Frogger.prototype.cycleEnemyPatterns()

  /**
   * Add next enemy to the active queue when the current queued sprite becomes
   * visible.
   *
   * @return {undefined}
   */
  Frogger.prototype.refreshEnemyQueues = function () {
    var row, rowState, rowEnemies, lastX;
    for (row = 0; row < this.currentPatterns.length; row += 1) {
      rowState = this.currentPatterns[row];
      rowEnemies = this.enemySprites[row];
      if (rowEnemies[rowState.tail].isOnCanvas()) {
        // Current queued enemy sprite has become visible
        lastX = rowEnemies[rowState.tail].position.x;// Visible sprite position
        this.addSprite(row);// Pull a sprite from the recycled set.
        // Position it where it belongs (off canvas), and get it moving
        rowEnemies[rowState.tail].position.x = lastX -
          (this.nextDistance(row) * this.GAME_BOARD.canvas.cellSize.width);
        rowEnemies[rowState.tail].speed = rowState.speed;
      }
    }// ./for (row = 0; row < this.currentPatterns.length; row += 1)
  };// ./function Frogger.prototype.refreshEnemyQueues()

  /**
   * Game state processing to do (at the start of) each animation frame
   *
   * NOTE: conceptually done at 'pre-update'
   *
   * @param {Number} deltaTime    (Fractional) seconds since previous update
   * @return {undefined}
   */
  Frogger.prototype.next = function (deltaTime) {
    manageTime.call(this, deltaTime);

    // Check for level time limit exceeded first
    if (this.elapsedTimes.level > this.currentSettings.levelTime) {
      // Time has expired for the current level.  Avatar dies (from exposure)
      this.reason = 'from exposure @' + this.elapsedTimes.level + ' on level ' +
          this.level + ', with limit of ' + this.currentSettings.levelTime;
      this.state = STATE_ENUM.dieing;
    }

    // TODO: check for collisions next ???

    // Check for expired patterns
    this.cycleEnemyPatterns();

    // Queue another enemy when the current queued enemy becomes visible
    this.refreshEnemyQueues();

    // TODO: stuff…
    // - put any enemies that have finished the pass back in the pool (for the
    //   row)
    //   - need explicit? or just pickup when adding to queue?
    //     - probably needs cleanup pass, so do not end up with multiple sprites
    //       waiting to be recycled.
  };// ./function Frogger.prototype.next(deltaTime)

  /** TODO: move the config structure description to engine.js, keep only the
   *  specifics for the current application here
   * Structure:
   *  canvas : {Object}
   *    information about the application graphical interface to be managed by
   *    the engine.
   *  gridRows : {Integer}
   *    number of (equal height) rows the canvas is split into.
   *  gridCols : {Integer}
   *    number of (equal width) columns the canvas is split into.
   *  gridCells : {Array of {row}} ==> [row1 [, row2]…]
   *    Each entry specifies the image resources to use for a single row of the
   *    grid for the canvas.  If there are fewer entries than grid rows, the
   *    rows without images will be left blank.  To leave an earlier row
   *    blank, specify null.  Extra row entries will be silently ignored.
   *    row{n} {Array|String|null}
   *      - null
   *        Grid row ‘n’ on the canvas be left blank
   *      - String (URL)
   *        Each column of grid row ‘n’ will be drawn with the image at the URL
   *      - Array (of Strings) ==> [col1 [, col2]…]
   *        The columns of grid row ‘n’ will be drawn with the images from the
   *        URLs.
   *        If fewer URLs are specified than the grid contains, the provided
   *        entries will be reused (cycled) as many times as needed to fill the
   *        row.
   *        If more URLS are specified than the grid contains, the extras will
   *        be silently ignored.
   *        to leave a column blank, specify null for the URL.
   *    The images are drawn left to right, top to bottom.  Order is important
   *    when image dimensions are greater than the grid cell dimensions, to
   *    determine which transparent sections will show underlying data, and
   *    which will be drawn over by a subsequent column or row.
   *  cellSize : {Object}
   *    dimensions for a single cell in the logical grid overlaying the canvas
   *    height : {Integer}
   *      The logical height (in pixels) of the grid rows.  This does not need
   *      to be the same as the actual height of the used images, but it is used
   *      as the relative offset when drawing to successive rows.
   *    width : {Integer}
   *      The logical width (in pixels of the grid columns.  This does not need
   *      to be the same as the actual width of the used images, but it is used
   *      as the relative offset when drawing to successive columns.
   *  tileSize : {Object}
   *    dimensions for a single image used to draw the grid cells.  If they are
   *    not all the same, use the largest height from the bottom row, and the
   *    largest width from right most column.  This affects the dimensions of
   *    the canvas created to hold the grid.
   *    height : {Integer}
   *      The height (in pixels) of tile(s).
   *    width : {Integer}
   *      The width (in pixels of the tile(s).
   *  padding : {Object}
   *    The amount of extra space to leave around the content when the grid is
   *    drawn.  The top and left padding controls the coordinates of row[0],
   *    column[0].  The right and bottom padding is simply added to the
   *    dimensions for the created html5 canvas element.
   *    left : {Integer}
   *      Pixels
   *    top : {Integer}
   *      Pixels
   *    right : {Integer}
   *      Pixels
   *    bottom : {Integer}
   *      Pixels
   *  resourceTiles : {Array of String}
   *    URLs of all of the image resources to be cached.  This will be
   *    automatically extended to include unique URL entries from "gridCells".
   */

  /////////////////////////////////
  // End of function definitions //
  /////////////////////////////////

  // Start of actual code execution
  console.log((new Date()).toISOString() + ' start app.js code');

  // Create a 'namespace' to hold application resources that need to be accessed
  // from outside of the current anonymous wrapper function.
  // TODO: Decide? Does game really need to be stored anywhere?  Will it work
  //  running right here in an anonymous function?  Callbacks may be all that
  //  is needed outside of the local function.  No external references to
  //  app.game needed??
  app = namespace('io.github.mmerlin.frogger');
  //engineNs = namespace('io.github.mmerlin.animationEngine');
  engineNs = window;

  //timeScaling : 1000.0,//milliseconds per second

  // TODO: Remove app.game namespace? Currently there does not seem to be any
  // need for it.  The game should be able to run completely inside the current
  // anonymous function.  Except for (maybe) this.GAME_BOARD, the animation
  // engine only works with objects passed to it in the engineNs properties
  app.game = new Frogger();

}());// ./function anonymous()
