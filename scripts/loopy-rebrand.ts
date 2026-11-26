#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - A one-shot maintenance script; synchronous Node APIs keep it small.
// Renames the product in user-visible copy from "T3 Code" to "Loopy" and carries every locale's
// translation over to the re-keyed catalog entry. Rerun after each upstream sync:
//
//   vp run loopy:rebrand
//
// It is idempotent: on an already rebranded tree it changes nothing. When an upstream merge
// conflicts in a file that only this script changes, take upstream's side and rerun it.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import ts from "typescript-legacy";

const NAME = "Loopy";
const root = NodePath.resolve(import.meta.dirname, "..");

const SOURCE_ROOTS = [
  "apps/web/src",
  "apps/desktop/src",
  "apps/desktop/gnome-extension",
  "apps/server/src",
  "packages",
];
const SOURCE_EXTENSIONS = /\.(?:ts|tsx|js|mjs|cjs)$/;

// Model-facing text (changing it needs evals), copy that runs inside an agent, and recorded
// provider transcripts keep the upstream name.
const EXCLUDED_PATHS = [
  /^packages\/provider-core\/src\/server\/[^/]*Instructions/,
  /^packages\/provider-core\/src\/server\/textGenerationPrompts/,
  /^apps\/server\/src\/(?:mcp|mcpApps)\//,
  /^apps\/server\/src\/auth\/McpOAuth/,
  /^packages\/contracts\/src\/orchestratorMcp/,
  /^packages\/provider-acp\/src\/server\/mcpOverAcpBridge/,
  /^apps\/server\/src\/feedback\/FeedbackReport/,
  /^apps\/server\/src\/triage\/triagePrompt/,
  /^apps\/server\/src\/policy\/policyTemplates/,
  /^apps\/server\/src\/orchestration-v2\/pullRequestWatch\./,
  /^apps\/server\/src\/orchestration-v2\/ContextHandoffService/,
  /^apps\/server\/src\/device\/AgentDeviceShim/,
  /^packages\/contracts\/src\/orchestrationV2\./,
  /^packages\/provider-pi\/src\/server\/mcpExtensionSource/,
  /^packages\/shared\/src\/themeCss\./,
  // Tests that use the name as data: search titles, tool-name prefixes, client and profile names.
  /^packages\/shared\/src\/(?:paletteSearch|speech|t3McpToolPresentation)\.test\./,
  /^packages\/client-runtime\/src\/authorization\/remote\.test\./,
  /^packages\/provider-testing\/src\/replayWorkspace\.test\./,
  /^apps\/server\/src\/(?:textGeneration\/CodexTextGeneration|orchestration-v2\/Adapters\/AcpAdapterV2)\.test\./,
  /^apps\/desktop\/src\/app\/DesktopUserData\.test\./,
  /\/fixtures?\//,
  /\.fixture\./,
  /^packages\/[^/]+\/(?!src\/)/,
];

// Lines whose "T3 Code" identifies something rather than naming the app to a person: git
// identities, provider client info, the GitHub App, the relay API spec, the CLI shim marker that
// finds earlier installs, and legacy profile folder names.
const IDENTIFIER_LINES =
  /GIT_AUTHOR_NAME|GIT_COMMITTER_NAME|GIT_CONFIG_VALUE|"user\.name"|CODEX_CLIENT_NAME|agent_name_hint|clientInfo|name: "t3-code"|appName: "T3 Code for GitHub"|OpenApi\.Title|MARKER = "|PROFILE_NAMES|legacy: "/;

// Non-code files whose whole text is user-facing.
const TEXT_FILES = [
  "apps/desktop/resources/dmg/dmg-background-latest.svg",
  "apps/desktop/resources/dmg/dmg-background-nightly.svg",
  "apps/desktop/resources/installer.nsh",
  "apps/desktop/resources/linux/io.github.aaf1007.loopy.metainfo.xml",
  "apps/desktop/gnome-extension/metadata.json",
];

const CATALOG_APPS: ReadonlyArray<{ dir: string; generate: readonly [string, ...string[]] }> = [
  { dir: "apps/web", generate: ["node_modules/.bin/gt", "generate"] },
  { dir: "apps/desktop", generate: [process.execPath, "scripts/i18n-generate.mjs"] },
  // Mobile scans packages/shared and packages/client-runtime too, so their strings re-key here.
  { dir: "apps/mobile", generate: ["node_modules/.bin/gt", "generate"] },
];

// Not inside a path, such as "/Applications/T3 Code.app": folders keep their names.
const FULL_NAME = /(?<![/\\])T3(?:\s+|%20)Code\b/g;
// "T3" alone used as the product name. "T3 team" stays: it names the people reports go to.
const BARE_NAME =
  /\bT3(?= (?:[Ss]erver|home|threads?|desktop|process|system footprint|operations|tool|requests)\b)/g;
// Characters of a test string on each side of the name that must match app copy.
const CONTEXT = 12;
const rebrand = (text: string) => text.replace(FULL_NAME, NAME).replace(BARE_NAME, NAME);
const hasProductT3 = (text: string) => /\bT3\b(?![\s-](?:Connect|Chat))/.test(text);

