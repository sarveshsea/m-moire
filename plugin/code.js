/**
 * Mémoire — Plugin Main Thread (code.js)
 *
 * Runs in Figma's sandboxed environment with access to figma.* API.
 * Communicates with ui.html via postMessage, which bridges to BOTH:
 *   - Mémoire engine (WebSocket)
 *   - figma-console MCP (WebSocket, auto-detected via SERVER_HELLO)
 *
 * This plugin replaces the separate "Figma Desktop Bridge" plugin —
 * all figma-console MCP commands are handled natively here.
 */

var PLUGIN_VERSION = '1.0.0';

// ── State ──────────────────────────────────────────────────

const state = {
  selectionListenerActive: true,
  changeBuffer: [],
  maxChangeBuffer: 200,
  lastSelectionUpdate: 0,
  selectionThrottleMs: 250,
};

var __editorType = figma.editorType || 'figma';

// ── Show UI ────────────────────────────────────────────────

figma.showUI(__html__, {
  width: 420,
  height: 640,
  title: "Mémoire",
  themeColors: true,
});

// ── Console Capture ────────────────────────────────────────
// Intercept console.* and forward to ui.html for figma-console MCP

(function() {
  var levels = ['log', 'info', 'warn', 'error', 'debug'];
  var originals = {};
  for (var i = 0; i < levels.length; i++) {
    originals[levels[i]] = console[levels[i]];
  }

  function safeSerialize(val) {
    if (val === null || val === undefined) return val;
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
    try { return JSON.parse(JSON.stringify(val)); } catch (e) { return String(val); }
  }

  for (var i = 0; i < levels.length; i++) {
    (function(level) {
      console[level] = function() {
        originals[level].apply(console, arguments);
        var args = [];
        var parts = [];
        for (var j = 0; j < arguments.length; j++) {
          args.push(safeSerialize(arguments[j]));
          parts.push(typeof arguments[j] === 'string' ? arguments[j] : String(arguments[j]));
        }
        figma.ui.postMessage({
          type: 'CONSOLE_CAPTURE',
          level: level,
          message: parts.join(' '),
          args: args,
          timestamp: Date.now()
        });
      };
    })(levels[i]);
  }
})();

// ── Hex Color Helper ───────────────────────────────────────

function hexToFigmaRGB(hex) {
  hex = hex.replace(/^#/, '');
  if (!/^[0-9A-Fa-f]+$/.test(hex)) {
    throw new Error('Invalid hex color: "' + hex + '"');
  }
  var r, g, b, a = 1;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16) / 255;
    g = parseInt(hex[1] + hex[1], 16) / 255;
    b = parseInt(hex[2] + hex[2], 16) / 255;
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
  } else if (hex.length === 8) {
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
    a = parseInt(hex.substring(6, 8), 16) / 255;
  } else {
    throw new Error('Invalid hex color format: "' + hex + '"');
  }
  return { r: r, g: g, b: b, a: a };
}

// ── Serialization Helpers ──────────────────────────────────

function serializeVariable(v) {
  return {
    id: v.id, name: v.name, key: v.key, resolvedType: v.resolvedType,
    valuesByMode: v.valuesByMode, variableCollectionId: v.variableCollectionId,
    scopes: v.scopes, codeSyntax: v.codeSyntax || {},
    description: v.description, hiddenFromPublishing: v.hiddenFromPublishing
  };
}

function serializeCollection(c) {
  return {
    id: c.id, name: c.name, key: c.key, modes: c.modes,
    defaultModeId: c.defaultModeId, variableIds: c.variableIds
  };
}

function serializeNode(node) {
  const data = {
    id: node.id, name: node.name, type: node.type,
    visible: node.visible !== false,
  };
  if ("x" in node) data.x = node.x;
  if ("y" in node) data.y = node.y;
  if ("width" in node) data.width = node.width;
  if ("height" in node) data.height = node.height;
  if ("characters" in node) data.characters = node.characters;
  if ("fills" in node && Array.isArray(node.fills)) {
    data.fills = node.fills.map((f) => ({
      type: f.type,
      color: f.color ? { r: f.color.r, g: f.color.g, b: f.color.b, a: f.opacity !== undefined ? f.opacity : 1 } : null,
    }));
  }
  if ("opacity" in node) data.opacity = node.opacity;
  if ("rotation" in node) data.rotation = node.rotation;
  if ("cornerRadius" in node) data.cornerRadius = node.cornerRadius;
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    data.description = node.description;
  }
  if ("children" in node) data.childCount = node.children.length;
  return data;
}

// ── Sticky Colors (FigJam) ─────────────────────────────────

var __stickyColors = {
  'YELLOW': { r: 1, g: 0.85, b: 0.4 },
  'BLUE': { r: 0.53, g: 0.78, b: 1 },
  'GREEN': { r: 0.55, g: 0.87, b: 0.53 },
  'PINK': { r: 1, g: 0.6, b: 0.78 },
  'ORANGE': { r: 1, g: 0.71, b: 0.42 },
  'PURPLE': { r: 0.78, g: 0.65, b: 1 },
  'RED': { r: 1, g: 0.55, b: 0.55 },
  'LIGHT_GRAY': { r: 0.9, g: 0.9, b: 0.9 },
  'GRAY': { r: 0.7, g: 0.7, b: 0.7 }
};

// ── Initialization ─────────────────────────────────────────

