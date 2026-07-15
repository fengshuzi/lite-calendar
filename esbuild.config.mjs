import esbuild from "esbuild";
import process from "process";
import { copyFileSync, existsSync, mkdirSync } from "fs";

const builtins = [
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
  'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring',
  'readline', 'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls',
  'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi',
  'worker_threads', 'zlib',
];

const prod = process.argv[2] === "production";

esbuild
    .build({
        entryPoints: ["src/main.ts"],
        bundle: true,
        external: [
            "obsidian",
            "electron",
            "@codemirror/autocomplete",
            "@codemirror/collab",
            "@codemirror/commands",
            "@codemirror/language",
            "@codemirror/lint",
            "@codemirror/search",
            "@codemirror/state",
            "@codemirror/view",
            "@lezer/common",
            "@lezer/highlight",
            "@lezer/lr",
            ...builtins,
        ],
        format: "cjs",
        minify: prod,
        watch: !prod,
        target: "es2016",
        logLevel: "info",
        sourcemap: prod ? false : "inline",
        treeShaking: true,
        outfile: "dist/main.js",
    })
    .then(() => {
        if (prod) {
            if (!existsSync('dist')) mkdirSync('dist');
            if (existsSync('manifest.json')) {
                copyFileSync('manifest.json', 'dist/manifest.json');
                console.log('Copied manifest.json -> dist/manifest.json');
            }
            if (existsSync('styles.css')) {
                copyFileSync('styles.css', 'dist/styles.css');
                console.log('Copied styles.css -> dist/styles.css');
            }
            console.log('Build output: dist/');
        }
    })
    .catch(() => process.exit(1));
