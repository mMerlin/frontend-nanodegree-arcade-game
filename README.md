This is a simplified version of the classical Frogger arcade game, implemented
using html5 canvas and javascript.

This demonstrates the use of:
* pseudoclassical class pattern
  * with hidden private data and methods
* (nested) pseudoclassical subclassing
  * with get and set properties using function scope methods
* over-riding superclass methods
* using superclass methods in subclassed prototype methods
* function closure scope private 'inner' functions
* singleton pattern
* function callbacks
* communication though custom events
* smooth animation on html5 canvas
* finite state machine

See the live application running at
http://mmerlin.github.io/frontend-nanodegree-arcade-game/

frontend-nanodegree-arcade-game
===============================

Students should use this rubric: https://www.udacity.com/course/viewer#!/c-ud015/l-3072058665/m-3072588797

for self-checking their submission.

Future version enhancements
===========================

Avatar.prototype.showSelections
Handle having more (selectable) avatars than grid columns
- scroll/page displayed avatars when selector moves off canvas edges

Avatar.prototype.die
Add 'death throes' animation
Ideas:
- simple rotate/spin in place
- spin and reducing size
- skull and cross-bones

Avatar.prototype.resurrect
Animate return to life
Ideas:
- spin from point to full size
- increase from point to full size, without spin

setStateNewlevel
Implement method of getting board 'filled' with enemies before allowing allowing Avatar to move, or clock to start
Ideas:
- configurable delay after initLevel
- wait until enemy crosses board
-- any row
-- all rows
-- 'nose' touches far side
- With any of above, increase the time flow rate to get there faster
-- Could jump time to get to 'filled' state
--- loop Frogger.prototype.next until conditions satisfied, render optional
- ignore / truncate if level was not started before 'fill' conditions were met
- ignore 'start' command until board has been filled
- change messaging to show [not] ready

Frogger.prototype.playerEnemyCheck
check how much overlap there is on a collision, and adjust the displayed message.  If little overlap, probably the avatar was sitting still, and the enemy ran them over (hit and run).  If the overlap is large, probably the avatar moved, running into the enemy (suicide by enemy).

Wrap the individual class constructors, with the associated prototypes, into separate top level, self running, anonymous wrapper functions.  Get each of them into their own private function scope, with private data and functions.
Variations:
- revealer pattern to export (just) the class constructor function.
- directly (inside the wrapper) store the constructors in a namespace
- in the namespace, store functions that create the class, instead of the class itself
-- Create tracker / PaceCar as inner class of Frogger, by running its creator function

PaceCar.prototype.jumpScore
Animate score reset to zero, instead of straight jump
Ideas:
- high speed spin
- treat like mechanical display
-- decrement one digit position at a time
-- decrement highest digit first
-- decrement matching digits together
--- 256 ==> 255 ==> 244 ==> 233 ==> 222 ==> 111 ==> 0

Improved 'demo' mode if the game is not started for awhile
- Intermix messages about the prizes with the looping start message
-- show prize icon
- modify Frogger.prototype.next so prizes and level pattern process continues in demo mode
- show other patterns and levels

PaceCar.prototype.render()
Change the style of the "Time:" label as the time starts running out
- green ==> yellow ==> red; animated
- use a function that calculates style based on remaining time
-- perhaps (also) animate to 'pulse'

Frogger.prototype.handleCommand, 'keyup' event listener
Consider adding state specific keyboard commands
- could use numbers to directly select avatars
- go to select processing one command after game over

Improve Prize handling.  Part of the logic exists to display multiple sequential prizes, but the code to calculate the next prize is not complete.
- Frogger.prototype.showPrize, after this.pendingPrize.isShowing = false;
-- refactor from Frogger.prototype.initPendingPrize
- Add checks and processing for elapsed time past this.pendingPrize.CheckAt
-- To handle case where random prize 'failed' but future retry allowed
-- Frogger.prototype.showPrize return undefined stub

Expand animation engine code
- Interface also/more using events
- Support multiple canvas areas
- Support simultaneous 'applications'
- remove duplication between rowImages and resourceTiles
-- push both to temporary array to pass to Resources
- add animation state hooks: preupdate, postupdate, prerender, postrender
-- postupdate looks like a good place to do collision detection
- add hooks to add a canvas after the engine is running
- when receiving configuration data through API, return unique key with response
-- use the key to later allow caller to modify (only) its own settings

Frogger.prototype.tooClose
Consider adding additional 'too close' case calculation
- ahead, behind

Move the description for the GAME_BOARD configuration structure to engine.js