const git = (...args: string[]) =>
  NodeChildProcess.execFileSync("git", args, { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

const run = (cwd: string, [command, ...args]: readonly [string, ...string[]]) => {
  const result = NodeChildProcess.spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed in ${cwd}\n${result.stdout}${result.stderr}`,
    );
  }
};

const scriptKind = (file: string) =>
  file.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : file.endsWith(".ts")
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;

const isContextOption = (node: ts.Node) =>
  ts.isPropertyAssignment(node.parent) &&
  node.parent.initializer === node &&
  ts.isIdentifier(node.parent.name) &&
  node.parent.name.text === "$context";

/** The string, template and JSX text tokens of a file, so comments and code stay put. */
function copyTokens(file: string, text: string) {
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const ranges: Array<readonly [number, number]> = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node) ||
        ts.isJsxText(node)) &&
      !isContextOption(node)
    ) {
      const start = node.getStart(sourceFile);
      const lineStart = text.lastIndexOf("\n", start) + 1;
      const lineEnd = text.indexOf("\n", start);
      if (!IDENTIFIER_LINES.test(text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd))) {
        ranges.push([start, node.getEnd()]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return ranges;
}

/** Rebrands each token, unless `keep` claims one of its matches by the text around it. */
function rebrandTokens(
  text: string,
  ranges: ReadonlyArray<readonly [number, number]>,
  keep?: (context: string, match: string) => boolean,
) {
  let result = "";
  let cursor = 0;
  for (const [start, end] of ranges) {
    const token = text.slice(start, end);
    const kept = [...token.matchAll(FULL_NAME), ...token.matchAll(BARE_NAME)].some(
      ({ 0: match, index }) =>
        keep?.(
          token
            .slice(Math.max(0, index - CONTEXT), index + match.length + CONTEXT)
            .replace(/^[`'"}]+|[`'"${]+$/g, ""),
          match,
        ),
    );
    result += text.slice(cursor, start) + (kept ? token : rebrand(token));
    cursor = end;
  }
  return result + text.slice(cursor);
}

// Catalog values are strings, or JSX trees whose text sits in array items and `c` children.
type CatalogValue =
  | string
  | number
  | boolean
  | null
  | CatalogValue[]
  | { [key: string]: CatalogValue };
type Catalog = Record<string, CatalogValue>;
const STRUCTURAL_KEYS = new Set(["t", "i", "k", "v"]);
const mapText = (value: CatalogValue, map: (text: string) => string): CatalogValue => {
  if (typeof value === "string") return map(value);
  if (Array.isArray(value)) return value.map((item) => mapText(item, map));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        STRUCTURAL_KEYS.has(key) ? item : mapText(item, map),
      ]),
    );
  }
  return value;
};
// A shorter line can make the formatter fold a JSX `{" "}` into the text next to it.
const joinText = (value: CatalogValue): CatalogValue => {
  if (Array.isArray(value)) {
    return value.map(joinText).reduce<CatalogValue[]>((items, item) => {
      const last = items.at(-1);
      if (typeof last === "string" && typeof item === "string")
        items[items.length - 1] = last + item;
      else items.push(item);
      return items;
    }, []);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, joinText(item)]));
  }
  return value;
};
const allText = (value: CatalogValue): string => JSON.stringify(joinText(value));

const readJson = (file: string) => JSON.parse(NodeFS.readFileSync(file, "utf8"));
const writeJson = (file: string, value: unknown) =>
  NodeFS.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

function catalogFiles(app: string) {
  const config = readJson(NodePath.join(root, app, "gt.config.json"));
  const dir = NodePath.join(root, app, NodePath.dirname(config.files.gt.output));
  const file = (locale: string) => NodePath.join(dir, `${locale}.json`);
  return {
    en: file(config.defaultLocale),
    locales: (config.locales as string[]).map((locale) => ({ locale, file: file(locale) })),
  };
}

// 1. Snapshot every catalog before `gt generate` drops the keys whose English changes.
const snapshots = CATALOG_APPS.map((app) => {
  const files = catalogFiles(app.dir);
  return {
    app,
    files,
    en: readJson(files.en) as Catalog,
    locales: new Map(files.locales.map(({ locale, file }) => [locale, readJson(file) as Catalog])),
  };
});