(async () => {
  await figma.loadAllPagesAsync();

  // Immediately fetch and send variables data to UI
  if (__editorType !== 'figjam' && __editorType !== 'slides') {
    try {
      const variables = await figma.variables.getLocalVariablesAsync();
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      figma.ui.postMessage({
        type: 'VARIABLES_DATA',
        data: {
          success: true, timestamp: Date.now(), fileKey: figma.fileKey || null,
          variables: variables.map(serializeVariable),
          variableCollections: collections.map(serializeCollection)
        }
      });
    } catch (e) { /* non-critical */ }
  }

  // ── Event Listeners ────────────────────────────────────────

  figma.on("selectionchange", () => {
    if (!state.selectionListenerActive) return;
    const now = Date.now();
    if (now - state.lastSelectionUpdate < state.selectionThrottleMs) return;
    state.lastSelectionUpdate = now;
    const selection = figma.currentPage.selection;
    const data = selection.map(serializeNode);
    figma.ui.postMessage({
      type: "selection-changed",
      data: { count: selection.length, nodes: data, page: figma.currentPage.name },
    });
    // Also send in figma-console format
    figma.ui.postMessage({
      type: 'SELECTION_CHANGE',
      data: { selectedNodeIds: selection.map(n => n.id), selectedNodeCount: selection.length }
    });
  });

  figma.on("currentpagechange", () => {
    figma.ui.postMessage({
      type: "page-changed",
      data: { page: figma.currentPage.name, pageId: figma.currentPage.id },
    });
    figma.ui.postMessage({
      type: 'PAGE_CHANGE',
      data: { pageName: figma.currentPage.name, pageId: figma.currentPage.id }
    });
  });

  figma.on("documentchange", (event) => {
    const changes = event.documentChanges.map((c) => ({
      type: c.type, id: c.id, origin: c.origin,
    }));
    state.changeBuffer.push(...changes);
    if (state.changeBuffer.length > state.maxChangeBuffer) {
      state.changeBuffer = state.changeBuffer.slice(-state.maxChangeBuffer);
    }
    figma.ui.postMessage({
      type: "document-changed",
      data: { changes: changes.length, buffered: state.changeBuffer.length },
    });
    figma.ui.postMessage({
      type: 'DOCUMENT_CHANGE',
      data: { hasNodeChanges: true, changeCount: changes.length, timestamp: Date.now() }
    });
  });

  figma.ui.postMessage({ type: "ready", data: { pages: figma.root.children.length } });
})();

// ── Message Handler ────────────────────────────────────────
// Routes messages from BOTH Mémoire CLI and figma-console MCP

figma.ui.onmessage = async (msg) => {
  const { type, id, method, params } = msg;

  // ── Mémoire Protocol (type: 'command', method: '...') ──────
  if (type === "command") {
    try {
      const result = await handleMémoireCommand(method, params || {});
      figma.ui.postMessage({ type: "command-response", id, result });
    } catch (err) {
      figma.ui.postMessage({ type: "command-response", id, error: String(err) });
    }
    return;
  }

  if (type === "ping") {
    figma.ui.postMessage({
      type: "pong",
      data: {
        file: figma.root.name, fileKey: figma.fileKey,
        page: figma.currentPage.name, editor: figma.editorType,
        selection: figma.currentPage.selection.length,
      },
    });
    return;
  }

  if (type === "chat-to-terminal") {
    figma.ui.postMessage({ type: "chat-sent", id, data: { ok: true } });
    return;
  }

  // ── Figma-Console Protocol (type = command name, e.g. 'EXECUTE_CODE') ──
  // These come from the figma-console MCP via our WebSocket bridge
  if (type && type === type.toUpperCase() && type.length > 3) {
    await handleFigmaConsoleCommand(msg);
    return;
  }
};

// ── Mémoire Command Router ────────────────────────────────────

async function handleMémoireCommand(method, params) {
  switch (method) {
    case "execute":
      return executeCode(params.code);
    case "getSelection":
      return figma.currentPage.selection.map(serializeNode);
    case "getFileData":
      return getFileData(params.depth || 3);
    case "getVariables":
      return getVariables();
    case "getComponents":
      return getComponents();
    case "getStyles":
      return getStyles();
    case "getStickies":
      return getStickies();
    case "getChanges":
      const changes = [...state.changeBuffer];
      state.changeBuffer = [];
      return changes;
    case "getComponentImage":
      return getComponentImage(params.nodeId, params.format);
    case "createNode":
      return createNode(params);
    case "updateNode":
      return updateNode(params);
    case "deleteNode":
      return deleteNode(params.nodeId);
    case "setSelection":
      return setSelection(params.nodeIds);
    case "navigateTo":
      return navigateTo(params.nodeId);
    case "getPageList":
      return figma.root.children.map((p) => ({ id: p.id, name: p.name }));
    case "getPageTree":
      return getPageTree(params.depth || 2);
    default:
      throw new Error(`Unknown command: ${method}`);
  }
}

// ══════════════════════════════════════════════════════════════
// FIGMA-CONSOLE MCP COMMAND HANDLER
// Handles ALL commands from the figma-console MCP server,
// eliminating the need for the separate "Figma Desktop Bridge" plugin.
// ══════════════════════════════════════════════════════════════

