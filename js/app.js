/*jslint browser: true, devel: true, todo: true, indent: 2, maxlen: 82 */
/*global Resources */

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
  var Sprite, app, engineNs;

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
    //The last used ID (serial number) for created Sprite instances.
    lastId = 0;

    /**
     * Get the next available (unique) Sprite serial number
     *
     * @return {Integer} Sprite serial number
     */
    // do not complain about the dangling "_" for the private method name
    /*jslint nomen: true */
    function __getNextId() {
      lastId += 1;
      return lastId;
    }// ./function __getNextId()

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
      this.id = __getNextId();
      this.sprite = imgRsrc;
      // The coordinates of the (image for) the sprite within the owning
      // application canvas.
      if (spriteX !== undefined || spriteY !== undefined) {
        this.position = {
          x : spriteX,
          y : spriteY
        };
      }
      // Not actually required for the current application, but storing the
      // context in the Sprite instance supports having multiple canvases in
      // a single application.  And gets rid of the need for the global ctx.
      this.context = spriteContext;
      this.flipped = false;
    };// ./function Sprite(imgRsrc, spriteX, spriteY, spriteContext)
    // complain about any other dangling "_" in variable names
    /*jslint nomen: false */

    // Return the constructor function, with the linked function scope extras
    return Sprite;
  }());// ./function Sprite()

  // Add the needed shared class method functions to the prototype

  /**
   * Reset the current transform to the identity transformation
   *
   * NOTE: it might be better to use an inverse transform operation (translate
   *   then scale), instead of setting to identity: if other processing wants
   *   to do their own transforms.  Like a straight translate to scroll the
   *   playing field vertically.
   *
   * @return {undefined}
   */
  Sprite.prototype.setIdTransform = function () {
    this.context.setTransform(1, 0, 0, 1, 0, 0);
  };// ./function Sprite.prototype.setIdTransform()

  /**
   * Set the transform needed to flip the playing field coordinates horizontally
   *
   * @return {undefined}
   */
  Sprite.prototype.setFlipTransform = function () {
    // scale(-1, 1) === transform(-1, 0, 0, 1, 0, 0)//horizontal flip
    // w = this.context.canvas.width;
    // translate(-w, 0) === transform(1, 0, 0, 1, -w, 0)
    // http://bucephalus.org/text/CanvasHandbook/CanvasHandbook.html#fn22
    // combined => transform(-1, 0, 0, 1, -w, 0)
    this.context.setTransform(-1, 0, 0, 1, this.context.canvas.width, 0);
    // TODO: think: would this need to use any playing field offset value(s)?
    // var calcTransform = composeTransform(
    //   [-1, 0, 0, 1, 0, 0],
    //   [1, 0, 0, 1, -w, 0]//testing seems to use w, not -w
    // );
  };// ./function Sprite.prototype.setFlipTransform()

  // Getter and Setter functions are not needed, unless something more than
  // simple property reading and writing is required.  Additional work would
  // be needed to hide the private instance variables in a function scope.
  // For now, just access the instance properties directly.
  // Sprite.prototype.setImage = function (imgRsrc) {
  //   this.sprite = imgRsrc;
  // };
  // instance.sprite = imgRsrc;

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
    if (this.flipped) {// Reverse the x coordinates before drawing
      this.setFlipTransform();
    }
    this.context.drawImage(Resources.get(this.sprite),
      this.position.x, this.position.y
      );
    if (this.flipped) {// Undo the swapped coordinate system
      this.setIdTransform();
    }
  };// ./function Sprite.prototype.render()


  ////////////////////////////////////////////////
  // Create Enemy (pseudoclassical) [sub]Class //
  ////////////////////////////////////////////////

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
    // Once placed, all current enemies stay on a specific grid row.
    this.row = gridRow || 0;
    this.rowOffset = ofstVert || 0;
    // Always start an enemy sprite one grid column off (before the) canvas.
    // With enemy sprite image tiles that are the same width as a grid column,
    // that will place them just off of the visible canvas.
    this.col = -1;
    this.colOffset = 0;
    if (gridCell) {
      this.cell = gridCell;
    } else {
      this.cell = { height : 0, width : 0 };
    }
    this.speed = speed || 0;// Pixels per second
    if (speed < 0) {
      // need to use a horizontally flipped sprite.  Or place (done here) on the
      // canvas using a horizontally flipped coordinate system.
      this.flipped = true;
      // reversing X coordinates means the movement direction is reversed too.
      this.speed = -speed;
    }
    this.position = {};
    this.gridColRowToXY();
  }// ./function Enemy(imgRsrc, gridRow, ofstVert, speed, cvsContext, gridCell)
  Enemy.prototype = Object.create(Sprite.prototype);
  Enemy.prototype.constructor = Enemy;

  /**
   * Convert the logical grid row number to a canvas y (pixel) coordinate.
   *
   * @return {undefined}
   */
  Enemy.prototype.gridRowToY = function () {
    this.position.y = ((this.row || 0) * this.cell.height) +
      (this.rowOffset || 0);
  };// ./function Enemy.prototype.gridRowToY()

  /**
   * Convert the logical grid column number to a canvas x (pixel) coordinate.
   *
   * @return {undefined}
   */
  Enemy.prototype.gridColToX = function () {
    this.position.x = ((this.col || 0) * this.cell.width) +
      (this.colOffset || 0);
  };// ./function Enemy.prototype.gridColToX()

  /**
   * Convert logical grid address to canvas (pixel) coordinates.
   *
   * @return {undefined}
   */
  Enemy.prototype.gridColRowToXY = function () {
    this.gridRowToY();
    this.gridColToX();
  };// ./function Enemy.prototype.gridColRowToXY()

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
    this.col = gridCol;
    this.colOffset = ofstHoriz;
    this.gridColToX();
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
    // Process any pending (movement) command.  No, or unrecognized, command
    // does nothing
    switch (this.pendingCommand) {
    case 'left':
      this.col -= 1;
      break;
    case 'right':
      this.col += 1;
      break;
    case 'up':
      this.row -= 1;
      break;
    case 'down':
      this.row += 1;
      break;
    }//./switch (cmd)
    //TODO: add limit checks for edge of field: die
    // might be 'automatic', based on collision logic?
    this.gridColRowToXY();

    //Make sure the command does not get processed again
    this.pendingCommand = null;
  };// ./function Avatar.prototype.update()


  ////////////////////////////////////////////
  // Create Frogger (pseudoclassical) Class //
  ////////////////////////////////////////////

  /**
   * Class to control the application and operations sequence
   *
   * @return {Object} Application instance
   */
  function Frogger() {
    var that;

    // Create a function closure scope tag to allow the inner functions to get
    // back into the right context, when invoked with a different context.
    that = this;

    ///////////////////////////////////////////////////////////
    // Definition of functions for the 'inner' PACEcAR class //
    ///////////////////////////////////////////////////////////

    /* NOTE: With the current application structure, only a single instance of
     * the Frogger class should ever need to be created.  That should avoid the
     * memory leak associated with getting a new copy of all locally defined
     * functions each time the Frogger function is called.  It should only
     * happen once, so only a single copy of the PaceCar related functions
     * should ever be created.
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
      Sprite.call(this, that.APP_CONFIG.enemy.spriteTile, undefined, undefined,
        cvsContext);
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
    };// ./function PaceCar.prototype.update(deltaTime)

    /**
     * Handle display of non-sprite information.
     *
     * This overrides the superclass render function.  This sub-classed sprite
     * does not need to display 'itself'
     *
     * @return {undefined}
     */
    PaceCar.prototype.render = function () {
      // Access outer function Frogger constructor 'this' context through 'that'
      that.display();
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
     *   spriteTile {string}   URL / resource key for all(?) enemy icons
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
     * player {Object}
     */
    this.APP_CONFIG = {
      "enemy" : {
        "spriteTile" : "images/enemy-bug.png",
        "verticalOffset" : -20,
        "maxSprites" : [3],
        "topRow" : 3,
        "levels" : [
          {
            "length" : 60,
            "rows" : [
              [
                {
                  "seconds" : 60,
                  "startDistance" : 0,
                  "speed" : 40,
                  "distances" : [3.2]
                }
              ]
            ]
          }
        ],
        "reset" : {
          "expires" : 0,
          "currentPattern" : -1,
          "head" : 0,
          "tail" : 1,
          "speed" : 0,
          "distances" : [],
          "nxtDistance" : 0,
          "cntDistances" : 0,
          "seconds" : 0
        }
      },
      "player" : {
        "spriteTile" : "images/char-boy.png",
        "start" : {
          "row" : 5,
          "col" : 2
        },
        "verticalOffset" : -30,
        "horizontalOffset" : 0
      }
    };// ./APP_CONFIG = {}

    this.level = 0;
    this.levelTime = 0;
    this.limits = {};
    this.tracker = new PaceCar();

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
      console.log(e.detail.message);
      console.log(e.detail.context);
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
    if (this.enemySprites[row][rowState.head].position.x >=
        this.limits.recycleSpriteX
        ) {
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
  };// ./function Frogger.prototype.nextDistance()

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
    this.enemySprites[row][rowState.head].position.x = this.limits.queuedSpriteX;

    // Change the front sprite to the next one in the buffer.
    //rowState.head = (rowState.head + 1) % this.APP_CONFIG.enemy.maxSprites[row];
    rowState.head += 1;
    if (rowState.head >= this.APP_CONFIG.enemy.maxSprites[row]) {
      rowState.head = 0;
    }
  };// ./function Frogger.prototype.recycleSprite(row)

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
    // TODO: handle (better) if this.level >= max configured levels
    if (this.level >= this.APP_CONFIG.enemy.levels.length) {
      throw new Error('Game broken, no level ' + this.level + ' configuration');
    }
    lvlConfig = this.APP_CONFIG.enemy.levels[this.level];

    if (lvlConfig.length) {
      this.levelTime = lvlConfig.length;
    }
    if (lvlConfig.delta) {
      if (lvlConfig.delta.length) {
        this.levelTime += lvlConfig.delta.length;
      }
    }

    this.elapsedTime = 0;
    // Build the initial level pattern configuration for each enemy row.  See
    // this.APP_CONFIG.enemy.reset for entry property descriptions.
    this.currentPatterns = [];
    // Potentially, different levels could have different numbers of rows active?
    // All possible active rows (and sprites) always exists: set pattern for any
    // inactive rows to keep speed zero and off screen.
    for (row = 0; row < this.APP_CONFIG.enemy.maxSprites.length; row += 1) {
      // Fill in an initial dummy pattern that will be immediately updated with
      // the first actual pattern from lvlConfig.rows
      this.currentPatterns.push(this.APP_CONFIG.enemy.reset);
      // Get all sprites stopped and positioned so that the first update will
      // start the first pattern for the level
      for (sprite = 1; sprite < this.APP_CONFIG.enemy.maxSprites[row];
          sprite += 1
          ) {
        this.enemySprites[row][sprite].speed = 0;
        this.enemySprites[row][sprite].position.x = this.limits.queuedSpriteX;
      }
      // Move the first sprite for each row to just after the canvas
      this.enemySprites[row][0].col = this.GAME_BOARD.canvas.gridCols;
      this.enemySprites[row][0].gridColToX();
    }

    // Move the player avatar back to the starting location
    this.player.col = this.APP_CONFIG.player.start.col;
    this.player.row = this.APP_CONFIG.player.start.row;
    this.player.gridColRowToXY();
  };// ./function Frogger.prototype.initLevel()

  /**
   * Create and initialize all game entities, and finish the initial
   * configuration
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
    this.limits.queuedSpriteX = this.enemySprites[0][0].position.x;
    this.enemySprites[0][0].col = this.GAME_BOARD.canvas.gridCols;
    this.enemySprites[0][0].gridColToX();
    this.limits.recycleSpriteX = this.enemySprites[0][0].position.x;

    cfg = this.APP_CONFIG.player;
    this.player = new Avatar(cfg.spriteTile, cfg.start.row, cfg.start.col,
      cfg.verticalOffset, cfg.horizontalOffset, cvsContext, gridCell
      );

    // Fill in the CanvasRenderingContext2D for the tracker.
    this.tracker.context = cvsContext;
    // TODO: trigger a pattern change on (or before?) the first tick
    //cfg.rows[sprite].speed[0]
    //this.tracker.update(0);

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
    // - instead of [pre] defining all details about a level in the
    //   configuration, only store level to level changes, and (intelligent)
    //   merge objects.

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
        37: 'left',
        38: 'up',
        39: 'right',
        40: 'down'
      };

      // Access outer function Frogger constructor 'this' context through 'that'
      that.player.handleInput(allowedKeys[e.keyCode]);
    });
  };// ./function Frogger.prototype.start(cvsContext)

  /**
   * Change to next movement pattern when an active pattern expires
   *
   * @return {undefined}
   */
  Frogger.prototype.cycleEnemyPatterns = function () {
    var lvlConfig, row, rowConfig, rowState, rowEnemies,
      ptrnConfig, nSprite, vSprite;
    lvlConfig = this.APP_CONFIG.enemy.levels[this.level];

    for (row = 0; row < this.currentPatterns.length; row += 1) {
      rowState = this.currentPatterns[row];
      rowEnemies = this.enemySprites[row];
      if (this.elapsedTime >= rowState.expires) {
        rowConfig = lvlConfig.rows[row];
        console.log('End pattern @' + rowState.expires + ' for level ' +
          this.level + ', row ' + row
          );
        // Index into rowConfig for the active pattern, increment and wrap to
        // zero when >= .length
        // rowState.currentPattern = incrementAndWrap(
        //   rowState.currentPattern, rowConfig.length)
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
        // rowState.expires = this.elapsedTime + rowState.seconds
        // Set the time when the new pattern ends, and the following one starts
        rowState.expires += rowState.seconds;

        // Figure out where to position the first (leading) sprite in the new
        // pattern.
        vSprite = this.lastVisible(row);// Last (maybe) visible sprite
        if (ptrnConfig.startDistance === 0) {
          // Replace the last visible sprite from the previous pattern with
          // first (leading) sprite in the new pattern.
          if (rowEnemies[vSprite].position.x >= this.limits.recycleSpriteX) {
            // What should have been the last visible sprite has actually moved
            // off of the canvas.  Use the queued sprite instead.
            vSprite = rowState.tail;
          }
          nSprite = vSprite;// New sprite is same as visible sprite
        } else {// !(ptrnConfig.startDistance === 0)
          // Place the leading sprite for the new pattern .startDistance behind
          // the last visible sprite from the previous pattern
          if ((rowEnemies[vSprite].position.x - ptrnConfig.startDistance) >
              this.limits.queuedSpriteX
              ) {
            // The targeted start point would teleport the sprite onto the
            // visible canvas: position it behind the queued sprite for the
            // previous pattern instead
            vSprite = rowState.tail;
            // Pull another sprite into the active circular buffer of sprites
            this.addSprite(row);
          }
          // Update the sprite (now) at the end of the circular buffer to be
          // a the configured starting distance behind the last visible sprite
          nSprite = rowState.tail;
          rowEnemies[nSprite].position.x =
            rowEnemies[vSprite].position.x - ptrnConfig.startDistance;
        }
        // Set the speed for the first sprite of the new pattern
        rowEnemies[nSprite].speed = rowState.speed;

        // TODO: 'intelligence' for switching patterns
        //  - make sure to keep enough info around for case where the distance
        //    can leave the whole row blank for awhile.
        //  - differences if speed changes
      }// ./if (this.elapsedTime >= rowState.expires)
    }// ./for (row = 0; row < this.currentPatterns.length; row += 1)
  };// ./function Frogger.prototype.cycleEnemyPatterns()

  /**
   * Add enemies to the active queue when the current queued sprites become
   * visible.
   *
   * @return {undefined}
   */
  Frogger.prototype.refreshEnemyQueues = function () {
    var row, rowState, rowEnemies, lastX;
    for (row = 0; row < this.currentPatterns.length; row += 1) {
      rowState = this.currentPatterns[row];
      rowEnemies = this.enemySprites[row];
      if (rowEnemies[rowState.tail].position.x > this.limits.queuedSpriteX) {
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
   * @param {Number} deltaTime    (Fractional) seconds since previous update
   * @return {undefined}
   */
  Frogger.prototype.next = function (deltaTime) {
    this.elapsedTime += deltaTime;

    // Check for level time limit exceeded first
    if (this.elapsedTime > this.levelTime) {
      // Time has expired for the current level.  Avatar dies (from exposure)
      // TODO: stub
      console.log('Dieing from exposure @' + this.elapsedTime + ' on level ' +
        this.level + ', with limit of ' + this.levelTime);
      this.elapsedTime = 0;
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

  /**
   * Display game state information (at the start of) each animation frame
   *
   * @return {undefined}
   */
  Frogger.prototype.display = function () {
    // TODO: stub
    return undefined;
  };// ./function Frogger.prototype.display()

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
  //engineNs = namespace('io.gihub.mmerlin.animationEngine');
  engineNs = window;

  //timeScaling : 1000.0,//milliseconds per second

  // TODO: Remove app.game namespace? Currently there does not seem to be any
  // need for it.  The game should be able to run completely inside the current
  // anonymous function.  Except for (maybe) this.GAME_BOARD, the animation
  // engine only works with objects passed to in the engingNs properties
  app.game = new Frogger();

}());// ./function anonymous()
