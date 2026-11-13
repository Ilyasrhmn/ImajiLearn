import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createExam, initialExamConfig } from "../packages/shared/lib/exams.mjs";

const source = new URL("../packages/shared/components/exam-document-viewer.jsx", import.meta.url);
const require = createRequire(source);
const { code } = require("next/dist/build/swc").transformSync(readFileSync(source, "utf8"), {
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  module: { type: "commonjs" },
});
function render(tab = "questions", props = {}) {
  const compiled = { exports: {} };
  function Select({ children, ...rest }) { return React.createElement("select", rest, children); }
  const localRequire = name => {
    if (name === "react") return { ...React, ViewTransition: React.Fragment, useState: () => [tab, () => {}] };
    if (name === "./themed-select") return Select;
    if (name === "./studio-alert") return { studioAlert() {} };
    return require(name);
  };
  new Function("require", "module", "exports", code)(localRequire, compiled, compiled.exports);
  const exam = { ...createExam({ ...initialExamConfig(), subject: "IPAS", summary: "Tumbuhan", counts: { multipleChoice: 2, shortAnswer: 2, essay: 1 } }), resourceVersion: 1 };
  return renderToStaticMarkup(React.createElement(compiled.exports.default, { exam, saved: true, ...props }));
}

test("PWA exam documents number each form separately while giving fields distinct names", () => {
  const questions = render();
  assert.deepEqual([...questions.matchAll(/class="exam-question-number">(\d+)\./g)].map(match => Number(match[1])), [1, 2, 1, 2, 1]);
  for (const label of ["Pilihan ganda 1", "Pilihan ganda 2", "Isian singkat 1", "Isian singkat 2", "Uraian 1"]) {
    assert.ok(questions.includes(`aria-label="${label}"`), label);
  }
  assert.equal((questions.match(/class="exam-answer-line"/g) || []).length, 4);
  const blueprint = render("blueprint");
  assert.deepEqual([...blueprint.matchAll(/<th scope="row">(\d+)<\/th>/g)].map(match => Number(match[1])), [1, 2, 1, 2, 1]);
  const answers = render("answers");
  assert.match(answers, /aria-label="Jawaban Isian singkat 1"/);
  assert.match(answers, /aria-label="Pedoman penskoran Uraian 1"/);
});

test("PWA generation shows its progress and disables editing, printing, copying and back", () => {
  const markup = render("questions", { generation: { filled: 2, total: 5 } });
  assert.match(markup, /Soal terisi 2\/5/);
  assert.match(markup, /Hentikan/);
  assert.doesNotMatch(markup, /Isi otomatis/);
  assert.match(markup, /<fieldset class="exam-editor-fields" disabled=""/);
  assert.match(markup, /disabled=""[^>]*>.*?Semua naskah/);
  assert.equal((markup.match(/disabled=""/g) || []).length, 6);
  assert.match(render("questions", { saved: false }), /disabled=""[^>]*>.*?Isi otomatis/);
});
