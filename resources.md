Resources used while building the arcade game for project 3.

At least the ones I was actually taking something from.  A lot more were browsed
and discarded as not being currently helpful.

http://caniuse.com
https://developer.mozilla.org/en-US/docs/Web/JavaScript/

http://javascript.info/tutorial/onload-ondomcontentloaded
ugggg crossbrowser DOMContentLoaded handling code
not really needed here.  The base html document is TINY.  All of the real work
is done by the javascript.  Waiting for full onload, instead of DOMContentLoaded
would be a very minor difference.  canisue.com says DOMContentLoaded
would work for 94% of browsers world wide.  In the 'aligned' set, everything
except ie8.
Used DOMContentLoaded anyway.  I *expect* that any browser that supports html5
and canvas will also know about DOMContentLoaded.

http://stackoverflow.com/questions/122102/what-is-the-most-efficient-way-to-clone-an-object
http://stackoverflow.com/questions/12032262/property-description-must-be-an-object-error-in-javascript-cant-understand-w

http://stackoverflow.com/questions/2268204/favicon-dimensions
http://realfavicongenerator.net/
http://www.comp.dit.ie/website07/images/news/frogger.png

http://bucephalus.org/text/CanvasHandbook/CanvasHandbook.html
http://elegantcode.com/2011/01/26/basic-javascript-part-8-namespaces/
http://stackoverflow.com/questions/2490825/how-to-trigger-event-in-javascript
http://davidwalsh.name/customevent
- custom events
http://stackoverflow.com/questions/19345392/why-arent-my-parameters-getting-passed-through-to-a-dispatched-event/19345563#19345563

http://www.ctc-aspire.co.uk/blog-post-36-web-safe-fonts-157-34.html
http://www.ampsoft.net/webdesign-l/WindowsMacFonts.html
http://stackoverflow.com/questions/6134039/format-number-to-always-show-2-decimal-places
http://tutorials.jenkov.com/html5-canvas/text.html#measuring-text-width

http://stackoverflow.com/questions/1635800/javascript-best-singleton-pattern#answer-6733919
https://code.google.com/p/jslibs/wiki/JavascriptTips#Singleton_pattern

http://www.javascripter.net/faq/keycodes.htm
http://stackoverflow.com/questions/5612787/converting-an-object-to-a-string

http://stackoverflow.com/questions/5222209/getter-setter-in-constructor
// all information found says it is not possible to to use literal syntax to add getter or setter properties in a
  (constructor) function.  Must use Object.defineProperty(this, ...) instead

http://html5.litten.com/understanding-save-and-restore-for-the-canvas-context/

