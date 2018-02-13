"use strict";

/*
Note: This example test is leveraging the Mocha test framework.
Please refer to their documentation on https://mochajs.org/ for help.
*/

import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import * as yara from "../yara/src/extension";

let workspace = path.join(__dirname, "..", "..", "test/rules/");

suite("YARA: Provider", function() {
    test("rule definition", function(done) {
        const filepath: string = path.join(workspace, "peek_rules.yara");
        vscode.workspace.openTextDocument(filepath).then(function(doc) {
            let defProvider: vscode.DefinitionProvider = new yara.YaraDefinitionProvider();
            // SyntaxExample: Line 40, Col 14
            let pos: vscode.Position = new vscode.Position(39, 14);
            let tokenSource: vscode.CancellationTokenSource = new vscode.CancellationTokenSource();
            let definition = defProvider.provideDefinition(doc, pos, tokenSource.token);
            console.log(`definition: ${JSON.stringify(definition)}`);
            done();
        });
    });

    test("rule references", function(done) {
        const filepath: string = path.join(workspace, "peek_rules.yara");
        vscode.workspace.openTextDocument(filepath).then(function(doc) {
            let refProvider: vscode.ReferenceProvider = new yara.YaraReferenceProvider();
            // $dstring: Line 22, Col 11
            let pos: vscode.Position = new vscode.Position(21, 11);
            let ctx: vscode.ReferenceContext = null;
            let tokenSource: vscode.CancellationTokenSource = new vscode.CancellationTokenSource();
            let references = refProvider.provideReferences(doc, pos, ctx, tokenSource.token);
            console.log(`references: ${JSON.stringify(references)}`);
            done();
        });
    });
});
