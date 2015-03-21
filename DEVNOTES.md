Incomplete
==========
With this implementation, game levels need to be included in the configuration object.  Levels are not open ended.

Considerations
==============
The GAME_BOARD and APP_CONFIG objects are conceptually read only / immutable.  Take care to use copies (deepCopyOf) of segments that could get modified after initialization.
Watch for issues anyplace code has the pattern:
settingObject = config.objectProperty

