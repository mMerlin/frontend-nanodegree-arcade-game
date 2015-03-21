/*jslint browser: true, devel: false, indent: 2, maxlen: 82 */
/*global io, Resources, CustomEvent */
/* jshint bitwise: true, curly: true, eqeqeq: true, es3: false,
   forin: true, freeze: true, futurehostile: true, latedef: true,
   maxcomplexity: 8, maxstatements: 35, noarg: true, nocomma: true,
   noempty: true, nonew: true, singleGroups: true, undef: true, unused: true,
   plusplus: true, strict: true, browser: true, devel: false
*/

/* Engine.js
 * This file provides the game loop functionality (update entities and render),
 * draws the initial game board on the screen, and then calls the update and
 * render methods on your player and enemy objects (defined in your app.js).
 *
 * A game engine works by drawing the entire game screen over and over, kind of
 * like a flipbook you may have created as a kid. When your player moves across
 * the screen, it may look like just that image/character is moving or being
 * drawn but that is not the case. What's really happening is the entire "scene"
 * is being drawn over and over, presenting the illusion of animation.
 */

// Start things off when the DOM is ready.
// The body tag must be available.
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var ns, MS_PER_SECOND;
  MS_PER_SECOND = 1000;
  ns = io.github.mmerlin.animationEngine;
  /**
   * The ns.field object is to be supplied by the application.  It holds
   * all of the constant configuration information needed to work with
   * the bare playing field (grid).
   *
   * Structure:
   *  canvasStyle {string}    css styling for created html canvas Element
   *  gridRows : {Integer}
   *    number of (equal height) rows the canvas is split into.
   *  gridCols : {Integer}
   *    number of (equal width) columns the canvas is split into.
   *  rowImages : {Array of {row}} ==> [row1 [, row2]…]
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
   *    URLs of all of the image resources to be cached.  This should be
   *    automatically extended to include unique URL entries from "rowImages",
   *    but currently (unique) rowImages entries must be duplicated here
   */

  /**
   * Create a custom event with fall back that works in IE (11 at least)
   *
   * @param {string} evName     The name for the custom event
   * @param {Object} evObj      The properties to include in the event details.
   * @returns {CustomEvent}
   */
  function makeCustomEvent(evName, evObj) {
    var cstEvnt;
    // IE11 fails on the 'standard' new CustomEvent() with "Object doesn't
    // support this action".  Provide a fall back.
    try {
      cstEvnt = new CustomEvent(evName, { detail : evObj });
    } catch (e) {
      cstEvnt = document.createEvent('CustomEvent');
      cstEvnt.initCustomEvent(evName, false, false, evObj);
    }
    return cstEvnt;
  }// ./function makeCustomEvent(evName, evObj)

  /* Start the game engine processing loop.  Another anonymous function is used
   * for this, but only as a convenience, to be able to pass an argument to it.
   *
   * TODO: flatten this code: the parameter is not really needed.  Just set
   * global as a constant value, to get it in a single place.  The original
   * 'this' value previously used is no longer the correct context, which is
   * now 'document' due to using addEventListener to start things up.
   */
  (function (global) {
    /* Predefine the variables we'll be using within this scope,
     * create the canvas element, grab the 2D context for that canvas
     * set the canvas elements height/width and add it to the DOM.
     */
    var doc, win, canvas, ctx, lastTime,
      update, render, reset, updateEntities, renderEntities, rdyEvnt;
    doc = global.document;
    win = global.window;
    canvas = doc.createElement('canvas');
    ctx = canvas.getContext('2d');

    canvas.width = ns.field.gridCols * ns.field.cellSize.width;
    canvas.height = (ns.field.gridRows - 1) * ns.field.cellSize.height +
      ns.field.tileSize.height + ns.field.padding.bottom;
    canvas.style.cssText = ns.field.canvasStyle;
    doc.body.appendChild(canvas);

    // The basic graphical environment is ready.  Let any interested parties
    // know.
    // Since the configuration information is being passed through an object
    // created in the engine’s namespace, an event trigger is not REQUIRED.  A
    // startup callback function could be provided with the configuration data.
    // However, using the event lets the engine continue, without worrying
    // about what the application might be doing, or how long it will take.
    rdyEvnt = makeCustomEvent('engineReady', {
      'message' : 'Canvas exists',
      'context' : ctx
    });
    document.dispatchEvent(rdyEvnt);

    /* This function serves as the kickoff point for the game loop itself
     * and handles properly calling the update and render methods.
     */
    function main() {
      /* Get our time delta information which is required if your game
       * requires smooth animation. Because everyone's computer processes
       * instructions at different speeds we need a constant value that
       * would be the same for everyone (regardless of how fast their
       * computer is) - hurry time!
       */
      var now, dt;
      now = Date.now();
      /* Get the (fractional) number of seconds since the previous time that
       * main was run.  Any timing based on dt will then be based on elapsed
       * seconds.
       */
      dt = (now - lastTime) / MS_PER_SECOND;

      /* Call our update/render functions, pass along the time delta to
       * our update function since it may be used for smooth animation.
       */
      update(dt);
      render();

      /* Set our lastTime variable which is used to determine the time delta
       * for the next time this function is called.
       */
      lastTime = now;

      /* Use the browser's requestAnimationFrame function to call this
       * function again as soon as the browser is able to draw another frame.
       */
      win.requestAnimationFrame(main);
    }

    /* This function does some initial setup that should only occur once,
     * particularly setting the lastTime variable that is required for the
     * game loop.
     */
    function init() {
      reset();
      lastTime = Date.now();
      main();
    }

    /* This function is called by main (our game loop) and itself calls all
     * of the functions which may need to update entity's data. To keep the
     * engine 'generic', applications need to implement their own collision
     * detection.  Normally that requires knowledge of what can collide,
     * which would end up creating a dependency with the application.
     */
    update = function (dt) {
      updateEntities(dt);
    };

    /* This is called by the update function  and loops through all of the
     * objects within your allEnemies array as defined in app.js and calls
     * their update() methods. It will then call the update function for your
     * player object. These update methods should focus purely on updating
     * the data/properties related to  the object. Do your drawing in your
     * render methods.
     */
    updateEntities = function (dt) {
      ns.allEnemies.forEach(function (enemy) {
        enemy.update(dt);
      });
      ns.player.update();
    };

    /* This function initially draws the "game level", it will then call
     * the renderEntities function. Remember, this function is called every
     * game tick (or loop of the game engine) because that's how games work -
     * they are flipbooks creating the illusion of animation but in reality
     * they are just drawing the entire screen over and over.
     */
    render = function () {
      var row, col;

      /* Loop through the number of rows and columns we've defined above
       * and, using the rowImages array, draw the correct image for that
       * portion of the "grid"
       */
      for (row = 0; row < ns.field.gridRows; row += 1) {
        for (col = 0; col < ns.field.gridCols; col += 1) {
          /* The drawImage function of the canvas' context element
           * requires 3 parameters: the image to draw, the x coordinate
           * to start drawing and the y coordinate to start drawing.
           * We're using our Resources helpers to refer to our images
           * so that we get the benefits of caching these images, since
           * we're using them over and over.
           */
          ctx.drawImage(
            Resources.get(ns.field.rowImages[row]),
            col * ns.field.cellSize.width,
            row * ns.field.cellSize.height
          );
        }
      }


      renderEntities();
    };

    /* This function is called by the render function and is called on each game
     * tick. It's purpose is to then call the render functions you have defined
     * on your enemy and player entities within app.js
     */
    renderEntities = function () {
      /* Loop through all of the objects within the allEnemies array and call
       * the render function you have defined.
       */
      ns.allEnemies.forEach(function (enemy) {
        enemy.render();
      });

      ns.player.render();
    };

    /* This function does nothing but it could have been a good place to
     * handle game reset states - maybe a new game menu or a game over screen
     * those sorts of things. It's only called once by the init() method.
     */
    reset = function () {
      return undefined;// noop
    };

    /* Go ahead and load all of the images we know we're going to need to
     * draw our game level. Then set init as the callback method, so that when
     * all of these images are properly loaded our game will start.
     */
    Resources.load(ns.field.resourceTiles);
    Resources.onReady(init);
  }(window));

});// ./DOMContentLoaded handler
