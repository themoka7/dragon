// 모든 CSS/JS 를 인라인한 단일 파일 dist/index.html 을 만든다: node tools/build.js
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, f) => `<style>\n${fs.readFileSync(path.join(root, f), 'utf8')}</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, f) => `<script>\n${fs.readFileSync(path.join(root, f), 'utf8')}</script>`);
// 단일 파일에서는 manifest/아이콘 경로가 없을 수 있으므로 제거
html = html.replace(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\n?/g, '');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
// 아티팩트 게시용: 문서 골격 태그 제거 (게시 시 자동으로 감싸짐)
const frag = html.replace(/<!doctype html>\n?/i, '').replace(/<\/?(html|head|body)[^>]*>\n?/g, '').replace(/<meta (charset|name="viewport")[^>]*>\n?/g, '');
fs.writeFileSync(path.join(root, 'dist', 'artifact.html'), frag);
console.log('dist/index.html', (html.length / 1024).toFixed(1) + 'KB');
