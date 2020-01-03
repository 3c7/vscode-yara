"use strict";

import * as assert from "assert";
import { ChildProcess } from "child_process";
import * as fs from "fs";
import { createConnection, Socket } from "net";
import * as path from "path";
import * as vscode from "vscode";
import { install_server, start_server, server_installed } from "../client/server";

const ext_id: string = "infosec-intern.yara";
const workspace: string = path.join(__dirname, "..", "..", "test/rules/");


// lazily pulled from https://solvit.io/53b9763
const removeDir = function(dirPath: string) {
    const fs = require("fs");
    const path = require("path");
    if (fs.existsSync(dirPath)) {
        return;
    }
    let list = fs.readdirSync(dirPath);
    for (let i = 0; i < list.length; i++) {
        let filename = path.join(dirPath, list[i]);
        let stat = fs.statSync(filename);
        if (filename == "." || filename == "..") {
            // do nothing for current and parent dir
        } else if (stat.isDirectory()) {
            removeDir(filename);
        } else {
            fs.unlinkSync(filename);
        }
    }
    fs.rmdirSync(dirPath);
};

// Unit tests to ensure the setup functions are working appropriately
suite("YARA: Setup", function () {
    /*
        give this test a generous timeout of 10 seconds to ensure the install
        has enough time to finish before the test is killed
    */
    test("install server", function (done) {
        // ensure the server components are installed if none exist
        const fs = require("fs");
        const os = require("os");
        const extensionRoot: string = path.join(__dirname, "..", "..");
        const targetDir: string = fs.mkdtempSync(`${os.tmpdir()}${path.sep}`);
        const installResult: boolean = install_server(extensionRoot, targetDir);
        // install_server creates the env/ directory when successful
        let dirExists: boolean = fs.existsSync(path.join(targetDir, "env"));
        try {
            removeDir(targetDir);
        } catch {
            console.log(`Couldn't remove temporary directory "${targetDir}". Manual removal required`);
        }
        assert(installResult && dirExists);
        done();
    }).timeout(10000);
    /*
        Have to report this test as complete in a slightly different way
        due to the "async" requirement
        see: https://github.com/mochajs/mocha/issues/2407
    */
    test("server binding", async function () {
        // ensure the server binds to a port so the client can connect
        const host: string = "127.0.0.1";
        const port: number = 8471;
        const extensionRoot: string = path.join(__dirname, "..", "..");
        await start_server(extensionRoot, host, port);
        return new Promise((resolve, reject) => {
            let connection: Socket = createConnection(port, host, () => {});
            connection.on("connect", () => {
                connection.end();
                resolve();
            });
        });
    });
    test("server installed", function (done) {
        const fs = require("fs");
        const os = require("os");
        const extensionRoot: string = path.join(__dirname, "..", "..");
        const targetDir: string = fs.mkdtempSync(`${os.tmpdir()}${path.sep}`);
        install_server(extensionRoot, targetDir);
        assert(server_installed(targetDir));
        done();
    }).timeout(10000);
});

// Integration tests to ensure the client is working independently of the server
suite("YARA: Client", function () {
    test.skip("client connection refused", async function () {
        // ensure the client throws an error message if the connection is refused and the server is shut down
        const filepath: string = path.join(workspace, "peek_rules.yara");
        const uri: vscode.Uri = vscode.Uri.file(filepath);
        const pos: vscode.Position = new vscode.Position(42, 14);
        let extension = vscode.extensions.getExtension(ext_id);
        let api = await extension.activate();
        // kill the server process, then try to open the client against it
        api.get_server().process.kill();
        let results: Array<vscode.Location> = await vscode.commands.executeCommand("vscode.executeDefinitionProvider", uri, pos);
        assert(results.length == 0);
        // TODO: assert(messagethrown)
        // TODO: assert(statusbarchanged)
    });
    test("start server", async function () {
        // ensure the language server is started as the client's child process
        // by checking that the PID exists
        let extension = vscode.extensions.getExtension(ext_id);
        let api = await extension.activate();
        let server_proc: ChildProcess = api.get_server().process;
        assert(server_proc.pid > -1);
    });
    test.skip("stop server", async function () {
        // ensure the language server is stopped if the client ends
        const filepath: string = path.join(workspace, "peek_rules.yara");
        let doc: vscode.TextDocument = await vscode.workspace.openTextDocument(filepath);
    });
});