async function handleFigmaConsoleCommand(msg) {
  const t = msg.type;
  const rid = msg.requestId;

  function ok(data) {
    figma.ui.postMessage(Object.assign({ type: t + '_RESULT', requestId: rid, success: true }, data));
  }
  function fail(err) {
    var errorMsg = err && err.message ? err.message : String(err);
    figma.ui.postMessage({ type: t + '_RESULT', requestId: rid, success: false, error: errorMsg });
  }

  try {
    switch (t) {

    // ── Code Execution ─────────────────────────────────────
    case 'EXECUTE_CODE': {
      var code = msg.code;
      if (typeof code !== 'string' || code.trim().length === 0) throw new Error('Code must be a non-empty string');
      if (code.length > 100000) throw new Error('Code exceeds maximum length (100KB)');

      var timeoutMs = msg.timeout || 5000;
      var timeoutPromise = new Promise(function(_, reject) {
        setTimeout(function() { reject(new Error('Execution timed out after ' + timeoutMs + 'ms')); }, timeoutMs);
      });

      var codePromise;
      try {
        codePromise = eval("(async function() {\n" + code + "\n})()");
      } catch (syntaxError) {
        ok({ result: null, error: 'Syntax error: ' + (syntaxError.message || String(syntaxError)) });
        return;
      }

      var result = await Promise.race([codePromise, timeoutPromise]);
      ok({ result: result, fileContext: { fileName: figma.root.name, fileKey: figma.fileKey || null } });
      break;
    }

    // ── Variable Operations ────────────────────────────────
    case 'UPDATE_VARIABLE': {
      var variable = await figma.variables.getVariableByIdAsync(msg.variableId);
      if (!variable) throw new Error('Variable not found: ' + msg.variableId);
      var value = msg.value;
      if (typeof value === 'string' && value.startsWith('VariableID:')) {
        value = { type: 'VARIABLE_ALIAS', id: value };
      } else if (variable.resolvedType === 'COLOR' && typeof value === 'string') {
        value = hexToFigmaRGB(value);
      }
      variable.setValueForMode(msg.modeId, value);
      ok({ variable: serializeVariable(variable) });
      break;
    }

    case 'CREATE_VARIABLE': {
      var collection = await figma.variables.getVariableCollectionByIdAsync(msg.collectionId);
      if (!collection) throw new Error('Collection not found: ' + msg.collectionId);
      var newVar = figma.variables.createVariable(msg.name, collection, msg.resolvedType);
      if (msg.valuesByMode) {
        for (var modeId in msg.valuesByMode) {
          var val = msg.valuesByMode[modeId];
          if (msg.resolvedType === 'COLOR' && typeof val === 'string') val = hexToFigmaRGB(val);
          newVar.setValueForMode(modeId, val);
        }
      }
      if (msg.description) newVar.description = msg.description;
      if (msg.scopes) newVar.scopes = msg.scopes;
      ok({ variable: serializeVariable(newVar) });
      break;
    }

    case 'CREATE_VARIABLE_COLLECTION': {
      var col = figma.variables.createVariableCollection(msg.name);
      if (msg.initialModeName && col.modes.length > 0) col.renameMode(col.modes[0].modeId, msg.initialModeName);
      if (msg.additionalModes) {
        for (var i = 0; i < msg.additionalModes.length; i++) col.addMode(msg.additionalModes[i]);
      }
      ok({ collection: serializeCollection(col) });
      break;
    }

    case 'DELETE_VARIABLE': {
      var dv = await figma.variables.getVariableByIdAsync(msg.variableId);
      if (!dv) throw new Error('Variable not found: ' + msg.variableId);
      var dvInfo = { id: dv.id, name: dv.name };
      dv.remove();
      ok({ deleted: dvInfo });
      break;
    }

    case 'DELETE_VARIABLE_COLLECTION': {
      var dc = await figma.variables.getVariableCollectionByIdAsync(msg.collectionId);
      if (!dc) throw new Error('Collection not found: ' + msg.collectionId);
      var dcInfo = { id: dc.id, name: dc.name };
      dc.remove();
      ok({ deleted: dcInfo });
      break;
    }

    case 'RENAME_VARIABLE': {
      var rv = await figma.variables.getVariableByIdAsync(msg.variableId);
      if (!rv) throw new Error('Variable not found: ' + msg.variableId);
      var oldName = rv.name;
      rv.name = msg.newName;
      ok({ variable: serializeVariable(rv), oldName: oldName });
      break;
    }

    case 'SET_VARIABLE_DESCRIPTION': {
      var sv = await figma.variables.getVariableByIdAsync(msg.variableId);
      if (!sv) throw new Error('Variable not found: ' + msg.variableId);
      sv.description = msg.description || '';
      ok({ variable: serializeVariable(sv) });
      break;
    }

    case 'ADD_MODE': {
      var amc = await figma.variables.getVariableCollectionByIdAsync(msg.collectionId);
      if (!amc) throw new Error('Collection not found: ' + msg.collectionId);
      var newModeId = amc.addMode(msg.modeName);
      ok({ collection: serializeCollection(amc), newMode: { modeId: newModeId, name: msg.modeName } });
      break;
    }

    case 'RENAME_MODE': {
      var rmc = await figma.variables.getVariableCollectionByIdAsync(msg.collectionId);
      if (!rmc) throw new Error('Collection not found: ' + msg.collectionId);
      rmc.renameMode(msg.modeId, msg.newName);
      ok({ collection: serializeCollection(rmc) });
      break;
    }

    case 'REFRESH_VARIABLES': {
      var rvars = await figma.variables.getLocalVariablesAsync();
      var rcols = await figma.variables.getLocalVariableCollectionsAsync();
      var vdata = {
        success: true, timestamp: Date.now(), fileKey: figma.fileKey || null,
        variables: rvars.map(serializeVariable),
        variableCollections: rcols.map(serializeCollection)
      };
      figma.ui.postMessage({ type: 'VARIABLES_DATA', data: vdata });
      ok({ data: vdata });
      break;
    }

    // ── Component Operations ───────────────────────────────
    case 'GET_COMPONENT': {
      var gcn = await figma.getNodeByIdAsync(msg.nodeId);
      if (!gcn) throw new Error('Node not found: ' + msg.nodeId);
      var isVariant = gcn.type === 'COMPONENT' && gcn.parent && gcn.parent.type === 'COMPONENT_SET';
      var gcData = {
        success: true, timestamp: Date.now(), nodeId: msg.nodeId,
        component: {
          id: gcn.id, name: gcn.name, type: gcn.type,
          description: gcn.description || null,
          visible: gcn.visible, locked: gcn.locked,
          annotations: gcn.annotations || [], isVariant: isVariant,
          componentPropertyDefinitions: (gcn.type === 'COMPONENT_SET' || (gcn.type === 'COMPONENT' && !isVariant)) ? gcn.componentPropertyDefinitions : undefined,
          children: gcn.children ? gcn.children.reduce(function(acc, child) {
            try { acc.push({ id: child.id, name: child.name, type: child.type }); } catch(e) {}
            return acc;
          }, []) : undefined
        }
      };
      // Send as COMPONENT_DATA for compatibility
      figma.ui.postMessage({ type: 'COMPONENT_DATA', requestId: rid, data: gcData });
      return; // Don't send _RESULT
    }

    case 'GET_LOCAL_COMPONENTS': {
      var components = [];
      var componentSets = [];
      function findComps(node) {
        if (!node) return;
        if (node.type === 'COMPONENT_SET') {
          var axes = {};
          var variants = [];
          if (node.children) {
            node.children.forEach(function(child) {
              try {
                if (child.type === 'COMPONENT') {
                  var vp = {};
                  child.name.split(',').forEach(function(part) {
                    var kv = part.trim().split('=');
                    if (kv.length === 2) {
                      vp[kv[0].trim()] = kv[1].trim();
                      if (!axes[kv[0].trim()]) axes[kv[0].trim()] = [];
                      if (axes[kv[0].trim()].indexOf(kv[1].trim()) === -1) axes[kv[0].trim()].push(kv[1].trim());
                    }
                  });
                  variants.push({ key: child.key, nodeId: child.id, name: child.name, description: child.description || null, variantProperties: vp, width: child.width, height: child.height });
                }
              } catch(e) {}
            });
          }
          componentSets.push({
            key: node.key, nodeId: node.id, name: node.name, type: 'COMPONENT_SET',
            description: node.description || null,
            variantAxes: Object.keys(axes).map(function(k) { return { name: k, values: axes[k] }; }),
            variants: variants, defaultVariant: variants[0] || null,
            properties: node.componentPropertyDefinitions ? Object.keys(node.componentPropertyDefinitions).map(function(pn) { var pd = node.componentPropertyDefinitions[pn]; return { name: pn, type: pd.type, defaultValue: pd.defaultValue }; }) : []
          });
        } else if (node.type === 'COMPONENT') {
          if (!node.parent || node.parent.type !== 'COMPONENT_SET') {
            components.push({ key: node.key, nodeId: node.id, name: node.name, type: 'COMPONENT', description: node.description || null, width: node.width, height: node.height });
          }
        }
        if (node.children) node.children.forEach(function(c) { try { findComps(c); } catch(e) {} });
      }
      figma.root.children.forEach(function(page) { findComps(page); });
      ok({ data: { components: components, componentSets: componentSets, totalComponents: components.length, totalComponentSets: componentSets.length, fileName: figma.root.name, fileKey: figma.fileKey || null, timestamp: Date.now() } });
      break;
    }

    case 'INSTANTIATE_COMPONENT': {
      var component = null;
      if (msg.componentKey) {
        try { component = await figma.importComponentByKeyAsync(msg.componentKey); } catch(e) {}
        if (!component) {
          try {
            var setResult = await figma.importComponentSetByKeyAsync(msg.componentKey);
            if (setResult && setResult.type === 'COMPONENT_SET') component = setResult.defaultVariant || setResult.children[0];
          } catch(e) {}
        }
      }
      if (!component && msg.nodeId) {
        var icNode = await figma.getNodeByIdAsync(msg.nodeId);
        if (icNode) {
          if (icNode.type === 'COMPONENT') component = icNode;
          else if (icNode.type === 'COMPONENT_SET' && icNode.children && icNode.children.length > 0) component = icNode.defaultVariant || icNode.children[0];
        }
      }
      if (!component) throw new Error('Component not found. Use figma_search_components for fresh IDs.');
      var inst = component.createInstance();
      if (msg.position) { inst.x = msg.position.x || 0; inst.y = msg.position.y || 0; }
      if (msg.size) inst.resize(msg.size.width, msg.size.height);
      if (msg.overrides) { for (var pn in msg.overrides) { try { inst.setProperties({ [pn]: msg.overrides[pn] }); } catch(e) {} } }
      if (msg.parentId) { var ip = await figma.getNodeByIdAsync(msg.parentId); if (ip && 'appendChild' in ip) ip.appendChild(inst); }
      ok({ instance: { id: inst.id, name: inst.name, x: inst.x, y: inst.y, width: inst.width, height: inst.height } });
      break;
    }

    // ── Node Operations ────────────────────────────────────
    case 'SET_NODE_DESCRIPTION': {
      var sdn = await figma.getNodeByIdAsync(msg.nodeId);
      if (!sdn) throw new Error('Node not found: ' + msg.nodeId);
      sdn.description = msg.description || '';
      if (msg.descriptionMarkdown && 'descriptionMarkdown' in sdn) sdn.descriptionMarkdown = msg.descriptionMarkdown;
      ok({ node: { id: sdn.id, name: sdn.name, description: sdn.description } });
      break;
    }

    case 'ADD_COMPONENT_PROPERTY': {
      var acpn = await figma.getNodeByIdAsync(msg.nodeId);
      if (!acpn) throw new Error('Node not found: ' + msg.nodeId);
      var opts = msg.preferredValues ? { preferredValues: msg.preferredValues } : undefined;
      var propNameId = acpn.addComponentProperty(msg.propertyName, msg.propertyType, msg.defaultValue, opts);
      ok({ propertyName: propNameId });
      break;
    }

    case 'EDIT_COMPONENT_PROPERTY': {
      var ecpn = await figma.getNodeByIdAsync(msg.nodeId);
      if (!ecpn) throw new Error('Node not found: ' + msg.nodeId);
      var editedProp = ecpn.editComponentProperty(msg.propertyName, msg.newValue);
      ok({ propertyName: editedProp });
      break;
    }

    case 'DELETE_COMPONENT_PROPERTY': {
      var dcpn = await figma.getNodeByIdAsync(msg.nodeId);
      if (!dcpn) throw new Error('Node not found: ' + msg.nodeId);
      dcpn.deleteComponentProperty(msg.propertyName);
      ok({});
      break;
    }

    case 'RESIZE_NODE': {
      var rn = await figma.getNodeByIdAsync(msg.nodeId);
      if (!rn) throw new Error('Node not found: ' + msg.nodeId);
      if (!('resize' in rn)) throw new Error('Node does not support resize');
      if (msg.withConstraints !== false) rn.resize(msg.width, msg.height);
      else rn.resizeWithoutConstraints(msg.width, msg.height);
      ok({ node: { id: rn.id, name: rn.name, width: rn.width, height: rn.height } });
      break;
    }

    case 'MOVE_NODE': {
      var mn = await figma.getNodeByIdAsync(msg.nodeId);
      if (!mn) throw new Error('Node not found: ' + msg.nodeId);
      mn.x = msg.x; mn.y = msg.y;
      ok({ node: { id: mn.id, name: mn.name, x: mn.x, y: mn.y } });
      break;
    }

    case 'SET_NODE_FILLS': {
      var sfn = await figma.getNodeByIdAsync(msg.nodeId);
      if (!sfn) throw new Error('Node not found: ' + msg.nodeId);
      var pf = msg.fills.map(function(fill) {
        if (fill.type === 'SOLID' && typeof fill.color === 'string') {
          var rgb = hexToFigmaRGB(fill.color);
          return { type: 'SOLID', color: { r: rgb.r, g: rgb.g, b: rgb.b }, opacity: rgb.a !== undefined ? rgb.a : (fill.opacity !== undefined ? fill.opacity : 1) };
        }
        return fill;
      });
      sfn.fills = pf;
      ok({ node: { id: sfn.id, name: sfn.name } });
      break;
    }

    case 'SET_NODE_STROKES': {
      var ssn = await figma.getNodeByIdAsync(msg.nodeId);
      if (!ssn) throw new Error('Node not found: ' + msg.nodeId);
      var ps = msg.strokes.map(function(s) {
        if (s.type === 'SOLID' && typeof s.color === 'string') {
          var rgb = hexToFigmaRGB(s.color);
          return { type: 'SOLID', color: { r: rgb.r, g: rgb.g, b: rgb.b }, opacity: rgb.a !== undefined ? rgb.a : 1 };
        }
        return s;
      });
      ssn.strokes = ps;
      if (msg.strokeWeight !== undefined) ssn.strokeWeight = msg.strokeWeight;
      ok({ node: { id: ssn.id, name: ssn.name } });
      break;
    }

    case 'SET_NODE_OPACITY': {
      var son = await figma.getNodeByIdAsync(msg.nodeId);
      if (!son) throw new Error('Node not found: ' + msg.nodeId);
      son.opacity = Math.max(0, Math.min(1, msg.opacity));
      ok({ node: { id: son.id, name: son.name, opacity: son.opacity } });
      break;
    }

    case 'SET_NODE_CORNER_RADIUS': {
      var scr = await figma.getNodeByIdAsync(msg.nodeId);
      if (!scr) throw new Error('Node not found: ' + msg.nodeId);
      scr.cornerRadius = msg.radius;
      ok({ node: { id: scr.id, name: scr.name, cornerRadius: scr.cornerRadius } });
      break;
    }

    case 'CLONE_NODE': {
      var cn = await figma.getNodeByIdAsync(msg.nodeId);
      if (!cn) throw new Error('Node not found: ' + msg.nodeId);
      var cloned = cn.clone();
      ok({ node: { id: cloned.id, name: cloned.name, x: cloned.x, y: cloned.y } });
      break;
    }

    case 'DELETE_NODE': {
      var dn = await figma.getNodeByIdAsync(msg.nodeId);
      if (!dn) throw new Error('Node not found: ' + msg.nodeId);
      var dnInfo = { id: dn.id, name: dn.name };
      dn.remove();
      ok({ deleted: dnInfo });
      break;
    }

    case 'RENAME_NODE': {
      var rnn = await figma.getNodeByIdAsync(msg.nodeId);
      if (!rnn) throw new Error('Node not found: ' + msg.nodeId);
      var oldN = rnn.name;
      rnn.name = msg.newName;
      ok({ node: { id: rnn.id, name: rnn.name, oldName: oldN } });
      break;
    }

    case 'SET_TEXT_CONTENT': {
      var stn = await figma.getNodeByIdAsync(msg.nodeId);
      if (!stn) throw new Error('Node not found: ' + msg.nodeId);
      if (stn.type !== 'TEXT') throw new Error('Node must be TEXT. Got: ' + stn.type);
      await figma.loadFontAsync(stn.fontName);
      stn.characters = msg.text;
      if (msg.fontSize) stn.fontSize = msg.fontSize;
      ok({ node: { id: stn.id, name: stn.name, characters: stn.characters } });
      break;
    }

    case 'CREATE_CHILD_NODE': {
      var parent = await figma.getNodeByIdAsync(msg.parentId);
      if (!parent) throw new Error('Parent not found: ' + msg.parentId);
      var props = msg.properties || {};
      var newNode;
      switch (msg.nodeType) {
        case 'RECTANGLE': newNode = figma.createRectangle(); break;
        case 'ELLIPSE': newNode = figma.createEllipse(); break;
        case 'FRAME': newNode = figma.createFrame(); break;
        case 'TEXT':
          newNode = figma.createText();
          await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
          if (props.text) newNode.characters = props.text;
          break;
        case 'LINE': newNode = figma.createLine(); break;
        case 'POLYGON': newNode = figma.createPolygon(); break;
        case 'STAR': newNode = figma.createStar(); break;
        case 'VECTOR': newNode = figma.createVector(); break;
        default: throw new Error('Unsupported node type: ' + msg.nodeType);
      }
      if (props.name) newNode.name = props.name;
      if (props.x !== undefined) newNode.x = props.x;
      if (props.y !== undefined) newNode.y = props.y;
      if (props.width !== undefined && props.height !== undefined) newNode.resize(props.width, props.height);
      if (props.fills) {
        newNode.fills = props.fills.map(function(f) {
          if (f.type === 'SOLID' && typeof f.color === 'string') { var rgb = hexToFigmaRGB(f.color); return { type: 'SOLID', color: { r: rgb.r, g: rgb.g, b: rgb.b }, opacity: rgb.a !== undefined ? rgb.a : 1 }; }
          return f;
        });
      }
      parent.appendChild(newNode);
      ok({ node: { id: newNode.id, name: newNode.name, type: newNode.type, x: newNode.x, y: newNode.y, width: newNode.width, height: newNode.height } });
      break;
    }

    // ── Screenshot ─────────────────────────────────────────
    case 'CAPTURE_SCREENSHOT': {
      var csn = msg.nodeId ? await figma.getNodeByIdAsync(msg.nodeId) : figma.currentPage;
      if (!csn) throw new Error('Node not found: ' + msg.nodeId);
      var format = msg.format || 'PNG';
      var scale = msg.scale || 2;
      var bytes = await csn.exportAsync({ format: format, constraint: { type: 'SCALE', value: scale } });
      var base64 = figma.base64Encode(bytes);
      ok({ image: { base64: base64, format: format, scale: scale, byteLength: bytes.length, node: { id: csn.id, name: csn.name, type: csn.type }, bounds: 'absoluteBoundingBox' in csn ? csn.absoluteBoundingBox : null } });
      break;
    }

    // ── Image Fill ─────────────────────────────────────────
    case 'SET_IMAGE_FILL': {
      var imgBytes = new Uint8Array(msg.imageBytes);
      var image = figma.createImage(imgBytes);
      var fill = { type: 'IMAGE', scaleMode: msg.scaleMode || 'FILL', imageHash: image.hash };
      var nodeIds = msg.nodeIds || (msg.nodeId ? [msg.nodeId] : []);
      var updated = [];
      for (var ni = 0; ni < nodeIds.length; ni++) {
        var ifn = await figma.getNodeByIdAsync(nodeIds[ni]);
        if (ifn && 'fills' in ifn) { ifn.fills = [fill]; updated.push({ id: ifn.id, name: ifn.name }); }
      }
      ok({ imageHash: image.hash, updatedCount: updated.length, nodes: updated });
      break;
    }

    // ── Instance Properties ────────────────────────────────
    case 'SET_INSTANCE_PROPERTIES': {
      var sipn = await figma.getNodeByIdAsync(msg.nodeId);
      if (!sipn) throw new Error('Node not found: ' + msg.nodeId);
      if (sipn.type !== 'INSTANCE') throw new Error('Node must be INSTANCE. Got: ' + sipn.type);
      await sipn.getMainComponentAsync();
      var currentProps = sipn.componentProperties;
      var propsToSet = {};
      var propUpdates = msg.properties || {};
      for (var pname in propUpdates) {
        if (currentProps[pname] !== undefined) {
          propsToSet[pname] = propUpdates[pname];
        } else {
          for (var ep in currentProps) {
            if (ep.startsWith(pname + '#')) { propsToSet[ep] = propUpdates[pname]; break; }
          }
        }
      }
      if (Object.keys(propsToSet).length > 0) sipn.setProperties(propsToSet);
      ok({ instance: { id: sipn.id, name: sipn.name, propertiesSet: Object.keys(propsToSet) } });
      break;
    }

    // ── File Info ──────────────────────────────────────────
    case 'GET_FILE_INFO': {
      var sel = figma.currentPage.selection;
      ok({ fileInfo: {
        fileName: figma.root.name, fileKey: figma.fileKey || null,
        currentPage: figma.currentPage.name, currentPageId: figma.currentPage.id,
        selectionCount: sel ? sel.length : 0, pluginVersion: PLUGIN_VERSION,
        editorType: __editorType
      }});
      break;
    }

    // ── FigJam Operations ──────────────────────────────────
    case 'CREATE_STICKY': {
      var sticky = figma.createSticky();
      if (msg.text) { await figma.loadFontAsync(sticky.text.fontName); sticky.text.characters = msg.text; }
      if (msg.color && __stickyColors[msg.color]) sticky.fills = [{ type: 'SOLID', color: __stickyColors[msg.color] }];
      if (msg.x !== undefined) sticky.x = msg.x;
      if (msg.y !== undefined) sticky.y = msg.y;
      ok({ data: { id: sticky.id, name: sticky.name } });
      break;
    }

    case 'CREATE_STICKIES': {
      var stickies = msg.stickies || [];
      var created = [];
      for (var si = 0; si < stickies.length; si++) {
        var s = stickies[si];
        var st = figma.createSticky();
        if (s.text) { await figma.loadFontAsync(st.text.fontName); st.text.characters = s.text; }
        if (s.color && __stickyColors[s.color]) st.fills = [{ type: 'SOLID', color: __stickyColors[s.color] }];
        if (s.x !== undefined) st.x = s.x;
        if (s.y !== undefined) st.y = s.y;
        created.push({ id: st.id, text: s.text || '' });
      }
      ok({ data: { created: created, count: created.length } });
      break;
    }

    case 'CREATE_CONNECTOR': {
      var conn = figma.createConnector();
      if (msg.startNodeId) {
        var startN = await figma.getNodeByIdAsync(msg.startNodeId);
        if (startN) conn.connectorStart = { endpointNodeId: startN.id, magnet: 'AUTO' };
      }
      if (msg.endNodeId) {
        var endN = await figma.getNodeByIdAsync(msg.endNodeId);
        if (endN) conn.connectorEnd = { endpointNodeId: endN.id, magnet: 'AUTO' };
      }
      if (msg.label) { await figma.loadFontAsync(conn.text.fontName); conn.text.characters = msg.label; }
      ok({ data: { id: conn.id } });
      break;
    }

    case 'CREATE_SHAPE_WITH_TEXT': {
      var shape = figma.createShapeWithText();
      if (msg.text) { await figma.loadFontAsync(shape.text.fontName); shape.text.characters = msg.text; }
      if (msg.shapeType) shape.shapeType = msg.shapeType;
      if (msg.x !== undefined) shape.x = msg.x;
      if (msg.y !== undefined) shape.y = msg.y;
      ok({ data: { id: shape.id, name: shape.name } });
      break;
    }

    case 'CREATE_TABLE': {
      var table = figma.createTable(msg.rows || 3, msg.columns || 3);
      if (msg.x !== undefined) table.x = msg.x;
      if (msg.y !== undefined) table.y = msg.y;
      ok({ data: { id: table.id, name: table.name } });
      break;
    }

    case 'CREATE_CODE_BLOCK': {
      var cb = figma.createCodeBlock();
      if (msg.code) cb.code = msg.code;
      if (msg.language) cb.codeLanguage = msg.language;
      if (msg.x !== undefined) cb.x = msg.x;
      if (msg.y !== undefined) cb.y = msg.y;
      ok({ data: { id: cb.id } });
      break;
    }

    case 'GET_BOARD_CONTENTS': {
      var page = figma.currentPage;
      var items = page.children.map(function(n) {
        try {
          var item = { id: n.id, name: n.name, type: n.type, x: n.x, y: n.y, width: n.width, height: n.height };
          if (n.type === 'STICKY' && n.text) item.text = n.text.characters;
          if (n.type === 'SHAPE_WITH_TEXT' && n.text) item.text = n.text.characters;
          if (n.type === 'CODE_BLOCK') item.code = n.code;
          return item;
        } catch(e) { return null; }
      }).filter(Boolean);
      ok({ data: { items: items, count: items.length } });
      break;
    }

    case 'GET_CONNECTIONS': {
      var connectors = figma.currentPage.findAll(function(n) { return n.type === 'CONNECTOR'; });
      var conns = connectors.map(function(c) {
        try {
          return {
            id: c.id, text: c.text ? c.text.characters : '',
            start: c.connectorStart, end: c.connectorEnd
          };
        } catch(e) { return null; }
      }).filter(Boolean);
      ok({ data: { connections: conns, count: conns.length } });
      break;
    }

    // ── Slides Operations ──────────────────────────────────
    case 'LIST_SLIDES':
    case 'GET_SLIDE_CONTENT':
    case 'CREATE_SLIDE':
    case 'DELETE_SLIDE':
    case 'DUPLICATE_SLIDE':
    case 'GET_SLIDE_GRID':
    case 'REORDER_SLIDES':
    case 'SET_SLIDE_TRANSITION':
    case 'GET_SLIDE_TRANSITION':
    case 'SET_SLIDES_VIEW_MODE':
    case 'GET_FOCUSED_SLIDE':
    case 'FOCUS_SLIDE':
    case 'SKIP_SLIDE':
    case 'ADD_TEXT_TO_SLIDE':
    case 'ADD_SHAPE_TO_SLIDE': {
      // Slides are best handled via EXECUTE_CODE — forward as code execution
      fail('Slides commands require EXECUTE_CODE. Use figma_execute instead.');
      break;
    }

    // ── Lint Design ────────────────────────────────────────
    case 'LINT_DESIGN': {
      // Lint is complex — delegate to EXECUTE_CODE
      fail('Use figma_execute with custom lint code for design auditing.');
      break;
    }

    // ── UI Management ──────────────────────────────────────
    case 'RESIZE_UI': {
      // Ignore — we keep our own UI size
      ok({});
      break;
    }

    case 'RELOAD_UI': {
      ok({});
      break;
    }

    case 'STORE_CLOUD_CONFIG': {
      // No-op for Mémoire plugin
      ok({});
      break;
    }

    case 'BOOT_LOAD_UI':
    case 'BOOT_FALLBACK': {
      // Ignore boot messages — we have our own UI
      return;
    }

    case 'CLEAR_CONSOLE': {
      ok({ cleared: true });
      break;
    }

    default: {
      fail('Unknown figma-console command: ' + t);
      break;
    }

    } // end switch
  } catch (err) {
    fail(err);
  }
}

