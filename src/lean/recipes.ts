/**
 * Recipe library: ExtendScript (ES3) bodies for jobs that come up again and again
 * in short-form ads. Each recipe is a function body that receives the caller's
 * parameters as `P` and returns a result object.
 */

import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';

export interface Recipe {
  name: string;
  summary: string;
  tags: string[];
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    anyOf?: unknown[];
  };
  body: string;
}

const LAYER_REF = {
  layerIndex: { type: 'integer', minimum: 1, description: '1-based layer index' },
  layerName: { type: 'string', minLength: 1, description: 'Layer name (used when layerIndex is absent)' },
  compName: { type: 'string', description: 'Composition name. Default: the active composition' }
};
const LAYER_REQUIRED = [{ required: ['layerIndex'] }, { required: ['layerName'] }];

const CAPTION_STYLE = {
  font: { type: 'string', description: 'PostScript font name. Default "Arial-BoldMT"' },
  fontSize: { type: 'number', description: 'Pixels. Default 4.5% of comp height' },
  fillColor: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'RGB 0-1. Default white' },
  strokeColor: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'RGB 0-1. Only used when strokeWidth > 0' },
  strokeWidth: { type: 'number', minimum: 0, description: 'Stroke width in px. Default 0' },
  yPosition: { type: 'number', minimum: 0, maximum: 1, description: 'Vertical centre as a fraction of comp height. Default 0.76 (inside the 0.70-0.82 caption band)' },
  maxWidth: { type: 'number', minimum: 0.1, maximum: 1, description: 'Max text width as a fraction of comp width; the layer is scaled down to fit. Default 0.9' },
  popIn: { type: 'number', minimum: 0, description: 'Pop-in duration in seconds (scale 85% to 100% plus fade). Default 0.12, 0 disables' },
  uppercase: { type: 'boolean', description: 'Force uppercase. Default false' }
};

// Shared ES3 helpers. No let/const, arrow functions, Array.indexOf, trim or JSON.
const HELPERS = `
function aeFindComp(P) {
  var comp = null;
  if (P.compName) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === P.compName) { comp = it; break; }
    }
    if (!comp) throw new Error("Composition not found: " + P.compName);
  } else {
    comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) throw new Error("No active composition. Open one or pass compName.");
  }
  return comp;
}
function aeFindLayer(comp, P) {
  var layer = null;
  if (P.layerIndex) {
    if (P.layerIndex > comp.numLayers) throw new Error("layerIndex out of range: " + P.layerIndex);
    layer = comp.layer(P.layerIndex);
  } else if (P.layerName) {
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).name === P.layerName) { layer = comp.layer(i); break; }
    }
    if (!layer) throw new Error("Layer not found: " + P.layerName);
  } else {
    throw new Error("Pass layerIndex or layerName");
  }
  return layer;
}
function aeSetSpan(layer, t0, dur) {
  var t1 = t0 + dur;
  if (t0 >= layer.outPoint) { layer.outPoint = t1; layer.inPoint = t0; }
  else { layer.inPoint = t0; layer.outPoint = t1; }
}
function aeScaleBy(base, f) {
  var out = [];
  for (var i = 0; i < base.length; i++) out.push(base[i] * f);
  return out;
}
function aeEaseKeys(prop, influence) {
  var dims = 1;
  var v = prop.value;
  if (v instanceof Array) dims = v.length;
  var eases = [];
  for (var d = 0; d < dims; d++) eases.push(new KeyframeEase(0, influence));
  for (var k = 1; k <= prop.numKeys; k++) {
    try {
      prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
      prop.setTemporalEaseAtKey(k, eases, eases);
    } catch (e) {}
  }
}
function aeClearKeys(prop) {
  while (prop.numKeys > 0) prop.removeKey(1);
}
function aeMakeCaption(comp, text, start, dur, S) {
  var shown = S.uppercase ? String(text).toUpperCase() : String(text);
  var layer = comp.layers.addText(shown);
  var tp = layer.property("ADBE Text Properties").property("ADBE Text Document");
  var td = tp.value;
  td.resetCharStyle();
  td.font = S.font ? S.font : "Arial-BoldMT";
  td.fontSize = S.fontSize ? S.fontSize : Math.round(comp.height * 0.045);
  td.applyFill = true;
  td.fillColor = S.fillColor ? S.fillColor : [1, 1, 1];
  if (S.strokeWidth && S.strokeWidth > 0) {
    td.applyStroke = true;
    td.strokeColor = S.strokeColor ? S.strokeColor : [0, 0, 0];
    td.strokeWidth = S.strokeWidth;
    td.strokeOverFill = false;
  } else {
    td.applyStroke = false;
  }
  td.justification = ParagraphJustification.CENTER_JUSTIFY;
  tp.setValue(td);
  var r = layer.sourceRectAtTime(0, false);
  var tr = layer.property("ADBE Transform Group");
  tr.property("ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
  var y = (S.yPosition === undefined) ? 0.76 : S.yPosition;
  tr.property("ADBE Position").setValue([comp.width / 2, comp.height * y]);
  var maxW = (S.maxWidth === undefined) ? 0.9 : S.maxWidth;
  var pct = 100;
  if (r.width > comp.width * maxW) pct = (comp.width * maxW / r.width) * 100;
  tr.property("ADBE Scale").setValue([pct, pct]);
  aeSetSpan(layer, start, dur);
  var pop = (S.popIn === undefined) ? 0.12 : S.popIn;
  if (pop > 0) {
    var sp = tr.property("ADBE Scale");
    sp.setValueAtTime(start, [pct * 0.85, pct * 0.85]);
    sp.setValueAtTime(start + pop, [pct, pct]);
    aeEaseKeys(sp, 60);
    var op = tr.property("ADBE Opacity");
    op.setValueAtTime(start, 0);
    op.setValueAtTime(start + pop, 100);
  }
  layer.name = "CAP: " + shown.replace(/[\\r\\n]+/g, " ").substring(0, 40);
  return layer;
}
`;

