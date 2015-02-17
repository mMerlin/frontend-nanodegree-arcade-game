/*jslint browser: true, devel: true, todo: true, indent: 2, maxlen: 82 */
/*global Resources, ctx */

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
   * @param {Number} spriteX      The x coordinate to use to display the sprite
   * @param {Number} spriteY      The y coordinate to use to display the sprite
   * @param {Object} spriteCanvas The CanvasRenderingContext2D to display the
   *                    sprite on.
   * @return {Object} Player instance
   */
  function Enemy(imgRsrc, gridRow, ofstVert, speed, cvsContext, gridCell) {
    Sprite.call(this, imgRsrc, undefined, undefined, cvsContext);
    // Once placed, all current enemies stay on a specific grid row.
    this.row = gridRow || 0;
    this.rowOffset = ofstVert || 0;
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
    // Always start an enemy just off (in front of) the visible canvas
    this.position = { x : -this.cell.width };
    this.gridRowToY();
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
   * @param {string} imgRsrc URL for the image file, which in this context
   *                    is the key to the cached image resource.
   * @param {Number} spriteX      The x coordinate to use to display the sprite
   * @param {Number} spriteY      The y coordinate to use to display the sprite
   * @param {Object} spriteCanvas The CanvasRenderingContext2D to display the
   *                    sprite on.
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
   * Convert the logical grid column number to a canvas x (pixel) coordinate.
   *
   * @return {undefined}
   */
  Avatar.prototype.gridColToX = function () {
    this.position.x = ((this.col || 0) * this.cell.width) + (this.colOffset || 0);
  };// ./function Avatar.prototype.gridColToX()

  /**
   * Convert logical grid address to canvas (pixel) coordinates.
   *
   * @return {undefined}
   */
  Avatar.prototype.gridColRowToXY = function () {
    this.gridRowToY();//From superclass prototype
    this.gridColToX();
  };// ./function Avatar.prototype.gridColRowToXY()

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
    //   console.log(engineNs.allEnemies[i].x);
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
  };


  /////////////////////////////////
  // End of function definitions //
  /////////////////////////////////

  // Start of actual code execution

  // Create a 'namespace' to hold application resources that need to be accessed
  // from outside of the current anonymous wrapper function.
  app = namespace('io.github.mmerlin.frogger');
  //engineNs = namespace('io.gihub.mmerlin.animationEngine');
  engineNs = window;

  /* Populate a configuration object to be shared with / passed to the animation
   * (game) engine.  This includes the resources that are to be [pre] loaded.
   * Set this up as a JSON object structure that could potentially be loaded
   * from an external file.
   *
   * TODO: move the config structure description to engine.js, keep only the
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
   * *************************
   *  canvas : {Object} Information about the grid used for the game playing field
   *  gridRows : {Integer} base playing field grid height
   *  gridCols : {Integer} base playing field grid width
   *  gridCells : {Array} URLs of resources to build the base playing field: Each
   *              image is repeated to fill the row; top row is water, followed
   *              by three rows of stone, then 2 rows of grass.
   *  cellSize : width 101 pixels; height 83 pixels
   *  tileSize : all used tiles are 171 x 101 pixels, with at least some
   *    transparent area at the top.
   *  Padding : An extra 20 pixels is (to be) added to the bottom of the canvas;
   *    all other padding is 0.
   */
  app.gameBoard = {
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
  };
  //timeScaling : 1000.0,//milliseconds per second
  /* Store constants that are needed for the application, but that that the
   * animation engine has no need for.
   *
   * TODO: Expand the game configuration to include the intelligence / patterns
   * used for the enemies, for each game level
   */
  app.config = {
    "enemy" : {
      "spriteTile" : "images/enemy-bug.png",
      "verticalOffset" : -20,
      "firstRow" : 1,
      "rows" : [
        {
          "speed" : [80]
        },
        {
          "speed" : [-40]
        },
        {
          "speed" : [40]
        }
      ]
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
  };

  // Setup a callback, so that details can be filled in when the Animation
  // has things setup
  document.addEventListener('engineReady', function (e) {
    var ctx, gridCell, cfg, sprite;
    console.log('Engine says it is ready');
    console.log(e.detail.message);
    console.log(e.detail.context);
    ctx = e.detail.context;

    // Place all enemy objects in an array called allEnemies
    // Place the player object in a variable called player
    // The image tile for enemy sprites needs to be offset vertically from the
    // base grid position, to align with the playing field graphics.
    engineNs.allEnemies = [];
    gridCell = app.gameBoard.canvas.cellSize;
    cfg = app.config.enemy;
    for (sprite = 0; sprite < cfg.rows.length; sprite += 1) {
      engineNs.allEnemies.push(
        new Enemy(cfg.spriteTile, sprite + cfg.firstRow,
          cfg.verticalOffset, cfg.rows[sprite].speed[0], ctx, gridCell
          )
      );
    }
    cfg = app.config.player;
    engineNs.player = new Avatar(cfg.spriteTile, cfg.start.row, cfg.start.col,
      cfg.verticalOffset, cfg.horizontalOffset, ctx, gridCell
      );
  });

  // This listens for key presses and sends the keys to your
  // Player.handleInput() method. You don't need to modify this.
  document.addEventListener('keyup', function (e) {
    var allowedKeys = {
      37: 'left',
      38: 'up',
      39: 'right',
      40: 'down'
    };

    engineNs.player.handleInput(allowedKeys[e.keyCode]);
  });
}());
