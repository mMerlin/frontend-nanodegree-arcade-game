/*jslint browser: true, devel: false, todo: false, indent: 2, maxlen: 82 */
/*global Resources, CustomEvent */
/* jshint bitwise: true, curly: true, eqeqeq: true, es3: false,
   forin: true, freeze: true, futurehostile: true, latedef: true,
   maxcomplexity: 8, maxstatements: 35, noarg: true, nocomma: true,
   noempty: true, nonew: true, singleGroups: true, undef: true, unused: true,
   plusplus: true, strict: true, browser: true, devel: false
*/

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
  var Sprite, ENUMS, froggerInstance, app, engineNs;

  /**
   * Create a nested set of objects, (only) if any level(s) do not already exist
   *
   * Ref: http://elegantcode.com/2011/01/26/basic-javascript-part-8-namespaces/
   *
   * @param {string} namespaceString The dotted path to the last object
   */
  function namespace(namespaceString) {
    var i, parts, parent, currentPart, length;
    parts = namespaceString.split('.');
    parent = window;
    currentPart = '';

    length = parts.length;
    for (i = 0; i < length; i += 1) {
      currentPart = parts[i];
      parent[currentPart] = parent[currentPart] || {};
      parent = parent[currentPart];
    }

    return parent;
  }// ./function namespace(namespaceString)

  /**
   * Create a custom event with fall back that works in IE (11 at least)
   *
   * @param {string} evName     The name for the custom event
   * @param {Object} evObj      The properties to include in the event details.
   * @returns {CustomEvent}
   */
  function makeCustomEvent(evName, evObj) {
    var cstEvnt;
    //IE11 fails on the 'standard' new CustomEvent() with "Object doesn't
    //support this action".  Provide a fall back.
    try {
      cstEvnt = new CustomEvent(evName, { detail : evObj });
    } catch (e) {
      cstEvnt = document.createEvent("CustomEvent");
      cstEvnt.initCustomEvent(evName, false, false, evObj);
    }
    return cstEvnt;
  }// ./function makeCustomEvent(evName, evObj)

  /**
   * Check if the current ('this') array contains a specific element / value
   *
   * This only does a direct equality compare.  Deeply matching identical
   * objects will still not match, if they are not the same instance.
   *
   * @param {object} obj        The element / value to look for
   * @returns {boolean}
   */
  function arrayContains(obj) {
    /* jshint validthis: true */
    var i;

    for (i = 0; i < this.length; i += 1) {
      if (this[i] === obj) { return true; }
    }

    return false;
  }// ./function arrayContains(obj)

  /**
   * Total all the values in the current ('this') array.
   *
   * All array elements are expected to be numeric.
   *
   * @returns {Number}
   */
  function arraySum() {
    /* jshint validthis: true */
    var i, sum;

    sum = 0;
    for (i = 0; i < this.length; i += 1) {
      sum += this[i];
    }

    return sum;
  }// ./function arraySum()

  /**
   * Zero entries in the current ('this') array that are not available for a row
   *
   * 'this' entries are expected to be numeric.
   *
   * @param {Array of Array of boolean} notAvailable ary[col][row] of flags
   * @param {Integer} row       The row number in 'notAvailable to filter with
   * @return {undefined}
   */
  function clearUnavailableColWeight(notAvailable, row) {
    /* jshint validthis: true */
    var col;
    for (col = 0; col < this.length; col += 1) {
      if (notAvailable[col][row]) {
        this[col] = 0;
      }
    }// ./for (col = 0; col < this.length; col += 1)
  }// ./clearUnavailableColWeight(notAvailable, row)

  /**
   * Zero entries in the current ('this') array that are not available for a row
   *
   * 'this' entries are expected to be numeric.
   *
   * @param {Array of Array of boolean} notAvailable ary[col][row] of flags
   * @param {Integer} row       The row number in 'notAvailable to filter with
   * @return {undefined}
   */
  function clearUnavailableRowWeight(notAvailable, col) {
    /* jshint validthis: true */
    var row;
    for (row = 0; row < this.length; row += 1) {
      if (notAvailable[col][row]) {
        this[row] = 0;
      }
    }// ./for (row = 0; row < this.length; row += 1)
  }// ./clearUnavailableRowWeight(notAvailable, row)

  /**
   * Count the number of positive value entries in the current ('this') array.
   *
   * All array elements are expected to be numeric.
   *
   * @returns {Integer}
   */
  function arrayCountPlus() {
    /* jshint validthis: true */
    var i, count;

    count = 0;
    for (i = 0; i < this.length; i += 1) {
      if (this[i] >= 0) { count += 1; }
    }

    return count;
  }// ./function arrayCountPlus()

  /**
   * Replace "{n}" markers in text string with consecutive values from array
   *
   * This must be run in the ('this') context of the template string.
   *
   * Array entries with no matching marker are simply ignored.
   *
   * If duplicate markers exists, only the first will be replaced.
   *
   * NOTE: Markers start at {1}, but index starts at 0.
   *
   * NOTE: There is a simple iterative solution, but the recursive solution
   * looks clean, and 'might' reduce temporary string copying.
   *
   * This does the substitutions in descending sequence, which can be important
   * if the substituted values introduce additional markers.
   *
   * @param {Array} ary         Array of values to insert into string
   * @param {Integer} lastKey   Value for the highest (largest) marker to
   *                            process, defaults to ary.length
   * @returns {string}
   */
  function textInterpolate(ary, lastKey) {
    /* jshint validthis: true */
    var idx, key;
    key = lastKey || ary.length;//Works, since never reaches key 0 falsey value
    idx = key - 1;
    if (idx <= 0) { return this.replace('{1}', ary[0]); }
    return textInterpolate.
      call(this.replace('{' + key + '}', ary[idx]), ary, idx);
  }// ./function textInterpolate(ary, lastKey)

  /**
   * Create a deep copy of the passed argument.
   *
   * Enumerable properties are duplicated, prototypes are copied.
   *
   * Function objects are passed directly (as references), not explicitly
   * copied, but since the contents of a function should be immutable, that
   * should not cause any problems.  The context of the function will be its
   * destination.
   *
   * NOTE: This has not been tested with regex objects.  Regex is documented as
   * being detected as an object, but it is not known whether standard object
   * processing will properly clone it.
   *
   * @param {object} obj        The object to (deep) copy
   * @returns {object}
   */
  function deepCopyOf(obj) {
    var copiedObj, k;
    if (obj === null) { return null; }
    // Anything that is NOT some sort of object can be treated as a primitive
    // data type, and returned directly as the result.  Including functions.
    if (typeof obj !== 'object') { return obj; }

    // Now for the 'hard' part.  Building a copy of an object.

    if (obj instanceof Array) {
      copiedObj = new obj.constructor();
      for (k = 0; k < obj.length; k += 1) {
        copiedObj.push(deepCopyOf(obj[k]));
      }
      return copiedObj;
    }// ./ if (obj instanceof Array)

    // Unknown if this code will work for a regex object.
    copiedObj = Object.create(obj.constructor.prototype);
    for (k in obj) {
      if (obj.hasOwnProperty(k)) {
        copiedObj[k] = deepCopyOf(obj[k]);
      }
    }// ./ for (k in obj)
    return copiedObj;

  }// ./function deepCopyOf(obj)

  /**
   * Adjust time flow rate, and time jumps
   *
   * Reduce very large frame animation time delays to a small value.  This helps
   * keep code 'sane' when frames are stopped while a browser tab is not
   * displayed, or while using breakpoints to debug code.  This is to be used to
   * limit all (and only) delta time values supplied by the animation engine.
   *
   * @param {Number} deltaTime  Actual delta time value (fractional seconds)
   * @returns {Number}
   */
  function timeCop(deltaTime) {
    return (deltaTime > 0.75 ? 0.01 : deltaTime) * app.elapsedTimes.timeSpeed;
  }// ./function timeCop(deltaTime)

  /**
   * Deep merge object properties, recursively, making copies.
   *
   * This function is expected to be called in the context of an object. 'this'
   * is the object to be modified.
   *
   * This function handles 'primitive' properties, regular objects, and arrays.
   *
   * @param {object} obj        The array element to look for
   * @returns {object}          The modified object
   */
  // Currently not using mergeProperties; deepCopyOf is sufficient so far
  // function mergeProperties(obj) {
  //   var p;
  //
  //   // Do validation checks on the operands: both should be objects, and not
  //   // arrays.
  //   p = typeof this;
  //   if (p !== 'object') {
  //     throw new Error('Can not merge properties into a ' + p);
  //   }
  //   if (this instanceof Array) {
  //     throw new Error('Can not merge properties into an array');
  //   }
  //   p = typeof obj;
  //   if (p !== 'object') {
  //     throw new Error('Can not merge a ' + p + ' into an object');
  //   }
  //   if (obj instanceof Array) {
  //     throw new Error('Can not merge array properties into an object');
  //   }
  //
  //   for (p in obj) {
  //     if (obj.hasOwnProperty(p)) {
  //       this[p] = deepCopyOf(obj[p]);
  //     }
  //   }
  //
  //   return this;
  // }// ./function mergeProperties(obj)

  /**
   * Get the updated setting value from the configuration
   *
   * @param {Number} currentValue The current value for the setting
   * @param {string} source     The configuration property name
   * @return {Number}
   */
  function configUpdate(currentValue, source) {
    /* jshint validthis: true */
    if (this === undefined) {
      // Configuration object does not exist; keep current value
      return currentValue;
    }
    if (this[source]) {
      return this[source];// Directly replace with the configuration value
    }
    if (this.delta && this.delta[source]) {
      // Adjust the current value by the configured delta
      return currentValue + this.delta[source];
    }
    return currentValue;// No configuration property; keep current value
  }// ./function configUpdate(currentValue, source)

  /**
   * Modify configuration settings from delta information
   *
   * Call with the ('this') context set to an Object containing change
   * information
   *
   * @param {Object} target     Configuration object with properties to updated
   * @return {undefined}
   */
  function deltaConfigUpdate(target) {
    /* jshint validthis: true */
    var p;
    if (this === undefined) {
      return; // no delta information to process
    }

    for (p in this) {
      if (this.hasOwnProperty(p)) {
        // For each local (Own) property of 'this' (which is a 'delta' object)
        if (this[p] === null) {
          // delta property is null; delete the matching configuration property
          delete target[p];
        } else if (typeof this[p] === 'number') {
          // The 'normal' case; the delta is a numeric value, just add it to the
          // existing configuration value
          if (target[p] === undefined) {
            // Safety net, in case the configuration property does not exist yet
            target[p] = 0;
          }
          target[p] += this[p];
        } else {// .!(this[p] === undefined || typeof this[p] === 'number')
          // Odd delta, just copy the value to the configuration property
          target[p] = deepCopyOf(this[p]);
        }// ./else !(this[p] === undefined || typeof this[p] === 'number')
      }// ./if (this.hasOwnProperty(p))
    }// ./for (p in this)
  }// ./function deltaConfigUpdate(target)

  /**
   * Get the updated setting value from the configuration
   *
   * @param {Object} target     Object with properties to be updated
   * @param {string} source     The configuration property name
   * @return {Object}           undefined or true
   */
  function nestedConfigUpdate(target, source) {
    /* jshint validthis: true */
    var p;
    if (this === undefined || this[source]  === undefined) {
      // Configuration object does not exist; keep current values
      return undefined;
    }
    if (target[source] === undefined) {
      target[source] = {};
    }
    for (p in this[source]) {
      if (this[source].hasOwnProperty(p)) {
        if (typeof this[source][p] === 'object') {
          if (p !== 'delta') {
            // Recursively do updates for nested objects
            nestedConfigUpdate.
              call(this[source], target[source], p);
          }
        } else {// !(typeof this[source][p] === 'object')
          target[source][p] = configUpdate.
            call(this[source], target[source][p], p);
          //target[source][p] = this[source][p];
        }// ./else !(typeof this[source][p] === 'object')
      }// ./if (this[source].hasOwnProperty(p))
    }// ./for (p in this[source])

    // Process any included delta information
    deltaConfigUpdate.call(this[source].delta, target[source]);

    return true;
  }// ./function nestedConfigUpdate(target, source)

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
   * @return {Function}         Sprite class constructor
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
     * @return {Integer}        Sprite serial number
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
     * @param {string} imgRsrc  URL for the image file, which in this
     *                    context is the key to the cached image resource.
     * @param {Number} spriteX  x coordinate of the sprite
     * @param {Number} spriteY  y coordinate of the sprite
     * @param {Object} spriteCanvas The CanvasRenderingContext2D to display the
     *                    sprite on.
     * @return {Object}         Sprite instance
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
   * @param {Number} offset     Horizontal offset for transform
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
    // Skip rendering if completely outside of the visible canvas area.
    // Expectation is that draw is expensive compared to detection
    // tst1 = 0 - this.cell.width;// jslint: Unexpected 'this'
    // tst1 = this.cell.width;// jslint: OK
    // if (this.position.x < (0 - this.cell.width)) {// jslint: Unexpected 'this'
    // if (this.position.x < tst1) {// OK
    // if (this.position.x < -this.cell.width) {// OK
    if (this.position.x <= -this.cell.width ||
        this.position.x >= this.context.canvas.width
        ) {
        // Off canvas horizontally
      return;
    }
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

  /**
   * Check if another sprite overlaps the current sprite position horizontally.
   *
   * This uses passed in parameters to determine the effective (collision
   * sensitive) width of each of the sprites.
   *
   * NOTE: touching is NOT considered intersecting here.
   *
   * Assumption: The actual (not contact area) width of the sprites is the same.
   * IE: Resources.get(this.sprite).width === Resources.get(target.sprite).width
   * This means that there is no need to add half of each of those values to the
   * sprite positions, to get a centre point to base collision detection on.
   * selfCenter = this.position.x + (thisWidth / 2);
   * targetCenter = target.position.x + (targetWidth / 2);
   * the simple position.x values can be used directly.
   *
   * @param {Sprite} target     The other sprite to check for intersection with
   * @param {Number} sHalfWidth Left and right collision size for 'this'
   * @param {Number} tHalfWidth Left and right collision size for target
   * @return {boolean}
   */
  Sprite.prototype.xIntersected = function (target, sHalfWidth, tHalfWidth) {
    /* jshint singleGroups: false */
    var thisLeft, thisRight, targetLeft, targetRight;

    thisLeft = this.position.x - sHalfWidth;
    thisRight = this.position.x + sHalfWidth;
    targetLeft = target.position.x - tHalfWidth;
    targetRight = target.position.x + tHalfWidth;

    // Collision when:
    //  targetLeft < thisLeft < targetRight ||
    //  targetLeft < thisRight < targetRight ||
    //  thisLeft < targetLeft < thisRight
    // - extra check needed to handle case where target is wholly 'inside' this
    // - Since widths are known, picking the check based on which is narrower
    //   removes the last between check, and reduces (by one) the maximum number
    //   of compares.
    if (sHalfWidth > tHalfWidth) {
      // 'this' contact area is larger, so enemy could be completely contained
      if ((thisLeft < targetLeft && targetLeft < thisRight) ||
          (thisLeft < targetRight && targetRight < thisRight)
          ) {
        return true;
      }
    } else {// !(sHalfWidth > tHalfWidth)
      // Target contact is the same or smaller, so Target could be completely
      // contained.
      if ((targetLeft < thisLeft && thisLeft < targetRight) ||
          (targetLeft < thisRight && thisRight < targetRight)
          ) {
        return true;
      }
    }// ./else !(sHalfWidth > tHalfWidth)

    return false;
  };// ./function Sprite.prototype.xIntersected(target, sHalfWidth, tHalfWidth)

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
   * @param {Number} newSpeed   Pixels per Second
   * @return {Number}
   */
  function setSpeed(newSpeed) {
    /* jshint validthis: true */
    this.private.speed = newSpeed;
    if (newSpeed < 0) {
      // need to use a horizontally flipped sprite.  Or place (done here) on
      // the canvas using a horizontally flipped coordinate system.
      this.position.flipped = true;
    } else if (newSpeed > 0) {
      // Leave .flipped state alone when speed = zero
      this.position.flipped = false;
    }
    return this.private.speed;
  }// ./function setSpeed(newSpeed)

  /**
   * Enemy class speed property getter function
   *
   * @return {Number}
   */
  function getSpeed() {
    /* jshint validthis: true */
    return this.private.speed;
  }// ./function getSpeed()

  /**
   * Convert the logical grid column number to a canvas x (pixel) coordinate.
   *
   * Enemy class column property setter function
   *
   * @param {Integer} colNumber The grid column for the sprite
   * @return {Integer}
   */
  function setColumn(colNum) {
    /* jshint validthis: true */
    this.private.column = colNum;
    this.position.x = colNum * this.cell.width + this.colOffset;
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
    /* jshint validthis: true */
    return this.private.column;
  }// ./function getColumn()

  /**
   * Convert the logical grid row number to a canvas y (pixel) coordinate.
   *
   * Enemy class row property setter function
   *
   * @param {Integer} rowNumber The grid row for the sprite
   * @return {Integer}
   */
  function setRow(rowNum) {
    /* jshint validthis: true */
    this.private.row = rowNum;
    this.position.y = rowNum * this.cell.height + this.rowOffset;
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
    /* jshint validthis: true */
    return this.private.row;
  }// ./function getRow()

  /**
   * Enemy sprite class constructor function
   *
   * A Pseudoclassical subClass (of Sprite) to hold information about enemy
   * sprites the avatar must avoid.
   *
   * @param {string} imgRsrc    URL for the image file, which in this context
   *                    is the key to the cached image resource.
   * @param {Integer} gridRow   The logical grid row for the instance
   * @param {Integer} ofstVert  The vertical (pixel) offset from the grid row
   * @param {Number} speed      The sprite movement speed (pixels/second)
   * @param {Object} cvsContext The CanvasRenderingContext2D to display the
   *                    sprite on.
   * @param {Object} gridCell   Dimensions for a single cell on the grid
   * @return {Object}           Enemy instance
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
   * @param {Number} deltaTime  Delta Time (since previous update) in seconds
   * @return {undefined}
   */
  Enemy.prototype.update = function (deltaTime) {
    var dt = timeCop(deltaTime);
    this.position.x += this.speed * dt;// standard distance formula: Δs=v*Δt
  };// ./function Enemy.prototype.update(deltaTime)

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
    return offsetX > -this.cell.width && offsetX < this.context.canvas.width;
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
    if (this.speed < 0) {
      return this.position.x - this.colOffset <= -this.cell.width;
    }
    return this.position.x - this.colOffset >= this.context.canvas.width;
  };// ./function Enemy.prototype.isOffEnd()


  ////////////////////////////////////////////////
  // Create Avatar (pseudoclassical) [sub]Class //
  ////////////////////////////////////////////////

  /**
   * Player avatar class constructor function
   *
   * A Pseudoclassical subClass (of Enemy) to hold information about a player
   * avatar that will be placed and managed as part of the application (game).
   *
   * @param {Object} options    Object with Avatar instance setup properties:
   *   {Integer} start.row      The logical grid row for the instance
   *   {Integer} start.col      The logical grid column for the instance
   *   {Integer} verticalOffset The vertical (pixel) offset from the grid row
   *   {Integer} horizontalOffset The horizontal (pixel) offset from the grid
   *                            column
   *   {Integer} tileIndex      Index into resource tiles for (first) sprite icon
   * @param {Object} cvsContext The CanvasRenderingContext2D to display the
   *                    sprite on.
   * @param {Object} gridCell   Dimensions for a single cell on the grid
   * @param {Object} owner      Reference to owner/parent context
   *   {Array} GAME_BOARD.resourceTiles Icon URLs
   * @return {Object}           Avatar instance
   */
  function Avatar(options, cvsContext, gridCell, owner) {
    Enemy.call(this, null, options.start.row, options.verticalOffset, undefined,
      cvsContext, gridCell
      );
    this.selectorCol = 0;
    this.pendingCommand = null;
    this.sleeping = true;// Avatar does not respond to commands while sleeping

    this.options = options;// Immutable
    this.parent = owner;
    this.tiles = this.parent.GAME_BOARD.resourceTiles;
    this.sprite = this.tiles[options.tileIndex + this.selectorCol];
    this.colOffset = options.horizontalOffset;
    this.col = options.start.col;

    // Create (reusable) custom event instance.
    this.appEvent = makeCustomEvent("ApplicationCommand", {
      message : "Application Event received",
      command : null
    });
  }// ./function Avatar(imgRsrc, gridRow, gridCol, ofstVert, ofstHoriz,
  //      cvsContext, gridCell)
  Avatar.prototype = Object.create(Enemy.prototype);
  Avatar.prototype.constructor = Avatar;

  /**
   * Respond to position change commands
   *
   * @param {string} cmd        A movement command
   * @return {undefined}
   */
  Avatar.prototype.handleInput = function (cmd) {
    // Save the command until ready to update for the next animation frame.
    // Commands are NOT queued.  If multiple commands arrive in the same frame,
    // only the last one will get processed.
    this.pendingCommand = cmd;// 'undefined' tests as 'falsey'
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
    // Process any pending (movement) command, passing anything else to the
    // application.
    if (this.pendingCommand) {
      this.appEvent.detail.command = this.pendingCommand;
      if (this.sleeping) {
        //Pass ALL commands to the main application
        document.dispatchEvent(this.appEvent);
      } else {// !(this.sleeping)
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
        default:
          // Just pass the command along to the main application.  *We* do not
          // need to know anything about it here.
          document.dispatchEvent(this.appEvent);
          break;
        }// ./switch (this.pendingCommand)
      }// ./else !(this.sleeping)

      // Always clear any pending command.  Commands are not queued while they
      // are not being processed.
      this.pendingCommand = null;
    }// ./if (this.pendingCommand)
  };// ./function Avatar.prototype.update()

  /**
   * Show the possible avatar selections, and highlight the current choice
   *
   * @return {undefined}
   */
  Avatar.prototype.showSelections = function () {
    var column;

    // Transfer any avatar motion into selector motion
    this.selectorCol += this.col - this.options.start.col;
    // Wrap the selector tile around the screen / avatar list
    if (this.selectorCol < 0) {
      this.selectorCol = this.options.avatarCount - 1;
    } else if (this.selectorCol >= this.options.avatarCount) {
      this.selectorCol = 0;
    }// ./ else if (this.selectorCol >= this.options.avatarCount)

    // Display each selectable avatar on a separate column
    this.row = this.options.selector.row;
    for (column = 0; column < this.options.avatarCount; column += 1) {
      this.col = column;
      this.sprite = this.tiles[this.options.tileIndex + column];
      this.render();
    }

    // Display the selector (highlight) tile over one of the avatars
    this.col = this.selectorCol;
    this.sprite = this.tiles[this.options.selector.tileIndex];
    this.render();

    // Setup so that the normal engine managed render will show the currently
    // highlighted (selected) avatar
    this.row = this.options.start.row;
    this.col = this.options.start.col;
    this.sprite = this.tiles[this.options.tileIndex + this.selectorCol];
    // Do not render this here; the engine will get to it later in the frame
  };// function Avatar.prototype.showSelections()

  /**
   * Setup any 'death throes' for the Avatar
   *
   * @return {undefined}
   */
  Avatar.prototype.die = function () {
    return null;// noop Stub
  };// ./function Avatar.prototype.die()

  /**
   * Restore to 'normal' conditions after death throes finished
   *
   * @return {undefined}
   */
  Avatar.prototype.resurrect = function () {
    return null;// noop Stub
  };// ./function Avatar.prototype.resurrect()


  ///////////////////////////////////////////////
  // Create Prize (pseudoclassical) [sub]Class //
  ///////////////////////////////////////////////

  /**
   * Prize class constructor function
   *
   * A Pseudoclassical subClass (of Enemy) to hold information about a reward
   * target that will be placed and managed as part of the application (game).
   *
   * @param {Integer} vOffset   The vertical (pixel) offset from the grid row
   * @param {Integer} hOffset   The horizontal (pixel) offset from the grid
   *                    column
   * @param {Object} gridCell   Dimensions for a single cell on the grid
   * @param {Array of string}   tiles Icon URLs to select from
   * @param {Object} cvsContext The CanvasRenderingContext2D to display the
   *                    sprite on
   * @param {Object} callbacks  object properties hold callback functions
   * @return {Object}           Prize instance
   */
  function Prize(vOffset, hOffset, gridCell, tiles, cvsContext, callbacks) {
    Enemy.call(this, null, 0, vOffset, undefined, cvsContext, gridCell);

    this.callbacks = callbacks;
    this.tiles = tiles;
    this.colOffset = hOffset;
    this.col = -1;
    this.timeToLive = 0;
  }// ./function Prize(vOffset, hOffset, gridCell, tiles, cvsContext)
  Prize.prototype = Object.create(Enemy.prototype);
  Prize.prototype.constructor = Prize;

  /**
   * Move prize instance off canvas when remaining life expires
   *
   * @param {Number} deltaTime  Delta Time (since previous update) in seconds
   * @param {Number} dt         Delta Time (since previous update) in seconds
   * @return {undefined}
   */
  Prize.prototype.update = function (deltaTime) {
    var dt = timeCop(deltaTime);
    if (this.col < 0) { return; }
    this.timeToLive -= dt;// Life is ticking away
    if (this.timeToLive < 0) {
      this.expired();
    }
  };// ./function Prize.prototype.update()

  /**
   * Cleanup and save status information when the prize times out before being
   * collected.
   *
   * This expired processing is needed as part of the class, because the timeout
   * occurs here, and the invoking (.place`ing) needs to know.  This seems
   * better than having the external code peek at the internals of the Prize
   * class instance to detected the timeout.
   *
   * @return {undefined}
   */
  Prize.prototype.expired = function () {
    // Remove the prize from the canvas, and let the specified object know
    this.hide();
    this.callbacks.expired.call(this.callbacks.context);
  };// ./function Prize.prototype.expired()

  /**
   * Cleanup and save status information when the prize was collected before
   * the time expired
   *
   * Note: This method is really just for symmetry with .expired.  Collection is
   * done by external code, so it already knows about it, and tells 'us'.
   *
   * @return {undefined}
   */
  Prize.prototype.collected = function () {
    this.hide();// Remove the prize from the canvas
  };// ./function Prize.prototype.collected()

  /**
   * Show the prize instance on the canvas
   *
   * @param {Object} location   Object with prize location information
   * @return {undefined}
   */
  Prize.prototype.place = function (location) {
    this.sprite = this.tiles[location.tileIndex];
    this.row = location.row;
    this.col = location.col;
    this.timeToLive = location.lifeTime;
  };// ./function Prize.prototype.place(location)

  /**
   * Manually expire the prize, and remove it from the canvas
   *
   * @return {undefined}
   */
  Prize.prototype.hide = function () {
    this.col = -1;
    this.timeToLive = 0;
  };// ./function Prize.prototype.hide()


  ////////////////////////////////////////////
  // Create Frogger (pseudoclassical) Class //
  ////////////////////////////////////////////

  // Internal shared, helper, utility, modularizing functions and data that do
  // not really belong in the prototypes.  Using function closure scope instead.

  // Internal constants
  ENUMS = {
    "STATE" : {
      "waiting" : "waiting",
      "dieing" : "Avatar dieing",
      "donelevel" : "scored goal",
      "gameover" : "game over",
      "resurrect" : "resurrect",
      "newlevel" : "new level",
      "running" : "running",
      "select" : "select"
    },
    "CHANGE" : {
      "never" : "Never",
      "now" : "Now",
      "trigger" : "Trigger",
      "delay" : "Delay"
    },
    "TRANSITIONS" : {},
    "BONUS" : {
      "score" : "score",
      "lives" : "lives",
      "speed" : "speed",
      "time" : "time"
    },
    "MOTION" : {
      "static" : "static",
      "acceleration" : "acceleration",
      "coasting" : "coasting",
      "deceleration" : "deceleration"
    },
    "SETTINGS" : {
      "sizeFactor" : "sizeFactor",
      "rewards" : "rewards",
      "baseSpeed" : "baseSpeed",
      "fillSpeed" : "fillSpeed"
    }
  };
  // Lookup for valid state transitions: target from (one of) current)
  // Can not populate direction in the JSON structure, since it uses constants
  // from earlier in the structure.
  ENUMS.TRANSITIONS[ENUMS.STATE.select] = [
    ENUMS.STATE.gameover,
    ENUMS.STATE.newlevel
  ];
  ENUMS.TRANSITIONS[ENUMS.STATE.waiting] = [
    ENUMS.STATE.newlevel,
    ENUMS.STATE.select
  ];
  ENUMS.TRANSITIONS[ENUMS.STATE.dieing] = [
    ENUMS.STATE.running
  ];
  ENUMS.TRANSITIONS[ENUMS.STATE.donelevel] = [
    ENUMS.STATE.running
  ];
  ENUMS.TRANSITIONS[ENUMS.STATE.gameover] = [
    ENUMS.STATE.resurrect
  ];
  ENUMS.TRANSITIONS[ENUMS.STATE.resurrect] = [
    ENUMS.STATE.dieing
  ];
  ENUMS.TRANSITIONS[ENUMS.STATE.newlevel] = [
    ENUMS.STATE.donelevel,
    ENUMS.STATE.resurrect,
    ENUMS.STATE.gameover
  ];
  ENUMS.TRANSITIONS[ENUMS.STATE.running] = [
    ENUMS.STATE.waiting
  ];

  // Store the single actual instance of the application class
  froggerInstance = false;

  /**
   * Check if the requested target is a valid transition from current state
   *
   * This is to be run in the context ('this') of the finite state settings
   * object.
   *
   * Clears any pending state transition that is satisfied by the (validated)
   * state change.
   *
   * @param {string} targetState The requested transition target state
   * @return {boolean}
   */
  function validateStateTransition(targetState) {
    /* jshint validthis: true */
    var transitions;
    if (!ENUMS.TRANSITIONS.hasOwnProperty(targetState)) {
      throw new Error('Unknown target state: "' + targetState + '"');
    }

    transitions = ENUMS.TRANSITIONS[targetState];
    if (!arrayContains.call(transitions, this.current)) {
      return false;
    }

    // If the requested transition is valid, and matches the pending
    // transition target, clear it out of pending.
    if (this.next === targetState) {
      this.changeOn = ENUMS.CHANGE.never;
      this.next = null;
    }

    return true;
  }// ./function validateStateTransition(targetState)

  function getLevel() {
    /* jshint validthis: true */
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
    /* jshint validthis: true */
    return this.finiteState.current;
  }// ./function getState()

  /**
   * Transition to ENUMS.STATE.newlevel state
   *
   * Must be run in the context (this) of the Frogger instance
   *
   * @return {undefined}
   */
  function setStateNewlevel() {
    /* jshint validthis: true */
    if (this.resetGame) {
      // Start of (new) game
      this.resetGame = false;
      this.lvlIndex = -1; //So increment will get to level 0 (displayed as 1)
      this.lives = this.APP_CONFIG.player.start.lives;
      this.score = 0;
    }
    this.lvlIndex += 1;
    this.elapsedTimes[ENUMS.STATE.running] = 0;
    this.elapsedTimes.timeSpeed = 1;

    // Currently, if run out of level configurations, there is no way to
    // continue.
    if (this.lvlIndex >= this.APP_CONFIG.enemy.levels.length) {
      this.finiteState.lock = false;
      throw new Error('Game broken, no level ' + this.level + ' configuration');
    }

    // Pick the state to transition too after the level is setup.
    if (this.finiteState.selectPending) {
      this.finiteState.next = ENUMS.STATE.select;
    } else {
      this.finiteState.next = ENUMS.STATE.waiting;
    }
    this.finiteState.changeOn = ENUMS.CHANGE.now;
    this.finiteState.doCurrent = true;
  }// ./function setStateNewlevel()

  /**
   * Change the application state, and update dependant properties. to match
   *
   * Frogger class state property setter function
   *
   * jshint currently reports a cyclomatic complexity rating of 16 for this
   * function.  Too high for normal things, but there does not seem to be a
   * reasonable way to reduce it.  It appears that every 'case' clause increase
   * the complexity by 1.
   *
   * @param {string} newState   The destination state from ENUMS.STATE
   * @return {string}
   */
  function setState(newState) {
    /* jshint validthis: true, maxcomplexity: 16 */
    var lockStatus, tmpMsg;
    lockStatus = this.finiteState.lock;
    this.finiteState.lock = true;

    if (lockStatus) {
      // This function is not recursive / re-entrant safe.  Make sure that only
      // a single instance will ever be in progress.  Set '.next' property to
      // change the state again after finished setup for the current transition.
      throw new Error('New state transition to "' +
        newState + '" while still processing previous transition');
    }

    // Check that the requested state transition (path) is valid
    if (!validateStateTransition.call(this.finiteState, newState)) {
      this.finiteState.lock = false;
      throw new Error('Invalid transition from "' +
        this.finiteState.current + '" to "' + newState + '" state');
      //return null;// reject the state transition
    }

    // Process the requested 'transition to' state
    switch (newState) {
    case ENUMS.STATE.waiting:
      this.elapsedTimes[ENUMS.STATE.running] = 0.0001;// trigger pattern change
      // Include previous select state time, for ENUMS.CHANGE.delayed time passed
      this.elapsedTimes[ENUMS.STATE.waiting] = 0;
      if (this.finiteState.current === ENUMS.STATE.select) {
        // Include previous select state in ENUMS.CHANGE.delayed elapsed time
        this.elapsedTimes[ENUMS.STATE.waiting] += this.elapsedTimes.state;
      }
      this.finiteState.next = ENUMS.STATE.running;
      this.finiteState.changeOn = ENUMS.CHANGE.delayed;
      break;

    case ENUMS.STATE.running:
      this.tracker.scrollMessage = false;
      this.player.sleeping = false;
      break;

    case ENUMS.STATE.newlevel:
      setStateNewlevel.call(this);
      break;

    case ENUMS.STATE.dieing:
      this.freezeEnemies();
      tmpMsg = deepCopyOf(this.APP_CONFIG.hud.statusline.templates.died);
      tmpMsg.text = tmpMsg.text.replace('{1}', this.reason);
      this.tracker.message = tmpMsg;

      if (this.elapsedTimes[ENUMS.STATE.running] >
          this.currentSettings.levelTime
          ) {
        // Prevent display of "-0.0" when time expires
        this.elapsedTimes[ENUMS.STATE.running] = this.currentSettings.levelTime;
      }

      this.finiteState.next = ENUMS.STATE.resurrect;
      this.finiteState.changeOn = ENUMS.CHANGE.trigger;
      this.finiteState.doCurrent = true;
      break;

    case ENUMS.STATE.donelevel:
      this.freezeEnemies();
      this.finiteState.next = ENUMS.STATE.newlevel;
      this.finiteState.changeOn = ENUMS.CHANGE.trigger;
      this.finiteState.doCurrent = true;
      break;

    case ENUMS.STATE.resurrect:
      this.lives -= 1;
      // - space to start message ? game over? start game over in above
      if (this.lives <= 0) {
        this.finiteState.next = ENUMS.STATE.gameover;
      } else {
        this.lvlIndex -= 1;// Repeat the same level
        this.finiteState.next = ENUMS.STATE.newlevel;
        this.finiteState.doCurrent = true;
      }
      this.finiteState.changeOn = ENUMS.CHANGE.now;
      break;

    case ENUMS.STATE.select:
      // Select an avatar image, on initial start, or between games
      this.finiteState.selectPending = false;
      this.player.sleeping = false;
      this.tracker.message =
        this.APP_CONFIG.hud.statusline.templates.selectAvatar;
      this.finiteState.next = ENUMS.STATE.waiting;
      this.finiteState.changeOn = ENUMS.CHANGE.trigger;
      break;

    case ENUMS.STATE.gameover:
      // Game over from dieing too many times
      this.resetGame = true;
      this.tracker.message = this.APP_CONFIG.hud.statusline.templates.gameover;
      this.finiteState.next = ENUMS.STATE.newlevel;
      this.finiteState.changeOn = ENUMS.CHANGE.trigger;
      break;

    default:
      throw new Error('Unknown target state: ' + newState +
        '; from state = "' + this.finiteState.current + '"'
        );
      // break;
    }// ./switch (newState)

    // If got this far, the state transition was accepted.  Do any cleanup
    // processing needed for the current (now previous) state.
    switch (this.finiteState.current) {
    case ENUMS.STATE.running:
      // State changing away from running, put the player to sleep
      this.player.sleeping = true;
      break;
    case ENUMS.STATE.select:
      // State changing away from select, put the player to sleep
      this.player.sleeping = true;
      break;
    }// ./switch (this.finiteState.current)

    //this.finiteState.previous = this.finiteState.current;
    this.finiteState.current = newState;
    this.elapsedTimes.state = 0;
    this.finiteState.lock = false;

    return this.finiteState.current;
  }// ./function setState(newState)

  /**
   * Advance internal application time values based on the current state
   *
   * @param {Number} deltaTime  Seconds elapsed since previous frame processed
   * @return {undefined}
   */
  function manageTime(deltaTime) {
    /* jshint validthis: true */
    // Always up the time for the current state.  It is not actually used for
    // most states, but will never conflict.  Anywhere it WOULD conflict gets
    // its own separate property in this.elapsedTimes
    this.elapsedTimes.state += deltaTime;
    if (this.elapsedTimes[this.state] !== undefined) {
      // Increase any specified state specific time
      this.elapsedTimes[this.state] += deltaTime;
    }
    if (this.elapsedTimes.timeSpeed > this.currentSettings.baseSpeed) {
      if (this.elapsedTimes[this.state] > this.currentSettings.fillTime) {
        this.elapsedTimes.timeSpeed = this.currentSettings.baseSpeed;
        this.finiteState.changeOn = ENUMS.CHANGE.now;
      }
    }
  }// ./function manageTime(deltaTime)

  /**
   * Class to control the application and operations sequence
   *
   * @return {Object}           Application instance
   */
  function Frogger() {
    this.private = {};// (psuedo) private storage for class instances

    // Reasonably robust singleton class pattern implementation
    if (froggerInstance) {
      return froggerInstance;
    }
    froggerInstance = this;

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

    /**
     * PaceCar class message property getter function
     *
     * @return {string}
     */
    function getMessage() {
      /* jshint validthis: true */
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
      /* jshint validthis: true */
      this.private.message = message;// Immutable
      // Setup to start displaying the new message
      this.scrollMessage = true;
      this.position.x = this.context.canvas.width;
      this.scrollEnd = this.position.x;

      return this.private.message;
    }

    /**
     * Tracking sprite: allow application to interface with animation engine
     *
     * A Pseudoclassical subClass (of Sprite) used to pick up elapsed time
     * information, and as a hook to display time, level, score, lives, and
     * other dynamic information as the game Progresses.
     *
     * @param {Object} spriteCanvas The CanvasRenderingContext2D to display the
     *                    information on.
     * @return {Object}         PaceCar instance
     */
    function PaceCar(ownerInstance, cvsContext) {
      this.owner = ownerInstance;
      this.animation = {
        "score" : {
          "displayScore" : 0
        }
      };
      Sprite.call(this, undefined, 0, undefined, cvsContext);
      this.speed = 0;// Not using the setter from Enemy class
      this.scrollMessage = false;
      // Automatically update dependant properties on state changes
      Object.defineProperty(this, "message", {
        get : getMessage,
        set : setMessage
      });

    }// ./function PaceCar(cvsContext)
    PaceCar.prototype = Object.create(Sprite.prototype);
    PaceCar.prototype.constructor = PaceCar;

    /**
     * Handle score decreases, or no change
     *
     * @param {Object} dat      Score display status information
     * @return {boolean}
     */
    PaceCar.prototype.jumpScore = function (dat) {
      if (dat.displayScore > this.owner.score) {
        // Straight jump on decrease (only expected for reset to zero)
        dat.displayScore = this.owner.score;
        dat.state = ENUMS.MOTION.static;
        return true;
      }// ./if (dat.displayScore > this.owner.score)
      if (dat.displayScore === this.owner.score) {
        // Check for any cleanup needed from previous??
        dat.state = ENUMS.MOTION.static;
        return true;
      }// ./if (dat.displayScore === this.owner.score)
      return false;
    };// ./function PaceCar.prototype.jumpScore(dat)

    /**
     * Handle animation initialization from static state
     *
     * @param {Object} dat      Score display status information
     * @param {Number} deltaTime (Fractional) seconds since previous update
     * @return {undefined}
     */
    PaceCar.prototype.scoringStatic = function (dat, deltaTime) {
      var prm;
      prm = this.owner.APP_CONFIG.hud.animation.score;
      if (dat.state === ENUMS.MOTION.static) {// Setup initial parameters
        dat.s1 = dat.displayScore;
        dat.target = dat.displayScore;
        dat.v1 = 0;
        dat.a = prm.acceleration;
        // Tweak the first time reference, since animating 0 change is useless.
        // 'Pretend' that the acceleration has been going on just long enough to
        // get the first (integer) step increase, rounded from 0.5 + ε
        // 0.5 + ε = ½a × Δt² ==> t = sqrt((1 + ε)/a)
        dat.dt = Math.sqrt(1.001 / dat.a) - deltaTime;
      }// ./if (dat.state === ENUMS.MOTION.static)
    };// ./function PaceCar.prototype.scoringStatic(dat)

    /**
     * Handle score target changes
     *
     * @param {Object} dat      Score display status information
     * @return {undefined}
     */
    PaceCar.prototype.scoringTargetChange = function (dat) {
      var prm;
      prm = this.owner.APP_CONFIG.hud.animation.score;
      // Handle both initial start, and change while animating
      if (this.owner.score > dat.target + 0.5) {// Target changed
        // Setup animation parameters to continue from the current conditions
        dat.target = this.owner.score - 0.499;// Offset better for int step
        dat.s0 = dat.s1;// Displayed score when score changed
        dat.v0 = dat.v1;// Velocity when score changed
        dat.a = prm.acceleration;// Set to accelerate; normal logic will
        dat.state = ENUMS.MOTION.acceleration;// 'catch up' as needed
      }// ./if (this.owner.score > dat.target + 0.5)
    };// ./function PaceCar.prototype.scoringTargetChange(dat)

    /**
     * Handle score acceleration animation
     *
     * @param {Object} dat      Score display status information
     * @return {undefined}
     */
    PaceCar.prototype.scoringAcceleration = function (dat) {
      var prm;
      prm = this.owner.APP_CONFIG.hud.animation.score;
      if (dat.state === ENUMS.MOTION.acceleration) {// Fast enough yet?
        // s1 + v1 × Δt >= s{target}
        if (dat.s1 + dat.v1 * prm.coasting >= dat.target) {
          // v1 is high enough to reach the target in .coasting seconds.
          dat.s0 = dat.s1;// Score when acceleration stopped
          dat.v0 = dat.v1;// Velocity when acceleration stopped
          dat.a = 0;
          dat.dt = 0;// New reference point
          dat.state = ENUMS.MOTION.coasting;
        }// ./if (dat.s1 + dat.v1 * prm.coasting >= dat.target)
      }// ./if (dat.state === ENUMS.MOTION.acceleration)
    };// ./function PaceCar.prototype.scoringAcceleration(dat)

    /**
     * Handle score coasting animation
     *
     * @param {Object} dat      Score display status information
     * @return {undefined}
     */
    PaceCar.prototype.scoringCoasting = function (dat) {
      var prm;
      prm = this.owner.APP_CONFIG.hud.animation.score;
      if (dat.state === ENUMS.MOTION.coasting) {// change to landing?
        // s1 + v1 × Δt >= s{target}
        if (dat.s1 + dat.v1 * prm.turnover >= dat.target) {
          // s1 high enough to reach the target (coasting) in .turnover seconds
          // Decelerate to 'land' exactly at .target after .landing seconds
          dat.s0 = dat.s1;// Score when deceleration started
          // s1 = s0 + v0 × Δt + ½a × Δt² ==> a = 2 × (s1 - s0 - v0 × Δt) / Δt²
          dat.a = 2 *
            (dat.target - dat.s0 - dat.v0 * prm.landing) /
            (prm.landing * prm.landing);
          dat.dt = 0;// New reference point (@ dat.s1 === .s0)
          dat.state = ENUMS.MOTION.deceleration;
        }// ./if (dat.s1 + dat.v1 * prm.turnover >= dat.target)
      }// ./if (dat.state === ENUMS.MOTION.coasting)
    };// ./function PaceCar.prototype.scoringCoasting(dat)

    /**
     * Check if the scoring animation is done, and cleanup
     *
     * @param {Object} dat      Score display status information
     * @return {undefined}
     */
    PaceCar.prototype.scoringDoneCheck = function (dat) {
      if (dat.displayScore >= this.owner.score) {
        dat.state = ENUMS.MOTION.static;
      }// ./if (dat.displayScore >= this.owner.score)
    };// ./function PaceCar.prototype.scoringDoneCheck(dat)

    /**
     * Animate score increases using standard distance equations.
     *
     * s1 = s0 + v0 × Δt + ½a × Δt²
     * v1 = v0 + a × Δt
     *
     * @param {Number} deltaTime (Fractional) seconds since previous update
     * @return {undefined}
     */
    PaceCar.prototype.animateScoring = function (deltaTime) {
      var dat;
      dat = this.animation.score;
      if (this.jumpScore(dat)) { return; }// Quick exit if no animation needed

      // The score is higher than displayed: Animate the increase 'spin' rate.
      this.scoringStatic(dat, deltaTime);
      this.scoringTargetChange(dat);
      this.scoringAcceleration(dat);
      this.scoringCoasting(dat);

      dat.dt += deltaTime;
      // s1 = s0 + v0 × Δt + ½a × Δt²
      dat.s1 = dat.s0 + dat.v0 * dat.dt +
        dat.a * dat.dt * dat.dt / 2;
      dat.v1 = dat.v0 + dat.a * dat.dt;// As of previous Δt
      dat.displayScore = Math.round(dat.s1);

      this.scoringDoneCheck(dat);
    };// ./function PaceCar.prototype.animateScoring(deltaTime)

    /**
     * Update game state based on the elapsed time in the animation engine
     *
     * @param {Number} deltaTime  Delta Time (since previous update) in seconds
     * @return {undefined}
     */
    PaceCar.prototype.update = function (deltaTime) {
      var dt = timeCop(deltaTime);
      this.owner.next(dt);
      // Update the instance position as well, to handle scrolling HUD messages
      if (this.scrollMessage) {
        if (this.scrollEnd < 0) {
          // Message has scrolled off of the canvas
          this.scrollMessage = false;
          this.position.x = this.context.canvas.width;
          this.scrollEnd = this.position.x;
          if (this.message.changestate) {
            this.message.changestate = false;
            this.owner.finiteState.changeOn = ENUMS.CHANGE.now;
          }
        } else {// !(this.scrollEnd < 0)
          this.position.x += this.message.speed * deltaTime;
        }// ./else !(this.scrollEnd < 0)
      }// ./if (this.scrollMessage)

      this.animateScoring(dt);
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

      /**
       * Helper function to place a piece of constant text based on a descriptor
       * block
       *
       * Invoked with 'this' referencing a CanvasRenderingContext2D object
       *
       * @param {Object} block  Properties define what and where to place the text
       * @param {Integer} yPos  The vertical position to place the text
       * @return {Integer}
       */
      function placeLabel(block, yPos) {
        /* jshint validthis: true */
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
       * Invoked with 'this' referencing a CanvasRenderingContext2D object
       *
       * @param {string|Integer} val value to be drawn as text
       * @param {Object} desc   Placement properties for val
       * @param {Object} startX Ending position for the preceding label
       * @param {Object} endX   Starting position the following label
       * @param {Integer} yPos  The vertical position to place the text
       * @return {undefined}
       */
      function placeValue(val, desc, startX, endX, yPos) {
        /* jshint validthis: true */
        var leftX, rightX, maxWidth, placeX;
        this.textAlign = desc.align;
        leftX = startX + desc.margin.left;
        rightX = endX - desc.margin.right;
        maxWidth = rightX - leftX;
        if (desc.align === 'right') {
          placeX = rightX;
        } else if (desc.align === 'center') {
          placeX = leftX + maxWidth / 2;
        } else {// 'left', or any unrecognized alignment
          placeX = leftX;
        }
        this.fillText(val, placeX, yPos, maxWidth);
      }// ./function placeValue(val, desc, prev, next, yPos)

      this.owner.preRender();

      ctx = this.context;
      ctx.save();

      hud = this.owner.APP_CONFIG.hud;

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

      tm = this.owner.currentSettings.levelTime -
        this.owner.elapsedTimes[ENUMS.STATE.running];
      tmStr = Number(tm).toFixed(1);
      //zfStr = (tm < 99.5) ? ('00' + tmStr).slice(-4) : tmStr;//leading zeros
      placeValue.call(ctx, tmStr, hud.values.time,
        hud.labels.time.left + segWidths.time,
        hud.labels.level.left, hud.headline.baseY
        );
      placeValue.call(ctx, this.owner.level, hud.values.level,
        hud.labels.level.left + segWidths.level,
        hud.labels.score.left, hud.headline.baseY
        );
      placeValue.call(ctx, this.animation.score.displayScore, hud.values.score,
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
            this.scrollEnd += this.message.gap + segWidths.scroll;
          }
        }
      } else {
        // No message is currently being scrolled, so show the 'static' data
        ctx.font = hud.statusline.valuesfont;
        placeValue.call(ctx, this.owner.lives, hud.values.lives,
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
     * expected to be modified after the initial create / load.
     *
     *  canvasStyle {string}  css styling to apply to created html canvas Element
     *  gridRows : {Integer}  base playing field grid height
     *  gridCols : {Integer}  base playing field grid width
     *  rowImages : {Array}   URLs of resources to build the base playing field:
     *                        Each image is repeated to fill the row; top row is
     *                        water, followed by three rows of stone, then 2
     *                        rows of grass.
     *  cellSize : {Object}   width 101 pixels; height 83 pixels
     *  tileSize : {Object}   all used tiles are 171 x 101 pixels, with at least
     *                        some transparent area at the top.
     *  Padding : {Object}    An extra 20 pixels is (to be) added to the bottom
     *                        of the canvas; all other padding is 0.
     *  ResourceTiles : {Array} All image resources to be preloaded.
     */
    this.GAME_BOARD = {
      "canvasStyle" : "border: 0px solid; background-color: aqua;",
      "gridRows" : 6,
      "gridCols" : 5,
      "rowImages" : [
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
        "images/char-boy.png",
        "images/char-cat-girl.png",
        "images/char-horn-girl.png",
        "images/char-pink-girl.png",
        "images/char-princess-girl.png",
        "images/Selector.png",
        "images/Gem Blue.png",
        "images/Gem Green.png",
        "images/Gem Orange.png",
        "images/Heart.png",
        "images/Key.png",
        "images/Rock.png",
        "images/Star.png",
        "images/water-block.png",
        "images/stone-block.png",
        "images/grass-block.png"
      ]
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
     *   tileIndex {Integer}  Icon index in GAME_BOARD.resourceTiles
     *   vertialOffset {Integer} Offset (pixels) to align to playing field grid
     *   maxSprites {Array}   Maximum number of enemy sprites that will be
     *                        needed simultaneously for each row.  This includes
     *                        The number that can be (partially) visible, plus
     *                        one off canvas (queued).  (Manually) calculated
     *                        from: (minimum number of distance values where the
     *                        sum > canvas width - one sprite width) +1
     *   topRow {Integer}     The first grid row (zero based) that enemies can
     *                        travel on.
     *   levels {Array}       One {Object} entry per game level
     *                    ??  need a way to continue past configured levels ??
     *     sizeFactor {Number} The collision size fraction of enemy tile size
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
     *
     * player {Object}        Configuration information for player avatar
     *   tileIndex            GAME_BOARD.resourceTiles index first avatar
     *   tileCount            Number of avatar icons available (after selector)
     *   start {Object}       Player settings for the start of game and level
     *     row {Integer}      The grid row to start from for each level
     *     col {Integer}      The grid column to start from for each level
     *     lives {Integer}    The number of lives at the start of the game
     * selector {Object}      Configuration information for avatar selection
     *   tileIndex            GAME_BOARD.resourceTiles index for highlight
     *   row {Integer}        The grid row to display selections on
     *
     * game {Object}
     *   levels {Array}       One {Object} entry per game level
     *                    ??  need a way to continue past configured levels ??
     *     length {Number}    The actual length of time (seconds) allowed to
     *                        complete the level (without dieing)
     *     sizeFactor {Number} The collision size fraction of avatar tile size
     *     rewards {Object}   Per level reward bonus settings
     *       {reward_property} {Object} Bonus information for 'doing' 'property'
     *         score {Integer} Add to current score
     *         time {Integer} Add to time remaining for current level
     *         lives {Integer} Add to number of lives remaining
     *         speed {Number} ?factor?time? to slow down enemies
     *         delta {Object} Adjustment amount for {scoreProperty values}
     *     goal {Array or Object} Conditions for reaching goal (avatar position)
     *       {each Object}    One possible goal condition
     *         row {Integer}  Being on specific playing grid row, AND
     *         cols {Array of Integer} Being on any specified grid column
     *     prizes {Array}     Information about which/when/where to show prizes
     *     delta {Object}     Values to adjust from previous level settings
     *       length {Number}  Change from previous level length
     * {reward_property} {Object}
     *   goal                 Finish the level before time runs out
     *   timeleft             Per second bonus for time remaining @level end
     *   {sprite_url}         Picking up a prize sprite
     * game.levels[].prizes[] {Object}
     *   condition {Object}
     *     when {Object}
     *       collected {Object} <<delta_time>> object; min time after collection
     *       expired {Object} <<delta_time>> object: min time after expired
     *       failed {Object}  <<delta_time>> object: min time after failed
     *       elapsed {Object} <<delta_time>> object: min elpased level time
     *       checked {Object} <<delta_time>> object: min time after previous check
     *     if {Object}        <<bool_check> object
     *   constraints {Object}
     *     tileIndex {Object} Single Integer, or Array of Integer
     *     minDistance {Object}
     *       total {Integer}
     *     row {Object} Single Integer, or Array of Integer
     *     col {Object} Single Integer, or Array of Integer
     *   time {Object}        <<delta_time>> object
     * <<delta_time>> {Object} ax + b; x = times shown, a,b = fix + dlta * random
     *   base {Number}        b.fixed
     *   additional {Number}  b.delta
     *   fixed {Number}       a.fixed
     *   delta {Number}       a.delta
     * <<bool_check> {Object} ax + b < limit; x = times shown,
     *                        a = fixed + delta * random()
     *   fixed {Number}       a.fixed
     *   delta {Number}       a.delta
     *   weight {Number}      b = weight * random()
     *   limit {Number}
     *
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
     *         changestate {boolean} Advance to pending game state at end of
     *                        message (never when repeat)
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
     *   animation {Object}   Configuration for animations on the hud
     *     score {object}     Parameters to control the speed of score changes
     *      coasting {Number} Remaining time (@current speed) when accel stops
     *      acceleration {Number} How fast (* delta time) to increase speed
     *      turnover {Number} Remaining time (@coasting speed) to start decel
     *      landing {Number}  Deceleration time for getting to zero velocity
     */
    this.APP_CONFIG = {
      "enemy" : {
        "tileIndex" : 0,
        "verticalOffset" : -20,
        "maxSprites" : [5, 4, 4],
        "topRow" : 1,
        "levels" : [
          {
            "levelstart" : 1,
            "sizeFactor" : 1.0,
            "baseSpeed" : 1,
            "fillSpeed" : 5,
            "rows" : [
              [ { "speed" :   80, "distances" : [ 1,    6,    6        ] } ],
              [ { "startDistance" : 1,
                  "speed" :  -50, "distances" : [-3.5, -3.5, -3.5, -7  ] } ],
              [ { "speed" :   50, "distances" : [ 3.5                  ] } ]
            ]
          },
          {
            "levelstart" : 2,
            "rows" : [
              [ { "speed" :   80, "distances" : [ 1,    6              ] } ],
              [ { "speed" :  -40, "distances" : [-2.8, -2.8, -2.8, -5.6] } ],
              [ { "speed" :   40, "distances" : [ 2.8,  2.8,  2.8,  5.6] } ]
            ]
          },
          {
            "levelstart" : 3,
            "rows" : [
              [ { "speed" :   70, "distances" : [ 1.4,  5              ] } ],
              [ { "speed" :  -55, "distances" : [-2.8, -2.8, -2.8, -3.4] } ],
              [ { "speed" :   45, "distances" : [ 3.1                  ] } ]
            ]
          },
          {
            "levelstart" : 4,
            "rows" : [
              [ { "speed" :   70, "distances" : [ 1.4,  4              ] } ],
              [ { "startDistance" : 0.7,
                  "speed" :  -55, "distances" : [-2.8, -2.8, -2.8, -3.4] } ],
              [ { "speed" :   45, "distances" : [ 3.1                  ] } ]
            ]
          },
          {
            "levelstart" : 5,
            "rows" : [
              [ { "speed" :   75, "distances" : [ 1,    4,    1,    3  ] } ],
              [ { "speed" :  -55, "distances" : [-3.5, -3.5, -3.5, -2.5] } ],
              [ { "speed" :   50, "distances" : [ 2.5,  3.5,  3.5,  3.5] } ]
            ]
          },
          {
            "levelstart" : 6,
            "rows" : [
              [ { "speed" :   80, "distances" : [ 1,    4              ] } ],
              [ { "speed" :  -50, "distances" : [-3,   -3,   -2,   -4  ] } ],
              [ { "speed" :   50, "distances" : [ 3,    4,    2,    3  ] } ]
            ]
          },
          {
            "levelstart" : 7,
            "rows" : [
              [ { "speed" :   80, "distances" : [ 1.2,  4.2            ] } ],
              [ { "speed" :  -55, "distances" : [-3.2, -2.8, -2.2, -3.8] } ],
              [ { "speed" :   45, "distances" : [ 3,    4,    2,    3  ] } ]
            ]
          },
          {
            "levelstart" : 8,
            "rows" : [
              [ { "speed" :   80, "distances" : [ 1.4,  4.4            ] } ],
              [ { "speed" :  -55, "distances" : [-3.2, -2.9, -2.1, -3.8] } ],
              [ { "speed" :   45, "distances" : [ 3,    3,    2,    3  ] } ]
            ]
          },
          {
            "levelstart" : 9,
            "rows" : [
              [ { "speed" :   85, "distances" : [ 1.4,  4.4            ] } ],
              [ { "startDistance" : -1.7,
                  "speed" :  -55, "distances" : [-3.2, -2.9, -2.1, -3.8] } ],
              [ { "speed" :   50, "distances" : [ 3,    3,    2,    3  ] } ]
            ]
          },
          {
            "levelstart" : 10,
            "rows" : [
              [ { "speed" :   90, "distances" : [ 1.4,  4.4            ] } ],
              [ { "speed" :  -60, "distances" : [-3.2, -2.9, -2.1, -3.8] } ],
              [ { "speed" :   50, "distances" : [ 3.5,  3,    1.5,  3  ] } ]
            ]
          },
          {
            "levelstart" : 11,
            "rows" : [
              [ { "speed" : -105, "distances" : [-1,   -6,   -6        ] } ],
              [ { "startDistance" : 1,
                  "speed" :   60, "distances" : [ 3.5,  3.5,  3.5,  7  ] } ],
              [ { "speed" :  -60, "distances" : [-3.5                  ] } ]
            ]
          },
          {
            "levelstart" : 12,
            "rows" : [
              [ { "speed" : -105, "distances" : [-1,   -6              ] } ],
              [ { "speed" :   50, "distances" : [ 2.8,  2.8,  2.8,  5.6] } ],
              [ { "speed" :  -50, "distances" : [-2.8, -2.8, -2.8, -5.6] } ]
            ]
          },
          {
            "levelstart" : 13,
            "rows" : [
              [ { "speed" :  -95, "distances" : [-1.4, -5              ] } ],
              [ { "speed" :   65, "distances" : [ 2.8,  2.8,  2.8,  3.4] } ],
              [ { "speed" :  -55, "distances" : [-3.1                  ] } ]
            ]
          },
          {
            "levelstart" : 14,
            "rows" : [
              [ { "speed" :  -95, "distances" : [-1.4, -4              ] } ],
              [ { "startDistance" : 0.7,
                  "speed" :   65, "distances" : [ 2.8,  2.8,  2.8,  3.4] } ],
              [ { "speed" :  -55, "distances" : [-3.1                  ] } ]
            ]
          },
          {
            "levelstart" : 15,
            "rows" : [
              [ { "speed" : -100, "distances" : [-1,   -4,   -1,   -3  ] } ],
              [ { "speed" :   65, "distances" : [ 3.5,  3.5,  3.5,  2.5] } ],
              [ { "speed" :  -60, "distances" : [-2.5, -3.5, -3.5, -3.5] } ]
            ]
          },
          {
            "levelstart" : 16,
            "rows" : [
              [ { "speed" : -105, "distances" : [-1,   -4              ] } ],
              [ { "speed" :   60, "distances" : [ 3,    3,    2,    4  ] } ],
              [ { "speed" :  -60, "distances" : [-3,   -4,   -2,   -3  ] } ]
            ]
          },
          {
            "levelstart" : 17,
            "rows" : [
              [ { "speed" : -105, "distances" : [-1.2, -4.2            ] } ],
              [ { "speed" :   65, "distances" : [ 3.2,  2.8,  2.2,  3.8] } ],
              [ { "speed" :  -55, "distances" : [-3,   -4,   -2,   -3  ] } ]
            ]
          },
          {
            "levelstart" : 18,
            "rows" : [
              [ { "speed" : -105, "distances" : [-1.4, -4.4            ] } ],
              [ { "speed" :   65, "distances" : [ 3.2,  2.9,  2.1,  3.8] } ],
              [ { "speed" :  -55, "distances" : [-3,   -3,   -2,   -3  ] } ]
            ]
          },
          {
            "levelstart" : 19,
            "rows" : [
              [ { "speed" : -110, "distances" : [-1.4, -4.4            ] } ],
              [ { "startDistance" : -1.7,
                  "speed" :   65, "distances" : [ 3.2,  2.9,  2.1,  3.8] } ],
              [ { "speed" :  -60, "distances" : [-3,   -3,   -2,   -3  ] } ]
            ]
          },
          {
            "levelstart" : 20,
            "rows" : [
              [ { "speed" : -115, "distances" : [-1.4, -4.4            ] } ],
              [ { "speed" :   70, "distances" : [ 3.2,  2.9,  2.1,  3.8] } ],
              [ { "speed" :  -60, "distances" : [-3.5, -3,   -1.5, -3  ] } ]
            ]
          },
          {
            "levelstart" : 21,
            "rows" : [
              [ { "speed" :  120, "distances" : [ 1,    6,    6        ] } ],
              [ { "startDistance" : 1,
                  "speed" :  -70, "distances" : [-3.5, -3.5, -3.5, -7  ] } ],
              [ { "speed" :   70, "distances" : [ 3.5                  ] } ]
            ]
          },
          {
            "levelstart" : 22,
            "rows" : [
              [ { "speed" :  110, "distances" : [ 1,    6              ] } ],
              [ { "speed" :  -60, "distances" : [-2.8, -2.8, -2.8, -5.6] } ],
              [ { "speed" :   60, "distances" : [ 2.8,  2.8,  2.8,  5.6] } ]
            ]
          },
          {
            "levelstart" : 23,
            "rows" : [
              [ { "speed" :  110, "distances" : [ 1.4,  5              ] } ],
              [ { "speed" :  -75, "distances" : [-2.8, -2.8, -2.8, -3.4] } ],
              [ { "speed" :   65, "distances" : [ 3.1                  ] } ]
            ]
          },
          {
            "levelstart" : 24,
            "rows" : [
              [ { "speed" :  110, "distances" : [ 1.4,  4              ] } ],
              [ { "startDistance" : 0.7,
                  "speed" :  -75, "distances" : [-2.8, -2.8, -2.8, -3.4] } ],
              [ { "speed" :   65, "distances" : [ 3.1                  ] } ]
            ]
          },
          {
            "levelstart" : 25,
            "rows" : [
              [ { "speed" :  115, "distances" : [ 1,    4,    1,    3  ] } ],
              [ { "speed" :  -75, "distances" : [-3.5, -3.5, -3.5, -2.5] } ],
              [ { "speed" :   70, "distances" : [ 2.5,  3.5,  3.5,  3.5] } ]
            ]
          },
          {
            "levelstart" : 26,
            "rows" : [
              [ { "speed" :  120, "distances" : [ 1,    4              ] } ],
              [ { "speed" :  -70, "distances" : [-3,   -3,   -2,   -4  ] } ],
              [ { "speed" :   70, "distances" : [ 3,    4,    2,    3  ] } ]
            ]
          },
          {
            "levelstart" : 27,
            "rows" : [
              [ { "speed" :  120, "distances" : [ 1.2,  4.2            ] } ],
              [ { "speed" :  -75, "distances" : [-3.2, -2.8, -2.2, -3.8] } ],
              [ { "speed" :   65, "distances" : [ 3,    4,    2,    3  ] } ]
            ]
          },
          {
            "levelstart" : 28,
            "rows" : [
              [ { "speed" :  120, "distances" : [ 1.4,  4.4            ] } ],
              [ { "speed" :  -75, "distances" : [-3.2, -2.9, -2.1, -3.8] } ],
              [ { "speed" :   65, "distances" : [ 3,    3,    2,    3  ] } ]
            ]
          },
          {
            "levelstart" : 29,
            "rows" : [
              [ { "speed" :  125, "distances" : [ 1.4,  4.4            ] } ],
              [ { "startDistance" : -1.7,
                  "speed" :  -75, "distances" : [-3.2, -2.9, -2.1, -3.8] } ],
              [ { "speed" :   70, "distances" : [ 3,    3,    2,    3  ] } ]
            ]
          },
          {
            "levelstart" : 30,
            "rows" : [
              [ { "speed" :  130, "distances" : [ 1.4,  4.4            ] } ],
              [ { "speed" :  -80, "distances" : [-3.2, -2.9, -2.1, -3.8] } ],
              [ { "speed" :   70, "distances" : [ 3.5,  3,    1.5,  3  ] } ]
            ]
          },
          {
            "levelstart" : 31,
            "rows" : [
              [ { "speed" :   75, "distances" : [ 1.4,  3.8,  3.2      ] } ],
              [ { "speed" : -120, "distances" : [-3.2, -2.9, -2.1, -3.8] } ],
              [ { "speed" :   60, "distances" : [ 2.5,  3.4,  1.3,  3  ] } ]
            ]
          },
          {
            "levelstart" : 99,
            "rows" : [
              [ { "speed" :  150, "distances" : [ 1.8,  5,    1.2,  4  ] } ],
              [ { "speed" :  -75, "distances" : [-3.5, -3.5, -3.5, -5  ] } ],
              [ { "speed" :   65, "distances" : [ 3.2,  3.2,  2.3      ] } ]
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
          "seconds" : { "writable": true, "configurable": true, "value": 9999 }
        }
      },
      "player" : {
        "tileIndex" : 1,
        "avatarCount" : 5,
        "selector" : {
          "tileIndex" : 6,
          "row" : 4
        },
        "start" : {
          "row" : 5,
          "col" : 2,
          "lives" : 5
        },
        "verticalOffset" : -30,
        "horizontalOffset" : 0
      },
      "prizes" : {
        "tileIndex" : 7,
        "prizeCount" : 7,
        "verticalOffset" : -20,
        "horizontalOffset" : 0
      },
      "game" : {
        "levels" : [
          {
            "levelstart" : 1,
            "length" : 60,
            "sizeFactor" : 0.5,
            "rewards" : {
              "goal" :                              { "score" : 100   },
              "timeleft" :                          { "score" :   4   },
              "images/Gem Blue.png" :               { "score" :  20   },
              "images/Gem Green.png" :              { "score" :  40   },
              "images/Gem Orange.png" :             { "score" :  60   },
              "images/Key.png" :                    { "score" :  80   },
              "images/Heart.png" :                  { "lives" :   1   },
              "images/Rock.png" :                   { "speed" :   0.5 },
              "images/Star.png" :                   { "time" :   10   }
            },
            "goal" : [
              {
                "row" : 0,
                "cols" : [0, 1, 2, 3, 4]
              }
            ],
            "prizes" : [
              {
                "desc" : "Blue; goal; < on shown; fail penalty",
                "condition" : {
                  "when" : {
                    "collected" :       { "base" : 3, "fixed" : 1 },
                    "expired" :         { "base" : 4 },
                    "failed" :          { "base" : 3, "fixed" : 0.5,
                                          "delta" : 0.5 },
                    "elapsed" :         { "base" : 8 }
                  },
                  "if" :                { "limit" : 0.2 }
                },
                "constraints" : {
                  "tileIndex" : 0,
                  "row" : 0,
                  "col" : [1, 1, 1, 1, 1]
                },
                "time" :                { "base" : 7 }
              }
            ]
          },
          {
            "levelstart" : 2,
            "sizeFactor" : 0.6,
            "rewards" : {
              "goal" :                  { "delta" : { "score" :   5   } }
            }
          },
          {
            "levelstart" : 3,
            "rewards" : {
              "goal" :                  { "delta" : { "score" :   5   } }
            },
            "prizes" : [
              {
                "desc" : "Green; grass;",
                "condition" : {
                  "when" : {
                    "collected" :       { "base" : 1, "fixed" : 1 },
                    "expired" :         { "fixed" : 2 },
                    "elapsed" :         { "base" : 5 },
                    "checked" :         { "base" : 5 }
                  },
                  "if" :                { "limit" : 0.2 }
                },
                "constraints" : {
                  "tileIndex" : 1,
                  "row" : [0, 0, 0, 0, 1, 1],
                  "col" : [1, 1, 1, 1, 1]
                },
                "time" :                { "base" : 4 }
              },
              {
                "desc" : "Blue; goal; < on shown; fail penalty",
                "condition" : {
                  "when" : {
                    "collected" :       { "base" : 3, "fixed" : 1 },
                    "expired" :         { "base" : 4 },
                    "failed" :          { "base" : 3, "fixed" : 0.5,
                                          "delta" : 0.5 },
                    "elapsed" :         { "base" : 8 }
                  },
                  "if" :                { "limit" : 0.2 }
                },
                "constraints" : {
                  "tileIndex" : 0,
                  "row" : 0,
                  "col" : [1, 1, 1, 1, 1]
                },
                "time" :                { "base" : 7 }
              }
            ]
          },
          {
            "levelstart" : 4
          },
          {
            "levelstart" : 5,
            "rewards" : {
              "goal" :                  { "delta" : { "time" :   1   } }
            },
            "prizes" : [
              {
                "desc" : "Orange; traffic lanes; prefer edges",
                "condition" : {
                  "when" : {
                    "collected" :       { "base" : 2, "fixed" : 0.6 },
                    "failed" :          { "base" : 5, "fixed" : -0.5 },
                    "elapsed" :         { "base" : 12 },
                    "checked" :         { "base" : 5, "additional": 1.5 }
                  },
                  "if" :                { "limit" : 0.15 }
                },
                "constraints" : {
                  "tileIndex" : 2,
                  "row" : [0, 1, 1, 1, 0, 0],
                  "col" : [1.5, 1, 1, 1, 1.5]
                },
                "time" :                { "base" : 8 }
              },
              {
                "desc" : "Green; grass;",
                "condition" : {
                  "when" : {
                    "collected" :       { "base" : 1, "fixed" : 1 },
                    "expired" :         { "fixed" : 2 },
                    "elapsed" :         { "base" : 5 },
                    "checked" :         { "base" : 5 }
                  },
                  "if" :                { "limit" : 0.15 }
                },
                "constraints" : {
                  "tileIndex" : 1,
                  "row" : [0, 0, 0, 0, 1, 1],
                  "col" : [1, 1, 1, 1, 1]
                },
                "time" :                { "base" : 4 }
              },
              {
                "desc" : "Blue; goal; < on shown; fail penalty",
                "condition" : {
                  "when" : {
                    "collected" :       { "base" : 3, "fixed" : 1 },
                    "expired" :         { "base" : 4 },
                    "failed" :          { "base" : 3, "fixed" : 0.5,
                                          "delta" : 0.5 },
                    "elapsed" :         { "base" : 8 }
                  },
                  "if" :                { "limit" : 0.15 }
                },
                "constraints" : {
                  "tileIndex" : 0,
                  "row" : 0,
                  "col" : [1, 1, 1, 1, 1]
                },
                "time" :                { "base" : 7 }
              }
            ]
          },
          {
            "levelstart" : 6,
            "rewards" : {
              "timeleft" :              { "delta" : { "score" :   1   } }
            }
          },
          {
            "levelstart" : 7,
            "prizes" : [
              {
                "desc" : "Blue+Green+Key; traffic lanes; prefer edges",
                "condition" : {
                  "when" : {
                    "collected" :       { "base" : 2, "fixed" : 0.6 },
                    "failed" :          { "base" : 5, "fixed" : -0.5 },
                    "elapsed" :         { "base" : 12 },
                    "checked" :         { "base" : 5, "additional": 1.5 }
                  },
                  "if" :                { "limit" : 0.2 }
                },
                "constraints" : {
                  "tileIndex" : [3, 2, 0, 1],
                  "row" : [0, 1, 1, 1, 0, 0],
                  "col" : [1.5, 1, 1, 1, 1.5]
                },
                "time" :                { "base" : 8 }
              },
              {
                "desc" : "Orange; goal; < on shown; fail penalty",
                "condition" : {
                  "when" : {
                    "collected" :       { "base" : 3, "fixed" : 1 },
                    "expired" :         { "base" : 4 },
                    "failed" :          { "base" : 3, "fixed" : 0.5,
                                          "delta" : 0.5 },
                    "elapsed" :         { "base" : 8 }
                  },
                  "if" :                { "limit" : 0.2 }
                },
                "constraints" : {
                  "tileIndex" : 2,
                  "row" : 0,
                  "col" : [1, 1, 1, 1, 1]
                },
                "time" :                { "base" : 7 }
              }
            ],
            "rewards" : {
              "score" :                 { "delta" : { "score" :   5   } }
            }
          },
          {
            "levelstart" : 8,
            "rewards" : {
              "images/Gem Blue.png" :   { "delta" : { "score" :   5   } }
            }
          },
          {
            "levelstart" : 9,
            "rewards" : {
              "images/Gem Green.png" :  { "delta" : { "score" :   5   } }
            }
          },
          {
            "levelstart" : 10,
            "prizes" : [
              {
                "desc" : "Blue+Green+Key+Heart; traffic lanes; prefer edges",
                "condition" : {
                  "when" : {
                    "collected" :       { "base" : 2, "fixed" : 0.6 },
                    "failed" :          { "base" : 5, "fixed" : -0.5 },
                    "elapsed" :         { "base" : 12 },
                    "checked" :         { "base" : 5, "additional": 1.5 }
                  },
                  "if" :                { "limit" : 0.25 }
                },
                "constraints" : {
                  "tileIndex" : [3, 2, 0, 1, 1],
                  "row" : [0, 1, 1, 1, 0, 0],
                  "col" : [1.5, 1, 1, 1, 1.5]
                },
                "time" :                { "base" : 8 }
              },
              {
                "desc" : "Orange; goal; < on shown; fail penalty",
                "condition" : {
                  "when" : {
                    "collected" :       { "base" : 3, "fixed" : 1 },
                    "expired" :         { "base" : 4 },
                    "failed" :          { "base" : 3, "fixed" : 0.5,
                                          "delta" : 0.5 },
                    "elapsed" :         { "base" : 8 }
                  },
                  "if" :                { "limit" : 0.15 }
                },
                "constraints" : {
                  "tileIndex" : 2,
                  "row" : 0,
                  "col" : [1, 1, 1, 1, 1]
                },
                "time" :                { "base" : 7 }
              }
            ]
          },
          {
            "levelstart" : 11,
            "rewards" : {
              "images/Gem Orange.png" :  { "delta" : { "score" :   5   } }
            }
          },
          {
            "levelstart" : 12,
            "rewards" : {
              "images/Key.png" :        { "delta" : { "score" :   5   } }
            }
          },
          {
            "levelstart" : 13,
            "prizes" : [
              {
                "desc" : "multiple; goal; < on shown; fail penalty",
                "condition" : {
                  "when" : {
                    "collected" : {
                      "desc" : "2..5 + (1..3 * times shown) after any collect",
                      "base" : 2,
                      "additional" : 3,
                      "fixed" : 1,
                      "delta" : 2
                    },
                    "expired" : {
                      "desc" : "1..6 + (1..3 * times shown) after any expire",
                      "base" : 1,
                      "additional" : 5,
                      "fixed" : 1,
                      "delta" : 2
                    },
                    "failed" : {
                      "desc" : "3..6 after if bool check failed",
                      "base" : 3,
                      "additional" : 3
                    },
                    "elapsed" :         { "base" : 15 },
                    "checked" :         { "base" : 5 }
                  },
                  "if" :                { "limit" : 0.1, "fixed" : 0.02 }
                },
                "constraints" : {
                  "desc" : "not time or speed; goal; prefer edge columns",
                  "tileIndex" : [15, 10, 5, 3, 1, 0, 0],
                  "row" : 0,
                  "col" : [2, 1, 1, 1, 2]
                },
                "time" : {
                  "desc" : "show for 10 seconds first time, reduce for repeats",
                  "base" : 10,
                  "fixed" : -1,
                  "delta" : -2
                }
              },
              {
                "desc" : "all (not speed); enemies",
                "condition" : {
                  "when" : {
                    "checked" : {
                      "desc" : "3..5 after previous checked limit",
                      "base" : 3,
                      "additional" : 2
                    },
                    "elapsed" : {
                      "desc" : "none allowed for first 15 seconds of level",
                      "base" : 15
                    },
                    "expired" : {
                      "desc" : "no check for 3 seconds after shown prize expires",
                      "base" : 3
                    }
                  },
                  "if" : {
                    "desc" : "10% chance until shown, 2% less after shown",
                    "fixed" : -0.02,
                    "limit" : 0.1
                  }
                },
                "constraints" : {
                  "desc" : "any but speed; enemy rows; prefer edge cols",
                  "tileIndex" : [50, 40, 20, 10, 1, 0, 5],
                  "row" : [0, 1, 1, 1, 0, 0],
                  "col" : [1.5, 1, 1, 1, 1.5]
                },
                "time" :                { "base" : 5 }
              }
            ]
          }
        ]
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
            },
            "levelComplete" : {
              "text" : "Level {1} Complete with {2} seconds left",
              "speed" : -150,
              "style" : "green",
              "repeat" : false,
              "changestate" : true
            },
            "died" : {
              "text" : "Avatar died {1}",
              "speed" : -120,
              "style" : "red",
              "repeat" : false,
              "changestate" : true
            },
            "gameover" : {
              "text" : "Game over",
              "speed" : -90,
              "style" : "red",
              "repeat" : false,
              "changestate" : true
            },
            "selectAvatar" : {
              "text" : "Select Avatar using arrow keys, SPACE to accept",
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
            "left" : 185,
            "maxWidth" : 70
          },
          "score" : {
            "text" : "Score:",
            "left" : 310,
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
              "right" : 10
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
        },
        "animation" : {
          "score" : {
            "acceleration" : 30,
            "coasting" : 1.6,
            "turnover" : 1.2,
            "landing" : 1.5
          }
        }
      }
    };// ./APP_CONFIG = {}
    this.private.dataTemplates = {
      "enemy" : {
        "levels" : [
          {
            "levelstart" : 999,// Only for developer tagging while editing
            "sizeFactor" : 1.0,// Sprite size for collisions (times cell width)
            "baseSpeed" : 1,
            "fillSpeed" : 5,// Time speedup factor while filling canvas
            "rows" : [// one entry (another array) per enemy row
              // Currently only using/allowing a single pattern per row+level
              // so each (inner) array contains only a single configuration obj
              [ { "speed" :   40, "distances" : [ 2.8,  2.8,  2.8,  5.6] } ]
            ]
          },
          "more levels"
        ]
      },
      "game" : {
        "levels" : [
          {
            "levelstart" : 999,// Only for developer tagging while editing
            "length" : 60,// Level length (seconds); only needed for first level
            "sizeFactor" : 0.5,// Sprite size for collisions (times cell width)
            "rewards" : {
              "goal" :                              { "score" : 100   },
              "timeleft" :                          { "score" :   4   },
              "images/Gem Blue.png" :               { "score" :  20   },
              "images/Gem Green.png" :              { "score" :  40   },
              "images/Gem Orange.png" :             { "score" :  60   },
              "images/Key.png" :                    { "score" :  80   },
              "images/Heart.png" :                  { "lives" :   1   },
              "images/Rock.png" :                   { "speed" :   0.5 },
              "images/Star.png" :                   { "time" :   10   },
              "any rewards property" : {
                "score" : 1,// points value
                "lives" : 1,// number of lives to add
                "time" : 1,// seconds to add to the current level
                "speed" : 0.5,// factor to slow enemy sprites by (not implement)
                "delta" : {
                  "score" : 1,// change to current points value
                  "lives" : 1,// change to current number of lives to add
                  "time" : 1,// change to current seconds to add to the level
                  "speed" : 0.5,// change to current speed
                  "more" : "more delta keys"
                },
                "more" : "more rewards"
              }
            },
            "prizes" : [// prizes that might be collected for the current level
              "prize configuration object",
              {
                "prizestart" : "description",// Only for developer editing tagging
                "condition" : {
                  "when" : {
                    "collected" :       "delta time configuration object",
                    "expired" :         "delta time configuration object",
                    "failed" :          "delta time configuration object",
                    "elapsed" :         "delta time configuration object",
                    "checked" :         "delta time configuration object",
                    "more" : "when properties"
                  },
                  "if" :                "boolean configuration object",
                  "more" : "condition properties"
                },
                "constraints" : {
                  "tileIndex" : "index selection object",
                  "row" : "index selection object",
                  "col" : "index selection object",
                  "minDistance" : {// Minimum separation from avatar
                    "total" : 1,
                    "horizontal" : 0,
                    "vertical" : 0,
                    "more" : "minDistance properties"
                  },
                  "more" : "constraints properties"
                },
                "time" :                "delta time configuration object",
                "more" : "prize configuration properties"
              },
              "more prize description objects"
            ],
            "more" : "level property objects"
          },
          "more levels"
        ]
      },
      "more" : "template sections",
      "index selection object" : {
        "property0" : 0,// actual index number
        "property1" : [],// array of numeric weights:
          // chance index = n is weight[n]/sum weights
          // array needs index 0, plus entries to max index care about
        "property2" : "any and only one of above"
      },
      "samples" : {
        "game" : {
          "levels" : {
            "rewards" : {
              "goal" :                  { "delta" : { "score" :   5   } },
              "timeleft" :              { "delta" : { "score" :   1   } },
              "images/Gem Blue.png" :   { "delta" : { "score" :   5   } },
              "images/Gem Green.png" :  { "delta" : { "score" :   5   } },
              "images/Gem Orange.png" : { "delta" : { "score" :   5   } },
              "images/Key.png" :        { "delta" : { "score" :   5   } },
              "images/Heart.png" :      { "delta" : { "lives" :   1   } },
              "images/Rock.png" :       { "delta" : { "speed" :   0.1 } },
              "images/Star.png" :       { "delta" : { "time"  :   2   } }
            }
          }
        }
      },
      "delta time configuration object" : {
        "base" : 0,
        "additional" : 0,
        "fixed" : 0,
        "delta" : 0,
        "result" :
          "(fixed + delta * rnd()) * previous + base + additional * rnd()"
      },
      "boolean configuration object" : {
        "weight" : 1,
        "fixed" : 0,
        "delta" : 0,
        "limit" : 0.5,
        "result" : "(fixed + delta * rnd()) * previous + weight * rnd() < limit"
      },
      "more2" : "object template descriptions"
    };


    // Create read-only 'level' calculated property
    Object.defineProperty(this, "level", {
      get : getLevel
    });// get level() { return this.lvlIndex + 1; }

    // Automatically update dependant properties on state changes
    Object.defineProperty(this, "state", {
      set : setState,
      get : getState
    });

    this.finiteState = {};
    this.finiteState.selectPending = false;
    this.limits = {};
    this.elapsedTimes = {};
    this.prizes = [];
    this.pendingPrize = {
      "isShowing" : false,
      "prize" : 0
    };
    // No prize reward to be shown on canvas (yet), current implementation only
    // uses a single Prize sprite, so prize (index) always zero.

    this.currentSettings = {
      "player" : {},
      "enemy" : {}
    };
    // Make the inner class PaceCar constructor available through the instance
    this.TrackerBuilder = PaceCar;

    // Start things off when the engine has the graphical environment ready
    document.addEventListener('engineReady', function (e) {
      app.start(e.detail.context);
    });
  }// ./function Frogger()

  /**
   * Get the index for the last (trailing) enemy sprite in a row
   *
   * NOTE: In some situations, the calculated index will be for a sprite that
   * has already moved off of the visible canvas, and is ready to be recycled.
   *
   * @param {Integer} row       The row (index) number to locate the sprite in
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
   * @param {Integer} row       The row (index) number to locate the sprite in
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
   * @param {Integer} row       The row (index) number the distances are for
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
   * @param {Integer} row       The row (index) number to the sprite is on
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
   * @param {Object} request    The request to be processed
   * @return {undefined}
   */
  Frogger.prototype.handleCommand = function (request) {
    switch (request.command) {
    case 'space':
      if (this.finiteState.changeOn === ENUMS.CHANGE.delayed) {
        if (this.elapsedTimes[this.state] >= this.currentSettings.fillTime) {
          // Enough time already passed: convert to triggered change
          this.finiteState.changeOn = ENUMS.CHANGE.trigger;
        } else {
          // Speedup time until get to the minimum trigger time
          this.elapsedTimes.timeSpeed = this.currentSettings.fillSpeed;
        }
      }

      if (this.finiteState.changeOn === ENUMS.CHANGE.trigger) {
        this.finiteState.changeOn = ENUMS.CHANGE.now;
        this.tracker.scrollMessage = false;// Don't care if [not] scrolling
      }
      break;
    case 'numplus':// DEBUG; cheat code
      if (this.state === ENUMS.STATE.running) {
        this.lvlIndex += 1;
        this.lives += 1;
        this.reason = 'and resurrected jumping levels';
        this.state = ENUMS.STATE.dieing;
      }
      break;
    case 'numtimes':// DEBUG; cheat code
      this.lives += 1;
      break;
    }
  };// ./function Frogger.prototype.handleCommand(request)

  /**
   * Build the initial level pattern configuration for each enemy row
   *
   * See this.APP_CONFIG.enemy.reset for entry property descriptions.
   *
   * @return {undefined}
   */
  Frogger.prototype.clearEnemyPatterns = function () {
    var row, sprite;

    delete this.currentPatterns;
    this.currentPatterns = [];
    // Potentially, different levels could have different numbers of rows active?
    // All possible active rows (and sprites) always exists: set pattern for any
    // inactive rows to keep speed zero and off screen.
    for (row = 0; row < this.APP_CONFIG.enemy.maxSprites.length; row += 1) {
      // Fill in an initial dummy pattern that will be immediately updated with
      // the first actual pattern from lvlConfig.rows
      // NOTE: Could instead simplify enemy.reset, and use deepCopyOf(enemy.reset)
      this.currentPatterns.push(Object.create(null, this.APP_CONFIG.enemy.reset));
      // Get all sprites stopped and positioned so that the first update will
      // start the first pattern for the level
      for (sprite = 0; sprite < this.APP_CONFIG.enemy.maxSprites[row];
          sprite += 1
          ) {
        this.enemySprites[row][sprite].speed = 0;
        this.enemySprites[row][sprite].position.x = this.limits.offLeftX;
      }// ./for (each sprite in enemy row)
      // Move the first sprite for each row to just after the canvas
      // NOTE: speed is always zero here, so no difference for negative speed
      this.enemySprites[row][0].position.x = this.limits.offRightX;
    }// ./for (row = 0; row < this.APP_CONFIG.enemy.maxSprites.length; row += 1)

  };// /.function Frogger.prototype.clearEnemyPatterns()

  /**
   * Determine a time (offset) value from a configuration object
   *
   * obj = { base : 0, additional : 0, fixed : 0, delta : 0 }
   * result = (fixed + delta * rnd()) * previous + base + additional * rnd()
   *
   * @param {Object} obj        Object with time configuration properties
   * @param {Integer} previous  number of times the prize has already been shown
   * @return {Number}           Seconds
   */
  Frogger.prototype.parseTimeConfig = function (obj, previous) {
    if (obj === undefined) {
      // No configuration object ==> no offset
      return 0;
    }
    // y = ax + b; a and b can each have random component: = fixed + delta * r
    return ((obj.fixed || 0) + (obj.delta || 0) * Math.random()) * previous +
      (obj.base || 0) + (obj.additional || 0) * Math.random();
  };// ./function Frogger.prototype.parseTimeConfig(obj, previous)

  /**
   * Determine a boolean value from a configuration object
   *
   * obj = { weight : 1, fixed : 0, delta : 0, limit : 0.5 }
   * result = (fixed + delta * rnd()) * previous + weight * rnd() < limit"
   *
   * @param {Object} obj        Object with test configuration properties
   * @param {Integer} previous  number of times the prize has already been shown
   * @return {boolean}
   */
  Frogger.prototype.parseBoolConfig = function (obj, previous) {
    if (obj === undefined) {
      // No configuration object ==> always
      return true;
    }
    return ((obj.fixed || 0) + (obj.delta || 0) * Math.random()) * previous +
      (obj.weight === undefined ? 1 : obj.weight) * Math.random() <
      (obj.limit === undefined ? 0.5 : obj.limit);
  };// ./function Frogger.prototype.parseBoolConfig(obj, previous)

  /**
   * Prep the prize rule information
   *
   * @return {undefined}
   */
  Frogger.prototype.resetPrizeWaits = function () {
    var rule, rules;
    rules = this.currentSettings.prizes;

    for (rule = 0; rule < rules.length; rule += 1) {
      rules[rule].timesShown = 0;// The prize has never been displayed
      if (rules[rule].condition && rules[rule].condition.when) {
        rules[rule].condition.when.failureTime = undefined;
        rules[rule].condition.when.checkTime = undefined;
      }
    }// ./for (rule = 0; rule < rules.length; rule += 1)

    this.pendingPrize.collectionTime = null;
    this.pendingPrize.expirationTime = null;

  };// ./function Frogger.prototype.resetPrizeWaits()

  /**
   * Get an index number from a configuration object
   *
   * @param {Object} obj        Integer index value, or Array of index weights
   * @return {Integer}
   */
  Frogger.prototype.pickIndex = function (obj) {
    var idx, runningWeight, selectPoint;
    if (typeof obj === 'number') {
      return obj;
    }

    runningWeight = arraySum.call(obj);
    // if (runningWeight <= 0) {
    //   throw new Error('total index selection weight is zero');
    //   //return -1;
    // }

    selectPoint = Math.random() * runningWeight;
    runningWeight = 0;
    for (idx = 0; idx < obj.length; idx += 1) {
      runningWeight += obj[idx];
      if (selectPoint < runningWeight) { return idx; }
    }

    return obj.length - 1;
  };// ./function Frogger.prototype.pickIndex(obj)

  /**
   * Determine how long to wait before queueing another prize for a rule
   *
   * Each (used) property of the rule parameter is used to limit how soon the
   * next instance of the prize could be check to see if it will be shown.
   *   collected    Minimum time since any prize was collected
   *   expired      Minimum time since any shown prize expired
   *   failed       Minimum time since current rule failed to show prize
   *   checked      Minimum time since last check for the current rule
   *   elasped      Minimum elapsed (running) time for the current level
   *
   * @param {Object} rule       properties are delta time rule objects
   * @param {Integer} previous  number of times the prize has already been shown
   * @return {Number}
   */
  Frogger.prototype.prizeWaitTime = function (rule, previous) {
    var bCollect, bExpire, bFail, bCheck, mCheck,
      tCollect, tExpire, tFail, tCheck, tElapse;
    // Get the base time referene points
    bCollect = this.pendingPrize.collectionTime || -999;// Far past
    bExpire = this.pendingPrize.expirationTime || -999;
    // Different for failure because zero is a valid (previous) time
    bFail = rule.failureTime === undefined ? -999 : rule.failureTime;
    bCheck = rule.checkTime || 0;// Limit to use THIS calculation
    // Get the offsets from the base reference times values
    tCollect = bCollect + this.parseTimeConfig(rule.collected, previous);
    tExpire = bExpire + this.parseTimeConfig(rule.expired, previous);
    tFail = bFail + this.parseTimeConfig(rule.failed, previous);
    // No accumulated for Elapsed: just direct offset from zero
    tElapse = this.parseTimeConfig(rule.elapsed, previous);
    mCheck = Math.max(tCollect, tExpire, tFail, tElapse);
    tCheck = this.parseTimeConfig(rule.checked, previous) +
      this.elapsedTimes[ENUMS.STATE.running];
    // Save new checked time reference for NEXT limit
    rule.checkTime = Math.max(mCheck, tCheck);
    // Pick the last / highest limit
    return Math.max(mCheck, bCheck);
  };// ./function Frogger.prototype.prizeWaitTime(rule, previous)

  /**
   * Find the next available prize to be shown
   *
   * @return {undefined}
   */
  Frogger.prototype.initPendingPrize = function () {
    var rIdx, rule, rules, minWait, canShow;
    rules = this.currentSettings.prizes;

    this.pendingPrize.isShowing = false;
    this.pendingPrize.showAt = 99999;// Far future time
    this.pendingPrize.checkAt = this.pendingPrize.showAt;
    this.pendingPrize.tileIndex = null;
    this.pendingPrize.rule = null;

    for (rIdx = 0; rIdx < rules.length; rIdx += 1) {
      minWait = this.
        prizeWaitTime(rules[rIdx].condition.when, rules[rIdx].timesShown);
      if (minWait < this.pendingPrize.showAt) {
        this.pendingPrize.checkAt =
          Math.max(minWait, rules[rIdx].condition.when.checkTime);
        canShow = this.
          parseBoolConfig(rules[rIdx].condition.if, rules[rIdx].timesShown);
        if (canShow) {
          this.pendingPrize.showAt = minWait;
          this.pendingPrize.rule = rIdx;
        } else {
          // Record the failure, only after actual "if" condition check
          rules[rIdx].condition.when.failureTime = minWait;
        }
      }
    }// ./for (rIdx = 0; rIdx < rules.length; rIdx += 1)

    if (this.pendingPrize.rule === null) { return; }

    rule = rules[this.pendingPrize.rule];
    this.pendingPrize.tileIndex = this.APP_CONFIG.prizes.tileIndex +
      this.pickIndex(rule.constraints.tileIndex);
    this.pendingPrize.lifeTime = this.parseTimeConfig(rule.time, rule.timesShown);

    // Position needs to be determined when actually placed, to be able to
    // account for the (then) current location of the avatar
    return;
  };// ./function Frogger.prototype.initPendingPrize()

  /**
   * Update and load the application (game) level settings
   *
   * @return {undefined}
   */
  Frogger.prototype.loadSettings = function () {
    var gamConfig, lvlConfig, minSpeed, row;
    gamConfig = this.APP_CONFIG.game.levels[this.lvlIndex];
    lvlConfig = this.APP_CONFIG.enemy.levels[this.lvlIndex];

    // gamConfig might be undefined.  Only need entry if storing changes for
    // the current level.
    this.currentSettings.levelTime = configUpdate.
      call(gamConfig, this.currentSettings.levelTime, 'length');
    this.currentSettings.player.sizeFactor = configUpdate.call(gamConfig,
      this.currentSettings.player.sizeFactor, ENUMS.SETTINGS.sizeFactor
      );
    if (gamConfig !== undefined) {
      if (gamConfig.goal) {
        // Just replace the whole array.  There does not seem to be a good (and
        // simple) structure to add/remove/update portions.  Keeping it optional
        // though means no entry is needed if no change from previous level
        delete this.currentSettings.goal;
        this.currentSettings.goal = gamConfig.goal;
      }

      if (gamConfig.prizes) {
        delete this.currentSettings.prizes;
        // Need copy, since (easiest) processing updates information
        this.currentSettings.prizes = deepCopyOf(gamConfig.prizes);
      }
    }// ./if (gamConfig !== undefined)
    this.resetPrizeWaits();
    this.initPendingPrize();

    // Update the reward rules/configuration for the level
    nestedConfigUpdate.
      call(gamConfig, this.currentSettings, ENUMS.SETTINGS.rewards);

    // lvlConfig needs to always exist.  The pattern information is complex
    // enough to make cloning and modifying from previous levels 'problematic'.
    // At least if multiple patterns are allowed in a single level
    this.currentSettings.enemy.sizeFactor = configUpdate.call(lvlConfig,
      this.currentSettings.enemy.sizeFactor, ENUMS.SETTINGS.sizeFactor
      );
    minSpeed = 9999;
    for (row = 0; row < lvlConfig.rows.length; row += 1) {
      minSpeed = Math.min(minSpeed, Math.abs(lvlConfig.rows[row][0].speed));
    }
    // Enough time to get the slowest enemy sprite almost across the canvas.
    // Tweaked to prevent immediate straight up alignment with many of the
    // enemy movement patterns.
    this.currentSettings.fillTime = this.GAME_BOARD.cellSize.width *
      (this.GAME_BOARD.gridCols - 0.5) / minSpeed;
    this.currentSettings.baseSpeed = configUpdate.call(lvlConfig,
      this.currentSettings.baseSpeed, ENUMS.SETTINGS.baseSpeed
      );
    this.currentSettings.fillSpeed = configUpdate.call(lvlConfig,
      this.currentSettings.fillSpeed, ENUMS.SETTINGS.fillSpeed
      );
  };// /.function Frogger.prototype.loadSettings()

  /**
   * Set the initial game state for the start of a level
   *
   * QUERY: Should this be a (function scope) helper function, instead of a
   *  shared prototype function? private vs possible inherit and override?
   *
   * @return {undefined}
   */
  Frogger.prototype.initLevel = function () {
    var i;

    // Clear any prizes left from the previous run
    for (i = 0; i < this.prizes.length; i += 1) {
      this.prizes[i].hide();
    }
    this.clearEnemyPatterns();
    this.loadSettings();

    // Calculation level specific collision detection parameters
    // Assumptions:
    // - all enemy sprites are the same size
    // - neither player nor enemy sizes are going to change while a level is in
    //   progress
    this.currentSettings.player.halfWidth =
      this.currentSettings.player.sizeFactor *
      this.player.cell.width / 2;
    this.currentSettings.enemy.halfWidth =
      this.currentSettings.enemy.sizeFactor *
      this.enemySprites[0][0].cell.width / 2;

    // Move the player avatar (back) to the starting location
    this.player.col = this.APP_CONFIG.player.start.col;
    this.player.row = this.APP_CONFIG.player.start.row;
  };// ./function Frogger.prototype.initLevel()

  /**
   * Stop all enemies
   *
   * Set the sprite speed to zero for all enemies in each of the (row) circular
   * buffers.  Since the buffer updates are based on position, and pattern
   * changes are based on elapsed level time, that should freeze all enemies in
   * place until a state change re-initializes the patterns.
   *
   * @return {undefined}
   */
  Frogger.prototype.freezeEnemies = function () {
    var row, sprite, inBuffer;
    for (row = 0; row < this.APP_CONFIG.enemy.maxSprites.length; row += 1) {
      // For each row occupied by moving enemies
      sprite = this.currentPatterns[row].head;// The 'front' sprite in the row
      inBuffer = true;
      while (inBuffer) {
        this.enemySprites[row][sprite].speed = 0;// Stop the sprite

        if (sprite === this.currentPatterns[row].tail) {
          inBuffer = false;// Just stopped the last sprite in the buffer
        } else {// !(sprite === this.currentPatterns[row].tail)
          // Move to the next active enemy in the circular buffer
          sprite += 1;
          if (sprite >= this.APP_CONFIG.enemy.maxSprites[row]) {
            sprite = 0;// Wrap to the start of the buffer
          }
        }// ./else !(sprite === this.currentPatterns[row].tail)
      }// ./while (inBuffer)
    }// ./for (row = 0; row < this.APP_CONFIG.enemy.maxSprites.length; row += 1)
  };// ./function Frogger.prototype.freezeEnemies()

  /**
   * Collect any / all bonuses for a single reward case
   *
   * @param {string} reward     The key for the reward won
   * @return {undefined}
   */
  Frogger.prototype.collectReward = function (reward, multiplier) {
    var rwdObj, bonus, bonusValue;
    rwdObj = this.currentSettings.rewards[reward];
    // Redundant? validation (if no recovery); will fail looking for properties
    // if (!rwdObj) {
    //   throw new Error('No known bonus for "' + reward + '" reward');
    // }

    for (bonus in rwdObj) {
      if (rwdObj.hasOwnProperty(bonus)) {
        // For each local (Own) bonus associated with the reward
        bonusValue = rwdObj[bonus];
        switch (bonus) {
        case ENUMS.BONUS.score:
          this.score += Math.round(bonusValue * (multiplier || 1));
          break;
        case ENUMS.BONUS.lives:
          this.lives += bonusValue;
          break;
        case ENUMS.BONUS.time:
          this.elapsedTimes[ENUMS.STATE.running] -= bonusValue;
          break;
        case ENUMS.BONUS.speed:
          // need a multiplier to use with sprite speed in Enemy.update
          // need a timer for how long it lasts
          throw new Error('Speed reduction bonus not implemented');
          //break;
        default:
          throw new Error('Unknown bonus found while collecting "' +
            reward + '" reward');
        }// ./select(bonus)
      }// ./if (rwdObj.hasOwnProperty[bonus])
    }// ./for (bonus in rwdObj)
  };// ./function Frogger.prototype.collectReward(reward, multiplier)

  /**
   * Do end of (successful) level processing
   *
   * Collect end of level rewards, and create scrolling content
   *
   * @return {undefined}
   */
  Frogger.prototype.levelComplete = function () {
    var bonusTime, tmpMsg;

    //this.freezeEnemies();// Done in state transition
    bonusTime = this.currentSettings.levelTime -
      this.elapsedTimes[ENUMS.STATE.running];
    tmpMsg = deepCopyOf(this.APP_CONFIG.hud.statusline.templates.levelComplete);
    tmpMsg.text = textInterpolate.call(tmpMsg.text,
      [this.level, Number(bonusTime.toFixed(1))]);
    this.tracker.message = tmpMsg;

    this.collectReward('goal');
    this.collectReward('timeleft', bonusTime);
  };// ./function Frogger.prototype.levelComplete()

  /**
   * Create and initialize all game entities, and finish the initial
   * configuration
   *
   * Executed when 'engineReady' event received
   *
   * @param {Object} cvsContext CanvasRenderingContext2D to display the
   *                    sprites on.
   * @return {undefined}
   */
  Frogger.prototype.start = function (cvsContext) {
    var gridCell, cfg, tiles, row, sprite, rowSprites;

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
    gridCell = this.GAME_BOARD.cellSize;
    cfg = this.APP_CONFIG.enemy;
    tiles = this.GAME_BOARD.resourceTiles;
    this.enemySprites = [];
    for (row = 0; row < cfg.maxSprites.length; row += 1) {
      rowSprites = [];
      for (sprite = 0; sprite < cfg.maxSprites[row]; sprite += 1) {
        rowSprites.push(
          new Enemy(tiles[cfg.tileIndex], row + cfg.topRow,
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
    this.enemySprites[0][0].col = this.GAME_BOARD.gridCols;
    this.limits.offRightX = this.enemySprites[0][0].position.x;

    cfg = this.APP_CONFIG.player;
    if (cfg.avatarCount > 1) {
      // Setup to transition to 'select' state after level initialized
      this.finiteState.selectPending = true;
    }
    this.player = new Avatar(cfg, cvsContext, gridCell, this
      );

    // For now, just use (and reuse) a single Prize instance.  Never more than one
    // on the canvas at a time (with current implementation)
    cfg = this.APP_CONFIG.prizes;
    this.prizes[0] = new Prize(cfg.verticalOffset, cfg.horizontalOffset, gridCell,
      tiles, cvsContext, { "context" : this, "expired" : this.prizeExpired }
      );

    // Due to the scope of where it is currently being created, the PaceCar
    // constructor function is not directly available from here.  The instance
    // reference to it is though.
    this.tracker = new this.TrackerBuilder(this, cvsContext);
    // Fill in the (base) position for scrolling messages (bottom of canvas)
    this.tracker.position.y = cvsContext.canvas.height;
    // Start the 'press space' message scrolling
    this.tracker.message = this.APP_CONFIG.hud.statusline.templates.start;

    // Place all enemy objects in an array called allEnemies
    // Place the player object in a variable called player
    engineNs.allEnemies = [];
    // Add the tracking instance as the first enemy, so that it gets a chance
    // to run first on any animation frame updates.  It can safely update
    // sprite information, and have the changes take effect in the same frame.
    engineNs.allEnemies.push(this.tracker);
    // Add the prizes next, so that enemies will 'drive over' prizes
    for (sprite = 0; sprite < this.prizes.length; sprite += 1) {
      engineNs.allEnemies.push(this.prizes[sprite]);
    }
    for (row = 0; row < this.APP_CONFIG.enemy.maxSprites.length; row += 1) {
      for (sprite = 0; sprite < this.APP_CONFIG.enemy.maxSprites[row];
          sprite += 1
          ) {
        engineNs.allEnemies.push(this.enemySprites[row][sprite]);
      }
    }
    engineNs.player = this.player;

    // Listen for key presses, and send them to (avatar) handleInput
    document.addEventListener('keyup', function (e) {
      var allowedKeys = {
        107: 'numplus',// DEBUG; cheat code
        106: 'numtimes',// DEBUG; cheat code
        32: 'space',
        37: 'left',
        38: 'up',
        39: 'right',
        40: 'down'
      };

      // Use outer function scope reference to access the listening instance,
      // since 'this' is 'document' for the listener callback function
      app.player.handleInput(allowedKeys[e.keyCode]);
    });
    // Listen for (custom) 'ApplicationCommand' events, and pass them to the
    // application handleCommand method
    document.addEventListener('ApplicationCommand', function (e) {
      // Use outer function scope reference to access the listening instance,
      // since 'this' is 'document' for the listener callback function
      app.handleCommand(e.detail);
    });

    // Setup to go to level 1 (index 0) when the engine is ready
    this.resetGame = true;
    this.finiteState.current = ENUMS.STATE.gameover;
    this.finiteState.next = ENUMS.STATE.newlevel;
    this.finiteState.changeOn = ENUMS.CHANGE.now;
  };// ./function Frogger.prototype.start(cvsContext)

  /**
   * Position and activate the first (leading) sprite in a pattern
   *
   * Scenarios:
   *  Level Startup: 2 sprites in cycle, both stopped
   *  Same direction as previous, new spacing and/or speed
   *  reverse direction
   *
   * @param {Integer} rowIndex  The pattern row number
   * @param {Number} startDistance The distance from old to new pattern
   * @return {undefined}
   */
  Frogger.prototype.initPattern = function (rowIndex, startDistance) {
    var sprites, pattern, offset;
    pattern = this.currentPatterns[rowIndex];
    sprites = this.enemySprites[rowIndex];

    // This needs to be smarter to handle more of the intended cases.  For now,
    // just get it setup for the base case of one pattern per level, but add
    // sanity checks to make sure that is REALLY the scenario.
    if (pattern.head !== 0 ||
        pattern.tail !== 1 ||
        sprites[pattern.tail].speed !== 0 ||
        sprites[pattern.head].speed !== 0 ||
        this.lastVisible(rowIndex) !== pattern.head
        ) {
      throw new Error('unknown pattern change combination for level ' +
        this.level
        );
    }

    // replace existing sprite settings
    offset = (startDistance || 0) * this.GAME_BOARD.cellSize.width;
    sprites[pattern.tail].speed = pattern.speed;
    if (pattern.speed < 0) {
      sprites[pattern.tail].position.x = this.limits.offRightX + offset;
    } else {
      sprites[pattern.tail].position.x = this.limits.offLeftX - offset;
    }
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
      if (this.elapsedTimes[ENUMS.STATE.running] >= rowState.expires) {
        rowConfig = lvlConfig.rows[row];
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
          rowState.distances = ptrnConfig.distances;
          rowState.cntDistances = rowState.distances.length;
        }
        if (ptrnConfig.seconds) {
          rowState.seconds = ptrnConfig.seconds;
        }
        // NOTE: Design decision: No adjust for the actual elapsed state time.
        // rowState.expires = this.elapsedTimes[ENUMS.STATE.running] +
        //   rowState.seconds;
        // Set the time when the new pattern ends, and the following one starts
        rowState.expires += rowState.seconds;

        // Activate the first (leading) sprite in the new pattern
        this.initPattern(row, ptrnConfig.startDistance);

      }// ./if (this.elapsedTimes[ENUMS.STATE.running] >= rowState.expires)
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
          this.nextDistance(row) * this.GAME_BOARD.cellSize.width;
        rowEnemies[rowState.tail].speed = rowState.speed;
      }
    }// ./for (row = 0; row < this.currentPatterns.length; row += 1)
  };// ./function Frogger.prototype.refreshEnemyQueues()

  /**
   * Collect rewards for any prize(s) at the avatar location
   *
   * @return {undefined}
   */
  Frogger.prototype.collectPrizes = function () {
    var prize;
    // Both prizes and the avatar are (currently) constrained to stay on the
    // grid rows and columns.
    // Currently only a single prize, but structure to handle multiple.
    for (prize = 0; prize < this.prizes.length; prize += 1) {
      if (this.player.row === this.prizes[prize].row &&
          this.player.col === this.prizes[prize].col
          ) {
        // Currently no prize rewards implemented that care about the remaining
        // time, either the life left on the prize, or for the level.
        // this.collectReward(this.prizes[prize].sprite, <<timeMultipler>>);
        this.collectReward(this.prizes[prize].sprite);
        this.prizes[prize].collected();
        this.pendingPrize.collectionTime = this.elapsedTimes[ENUMS.STATE.running];
        this.initPendingPrize();
      }
    }
  };// ./function Frogger.prototype.collectPrizes()

  /**
   * Check for level completion conditions
   *
   * @return {boolean}          Goal was reached, changing game state
   */
  Frogger.prototype.goalCheck = function () {
    var goals, goal;
    goals = this.currentSettings.goal;
    for (goal = 0; goal < goals.length; goal += 1) {
      // Check each defined goal for the level
      if (this.player.row === goals[goal].row &&
          arrayContains.call(goals[goal].cols, this.player.col)
          ) {
        // The player [row,col] matches a goal line case
        this.state = ENUMS.STATE.donelevel;
        return true;
      }
    }// ./for (goal = 0; goal < goals.length; goal += 1)

    return false;
  };// ./function Frogger.prototype.goalCheck()

  /**
   * Check for player avatar collision with the edge of the playing field
   *
   * *CURRENTLY* an Avatar instance only moves in grid cell size steps.  That
   * could change if things like riding on a log are implemented.
   *
   * NOTE: Initially looked more reasonable to implement this as an Avatar
   * prototype method, but currently an Avatar instance does not have access to
   * the playing field grid information.  Providing that would cause undesired
   * coupling with the application.
   *
   * @return {boolean}          Went past playing field boundary
   */
  Frogger.prototype.playerBoundsCheck = function () {
    // check for collision with game field boundaries
    if (this.player.row < 0 ||
        this.player.row >= this.GAME_BOARD.gridRows ||
        this.player.col < 0 ||
        this.player.col >= this.GAME_BOARD.gridCols
        ) {
      this.reason = 'from falling off the world';
      this.state = ENUMS.STATE.dieing;
      return true;
    }// ./if (player outside canvas)

  };// ./function Frogger.prototype.playerBoundsCheck()

  /**
   * Check if the player avatar has collided with an enemy sprite.
   *
   * This only needs to check for collisions with the sprites that are in the
   * grid row currently being occupied by the avatar.
   *
   * @return {boolean}          Collided, and game state changing
   */
  Frogger.prototype.playerEnemyCheck = function () {
    var enIdx, enRow, avHalfWidth, enHalfWidth, enemy;

    // Get the enemies that the avatar could be colliding with.
    // Offset needed because first (zeroth) Enemy row is not grid row zero
    enIdx = this.player.row - this.APP_CONFIG.enemy.topRow;
    enRow = this.enemySprites[enIdx];
    if (enRow) {
      // Enemy sprites exist on the same grid row as the player avatar

      // Get the half (left and right) collision area size of player avatars
      // and enemy sprites
      avHalfWidth = this.currentSettings.player.halfWidth;
      enHalfWidth = this.currentSettings.enemy.halfWidth;

      // Follow the active entries in the enemy circular queue from head to
      // tail.  the tail entry does not need to be processed.  It is still off
      // of the canvas.
      enemy = this.currentPatterns[enIdx].head;
      while (enemy !== this.currentPatterns[enIdx].tail) {
        // Check for (only) a horizontal overlap between the avatar and a single
        // (visible) enemy sprite
        if (this.player.
            xIntersected(enRow[enemy], avHalfWidth, enHalfWidth)
            ) {
          // Found a collision.  No point in checking for any more
          this.reason = 'from hit and run';
          this.state = ENUMS.STATE.dieing;
          return true;
        }// ./if (Avatar to Enemy collision)

        // Move to the next active enemy in the circular queue
        enemy += 1;
        if (enemy >= this.APP_CONFIG.enemy.maxSprites[enIdx]) {
          enemy = 0;// Wrap to the start of the buffer
        }
      }// ./while (enemy !== this.currentPatterns[enIdx].tail)
    }// ./if (enRow)

    return false;// No collision
  };// ./function Frogger.prototype.playerEnemyCheck()

  /**
   * Check for player avatar collisions with anything that is going to change
   * game state
   *
   * None of the collision detection needs to worry about the y coordinate in
   * more detail than the grid row.  None of the game features can be placed
   * (vertically) outside a row.  At least as far as collision detection is
   * concerned.  Offsets are used for visual adjustments, but do not affect
   * the location for vertical positioning.
   *
   * @return {boolean}          Was state changing collision detected?
   */
  Frogger.prototype.collisionCheck = function () {
    this.collectPrizes();// No game state change for this
    // check for collision with 'goal'; check for success before check for fail
    if (this.goalCheck()) { return true; }// goal line collision
    if (this.playerBoundsCheck()) { return true; }// world edge collision
    if (this.playerEnemyCheck()) { return true; }// enemy collision

    return false;// No state changing collision
  };// ./function Frogger.prototype.collisionCheck()

  /**
   * Do any processing need to 'start' the current state.
   *
   * This runs state initialization code after a state transition, to keep the
   * actual processing outside of the non re-entrant safe transitioning logic.
   *
   * @return {undefined}
   */
  Frogger.prototype.startState = function () {
    if (!this.finiteState.doCurrent) { return; }

    this.finiteState.doCurrent = false;
    switch (this.state) {
    case ENUMS.STATE.newlevel:
      this.initLevel();
      break;
    case ENUMS.STATE.dieing:
      this.player.die(this.reason);
      break;
    case ENUMS.STATE.resurrect:
      this.player.resurrect();
      break;
    case ENUMS.STATE.donelevel:
      this.levelComplete();
      break;
    }// ./switch (this.state)
  };// ./function Frogger.prototype.startState()

  /**
   * Set flags in array that are less than minimum distance from reference point
   *
   * Distance is measured in steps, to one row and one col difference is a
   * distance of two.
   *
   * @param {Array or Array of boolean} flags array[col][row] to update
   * @param {Integer} minDistance Minimal distance from reference coordinate
   * @param {Integer} refRow    Grid row index for reference point
   * @param {Integer} refCol    Grid column index for reference point
   * @return {undefined}
   */
  Frogger.prototype.tooCloseTotal = function (flags, minDistance, refRow,
      refCol
      ) {
    var idx, col, row, maxRow, maxCol, lowRow, highRow, lowCol, highCol;
    if (minDistance) {// Might not exist, and zero is not valid minimum distance
      // The four straight line (horizontal and vertical) points at the total
      maxCol = flags.length - 1;
      maxRow = flags[0].length - 1;
      lowRow = Math.max(0, refRow - minDistance);
      highRow = Math.min(maxRow, refRow + minDistance);
      lowCol = Math.max(0, refCol - minDistance);
      highCol = Math.min(maxCol, refCol + minDistance);
      flags[refCol][lowRow] = true;
      flags[refCol][highRow] = true;
      flags[lowCol][refRow] = true;
      flags[highCol][refRow] = true;
      for (idx = 1; idx < minDistance; idx += 1) {
        // For each exact distance > 0 and up to the configured limit
        for (col = 1; col < idx; col += 1) {
          // For each column offset > 0 and up to the exact distance
          row = idx - col;// Row offset is total distance minus column offset
          // (up to) four coordinates match: refCol ± col, refRow ± row
          lowRow = Math.max(0, refRow - row);
          highRow = Math.min(maxRow, refRow + row);
          lowCol = Math.max(0, refCol - col);
          highCol = Math.min(maxCol, refCol + col);
          flags[lowCol][lowRow] = true;
          flags[lowCol][highRow] = true;
          flags[highCol][lowRow] = true;
          flags[highCol][highRow] = true;
        }// ./for (col = 1; col < idx; col += 1)
      }// ./for (idx = 1; idx < minDistance; idx += 1)
    }// ./if (minDistance)
  };// ./function Frogger.prototype.
  //      tooCloseTotal(flags, minDistance, refRow, refCol)

  /**
   * Set flags in array that are less than minimum horizontal distance from
   * reference point
   *
   * @param {Array or Array of boolean} flags array[col][row] to update
   * @param {Integer} minDistance Minimal distance from reference column
   * @param {Integer} refCol    Grid column index for reference point
   * @return {undefined}
   */
  Frogger.prototype.tooCloseHorizontal = function (flags, minDistance, refCol) {
    var loopMin, loopMax, col, row, maxRow, maxCol;
    if (minDistance) {// Might not exist, and zero is not valid minimum distance
      maxCol = flags.length - 1;
      maxRow = flags[0].length - 1;
      loopMin = Math.max(0, refCol - minDistance);
      loopMax = Math.min(maxCol, refCol + minDistance);
      for (col = loopMin; col <= loopMax; col += 1) {
        for (row = 0; row <= maxRow; row += 1) {
          flags[col][row] = true;
        }
      }// ./for (col = loopMin; col <= loopMax; col += 1)

    }// ./if (minDistance)
  };// ./function Frogger.prototype.tooCloseHorizontal(flags, minDistance, refCol)

  /**
   * Set flags in array that are less than minimum vertical distance from
   * reference point
   *
   * @param {Array or Array of boolean} flags array[col][row] to update
   * @param {Integer} minDistance Minimal distance from reference row
   * @param {Integer} refRow    Grid row index for reference point
   * @return {undefined}
   */
  Frogger.prototype.tooCloseVertical = function (flags, minDistance, refRow) {
    var loopMin, loopMax, col, row, maxRow, maxCol;
    if (minDistance) {// Might not exist, and zero is not valid minimum distance
      maxCol = flags.length - 1;
      maxRow = flags[0].length - 1;
      loopMin = Math.max(0, refRow - minDistance);
      loopMax = Math.min(maxRow, refRow + minDistance);
      for (row = loopMin; row <= loopMax; row += 1) {
        for (col = 0; col <= maxCol; col += 1) {
          flags[col][row] = true;
        }
      }// ./for (row = loopMin; row <= loopMax; row += 1)
    }// ./if (minDistance)
  };// ./function Frogger.prototype.tooCloseVertical(flags, minDistance, refRow)

  /**
   * Build array of flags showing index combinations that are closer than the
   * configured minimum distance from the the avatar.
   *
   * @param {Object} rules      Object with minimal distance section properties
   * @return {Array} of {Array} of {boolean}
   */
  Frogger.prototype.tooClose = function (rules) {
    var row, col, mat, aRow, aCol, maxRow, maxCol;
    aRow = this.player.row;
    aCol = this.player.col;
    maxRow = this.GAME_BOARD.gridRows - 1;
    maxCol = this.GAME_BOARD.gridCols - 1;
    mat = [];
    for (col = 0; col <= maxCol; col += 1) {
      mat[col] = [];
      for (row = 0; row <= maxRow; row += 1) {
        mat[col][row] = false;
      }// ./for (row = 0; row <= maxRow; row += 1)
    }// ./for (col = 0; col <= maxCol; col += 1)

    // 'Tag' locations that are closer to the avatar than allowed
    mat[aCol][aRow] = true;
    if (rules) {
      this.tooCloseTotal(mat, rules.total, aRow, aCol);
      this.tooCloseHorizontal(mat, rules.horizontal, aCol);
      this.tooCloseVertical(mat, rules.vertical, aRow);
    }

    return mat;
  };// ./function Frogger.prototype.tooClose(rules)

  /**
   * Check whether a valid prize location was found
   *
   * @return {boolean}
   */
  Frogger.prototype.checkFoundLocation = function (flags, rowFirst, colFirst,
      rowWeights, colWeights
      ) {
    if (rowFirst && colFirst) {
      if (flags[this.pendingPrize.col][this.pendingPrize.row]) {
        // throw new Error('avatar at fixed prize target of (' +
        //   this.pendingPrize.col + ', ' + this.pendingPrize.row + ')'
        //   );
        return false;
      }
    }// ./if (rowFirst && colFirst) {

    if (rowWeights !== null && (rowWeights <= 0 || colWeights <= 0)) {
      // No currently valid location for the prize
      return false;
    }

    if (this.pendingPrize.row < 0 || this.pendingPrize.col < 0) {
      return false;
    }

    return true;
  };// ./function Frogger.Prototype.
  //      checkFoundLocation(flags, rowFirst, colFirst, rowWeights, colWeights)

  /**
   * Use the rule constraints to pick a location to show the prize icon.
   *
   * Must call this just before making the prize visible, since part of the
   * calculation are based on the current location of the avatar.  As a minimum,
   * want to avoid dropping the prize right on the avatar.
   *
   * @return {boolean}
   */
  Frogger.prototype.pickPrizeLocation = function () {
    var constraints, rowSelect, colSelect, noPrize, rowWeights, colWeights,
      rowFirst, colFirst;
    this.pendingPrize.row = -1;
    this.pendingPrize.col = -1;
    rowWeights = null;
    colWeights = null;
    constraints = this.currentSettings.prizes[this.pendingPrize.rule].constraints;
    rowSelect = deepCopyOf(constraints.row);
    colSelect = deepCopyOf(constraints.col);
    noPrize = this.tooClose(constraints.minDistance);
    rowFirst = typeof rowSelect === 'number';
    colFirst = typeof colSelect === 'number';

    if (!(rowFirst || colFirst)) {
      // Neither selection is directly limited to a single index.  Check for
      // reduced ranges after filtering for minimum distance
      // totalRowWeight = arraySum.call(rowSelect);
      // totalColWeight = arraySum.call(colSelect);
      rowWeights = arrayCountPlus.call(rowSelect);
      colWeights = arrayCountPlus.call(colSelect);

      rowFirst = rowWeights === 1;
      colFirst = colWeights === 1;
      if (!(rowFirst || colFirst)) {
        rowFirst = rowWeights <= colWeights;
        colFirst = !rowFirst;
      }
    }// ./if (!(rowFirst || colFirst))

    if (rowFirst) {
      this.pendingPrize.row = this.pickIndex(rowSelect);
      if (!colFirst) {
        clearUnavailableColWeight.call(colSelect, noPrize, this.pendingPrize.row);
      }
      this.pendingPrize.col = this.pickIndex(colSelect);
    } else {
      this.pendingPrize.col = this.pickIndex(colSelect);
      clearUnavailableRowWeight.call(rowSelect, noPrize, this.pendingPrize.col);
      this.pendingPrize.row = this.pickIndex(rowSelect);
    }

    return this.
      checkFoundLocation(noPrize, rowFirst, colFirst, rowWeights, colWeights);
  };// ./function Frogger.prototype.pickPrizeLocation()

  /**
   *
   *
   * @return {undefined}
   */
  Frogger.prototype.prizeExpired = function () {
    this.pendingPrize.expirationTime = this.elapsedTimes[ENUMS.STATE.running];
    this.initPendingPrize();
  };// ./function Frogger.prototype.prizeExpired()

  /**
   * Add prizes to the canvas, when they are ready to go
   *
   * @return {undefined}
   */
  Frogger.prototype.showPrize = function () {
    if (!this.pendingPrize.isShowing) {
      if (this.pendingPrize.showAt <= this.elapsedTimes[ENUMS.STATE.running]) {
        if (this.pickPrizeLocation()) {
          this.prizes[this.pendingPrize.prize].place(this.pendingPrize);
          this.currentSettings.prizes[this.pendingPrize.rule].timesShown += 1;
          this.pendingPrize.isShowing = true;
        }
      } else {
        if (this.pendingPrize.checkAt <= this.elapsedTimes[ENUMS.STATE.running]) {
          // When could not queue a prize, but need to check again.
          this.initPendingPrize();
        }
      }
    }// ./if (!this.pendingPrize.isShowing)
    return;// Dummy to aid breakpoint positioning
  };// ./function Frogger.prototype.showPrize()

  /**
   * Game state processing to do (at the start of) each animation frame
   *
   * NOTE: conceptually done at 'pre-update'
   *
   * @param {Number} deltaTime  (Fractional) seconds since previous update
   * @return {undefined}
   */
  Frogger.prototype.next = function (deltaTime) {
    manageTime.call(this, deltaTime);

    // Do any needed (one time) state initialization
    this.startState();
    // Check if there are any pending state transitions.  Loop to potentially
    // process multiple (cascading) transitions.
    while (this.finiteState.next &&
        this.finiteState.changeOn === ENUMS.CHANGE.now
        ) {
      this.state = this.finiteState.next;
      this.startState();
    }

    // check for collisions before time limits, so it is possible to finish a
    // level just as the time is running out.
    if (this.state === ENUMS.STATE.running) {
      if (this.collisionCheck()) { return; }

      // Add any pending prize to the screen that is due
      this.showPrize();

      // Check for level time limit exceeded
      if (this.elapsedTimes[ENUMS.STATE.running] >
          this.currentSettings.levelTime
          ) {
        // Time has expired for the current level.  Avatar dies (from exposure)
        this.reason = 'from exposure @' +
          Number(this.elapsedTimes[ENUMS.STATE.running]).toFixed(1) +
          ' on level ' + this.level + ', with limit of ' +
          this.currentSettings.levelTime;
        this.state = ENUMS.STATE.dieing;
      }
    }

    // Check for expired patterns
    this.cycleEnemyPatterns();

    // Queue another enemy when the current queued enemy becomes visible
    this.refreshEnemyQueues();
  };// ./function Frogger.prototype.next(deltaTime)

  /**
   * Per frame processing just before the tracker renders the HUD
   *
   * @return {undefined}
   */
  Frogger.prototype.preRender = function () {
    if (this.state === ENUMS.STATE.select) {
      this.player.showSelections();
    }
  };// function Frogger.prototype.preRender()

  /////////////////////////////////
  // End of function definitions //
  /////////////////////////////////

  // Start of actual code execution

  // Namespace where the animation engine (properties) live
  engineNs = namespace('io.github.mmerlin.animationEngine');

  // With the current implementation, the application itself does not need a
  // namespace to live in.  It runs just fine in the closure scope of the
  // anonymous wrapper function.  Nothing needs to reference it directly.  Only
  // the objects passed to the animation engine.
  app = new Frogger();
  engineNs.field = app.GAME_BOARD;

}());// ./function anonymous()