// 2. Rewrite sources and user-facing text files.
const changed: string[] = [];
const inScope = git("ls-files", "--", ...SOURCE_ROOTS).filter(
  (file) => SOURCE_EXTENSIONS.test(file) && !file.includes("/i18n/translations/"),
);
const isExcluded = (file: string) => EXCLUDED_PATHS.some((pattern) => pattern.test(file));
const sources = inScope.filter((file) => !isExcluded(file));
const keptSources = inScope.filter(isExcluded);
// Tests assert on the copy they exercise, so they are rebranded too, except a string whose text
// around the name matches copy this script keeps, such as agent instructions.
const isTest = (file: string) => /\.test\.[^/]+$/.test(file);
const keptText: string[] = [];
const squash = (text: string) => text.replace(/\s+/g, " ");
const write = (file: string, text: string, next: string) => {
  if (next === text) return;
  NodeFS.writeFileSync(NodePath.join(root, file), next);
  changed.push(file);
};
const read = (file: string) => NodeFS.readFileSync(NodePath.join(root, file), "utf8");
for (const file of keptSources.filter((source) => !isTest(source))) {
  const text = read(file);
  if (!/T3\b/.test(text)) continue;
  for (const [start, end] of copyTokens(file, text)) keptText.push(squash(text.slice(start, end)));
}
for (const file of sources.filter((source) => !isTest(source))) {
  const text = read(file);
  if (/T3\b|T3%20Code/.test(text)) write(file, text, rebrandTokens(text, copyTokens(file, text)));
}
for (const file of sources.filter(isTest)) {
  const text = read(file);
  if (!/T3\b/.test(text)) continue;
  const keep = (context: string, match: string) =>
    context.trim() !== match && keptText.some((kept) => kept.includes(squash(context)));
  write(file, text, rebrandTokens(text, copyTokens(file, text), keep));
}
for (const file of TEXT_FILES) {
  const text = read(file);
  write(file, text, text.replace(FULL_NAME, NAME));
}

// Same scan as `vp run i18n:generate`, written to a temp dir: gt reorders keys it did not change.
function generateEn(app: (typeof CATALOG_APPS)[number]) {
  const appDir = NodePath.join(root, app.dir);
  const config = readJson(NodePath.join(appDir, "gt.config.json"));
  const tmp = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "loopy-rebrand-"));
  try {
    const tmpConfig = NodePath.join(tmp, "gt.config.json");
    writeJson(tmpConfig, {
      ...config,
      locales: [],
      files: { gt: { output: `${tmp}/[locale].json` } },
    });
    run(appDir, [...app.generate, "--config", tmpConfig]);
    return readJson(NodePath.join(tmp, `${config.defaultLocale}.json`)) as Catalog;
  } finally {
    NodeFS.rmSync(tmp, { recursive: true, force: true });
  }
}

// 3. Re-key catalogs in place, keeping key order, and carry each translation over with the name swapped.
const catalogs: string[] = [];
const warnings: string[] = [];
let rekeyed = 0;
for (const { app, files, en: oldEn, locales } of snapshots) {
  const newEn = generateEn(app);
  const previous = new Map<string, string[]>();
  for (const [key, value] of Object.entries(oldEn)) {
    if (Object.hasOwn(newEn, key)) continue;
    const renamed = allText(mapText(value, rebrand));
    previous.set(renamed, [...(previous.get(renamed) ?? []), key]);
  }
  const moves: Array<readonly [string, string]> = [];
  for (const [key, value] of Object.entries(newEn)) {
    if (Object.hasOwn(oldEn, key)) continue;
    const oldKey = previous.get(allText(value))?.shift();
    if (oldKey) moves.push([oldKey, key]);
    else warnings.push(`${app.dir}: new key ${key} ${allText(value)} has no earlier translation`);
  }
  if (moves.length === 0) continue;
  rekeyed += moves.length;
  const renamed = new Map(moves);
  const rewrite = (
    file: string,
    catalog: Catalog,
    translate: (key: string, value: CatalogValue, oldKey: string) => CatalogValue,
  ) => {
    const next: Catalog = {};
    for (const [key, value] of Object.entries(catalog)) {
      const newKey = renamed.get(key);
      if (newKey) next[newKey] = translate(newKey, value, key);
      else if (Object.hasOwn(newEn, key)) next[key] = value;
    }
    for (const [key, value] of Object.entries(newEn)) {
      if (!Object.hasOwn(next, key)) next[key] = value;
    }
    writeJson(file, next);
    catalogs.push(file);
  };
  rewrite(files.en, oldEn, (key) => newEn[key]!);
  for (const { locale, file } of files.locales) {
    rewrite(file, locales.get(locale)!, (key, translation, oldKey) => {
      // Keep a translated bare "T3" when the English still has one, like "the T3 team".
      const keepBare = hasProductT3(allText(newEn[key]!));
      const reflowed =
        JSON.stringify(mapText(oldEn[oldKey]!, rebrand)) !== JSON.stringify(newEn[key]);
      return mapText(reflowed ? joinText(translation) : translation, (text) => {
        const named = text.replace(/T3[\s-]Code\b/g, NAME);
        return keepBare ? named : named.replace(/\bT3\b(?![\s-](?:Connect|Chat))/g, NAME);
      });
    });
  }
}

// 4. Shorter strings can reflow lines; format what changed so the tree matches `vp fmt`.
const formatted = [...changed, ...catalogs.map((file) => NodePath.relative(root, file))].filter(
  (file) => !file.endsWith(".nsh") && !file.endsWith(".svg") && !file.endsWith(".xml"),
);
if (formatted.length > 0) run(root, ["node_modules/.bin/vp", "fmt", ...formatted]);

console.log(`Rebranded ${changed.length} files and re-keyed ${rekeyed} catalog entries.`);
for (const file of changed) console.log(`  ${file}`);
if (warnings.length > 0) console.warn(`\n${warnings.join("\n")}`);
