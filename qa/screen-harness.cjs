/* global __dirname */
// Executes screen handlers with synthetic hooks/host elements, not a React renderer.
// Does not verify layout, React scheduling, touch dispatch or Android native APIs.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');

exports.screen = function screen(name, mobile) {
  const slots = [];
  let index = 0, effects = [], tree;
  const routes = [];
  const react = {
    useState(initial) {
      const at = index++;
      if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial;
      return [slots[at], value => { slots[at] = typeof value === 'function' ? value(slots[at]) : value; }];
    },
    useRef(value) { const at = index++; return slots[at] ??= { current: value }; },
    useCallback(fn, deps) {
      const at = index++, previous = slots[at];
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) slots[at] = { fn, deps };
      return slots[at].fn;
    },
    useMemo(fn, deps) {
      const at = index++, previous = slots[at];
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) slots[at] = { value: fn(), deps };
      return slots[at].value;
    },
    useEffect(fn, deps) {
      const at = index++, previous = slots[at];
      if (!previous || !deps || deps.some((dep, i) => dep !== previous.deps[i])) {
        slots[at] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[at].cleanup = fn(); });
      }
    },
  };
  const filename = path.resolve(__dirname, `../src/app/${name}.tsx`);
  const cache = new Map();
  const element = (type, props) => ({ type, props });
  const mockRequire = (id, from = filename) => {
    if (id === 'react') return react;
    if (id === 'react/jsx-runtime') return { jsx: element, jsxs: element, Fragment: 'Fragment' };
    if (id === 'react-native') return { Text: 'Text', View: 'View', Image: 'Image', TextInput: 'TextInput', Switch: 'Switch', Linking: { openSettings: async () => {} } };
    if (id === 'expo-router') return { useLocalSearchParams: () => mobile.params || {}, router: { replace: route => routes.push(route), navigate: route => routes.push(route), push: route => routes.push(route) } };
    if (id.endsWith('/MobileProvider')) return { useMobile: () => mobile };
    if (id.endsWith('/theme')) return { colors: {}, ui: {} };
    if (id.endsWith('/demo-data')) return { categoryIds: ['traffic', 'accident', 'waterlogging', 'flood'], categoryLabels: { traffic: 'Trânsito', accident: 'Acidente', waterlogging: 'Alagamento', flood: 'Enchente' }, demoRegions: {} };
    for (const component of ['Button', 'Screen', 'DemoBanner', 'FeedbackState', 'IncidentCard', 'ReportPhoto']) {
      if (id.endsWith('/' + component)) return { [component]: component };
    }
    if (id.startsWith('.')) {
      const target = path.resolve(path.dirname(from), id);
      for (const ext of ['.ts', '.tsx']) if (fs.existsSync(target + ext)) return load(target + ext);
    }
    return createRequire(from)(id);
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} }; cache.set(file, module);
    new Function('require', 'module', 'exports', compiled)(id => mockRequire(id, file), module, module.exports);
    return module.exports;
  }
  const component = load(filename).default;
  const render = () => { index = 0; effects = []; tree = component(); return tree; };
  const nodes = () => {
    const found = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === 'object') { found.push(node); walk(node.props?.children); }
    }
    walk(tree); return found;
  };
  const find = (key, value) => {
    const node = nodes().find(n => n.props?.[key] === value);
    if (!node) throw Error(`Elemento ausente: ${key}=${value}`);
    return node.props;
  };
  async function settle() { await new Promise(resolve => setImmediate(resolve)); render(); }
  render();
  return {
    render, nodes, routes, find,
    text: () => JSON.stringify(tree),
    async press(title) {
      const props = find('title', title);
      if (props.disabled || props.loading) throw Error(`Botão indisponível: ${title}`);
      props.onPress(); await settle();
    },
    change(label, value) {
      const props = find('accessibilityLabel', label);
      if (props.editable === false) throw Error(`Campo indisponível: ${label}`);
      props.onChangeText(value); render();
    },
    async effects() {
      for (let i = 0; i < 10 && effects.length; i++) {
        const pending = effects; effects = [];
        for (const effect of pending) effect();
        await settle();
      }
      if (effects.length) throw Error('Efeitos não estabilizaram no harness');
    },
  };
};