// Integration tests to ensure the client and server are interacting as expected
suite("YARA: Language Server", function () {
    setup(async function () {
        let extension = vscode.extensions.getExtension(ext_id);
        await extension.activate();
    });
    test("rule definition", async function () {
        const filepath: string = path.join(workspace, "peek_rules.yara");
        const uri: vscode.Uri = vscode.Uri.file(filepath);
        // SyntaxExample: Line 43, Col 14
        const expectedSymbol: string = "SyntaxExample";
        const pos: vscode.Position = new vscode.Position(42, 14);
        let doc: vscode.TextDocument = await vscode.workspace.openTextDocument(filepath);
        let results: Array<vscode.Location> = await vscode.commands.executeCommand("vscode.executeDefinitionProvider", uri, pos);
        assert(results.length == 1, `Wrong number of definitions. ${results.length} instead of 1`);
        let result: vscode.Location = results[0];
        assert(result.uri.path == filepath, `Incorrect document searched: ${result.uri.path} searched instead of ${filepath}`);
        let refWordRange: vscode.Range|undefined = doc.getWordRangeAtPosition(result.range.start);
        let refWord: string = doc.getText(refWordRange);
        assert(refWord == expectedSymbol, `${refWord} does not match ${expectedSymbol}`);
    });
    test("variable definition", async function () {
        const filepath: string = path.join(workspace, "peek_rules.yara");
        const uri: vscode.Uri = vscode.Uri.file(filepath);
        // $hex_string: Line 25, Col 14
        const expectedSymbol: string = "hex_string";
        const pos: vscode.Position = new vscode.Position(24, 14);
        let doc: vscode.TextDocument = await vscode.workspace.openTextDocument(filepath);
        let results: Array<vscode.Location> = await vscode.commands.executeCommand("vscode.executeDefinitionProvider", uri, pos);
        assert(results.length == 1, `Wrong number of definitions. ${results.length} instead of 1`);
        let result: vscode.Location = results[0];
        assert(result.uri.path == filepath);
        let refWordRange: vscode.Range|undefined = doc.getWordRangeAtPosition(result.range.start);
        let refWord: string = doc.getText(refWordRange);
        assert(refWord == expectedSymbol, `"${refWord}" does not match ${expectedSymbol}`);
    });
    test("symbol references", async function () {
        const filepath: string = path.join(workspace, "peek_rules.yara");
        const uri: vscode.Uri = vscode.Uri.file(filepath);
        // $dstring: Line 22, Col 11
        const expectedSymbol: string = "dstring";
        const pos: vscode.Position = new vscode.Position(21, 11);
        const acceptableLines: Set<number> = new Set([21, 28, 29]);
        let doc: vscode.TextDocument = await vscode.workspace.openTextDocument(filepath);
        let results: Array<vscode.Location> = await vscode.commands.executeCommand("vscode.executeReferenceProvider", uri, pos);
        assert(results.length == 3, `Wrong number of reference items. ${results.length} instead of 3`);
        results.forEach(reference => {
            let refWordRange: vscode.Range = doc.getWordRangeAtPosition(reference.range.start);
            let refWord: string = doc.getText(refWordRange);
            assert(refWord == expectedSymbol, `"${refWord}" does not match ${expectedSymbol}`);
            assert(acceptableLines.has(reference.range.start.line), `${reference.range.start.line} is not in the list of acceptable lines`);
        });
    });
    test("wildcard references", async function () {
        const filepath: string = path.join(workspace, "peek_rules.yara");
        const uri: vscode.Uri = vscode.Uri.file(filepath);
        // ($hex_*): Line 31, Col 11
        const expectedSymbol: string = "hex_";
        const pos: vscode.Position = new vscode.Position(30, 11);
        const acceptableLines: Set<number> = new Set([19, 20]);
        let doc: vscode.TextDocument = await vscode.workspace.openTextDocument(filepath);
        let results: Array<vscode.Location> = await vscode.commands.executeCommand("vscode.executeReferenceProvider", uri, pos);
        assert(results.length == 2, `Wrong number of reference items. ${results.length} instead of 2`);
        results.forEach(reference => {
            let refWordRange: vscode.Range = doc.getWordRangeAtPosition(reference.range.start);
            let refWord: string = doc.getText(refWordRange);
            assert(refWord.startsWith(expectedSymbol), `"${refWord}" does not match the wildcard expression "${expectedSymbol}*"`);
            assert(acceptableLines.has(reference.range.start.line), `${reference.range.start.line} is not in the list of acceptable lines`);
        });
    });
    /*
        Trying to capture $hex_string but not $hex_string2
        Should collect references for:
            $hex_string = { E2 34 ?? C8 A? FB [2-4] }
            $hex_string
        But not:
            $hex_string2 = { F4 23 ( 62 B4 | 56 ) 45 }
    */
    test("similar symbol references", async function () {
        const filepath: string = path.join(workspace, "peek_rules.yara");
        // $hex_string: Line 20, Col 11
        const expectedSymbol: string = "hex_";
        const uri: vscode.Uri = vscode.Uri.file(filepath);
        const pos: vscode.Position = new vscode.Position(19, 11);
        const acceptableLines: Set<number> = new Set([19, 24]);
        let doc: vscode.TextDocument = await vscode.workspace.openTextDocument(filepath);
        let results: Array<vscode.Location> = await vscode.commands.executeCommand("vscode.executeReferenceProvider", uri, pos);
        assert(results.length == 2, `Wrong number of reference items. ${results.length} instead of 2`);
        results.forEach(reference => {
            let refWordRange: vscode.Range = doc.getWordRangeAtPosition(reference.range.start);
            let refWord: string = doc.getText(refWordRange);
            assert(refWord.startsWith(expectedSymbol), `"${refWord}" does not match the wildcard expression "${expectedSymbol}*"`);
            assert(acceptableLines.has(reference.range.start.line), `${reference.range.start.line} is not in the list of acceptable lines`);
        });
    });
    test("code completion", async function () {
        const filepath: string = path.join(workspace, "code_completion.yara");
        const uri: vscode.Uri = vscode.Uri.file(filepath);
        const pos: vscode.Position = new vscode.Position(9, 16);
        const acceptableTerms: Set<string> = new Set(["filesystem", "network", "registry", "sync"]);
        let results: vscode.CompletionList = await vscode.commands.executeCommand("vscode.executeCompletionItemProvider", uri, pos);
        assert(results.items.length == 4, `Wrong number of completion items. ${results.items.length} instead of 4`);
        assert(results.isIncomplete == false, "Completion list reported as incomplete");
        results.items.forEach((item: vscode.CompletionItem) => {
            assert(item.kind == vscode.CompletionItemKind.Class, `"${item.kind.toString()}" is not a valid completion item type for this set`);
            assert(acceptableTerms.has(item.label), `"${item.label}" is not a valid completion label for this set`);
        });
    });
    test.skip("command CompileRule", async function() {
        // should compile the active document in the current texteditor
        const cmd: string = "yara.CompileRule";
        let cmds: Array<string> = await vscode.commands.getCommands(true);
        assert(cmds.indexOf(cmd) != -1);
        vscode.commands.executeCommand(cmd).then((items) => {
            console.log(`Executed command: ${cmd}`);
            console.log(items);
        });
    });
    test.skip("command CompileAllRules with workspace", async function() {
        // should compile all .yar and .yara rules in the current workspace
        const cmd: string = "yara.CompileAllRules";
        let cmds: Array<string> = await vscode.commands.getCommands(true);
        assert(cmds.indexOf(cmd) != -1);
        vscode.commands.executeCommand(cmd).then((items) => {
            console.log(`Executed command: ${cmd}`);
            console.log(items);
        });
    });
    test.skip("command CompileAllRules without workspace", async function() {
        // should compile all dirty files in the current texteditor
        const cmd: string = "yara.CompileAllRules";
        let cmds: Array<string> = await vscode.commands.getCommands(true);
        assert(cmds.indexOf(cmd) != -1);
        vscode.commands.executeCommand(cmd).then((items) => {
            console.log(`Executed command: ${cmd}`);
            console.log(items);
        });
    });
});