export const RECIPES: Recipe[] = [
  {
    name: 'sticker_pop',
    summary: 'Pop-in / pop-out animation for a sticker layer (scale overshoot in, shrink out), optional position wiggle and pop sound layer. Replaces existing scale keyframes.',
    tags: ['sticker', 'pop', 'overlay', 'scale', 'wiggle', 'animation', 'sound', 'sfx'],
    inputSchema: {
      type: 'object',
      properties: {
        ...LAYER_REF,
        start: { type: 'number', description: 'Start time in seconds. Default: layer in point' },
        duration: { type: 'number', exclusiveMinimum: 0, description: 'Visible duration in seconds. Default: layer length' },
        popIn: { type: 'number', exclusiveMinimum: 0, description: 'Pop-in duration. Default 0.25' },
        popOut: { type: 'number', exclusiveMinimum: 0, description: 'Pop-out duration. Default 0.2' },
        overshoot: { type: 'number', minimum: 100, description: 'Peak scale as % of the current scale. Default 115' },
        wiggleAmount: { type: 'number', minimum: 0, description: 'Position wiggle in px, 0 disables. Default 2' },
        wiggleFrequency: { type: 'number', exclusiveMinimum: 0, description: 'Wiggles per second. Default 8 (approximation of the house Wiggle effect)' },
        soundPath: { type: 'string', description: 'Optional audio file (for example 02_SFX pop) to add as a layer at the start time' }
      },
      anyOf: LAYER_REQUIRED
    },
    body: `
var comp = aeFindComp(P);
var layer = aeFindLayer(comp, P);
var t0 = (P.start !== undefined) ? P.start : layer.inPoint;
var dur = (P.duration !== undefined) ? P.duration : (layer.outPoint - t0);
if (dur <= 0) throw new Error("duration must be positive");
var popIn = P.popIn ? P.popIn : 0.25;
var popOut = P.popOut ? P.popOut : 0.2;
if (popIn + popOut > dur) { popIn = dur * 0.55; popOut = dur * 0.35; }
var over = (P.overshoot ? P.overshoot : 115) / 100;
aeSetSpan(layer, t0, dur);
var sp = layer.property("ADBE Transform Group").property("ADBE Scale");
var base = sp.value;
aeClearKeys(sp);
sp.setValueAtTime(t0, aeScaleBy(base, 0));
sp.setValueAtTime(t0 + popIn * 0.6, aeScaleBy(base, over));
sp.setValueAtTime(t0 + popIn, base);
sp.setValueAtTime(t0 + dur - popOut, base);
sp.setValueAtTime(t0 + dur, aeScaleBy(base, 0));
aeEaseKeys(sp, 55);
var amt = (P.wiggleAmount === undefined) ? 2 : P.wiggleAmount;
if (amt > 0) {
  var freq = P.wiggleFrequency ? P.wiggleFrequency : 8;
  layer.property("ADBE Transform Group").property("ADBE Position").expression = "wiggle(" + freq + "," + amt + ")";
}
var sound = null;
if (P.soundPath) {
  var f = new File(P.soundPath);
  if (!f.exists) throw new Error("Sound file not found: " + P.soundPath);
  var item = app.project.importFile(new ImportOptions(f));
  var a = comp.layers.add(item);
  a.startTime = t0;
  sound = a.name;
}
return { recipe: "sticker_pop", layer: layer.name, start: t0, end: t0 + dur, wiggle: amt, sound: sound };
`
  },
  {
    name: 'wiggle_position',
    summary: 'Apply a position wiggle expression to a layer (both axes, or only X or Y). Use remove=true to clear it.',
    tags: ['wiggle', 'shake', 'expression', 'position', 'sticker'],
    inputSchema: {
      type: 'object',
      properties: {
        ...LAYER_REF,
        amount: { type: 'number', minimum: 0, description: 'Wiggle size in px. Default 2' },
        frequency: { type: 'number', exclusiveMinimum: 0, description: 'Wiggles per second. Default 8' },
        axes: { type: 'string', enum: ['both', 'x', 'y'], description: 'Default both' },
        remove: { type: 'boolean', description: 'Remove the expression instead' }
      },
      anyOf: LAYER_REQUIRED
    },
    body: `
var comp = aeFindComp(P);
var layer = aeFindLayer(comp, P);
var pos = layer.property("ADBE Transform Group").property("ADBE Position");
if (P.remove) { pos.expression = ""; return { recipe: "wiggle_position", layer: layer.name, removed: true }; }
var amt = (P.amount === undefined) ? 2 : P.amount;
var freq = P.frequency ? P.frequency : 8;
var axes = P.axes ? P.axes : "both";
var expr = "w = wiggle(" + freq + "," + amt + ");";
if (axes === "x") expr += " [w[0], value[1]]";
else if (axes === "y") expr += " [value[0], w[1]]";
else expr += " w";
pos.expression = expr;
return { recipe: "wiggle_position", layer: layer.name, expression: expr };
`
  },
  {
    name: 'push_in',
    summary: 'Slow push-in (zoom) on a layer over its duration, optionally zooming toward a focus point such as a face so the subject stays framed. Replaces scale (and position, when focus is given) keyframes.',
    tags: ['zoom', 'push', 'push-in', 'scale', 'framing', 'motion', 'face', 'subject'],
    inputSchema: {
      type: 'object',
      properties: {
        ...LAYER_REF,
        from: { type: 'number', exclusiveMinimum: 0, description: 'Start zoom as a multiplier of the current scale, in %. Default 100' },
        to: { type: 'number', exclusiveMinimum: 0, description: 'End zoom multiplier in %. Default 108' },
        start: { type: 'number', description: 'Start time in seconds. Default: layer in point' },
        end: { type: 'number', description: 'End time in seconds. Default: layer out point' },
        focusX: { type: 'number', minimum: 0, maximum: 1, description: 'Zoom target X as a fraction of comp width (for example the face). Omit to zoom about the layer position' },
        focusY: { type: 'number', minimum: 0, maximum: 1, description: 'Zoom target Y as a fraction of comp height' },
        easing: { type: 'string', enum: ['easeInOut', 'linear'], description: 'Default easeInOut' }
      },
      anyOf: LAYER_REQUIRED
    },
    body: `
var comp = aeFindComp(P);
var layer = aeFindLayer(comp, P);
var t0 = (P.start !== undefined) ? P.start : layer.inPoint;
var t1 = (P.end !== undefined) ? P.end : layer.outPoint;
if (t1 <= t0) throw new Error("end must be after start");
var from = (P.from ? P.from : 100) / 100;
var to = (P.to ? P.to : 108) / 100;
var tr = layer.property("ADBE Transform Group");
var sp = tr.property("ADBE Scale");
var base = sp.value;
aeClearKeys(sp);
sp.setValueAtTime(t0, aeScaleBy(base, from));
sp.setValueAtTime(t1, aeScaleBy(base, to));
var moved = false;
if (P.focusX !== undefined && P.focusY !== undefined) {
  var pp = tr.property("ADBE Position");
  var p0 = pp.value;
  var fx = comp.width * P.focusX;
  var fy = comp.height * P.focusY;
  var k = to / from;
  aeClearKeys(pp);
  pp.setValueAtTime(t0, p0);
  var end = [fx + (p0[0] - fx) * k, fy + (p0[1] - fy) * k];
  if (p0.length > 2) end.push(p0[2]);
  pp.setValueAtTime(t1, end);
  if (P.easing !== "linear") aeEaseKeys(pp, 40);
  moved = true;
}
if (P.easing !== "linear") aeEaseKeys(sp, 40);
return { recipe: "push_in", layer: layer.name, from: from * 100, to: to * 100, start: t0, end: t1, positionAnimated: moved };
`
  },
  {
    name: 'caption_layer',
    summary: 'Add one styled caption text layer (centred in the caption band, auto-shrunk to fit, short pop-in).',
    tags: ['caption', 'subtitle', 'text', 'title', 'pop'],
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1 },
        compName: LAYER_REF.compName,
        start: { type: 'number', minimum: 0, description: 'Start time in seconds. Default 0' },
        duration: { type: 'number', exclusiveMinimum: 0, description: 'Seconds. Default 2' },
        ...CAPTION_STYLE
      },
      required: ['text']
    },
    body: `
var comp = aeFindComp(P);
var start = P.start ? P.start : 0;
var dur = P.duration ? P.duration : 2;
var layer = aeMakeCaption(comp, P.text, start, dur, P);
return { recipe: "caption_layer", layer: layer.name, index: layer.index, start: start, end: start + dur };
`
  },
  {
    name: 'captions_from_srt',
    summary: 'Create one styled caption layer per cue of an SRT file or SRT text. Same style options as caption_layer, plus a time offset.',
    tags: ['caption', 'subtitle', 'srt', 'text', 'batch'],
    inputSchema: {
      type: 'object',
      properties: {
        srt: { type: 'string', description: 'SRT content. Use this or srtPath' },
        srtPath: { type: 'string', description: 'Path to an .srt file. Use this or srt' },
        compName: LAYER_REF.compName,
        offset: { type: 'number', description: 'Seconds added to every cue time. Default 0' },
        maxCues: { type: 'integer', minimum: 1, maximum: 1000, description: 'Safety cap. Default 300' },
        ...CAPTION_STYLE
      },
      anyOf: [{ required: ['srt'] }, { required: ['srtPath'] }]
    },
    body: `
var comp = aeFindComp(P);
var raw = P.srt;
if (!raw) {
  var f = new File(P.srtPath);
  if (!f.exists) throw new Error("SRT file not found: " + P.srtPath);
  f.encoding = "UTF-8";
  f.open("r");
  raw = f.read();
  f.close();
}
raw = String(raw).replace(/\\r/g, "");
var blocks = raw.split(/\\n\\s*\\n/);
var offset = P.offset ? P.offset : 0;
var cap = P.maxCues ? P.maxCues : 300;
var re = /(\\d+):(\\d+):(\\d+)[,.](\\d+)\\s*-->\\s*(\\d+):(\\d+):(\\d+)[,.](\\d+)/;
function secs(h, m, s, ms) { return (+h) * 3600 + (+m) * 60 + (+s) + (+ms) / 1000; }
var made = [];
for (var b = 0; b < blocks.length && made.length < cap; b++) {
  var lines = blocks[b].split("\\n");
  var ti = -1;
  for (var i = 0; i < lines.length; i++) { if (re.test(lines[i])) { ti = i; break; } }
  if (ti < 0) continue;
  var m = re.exec(lines[ti]);
  var s0 = secs(m[1], m[2], m[3], m[4]) + offset;
  var s1 = secs(m[5], m[6], m[7], m[8]) + offset;
  var text = lines.slice(ti + 1).join("\\r");
  if (text.replace(/\\s/g, "") === "" || s1 <= s0) continue;
  var layer = aeMakeCaption(comp, text, s0, s1 - s0, P);
  made.push(layer.name);
}
return { recipe: "captions_from_srt", created: made.length, comp: comp.name };
`
  },
  {
    name: 'fade_in_out',
    summary: 'Fade a layer in and out with opacity keyframes. Replaces existing opacity keyframes.',
    tags: ['fade', 'opacity', 'transition', 'in', 'out'],
    inputSchema: {
      type: 'object',
      properties: {
        ...LAYER_REF,
        fadeIn: { type: 'number', minimum: 0, description: 'Seconds. Default 0.2, 0 disables' },
        fadeOut: { type: 'number', minimum: 0, description: 'Seconds. Default 0.2, 0 disables' }
      },
      anyOf: LAYER_REQUIRED
    },
    body: `
var comp = aeFindComp(P);
var layer = aeFindLayer(comp, P);
var fi = (P.fadeIn === undefined) ? 0.2 : P.fadeIn;
var fo = (P.fadeOut === undefined) ? 0.2 : P.fadeOut;
var op = layer.property("ADBE Transform Group").property("ADBE Opacity");
var full = op.numKeys === 0 ? op.value : 100;
aeClearKeys(op);
var a = layer.inPoint, z = layer.outPoint;
if (fi > 0) { op.setValueAtTime(a, 0); op.setValueAtTime(a + fi, full); }
if (fo > 0) { op.setValueAtTime(z - fo, full); op.setValueAtTime(z, 0); }
return { recipe: "fade_in_out", layer: layer.name, fadeIn: fi, fadeOut: fo };
`
  }
];

const validatorFactory = new AjvJsonSchemaValidator();
const validators = new Map<string, ReturnType<AjvJsonSchemaValidator['getValidator']>>();
for (const recipe of RECIPES) {
  validators.set(recipe.name, validatorFactory.getValidator(recipe.inputSchema as any));
}

function toExtendScriptLiteral(value: unknown): string {
  // JSON is a valid ES3 object literal once U+2028/2029 are escaped.
  return JSON.stringify(value ?? {})
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function findRecipe(name: string): Recipe | undefined {
  return RECIPES.find(recipe => recipe.name === name);
}

export function buildRecipeScript(name: string, params: unknown): string {
  const recipe = findRecipe(name);
  if (!recipe) {
    throw new Error('Unknown recipe: ' + name + '. Available: ' + RECIPES.map(r => r.name).join(', '));
  }
  const input = (params ?? {}) as Record<string, unknown>;
  const result = validators.get(name)!(input);
  if (!result.valid) throw new Error('Invalid parameters for recipe ' + name + ': ' + result.errorMessage);
  return (
    '(function () {\n' +
    'var P = ' + toExtendScriptLiteral(input) + ';\n' +
    HELPERS +
    recipe.body +
    '\n})();'
  );
}
