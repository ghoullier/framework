var DOMElement = Famous.domRenderables.DOMElement;

var Size = Famous.components.Size;

BEST.attach('famous:tests:platform-a', 'HEAD', '#ctx', function(renderNode) {
    var domEl = new DOMElement(renderNode);
    domEl.setContent('Hello Famous!');
    domEl.setProperty('background-color', 'red');

    var size = new Size(renderNode);
    size.setMode(1, 1, 1);
    size.setAbsolute(200, 200);
});