// ══════════════════════════════════════════════════════════════
// ARK COMMAND IMPLEMENTATIONS
// ══════════════════════════════════════════════════════════════

// ── Execute Safety ────────────────────────────────────────

const BLOCKED_PATTERNS = [
  /figma\.closePlugin/i,
  /figma\.root\.remove/i,
  /while\s*\(\s*true\s*\)/i,
  /for\s*\(\s*;\s*;\s*\)/i,
];

const BLOCKED_KEYWORDS = [
  "closeplugin", "removepage", "__proto__",
  "constructor", "prototype",
  "__defineGetter__", "__defineSetter__",
];

const BLOCKED_GLOBALS = [
  /\bFunction\s*\(/, /\bimport\s*\(/,
  /\brequire\s*\(/, /\bglobalThis\b/,
  /\bself\b/, /\bwindow\b/,
];

function isCodeSafe(code) {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) return { safe: false, reason: `Matches restricted pattern: ${pattern}` };
  }
  const normalized = code.toLowerCase().replace(/[\s'"` +\[\]]/g, "");
  for (const keyword of BLOCKED_KEYWORDS) {
    if (normalized.includes(keyword)) return { safe: false, reason: `Contains blocked keyword: ${keyword}` };
  }
  for (const pattern of BLOCKED_GLOBALS) {
    if (pattern.test(code)) return { safe: false, reason: `Blocked global access: ${pattern}` };
  }
  return { safe: true, reason: null };
}

async function executeCode(code) {
  if (typeof code !== "string" || code.trim().length === 0) throw new Error("Code must be a non-empty string");
  if (code.length > 50000) throw new Error("Code exceeds maximum length (50KB)");
  const check = isCodeSafe(code);
  if (!check.safe) throw new Error(`Blocked: ${check.reason}`);
  const fn = new Function("figma", `"use strict"; return (async () => { ${code} })()`);
  return await fn(figma);
}

function getPageTree(maxDepth) {
  function walkChildren(node, depth) {
    if (depth > maxDepth) return null;
    const data = { id: node.id, name: node.name, type: node.type, visible: node.visible !== false };
    if ("children" in node && node.children) {
      data.children = node.children.map((c) => walkChildren(c, depth + 1)).filter(Boolean);
    }
    return data;
  }
  return {
    fileKey: figma.fileKey, fileName: figma.root.name,
    pages: figma.root.children.map((page) => ({
      id: page.id, name: page.name,
      children: page.children.map((c) => walkChildren(c, 1)).filter(Boolean),
    })),
  };
}

function getFileData(maxDepth) {
  function walk(node, depth) {
    if (depth > maxDepth) return { id: node.id, name: node.name, type: node.type };
    const data = { id: node.id, name: node.name, type: node.type, visible: node.visible !== false };
    if ("children" in node && node.children) data.children = node.children.map((c) => walk(c, depth + 1));
    return data;
  }
  return walk(figma.currentPage, 0);
}

async function getVariables() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const result = [];
  for (const collection of collections) {
    const variables = [];
    for (const varId of collection.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(varId);
      if (!variable) continue;
      variables.push(serializeVariable(variable));
    }
    result.push({ id: collection.id, name: collection.name, modes: collection.modes, variables });
  }
  return { collections: result };
}

function getComponents() {
  const components = figma.currentPage.findAll((n) => n.type === "COMPONENT" || n.type === "COMPONENT_SET");
  return components.map((c) => ({
    id: c.id, name: c.name, type: c.type, description: c.description || "",
    key: c.type === "COMPONENT" ? c.key : undefined,
    variants: c.type === "COMPONENT_SET" && c.children ? c.children.map((v) => ({ id: v.id, name: v.name, key: v.key })) : [],
    componentProperties: "componentPropertyDefinitions" in c ? c.componentPropertyDefinitions : {},
  }));
}

function getStyles() {
  const styles = [];
  for (const s of figma.getLocalPaintStyles()) {
    styles.push({ id: s.id, name: s.name, type: s.type, styleType: "FILL", description: s.description, value: s.paints });
  }
  for (const s of figma.getLocalTextStyles()) {
    styles.push({ id: s.id, name: s.name, type: s.type, styleType: "TEXT", description: s.description, value: { fontName: s.fontName, fontSize: s.fontSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing } });
  }
  for (const s of figma.getLocalEffectStyles()) {
    styles.push({ id: s.id, name: s.name, type: s.type, styleType: "EFFECT", description: s.description, value: s.effects });
  }
  return styles;
}

function getStickies() {
  return figma.currentPage.findAll((n) => n.type === "STICKY").map((s) => ({
    id: s.id, text: s.text ? s.text.characters : "",
    authorName: s.authorName || null, fills: s.fills,
    x: s.x, y: s.y, width: s.width, height: s.height,
  }));
}

async function getComponentImage(nodeId, format) {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  const bytes = await node.exportAsync({ format: (format || "PNG").toUpperCase(), constraint: { type: "SCALE", value: 2 } });
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return { base64: binary, format: format || "png" };
}

async function createNode(params) {
  const { type, name, x, y, width, height, parentId } = params;
  let node;
  switch (type) {
    case "FRAME": node = figma.createFrame(); break;
    case "RECTANGLE": node = figma.createRectangle(); break;
    case "TEXT":
      node = figma.createText();
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      node.characters = params.text || "";
      break;
    case "ELLIPSE": node = figma.createEllipse(); break;
    case "LINE": node = figma.createLine(); break;
    default: throw new Error(`Unsupported node type: ${type}`);
  }
  if (name) node.name = name;
  if (x !== undefined) node.x = x;
  if (y !== undefined) node.y = y;
  if (width && height) node.resize(width, height);
  if (parentId) {
    const parent = await figma.getNodeByIdAsync(parentId);
    if (parent && "appendChild" in parent) parent.appendChild(node);
  }
  return serializeNode(node);
}

async function updateNode(params) {
  const { nodeId, properties } = params;
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  for (const [key, value] of Object.entries(properties)) {
    switch (key) {
      case "name": node.name = value; break;
      case "x": node.x = value; break;
      case "y": node.y = value; break;
      case "width": if ("resize" in node) node.resize(value, node.height); break;
      case "height": if ("resize" in node) node.resize(node.width, value); break;
      case "visible": node.visible = value; break;
      case "opacity": node.opacity = value; break;
      case "rotation": node.rotation = value; break;
      case "characters":
        if (node.type === "TEXT") {
          const fonts = node.getRangeAllFontNames(0, node.characters.length);
          await Promise.all(fonts.map((f) => figma.loadFontAsync(f)));
          node.characters = value;
        }
        break;
      case "fills": if ("fills" in node) node.fills = value; break;
    }
  }
  return serializeNode(node);
}

async function deleteNode(nodeId) {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  node.remove();
  return { deleted: nodeId };
}

function setSelection(nodeIds) {
  const nodes = [];
  for (const id of nodeIds) {
    const node = figma.getNodeById(id);
    if (node && "parent" in node) nodes.push(node);
  }
  figma.currentPage.selection = nodes;
  return { selected: nodes.length };
}

async function navigateTo(nodeId) {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  figma.viewport.scrollAndZoomIntoView([node]);
  return { navigated: nodeId };
}
